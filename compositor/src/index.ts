import { randomUUID } from 'node:crypto';
import { loadEnvironment } from './config/environment';
import { CompositorState } from './core/compositorState';
import { createHttpServer } from './http/server';
import { ControlServer } from './ws/server';
import type { ControlServerOptions } from './ws/server';

async function main(): Promise<void> {
  const env = loadEnvironment();
  const deviceId = env.deviceId ?? randomUUID();
  const state = new CompositorState({
    initialLayers: [
      { id: 'chat', name: 'Chat Box', visible: true },
      { id: 'alerts', name: 'Alerts', visible: false },
      { id: 'lower-third', name: 'Lower Third', visible: true },
    ],
    initialPresets: [
      {
        id: 'starting-soon',
        name: 'Starting Soon',
        description: 'Hides interactive overlays before the show begins.',
        visibility: {
          chat: false,
          alerts: false,
          'lower-third': false,
        },
      },
      {
        id: 'showtime',
        name: 'Showtime',
        description: 'Default live show stack.',
        visibility: {
          chat: true,
          alerts: true,
          'lower-third': true,
        },
      },
    ],
  });

  const { server } = createHttpServer(state);

  const controlOptions: ControlServerOptions = {
    wsPath: env.wsPath,
    heartbeatSeconds: env.heartbeatSeconds,
    deviceId,
    acceptedVersions: env.acceptedVersions,
  };

  if (env.authToken !== undefined) {
    controlOptions.authToken = env.authToken;
  }

  const control = new ControlServer(server, state, controlOptions);

  control.on('clientConnected', (client) => {
    console.log(`[control] client connected: ${client.client} v${client.ver}`);
  });

  control.on('clientDisconnected', (client) => {
    const label = client ? `${client.client} v${client.ver}` : 'unknown client';
    console.log(`[control] client disconnected: ${label}`);
  });

  control.on('visibilityChange', (layerId, visible, revision, source) => {
    console.log(
      `[rev ${revision}] layer ${layerId} visible=${visible} source=${source ?? 'unknown'}`,
    );
  });

  control.on('layerUpsert', (layer, revision, source, created) => {
    const action = created ? 'created' : 'updated';
    console.log(
      `[rev ${revision}] layer ${layer.id} ${action} name="${layer.name}" source=${source ?? 'system'}`,
    );
  });

  control.on('layerRemoved', (layerId, revision, source) => {
    console.log(`[rev ${revision}] layer ${layerId} removed source=${source ?? 'system'}`);
  });

  control.on('presetUpsert', (preset, revision, source, created) => {
    const action = created ? 'created' : 'updated';
    console.log(
      `[rev ${revision}] preset ${preset.id} ${action} name="${preset.name}" source=${
        source ?? 'system'
      }`,
    );
  });

  control.on('presetRemoved', (presetId, revision, source) => {
    console.log(`[rev ${revision}] preset ${presetId} removed source=${source ?? 'system'}`);
  });

  server.listen(env.httpPort, () => {
    console.log(`Remote compositor listening on http://localhost:${env.httpPort}`);
    console.log(`Control WebSocket path: ${env.wsPath}`);
    console.log(`Device identity: ${deviceId} (${env.deviceLabel})`);
  });
}

main().catch((error) => {
  console.error('Fatal error starting compositor', error);
  process.exitCode = 1;
});
