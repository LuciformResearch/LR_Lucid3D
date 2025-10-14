import { Vector2 } from '../Math/Vector2';
import { Vector3 } from '../Math/Vector3';
import { Quaternion } from '../Math/Quaternion';

/**
 * Generic payload accepted for procedural mesh attributes.
 * The legacy system was permissive, so we keep the union broad while
 * encouraging strongly typed usages in new modules.
 */
export type AttributePrimitive =
  | number
  | string
  | boolean
  | null
  | Vector2
  | Vector3
  | Quaternion;

export interface AttributeObject {
  [key: string]:
    | AttributePrimitive
    | AttributePrimitive[]
    | AttributeObject
    | AttributeObject[]
    | AttributeMap
    | AttributeMap[];
}

export type AttributeArray = AttributePrimitive[] | AttributeObject[] | AttributeMap[];

export type AttributeValue = AttributePrimitive | AttributeArray | AttributeObject | AttributeMap;

/**
 * Lightweight attribute container keyed by attribute name.
 * We use a Map internally for predictable iteration order and easy cloning.
 */
export type AttributeMap = Map<string, AttributeValue>;

export type AttributeTable = Map<number, AttributeMap>;

export type DetailAttributeTable = Map<string, AttributeValue>;

export interface CloneableAttribute {
  clone(): AttributeValue;
}

export function cloneAttributeValue(value: AttributeValue): AttributeValue {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => cloneAttributeValue(item)) as AttributeArray;
  }
  if (value instanceof Vector2) return value.clone();
  if (value instanceof Vector3) return value.clone();
  if (value instanceof Quaternion) return value.clone();
  if (value instanceof Map) {
    const cloned = new Map<string, AttributeValue>();
    for (const [key, entry] of value.entries()) {
      cloned.set(key, cloneAttributeValue(entry));
    }
    return cloned;
  }
  if (typeof value === 'object' && value !== null && 'clone' in (value as any)) {
    const candidate = (value as any).clone;
    if (typeof candidate === 'function') {
      return candidate.call(value);
    }
  }
  if (typeof value === 'object' && value !== null) {
    const cloned: AttributeObject = {};
    for (const key of Object.keys(value as AttributeObject)) {
      cloned[key] = cloneAttributeValue((value as AttributeObject)[key] as AttributeValue);
    }
    return cloned;
  }
  return value;
}
