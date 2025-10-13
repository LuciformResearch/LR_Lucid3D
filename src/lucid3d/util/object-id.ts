import { UniqueIDHelper } from '../Typescript/UniqueIDHelper';

type Obj = object | null | undefined;

const fallback = new WeakMap<object, string>();

export function getObjectId(target: Obj): string {
  if (!target) return '0';
  const asAny = target as any;
  try {
    if (typeof asAny === 'object') {
      if (!('uuid' in asAny)) {
        asAny.uuid = UniqueIDHelper.GenerateUUID();
      }
      return UniqueIDHelper.GetUUID(asAny);
    }
  } catch {
    // Fall through to WeakMap storage
  }
  const obj = target as object;
  if (!fallback.has(obj)) {
    fallback.set(obj, UniqueIDHelper.GenerateUUID());
  }
  return fallback.get(obj)!;
}
