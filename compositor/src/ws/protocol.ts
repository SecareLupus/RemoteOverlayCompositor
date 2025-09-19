import type { LayerDescriptor } from '../core/layerRegistry';
import type { PresetDefinition } from '../core/presetStore';

export interface HelloMessage {
  op: 'hello';
  client: string;
  ver: string;
  caps?: string[];
  auth?: string;
}

export interface PresetSummary {
  id: string;
  name: string;
  description?: string;
}

export interface WelcomeMessage {
  op: 'welcome';
  server: 'compositor';
  ver: string;
  deviceId: string;
  rev: number;
  layers: LayerDescriptor[];
  presets: PresetSummary[];
  heartbeatSec: number;
}

export interface LayerSetVisibleMessage {
  op: 'layer.setVisible';
  layerId: string;
  visible: boolean;
  rev: number;
  source?: string;
}

export interface LayerSyncMessage {
  op: 'layer.sync';
}

export interface LayerStateMessage {
  op: 'layer.state';
  layerId: string;
  visible: boolean;
  rev: number;
}

export interface LayerUpsertMessage {
  op: 'layer.upsert';
  layer: LayerDescriptor;
  rev: number;
  created?: boolean;
}

export interface LayerRemovedMessage {
  op: 'layer.removed';
  layerId: string;
  rev: number;
}

export interface LayerBulkStateMessage {
  op: 'layer.bulkState';
  layers: LayerDescriptor[];
  rev: number;
}

export interface PresetApplyMessage {
  op: 'preset.apply';
  presetId: string;
}

export interface PresetAppliedChange {
  layerId: string;
  visible: boolean;
  rev: number;
}

export interface PresetAppliedMessage {
  op: 'preset.applied';
  presetId: string;
  changes: PresetAppliedChange[];
}

export interface PresetUpsertMessage {
  op: 'preset.upsert';
  preset: PresetDefinition;
  rev: number;
  created?: boolean;
}

export interface PresetRemovedMessage {
  op: 'preset.removed';
  presetId: string;
  rev: number;
}

export interface ErrorMessage {
  op: 'error';
  code: string;
  message?: string;
}

export type InboundMessage = HelloMessage | LayerSetVisibleMessage | LayerSyncMessage | PresetApplyMessage;
export type OutboundMessage =
  | WelcomeMessage
  | LayerStateMessage
  | LayerUpsertMessage
  | LayerRemovedMessage
  | LayerBulkStateMessage
  | PresetAppliedMessage
  | PresetUpsertMessage
  | PresetRemovedMessage
  | ErrorMessage;

export function isHelloMessage(message: unknown): message is HelloMessage {
  return typeof message === 'object' && message !== null && (message as HelloMessage).op === 'hello';
}

export function isLayerSetVisibleMessage(message: unknown): message is LayerSetVisibleMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as LayerSetVisibleMessage).op === 'layer.setVisible'
  );
}

export function isLayerSyncMessage(message: unknown): message is LayerSyncMessage {
  return typeof message === 'object' && message !== null && (message as LayerSyncMessage).op === 'layer.sync';
}

export function isPresetApplyMessage(message: unknown): message is PresetApplyMessage {
  return typeof message === 'object' && message !== null && (message as PresetApplyMessage).op === 'preset.apply';
}
