export type PipelineKey = string;

export class PipelineCache<T> {
  private map = new Map<PipelineKey, T>();
  get(key: PipelineKey): T | undefined { return this.map.get(key); }
  set(key: PipelineKey, value: T) { this.map.set(key, value); }
}

