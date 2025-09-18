import { EventEmitter } from 'node:events';
import type { LayerDescriptor } from './layerRegistry';
import { LayerRegistry } from './layerRegistry';
import type { PresetDefinition } from './presetStore';
import { PresetStore } from './presetStore';
import { RevisionCounter } from './revision';

export interface LayerUpsertEvent {
  layer: LayerDescriptor;
  revision: number;
  source?: string;
  created: boolean;
}

export interface LayerVisibilityEvent {
  layer: LayerDescriptor;
  revision: number;
  source?: string;
}

export interface LayerRemovedEvent {
  layerId: string;
  revision: number;
  source?: string;
}

export interface PresetUpsertEvent {
  preset: PresetDefinition;
  revision: number;
  source?: string;
  created: boolean;
}

export interface PresetRemovedEvent {
  presetId: string;
  revision: number;
  source?: string;
}

export interface PresetApplicationChange {
  layerId: string;
  visible: boolean;
  revision: number;
}

export interface PresetApplicationResult {
  preset: PresetDefinition;
  changes: PresetApplicationChange[];
}

export interface LayerUpsertResult {
  layer: LayerDescriptor;
  revision: number;
  created: boolean;
  changed: boolean;
}

export interface LayerVisibilityResult {
  layer: LayerDescriptor;
  revision: number;
  changed: boolean;
}

export interface LayerRemovalResult {
  layerId: string;
  revision: number;
  removed: boolean;
}

export interface PresetUpsertResult {
  preset: PresetDefinition;
  revision: number;
  created: boolean;
  changed: boolean;
}

export interface PresetRemovalResult {
  presetId: string;
  revision: number;
  removed: boolean;
}

export interface CompositorStateEvents {
  layerUpsert: (event: LayerUpsertEvent) => void;
  layerVisibility: (event: LayerVisibilityEvent) => void;
  layerRemoved: (event: LayerRemovedEvent) => void;
  presetUpsert: (event: PresetUpsertEvent) => void;
  presetRemoved: (event: PresetRemovedEvent) => void;
}

export declare interface CompositorState {
  on<U extends keyof CompositorStateEvents>(event: U, listener: CompositorStateEvents[U]): this;
  off<U extends keyof CompositorStateEvents>(event: U, listener: CompositorStateEvents[U]): this;
  emit<U extends keyof CompositorStateEvents>(event: U, ...args: Parameters<CompositorStateEvents[U]>): boolean;
}

export interface CompositorStateInit {
  initialLayers?: LayerDescriptor[];
  initialPresets?: PresetDefinition[];
  initialRevision?: number;
}

function cloneLayer(layer: LayerDescriptor): LayerDescriptor {
  return { ...layer };
}

function clonePreset(preset: PresetDefinition): PresetDefinition {
  return {
    ...preset,
    visibility: { ...preset.visibility },
  };
}

function presetsEqual(a: PresetDefinition, b: PresetDefinition): boolean {
  if (a.name !== b.name || a.description !== b.description) {
    return false;
  }
  const keysA = Object.keys(a.visibility);
  const keysB = Object.keys(b.visibility);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every((key) => a.visibility[key] === b.visibility[key]);
}

export class CompositorState extends EventEmitter {
  private readonly registry: LayerRegistry;
  private readonly presets: PresetStore;
  private readonly revision: RevisionCounter;

  constructor(init: CompositorStateInit = {}) {
    super();
    this.registry = new LayerRegistry(init.initialLayers ?? []);
    this.presets = new PresetStore(init.initialPresets ?? []);
    this.revision = new RevisionCounter(init.initialRevision ?? 1);
  }

  public currentRevision(): number {
    return this.revision.value();
  }

  public listLayers(): LayerDescriptor[] {
    return this.registry.list();
  }

  public listPresets(): PresetDefinition[] {
    return this.presets.list();
  }

  public getLayer(layerId: string): LayerDescriptor | undefined {
    return this.registry.get(layerId);
  }

  public getPreset(presetId: string): PresetDefinition | undefined {
    return this.presets.get(presetId);
  }

