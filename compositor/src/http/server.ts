import express from 'express';
import http from 'node:http';
import type { CompositorState } from '../core/compositorState';
import type { LayerDescriptor } from '../core/layerRegistry';
import type { PresetDefinition } from '../core/presetStore';

interface ApiError {
  error: string;
  details?: unknown;
}

function badRequest(
  res: express.Response<ApiError>,
  message: string,
  details?: unknown,
): express.Response<ApiError> {
  const body: ApiError = details === undefined ? { error: message } : { error: message, details };
  return res.status(400).json(body);
}

function toBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw new Error(`Expected boolean for ${field}`);
}

function toString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  throw new Error(`Expected non-empty string for ${field}`);
}

function toVisibilityRecord(value: unknown, field: string): Record<string, boolean> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Expected object for ${field}`);
  }
  const record: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'boolean') {
      throw new Error(`Visibility for layer ${key} must be boolean`);
    }
    record[key] = raw;
  }
  return record;
}

function mergePreset(
  existing: PresetDefinition | undefined,
  patch: Partial<PresetDefinition> & { id: string },
): PresetDefinition {
  const visibility = patch.visibility ?? existing?.visibility ?? {};
  const preset: PresetDefinition = {
    id: patch.id,
    name: patch.name ?? existing?.name ?? patch.id,
    visibility: { ...visibility },
  };
  const description = patch.description ?? existing?.description;
  if (description !== undefined) {
    preset.description = description;
  }
  return preset;
}

export function createHttpServer(state: CompositorState): { app: express.Express; server: http.Server } {
  const app = express();
  app.use(express.json());
  app.use((err: unknown, _req: express.Request, res: express.Response<ApiError>, next: express.NextFunction) => {
    if (err instanceof SyntaxError) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    return next(err);
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', revision: state.currentRevision() });
  });

  app.get('/api/state', (_req, res) => {
    const presets = state.listPresets().map((preset) => ({
      id: preset.id,
      name: preset.name,
      ...(preset.description !== undefined ? { description: preset.description } : {}),
      visibility: preset.visibility,
    }));
    res.json({
      revision: state.currentRevision(),
      layers: state.listLayers(),
      presets,
    });
  });

  app.get('/api/layers', (_req, res) => {
    res.json({ layers: state.listLayers(), revision: state.currentRevision() });
  });

  app.get('/api/layers/:id', (req, res) => {
    const id = req.params.id;
    const layer = state.getLayer(id);
    if (!layer) {
      return res.status(404).json({ error: `Layer ${id} not found` });
    }
    return res.json({ layer, revision: state.currentRevision() });
  });

  app.post('/api/layers', (req, res) => {
    try {
      const id = toString(req.body?.id, 'id');
      if (!id) {
        return badRequest(res, 'Layer id is required');
      }
      const name = toString(req.body?.name, 'name') ?? id;
      const visible = toBoolean(req.body?.visible, 'visible') ?? false;
      const result = state.upsertLayer({ id, name, visible }, 'http:layers:create');
      return res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      return badRequest(res, (error as Error).message);
    }
  });

  app.patch('/api/layers/:id', (req, res) => {
    try {
      const id = req.params.id;
      const name = toString(req.body?.name, 'name');
      const visible = toBoolean(req.body?.visible, 'visible');
      const patch: Partial<Omit<LayerDescriptor, 'id'>> = {};
      if (name !== undefined) {
        patch.name = name;
      }
      if (visible !== undefined) {
        patch.visible = visible;
      }
      const result = state.patchLayer(id, patch, 'http:layers:patch');
      if (!result) {
        return res.status(404).json({ error: `Layer ${id} not found` });
      }
      return res.json(result);
    } catch (error) {
      return badRequest(res, (error as Error).message);
    }
  });

  app.delete('/api/layers/:id', (req, res) => {
    const id = req.params.id;
    const result = state.removeLayer(id, 'http:layers:delete');
    if (!result.removed) {
      return res.status(404).json({ error: `Layer ${id} not found` });
    }
    return res.status(204).send();
  });

  app.get('/api/presets', (_req, res) => {
    res.json({ presets: state.listPresets(), revision: state.currentRevision() });
  });

  app.get('/api/presets/:id', (req, res) => {
    const id = req.params.id;
    const preset = state.getPreset(id);
    if (!preset) {
      return res.status(404).json({ error: `Preset ${id} not found` });
    }
    return res.json({ preset, revision: state.currentRevision() });
  });

  app.post('/api/presets', (req, res) => {
    try {
      const id = toString(req.body?.id, 'id');
      if (!id) {
        return badRequest(res, 'Preset id is required');
      }
      const name = toString(req.body?.name, 'name') ?? id;
      const description = toString(req.body?.description, 'description');
      const visibility = toVisibilityRecord(req.body?.visibility, 'visibility') ?? {};
      const patch: Partial<PresetDefinition> & { id: string } = { id, name, visibility };
      if (description !== undefined) {
        patch.description = description;
      }
      const preset = mergePreset(undefined, patch);
      const result = state.upsertPreset(preset, 'http:presets:create');
      return res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      return badRequest(res, (error as Error).message);
    }
  });

  app.patch('/api/presets/:id', (req, res) => {
    try {
      const id = req.params.id;
      const existing = state.getPreset(id);
      if (!existing) {
        return res.status(404).json({ error: `Preset ${id} not found` });
      }
      const name = toString(req.body?.name, 'name');
      const description = toString(req.body?.description, 'description');
      const visibility = toVisibilityRecord(req.body?.visibility, 'visibility');
      const patchInput: Partial<PresetDefinition> & { id: string } = { id };
      if (name !== undefined) {
        patchInput.name = name;
      }
      if (description !== undefined) {
        patchInput.description = description;
      }
      if (visibility !== undefined) {
        patchInput.visibility = visibility;
      }
      const patch = mergePreset(existing, patchInput);
      const result = state.upsertPreset(patch, 'http:presets:patch');
      return res.json(result);
    } catch (error) {
      return badRequest(res, (error as Error).message);
    }
  });

  app.delete('/api/presets/:id', (req, res) => {
    const id = req.params.id;
    const result = state.removePreset(id, 'http:presets:delete');
    if (!result.removed) {
      return res.status(404).json({ error: `Preset ${id} not found` });
    }
    return res.status(204).send();
  });

  app.post('/api/presets/:id/apply', (req, res) => {
    const id = req.params.id;
    const result = state.applyPreset(id, 'http:presets:apply');
    if (!result) {
      return res.status(404).json({ error: `Preset ${id} not found` });
    }
    return res.json({
      presetId: id,
      changes: result.changes,
    });
  });

  const server = http.createServer(app);
  return { app, server };
}
