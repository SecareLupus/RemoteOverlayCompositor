import { EventEmitter } from 'node:events';

export interface LayerDescriptor {
  id: string;
  name: string;
  visible: boolean;
}

export interface LayerRegistryEvents {
  upsert: (layer: LayerDescriptor) => void;
  removed: (layerId: string) => void;
  visibility: (layer: LayerDescriptor) => void;
}

export declare interface LayerRegistry {
  on<U extends keyof LayerRegistryEvents>(event: U, listener: LayerRegistryEvents[U]): this;
  off<U extends keyof LayerRegistryEvents>(event: U, listener: LayerRegistryEvents[U]): this;
  emit<U extends keyof LayerRegistryEvents>(event: U, ...args: Parameters<LayerRegistryEvents[U]>): boolean;
}

export class LayerRegistry extends EventEmitter {
  private readonly layers = new Map<string, LayerDescriptor>();

  constructor(initialLayers: LayerDescriptor[] = []) {
    super();
    initialLayers.forEach((layer) => this.layers.set(layer.id, { ...layer }));
  }

  public list(): LayerDescriptor[] {
    return [...this.layers.values()].map((layer) => ({ ...layer }));
  }

  public upsert(layer: LayerDescriptor): LayerDescriptor {
    const copy = { ...layer };
    this.layers.set(copy.id, copy);
    return { ...copy };
  }

  public delete(layerId: string): boolean {
    return this.layers.delete(layerId);
  }

  public get(layerId: string): LayerDescriptor | undefined {
    const layer = this.layers.get(layerId);
    return layer ? { ...layer } : undefined;
  }

  public setVisibility(layerId: string, visible: boolean): LayerDescriptor | undefined {
    const existing = this.layers.get(layerId);
    if (!existing) {
      return undefined;
    }
    if (existing.visible === visible) {
      return { ...existing };
    }
    const updated: LayerDescriptor = { ...existing, visible };
    this.layers.set(layerId, updated);
    return { ...updated };
  }
}
