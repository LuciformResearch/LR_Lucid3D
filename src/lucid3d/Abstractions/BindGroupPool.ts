// Simple bind group pool keyed by layout + resource identities.
// Uses WeakMap-based object IDs to produce stable keys for identical resources.

import { getObjectId } from '../util/object-id';

export class BindGroupPool {
  private map = new Map<string, GPUBindGroup>();
  private layoutIds = new WeakMap<GPUBindGroupLayout, number>();
  private nextLayoutId = 1;

  private layoutId(layout: GPUBindGroupLayout): number {
    let id = this.layoutIds.get(layout);
    if (!id) { id = this.nextLayoutId++; this.layoutIds.set(layout, id); }
    return id;
  }

  private key(layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[]): string {
    const lid = this.layoutId(layout);
    const parts: string[] = [`L${lid}`];
    // Keep entry order; include binding index and resource identity
    for (const e of entries) {
      let rid: string = '0';
      const r: any = e.resource as any;
      if (r && 'buffer' in r) {
        rid = getObjectId(r.buffer);
        parts.push(`b${e.binding}:${rid}:${r.offset ?? 0}:${r.size ?? 0}`);
      } else if (r && 'label' in r && typeof r.label === 'string') {
        parts.push(`l${e.binding}:${r.label}`);
      } else {
        rid = getObjectId(r);
        parts.push(`r${e.binding}:${rid}`);
      }
    }
    return parts.join('|');
  }

  getOrCreate(device: GPUDevice, layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[]): GPUBindGroup {
    const k = this.key(layout, entries);
    const found = this.map.get(k);
    if (found) return found;
    const bg = device.createBindGroup({ layout, entries });
    this.map.set(k, bg);
    return bg;
  }
}

export const BGPool = new BindGroupPool();
