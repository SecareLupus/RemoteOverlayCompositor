import { EventEmitter } from 'node:events';

export interface PresetDefinition {
  id: string;
  name: string;
  description?: string;
  visibility: Record<string, boolean>;
}

export interface PresetStoreEvents {
  upsert: (preset: PresetDefinition) => void;
  removed: (presetId: string) => void;
}

export declare interface PresetStore {
  on<U extends keyof PresetStoreEvents>(event: U, listener: PresetStoreEvents[U]): this;
  off<U extends keyof PresetStoreEvents>(event: U, listener: PresetStoreEvents[U]): this;
  emit<U extends keyof PresetStoreEvents>(event: U, ...args: Parameters<PresetStoreEvents[U]>): boolean;
}

function clonePreset(preset: PresetDefinition): PresetDefinition {
  return {
    ...preset,
    visibility: { ...preset.visibility },
  };
}

export class PresetStore extends EventEmitter {
  private readonly presets = new Map<string, PresetDefinition>();

  constructor(initialPresets: PresetDefinition[] = []) {
    super();
    initialPresets.forEach((preset) => this.presets.set(preset.id, clonePreset(preset)));
  }

  public list(): PresetDefinition[] {
    return [...this.presets.values()].map((preset) => clonePreset(preset));
  }

  public get(id: string): PresetDefinition | undefined {
    const preset = this.presets.get(id);
    return preset ? clonePreset(preset) : undefined;
  }

  public upsert(preset: PresetDefinition): PresetDefinition {
    const copy = clonePreset(preset);
    this.presets.set(copy.id, copy);
    this.emit('upsert', clonePreset(copy));
    return clonePreset(copy);
  }

  public delete(id: string): boolean {
    const removed = this.presets.delete(id);
    if (removed) {
      this.emit('removed', id);
    }
    return removed;
  }
}
