import { AttributeMap, AttributeTable, AttributeValue, cloneAttributeValue } from './types';

/**
 * Centralised helper to manage attribute tables for points/primitives/groups.
 * Mirrors the legacy behaviour (sparse arrays keyed by numeric indices)
 * but implemented with Maps for clarity.
 */
export class AttributeStore {
  private readonly entries: AttributeTable = new Map();

  clear(): void {
    this.entries.clear();
  }

  ensure(index: number): AttributeMap {
    let map = this.entries.get(index);
    if (!map) {
      map = new Map();
      this.entries.set(index, map);
    }
    return map;
  }

  has(index: number): boolean {
    return this.entries.has(index);
  }

  delete(index: number): void {
    this.entries.delete(index);
  }

  keys(index: number): string[] {
    return Array.from(this.entries.get(index)?.keys() ?? []);
  }

  indices(): number[] {
    return Array.from(this.entries.keys());
  }

  get<T extends AttributeValue>(index: number, name: string): T | undefined {
    return this.entries.get(index)?.get(name) as T | undefined;
  }

  set(index: number, name: string, value: AttributeValue): void {
    this.ensure(index).set(name, value);
  }

  clone(): AttributeStore {
    const clone = new AttributeStore();
    for (const [index, map] of this.entries) {
      const clonedMap: AttributeMap = new Map();
      for (const [name, value] of map.entries()) {
        clonedMap.set(name, cloneAttributeValue(value));
      }
      clone.entries.set(index, clonedMap);
    }
    return clone;
  }

  forEach(callback: (index: number, attributes: AttributeMap) => void): void {
    for (const [index, map] of this.entries) {
      callback(index, map);
    }
  }
}
