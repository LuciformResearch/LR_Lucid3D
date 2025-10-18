import { AbstractDynamicGeom, AttributeComponentCount, AttributePlacement } from '../WebgpuGeom';

export type PrimBufferHandle = {
  vbo: GPUBuffer;
  ibo: GPUBuffer | null;
  indexCount: number;
  vertexCount: number;
  arrayStride: number;
  indexFormat: GPUIndexFormat | null;
};

type CacheMap = Map<string, PrimBufferHandle>;

const primCache = new WeakMap<AbstractDynamicGeom, CacheMap>();

export const FORWARD_GEOM_LAYOUT: AttributePlacement[] = [
  AttributePlacement.POSITION,
  AttributePlacement.NORMAL,
  AttributePlacement.TANGENT,
  AttributePlacement.COLOR,
  AttributePlacement.TEXCOORD_0,
  AttributePlacement.TEXCOORD_1,
  AttributePlacement.JOINTS_0,
  AttributePlacement.WEIGHTS_0,
  AttributePlacement.JOINTS_1,
  AttributePlacement.WEIGHTS_1,
];

type IndexKey = GPUIndexFormat | 'none';

export function layoutStride(layout: AttributePlacement[]): number {
  let stride = 0;
  for (const placement of layout) {
    const name = AttributePlacement[placement] as keyof typeof AttributeComponentCount;
    const comp = AttributeComponentCount[name] as number;
    stride += comp * Float32Array.BYTES_PER_ELEMENT;
  }
  return stride;
}

export function layoutKey(layout: AttributePlacement[], indexFormat: GPUIndexFormat | null): string {
  const fmt: IndexKey = indexFormat ?? 'none';
  return `${layout.join(',')}|${fmt}`;
}

export function getCachedPrim(
  geom: AbstractDynamicGeom,
  layout: AttributePlacement[],
  indexFormat: GPUIndexFormat | null,
): PrimBufferHandle | undefined {
  const map = primCache.get(geom);
  if (!map) return undefined;
  return map.get(layoutKey(layout, indexFormat));
}

export function storeCachedPrim(
  geom: AbstractDynamicGeom,
  layout: AttributePlacement[],
  indexFormat: GPUIndexFormat | null,
  handle: PrimBufferHandle,
) {
  let map = primCache.get(geom);
  if (!map) {
    map = new Map<string, PrimBufferHandle>();
    primCache.set(geom, map);
  }
  map.set(layoutKey(layout, indexFormat), handle);
}

export function invalidateCachedPrim(
  geom: AbstractDynamicGeom,
  predicate?: (entry: PrimBufferHandle, key: string) => boolean,
) {
  const map = primCache.get(geom);
  if (!map) return;
  if (!predicate) {
    primCache.delete(geom);
    return;
  }
  for (const [key, entry] of map.entries()) {
    if (predicate(entry, key)) {
      map.delete(key);
    }
  }
  if (map.size === 0) {
    primCache.delete(geom);
  }
}

export function forwardLayoutStride(): number {
  return layoutStride(FORWARD_GEOM_LAYOUT);
}
