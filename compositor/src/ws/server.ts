import http from 'node:http';
import { EventEmitter } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import type {
  CompositorState,
  LayerRemovedEvent,
  LayerUpsertEvent,
  LayerVisibilityEvent,
  PresetRemovedEvent,
  PresetUpsertEvent,
} from '../core/compositorState';
import type { PresetDefinition } from '../core/presetStore';
import type { LayerDescriptor } from '../core/layerRegistry';
import {
  HelloMessage,
  InboundMessage,
  LayerBulkStateMessage,
  LayerSetVisibleMessage,
  OutboundMessage,
  PresetApplyMessage,
  PresetSummary,
  WelcomeMessage,
  isHelloMessage,
  isLayerSetVisibleMessage,
  isLayerSyncMessage,
  isPresetApplyMessage,
} from './protocol';

export interface ControlServerOptions {
  wsPath: string;
  heartbeatSeconds: number;
  deviceId: string;
  authToken?: string;
  acceptedVersions?: string[];
}

// TODO: Extend the control server options with a WebRTC credential payload so
//       we can surface SDP offers/answers over the control channel when NDI is
//       unavailable.

interface ClientContext {
  socket: WebSocket;
  hello?: HelloMessage;
  isAlive: boolean;
}

export interface ControlServerEvents {
  visibilityChange: (layerId: string, visible: boolean, revision: number, source?: string) => void;
  layerUpsert: (layer: LayerDescriptor, revision: number, source?: string, created?: boolean) => void;
  layerRemoved: (layerId: string, revision: number, source?: string) => void;
  presetUpsert: (preset: PresetDefinition, revision: number, source?: string, created?: boolean) => void;
  presetRemoved: (presetId: string, revision: number, source?: string) => void;
  clientConnected: (client: HelloMessage) => void;
  clientDisconnected: (client?: HelloMessage) => void;
}

export declare interface ControlServer {
  on<U extends keyof ControlServerEvents>(event: U, listener: ControlServerEvents[U]): this;
  emit<U extends keyof ControlServerEvents>(event: U, ...args: Parameters<ControlServerEvents[U]>): boolean;
}

export class ControlServer extends EventEmitter {
  private readonly wss: WebSocketServer;
  private readonly heartbeatMillis: number;
  private readonly state: CompositorState;
  private readonly options: ControlServerOptions;

  constructor(server: http.Server, state: CompositorState, options: ControlServerOptions) {
    super();
    this.state = state;
    this.options = options;
    this.heartbeatMillis = options.heartbeatSeconds * 1000;
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      if (request.url && !request.url.startsWith(options.wsPath)) {
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });

    this.wss.on('connection', (socket) => this.handleConnection({ socket, isAlive: true }));