  public upsertLayer(layer: LayerDescriptor, source?: string): LayerUpsertResult {
    const existing = this.registry.get(layer.id);
    const normalized: LayerDescriptor = {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
    };
    if (existing && existing.name === normalized.name && existing.visible === normalized.visible) {
      return {
        layer: existing,
        revision: this.revision.value(),
        created: false,
        changed: false,
      };
    }

    this.registry.upsert(normalized);
    const revision = this.revision.bump();
    const result: LayerUpsertResult = {
      layer: cloneLayer(normalized),
      revision,
      created: !existing,
      changed: true,
    };
    const upsertEvent: LayerUpsertEvent = {
      layer: cloneLayer(normalized),
      revision,
      created: !existing,
    };
    if (source !== undefined) {
      upsertEvent.source = source;
    }
    this.emit('layerUpsert', upsertEvent);
    if (!existing || existing.visible !== normalized.visible) {
      const visibilityEvent: LayerVisibilityEvent = {
        layer: cloneLayer(normalized),
        revision,
      };
      if (source !== undefined) {
        visibilityEvent.source = source;
      }
      this.emit('layerVisibility', visibilityEvent);
    }
    return result;
  }

  public patchLayer(
    layerId: string,
    patch: Partial<Omit<LayerDescriptor, 'id'>>,
    source?: string,
  ): LayerUpsertResult | undefined {
    const existing = this.registry.get(layerId);
    if (!existing) {
      return undefined;
    }
    const next: LayerDescriptor = {
      id: layerId,
      name: patch.name ?? existing.name,
      visible: patch.visible ?? existing.visible,
    };
    return this.upsertLayer(next, source);
  }

  public setLayerVisibility(layerId: string, visible: boolean, source?: string): LayerVisibilityResult | undefined {
    const current = this.registry.get(layerId);
    if (!current) {
      return undefined;
    }
    if (current.visible === visible) {
      return { layer: current, revision: this.revision.value(), changed: false };
    }
    const updated = this.registry.setVisibility(layerId, visible);
    if (!updated) {
      return undefined;
    }
    const revision = this.revision.bump();
    const visibilityEvent: LayerVisibilityEvent = {
      layer: cloneLayer(updated),
      revision,
    };
    if (source !== undefined) {
      visibilityEvent.source = source;
    }
    this.emit('layerVisibility', visibilityEvent);
    return { layer: cloneLayer(updated), revision, changed: true };
  }

  public removeLayer(layerId: string, source?: string): LayerRemovalResult {
    const existing = this.registry.get(layerId);
    if (!existing) {
      return { layerId, revision: this.revision.value(), removed: false };
    }
    const removed = this.registry.delete(layerId);
    if (!removed) {
      return { layerId, revision: this.revision.value(), removed: false };
    }
    const revision = this.revision.bump();
    const event: LayerRemovedEvent = { layerId, revision };
    if (source !== undefined) {
      event.source = source;
    }
    this.emit('layerRemoved', event);
    return { layerId, revision, removed: true };
  }

  public upsertPreset(preset: PresetDefinition, source?: string): PresetUpsertResult {
    const existing = this.presets.get(preset.id);
    const normalized = clonePreset(preset);
    if (existing && presetsEqual(existing, normalized)) {
      return {
        preset: existing,
        revision: this.revision.value(),
        created: false,
        changed: false,
      };
    }
    this.presets.upsert(normalized);
    const revision = this.revision.bump();
    const result: PresetUpsertResult = {
      preset: clonePreset(normalized),
      revision,
      created: !existing,
      changed: true,
    };
    const event: PresetUpsertEvent = {
      preset: clonePreset(normalized),
      revision,
      created: !existing,
    };
    if (source !== undefined) {
      event.source = source;
    }
    this.emit('presetUpsert', event);
    return result;
  }

  public removePreset(presetId: string, source?: string): PresetRemovalResult {
    const existing = this.presets.get(presetId);
    if (!existing) {
      return { presetId, revision: this.revision.value(), removed: false };
    }
    const removed = this.presets.delete(presetId);
    if (!removed) {
      return { presetId, revision: this.revision.value(), removed: false };
    }
    const revision = this.revision.bump();
    const event: PresetRemovedEvent = { presetId, revision };
    if (source !== undefined) {
      event.source = source;
    }
    this.emit('presetRemoved', event);
    return { presetId, revision, removed: true };
  }

  public applyPreset(presetId: string, source?: string): PresetApplicationResult | undefined {
    const preset = this.presets.get(presetId);
    if (!preset) {
      return undefined;
    }
    const changes: PresetApplicationChange[] = [];
    Object.entries(preset.visibility).forEach(([layerId, visible]) => {
      const result = this.setLayerVisibility(layerId, visible, source ?? `preset:${presetId}`);
      if (result && result.changed) {
        changes.push({ layerId, visible: result.layer.visible, revision: result.revision });
      }
    });
    return { preset, changes };
  }
}
