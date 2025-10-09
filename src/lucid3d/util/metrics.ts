export type MetricsSnapshot = {
  buffersCreated: number;
  bindGroupsCreated: number;
  textureViewsCreated: number;
  writes: number;
  bytes: number;
};

class MetricsImpl {
  private enabled = false;
  private counters: MetricsSnapshot = { buffersCreated: 0, bindGroupsCreated: 0, textureViewsCreated: 0, writes: 0, bytes: 0 };

  setEnabled(v: boolean) { this.enabled = v; }
  isEnabled() { return this.enabled; }

  incBuffers(n = 1) { if (this.enabled) this.counters.buffersCreated += n; }
  incBindGroups(n = 1) { if (this.enabled) this.counters.bindGroupsCreated += n; }
  incTextureViews(n = 1) { if (this.enabled) this.counters.textureViewsCreated += n; }
  addWrite(bytes: number) { if (this.enabled) { this.counters.writes += 1; this.counters.bytes += bytes; } }

  snapshotAndReset(): MetricsSnapshot {
    const snap = { ...this.counters };
    this.counters = { buffersCreated: 0, bindGroupsCreated: 0, textureViewsCreated: 0, writes: 0, bytes: 0 };
    return snap;
  }
}

export const Metrics = new MetricsImpl();