    this.state.on('layerVisibility', (event) => this.handleLayerVisibilityEvent(event));
    this.state.on('layerUpsert', (event) => this.handleLayerUpsertEvent(event));
    this.state.on('layerRemoved', (event) => this.handleLayerRemovedEvent(event));
    this.state.on('presetUpsert', (event) => this.handlePresetUpsertEvent(event));
    this.state.on('presetRemoved', (event) => this.handlePresetRemovedEvent(event));
  }

  private handleConnection(context: ClientContext): void {
    const { socket } = context;
    const heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (!context.isAlive) {
        socket.terminate();
        return;
      }
      context.isAlive = false;
      socket.ping();
    }, this.heartbeatMillis);

    socket.on('pong', () => {
      context.isAlive = true;
    });

    socket.on('message', (data) => {
      const message = this.parseMessage(data);
      if (!message) {
        this.send(socket, { op: 'error', code: 'BAD_JSON', message: 'Unable to parse payload.' });
        return;
      }
      if (!context.hello) {
        if (!isHelloMessage(message)) {
          this.send(socket, { op: 'error', code: 'UNAUTHENTICATED', message: 'Send hello first.' });
          return;
        }
        this.handleHello(context, message);
        return;
      }
      this.routeMessage(context, message);
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      this.emit('clientDisconnected', context.hello);
    });
  }

  private handleHello(context: ClientContext, hello: HelloMessage): void {
    if (!this.validateHello(hello)) {
      this.send(context.socket, { op: 'error', code: 'UNSUPPORTED_VERSION', message: 'Unsupported client version.' });
      context.socket.close();
      return;
    }
    if (this.options.authToken && hello.auth !== this.options.authToken) {
      // TODO: Emit richer authentication diagnostics (e.g., structured error
      //       events) that the OBS plugin can surface to users when bearer
      //       tokens are missing or invalid.
      this.send(context.socket, { op: 'error', code: 'INVALID_AUTH', message: 'Authentication failed.' });
      context.socket.close();
      return;
    }
    context.hello = hello;
    context.isAlive = true;
    this.send(context.socket, this.createWelcome());
    this.send(context.socket, this.createBulkState());
    this.emit('clientConnected', hello);
  }

  private validateHello(hello: HelloMessage): boolean {
    const acceptedVersions = this.options.acceptedVersions ?? ['1.0'];
    return acceptedVersions.includes(hello.ver);
  }

  private routeMessage(context: ClientContext, message: InboundMessage): void {
    if (isLayerSetVisibleMessage(message)) {
      this.handleVisibility(context, message);
      return;
    }
    if (isLayerSyncMessage(message)) {
      this.send(context.socket, this.createBulkState());
      return;
    }
    if (isPresetApplyMessage(message)) {
      this.handlePresetApply(context, message);
      return;
    }
    if (isHelloMessage(message)) {
      this.send(context.socket, {
        op: 'error',
        code: 'ALREADY_AUTHENTICATED',
        message: 'Hello already received.',
      });
      return;
    }
    this.send(context.socket, { op: 'error', code: 'UNSUPPORTED', message: 'Unknown operation.' });
  }

  private handleVisibility(context: ClientContext, message: LayerSetVisibleMessage): void {
    const result = this.state.setLayerVisibility(
      message.layerId,
      message.visible,
      message.source ?? context.hello?.client,
    );
    if (!result) {
      this.send(context.socket, {
        op: 'error',
        code: 'UNKNOWN_LAYER',
        message: `Layer ${message.layerId} not found`,
      });
      return;
    }
    if (!result.changed) {
      this.send(context.socket, {
        op: 'layer.state',
        layerId: result.layer.id,
        visible: result.layer.visible,
        rev: result.revision,
      });
    }
  }

  private handlePresetApply(context: ClientContext, message: PresetApplyMessage): void {
    const requester = context.hello?.client ?? 'unknown';
    const result = this.state.applyPreset(message.presetId, requester);
    if (!result) {
      console.warn(`[control] preset ${message.presetId} not found for requester ${requester}`);
      // TODO: Return an explicit preset application failure payload once the
      //       client UX is ready to differentiate validation errors.
      return;
    }
    console.log(
      `[control] preset ${message.presetId} applied by ${requester} with ${result.changes.length} changes`,
    );
    // TODO: Route preset application outcomes to a diagnostics sink beyond
    //       stdout so operators have persistent visibility into partial apply
    //       failures.
  }

  private parseMessage(data: WebSocket.RawData): InboundMessage | undefined {
    try {
      const json = JSON.parse(data.toString());
      return json as InboundMessage;
    } catch (error) {
      return undefined;
    }
  }

  private createWelcome(): WelcomeMessage {
    return {
      op: 'welcome',
      server: 'compositor',
      ver: '1.0',
      deviceId: this.options.deviceId,
      rev: this.state.currentRevision(),
      layers: this.state.listLayers(),
      presets: this.state.listPresets().map((preset) => this.toPresetSummary(preset)),
      heartbeatSec: this.options.heartbeatSeconds,
    };
  }

  private createBulkState(): LayerBulkStateMessage {
    return {
      op: 'layer.bulkState',
      layers: this.state.listLayers(),
      rev: this.state.currentRevision(),
    };
  }

  private toPresetSummary(preset: PresetDefinition): PresetSummary {
    const summary: PresetSummary = {
      id: preset.id,
      name: preset.name,
      ...(preset.description !== undefined ? { description: preset.description } : {}),
    };
    return summary;
  }

  private handleLayerVisibilityEvent(event: LayerVisibilityEvent): void {
    const message: OutboundMessage = {
      op: 'layer.state',
      layerId: event.layer.id,
      visible: event.layer.visible,
      rev: event.revision,
    };
    this.broadcast(message);
    this.emit('visibilityChange', event.layer.id, event.layer.visible, event.revision, event.source);
  }

  private handleLayerUpsertEvent(event: LayerUpsertEvent): void {
    const message: OutboundMessage = {
      op: 'layer.upsert',
      layer: event.layer,
      rev: event.revision,
      created: event.created,
    };
    this.broadcast(message);
    this.emit('layerUpsert', event.layer, event.revision, event.source, event.created);
  }

  private handleLayerRemovedEvent(event: LayerRemovedEvent): void {
    const message: OutboundMessage = {
      op: 'layer.removed',
      layerId: event.layerId,
      rev: event.revision,
    };
    this.broadcast(message);
    this.emit('layerRemoved', event.layerId, event.revision, event.source);
  }

  private handlePresetUpsertEvent(event: PresetUpsertEvent): void {
    const preset: PresetDefinition = {
      id: event.preset.id,
      name: event.preset.name,
      visibility: { ...event.preset.visibility },
      ...(event.preset.description !== undefined ? { description: event.preset.description } : {}),
    };
    const message: OutboundMessage = {
      op: 'preset.upsert',
      preset,
      rev: event.revision,
      created: event.created,
    };
    this.broadcast(message);
    this.emit('presetUpsert', event.preset, event.revision, event.source, event.created);
  }

  private handlePresetRemovedEvent(event: PresetRemovedEvent): void {
    const message: OutboundMessage = {
      op: 'preset.removed',
      presetId: event.presetId,
      rev: event.revision,
    };
    this.broadcast(message);
    this.emit('presetRemoved', event.presetId, event.revision, event.source);
  }

  private send(socket: WebSocket, message: OutboundMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private broadcast(message: OutboundMessage): void {
    const payload = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
}
