import { ProceduralMesh } from './procedural-mesh';
import { AttributeValue, cloneAttributeValue } from './types';
import {
  IteratorInfo,
  IteratorType,
  MeshIterator,
  DetailIterator,
  PointIterator,
  PrimitiveIterator,
  GroupIterator,
} from './iterators';
import { PointAccessor, PrimitiveAccessor, GroupAccessor } from './accessors';

type ParameterMap = Map<string, AttributeValue>;

export class ProceduralMeshOperation {
  private readonly parameters: ParameterMap = new Map();
  private readonly iteratorChain: IteratorInfo[] = [];

  constructor(public readonly name = 'Operation') {}

  static merge(...ops: ProceduralMeshOperation[]): ProceduralMeshOperation {
    const merged = new ProceduralMeshOperation('MergedOperation');
    for (const op of ops) {
      for (const info of op.iteratorChain) {
        merged.iteratorChain.push(info.clone());
      }
      for (const [key, value] of op.parameters.entries()) {
        merged.parameters.set(key, cloneAttributeValue(value));
      }
    }
    return merged;
  }

  setParameter(name: string, value: AttributeValue): ProceduralMeshOperation {
    this.parameters.set(name, cloneAttributeValue(value));
    return this;
  }

  getParameter<T extends AttributeValue>(name: string): T | undefined {
    return this.parameters.get(name) as T | undefined;
  }

  addIterator(type: IteratorType, iterator: MeshIterator): ProceduralMeshOperation {
    this.iteratorChain.push(new IteratorInfo(type, iterator));
    return this;
  }

  addDetailIterator(iterator: DetailIterator): ProceduralMeshOperation {
    return this.addIterator(IteratorType.Detail, iterator);
  }

  addPointIterator(iterator: PointIterator): ProceduralMeshOperation {
    return this.addIterator(IteratorType.Point, iterator);
  }

  addPrimitiveIterator(iterator: PrimitiveIterator): ProceduralMeshOperation {
    return this.addIterator(IteratorType.Primitive, iterator);
  }

  addGroupIterator(iterator: GroupIterator): ProceduralMeshOperation {
    return this.addIterator(IteratorType.Group, iterator);
  }

  clone(newName?: string): ProceduralMeshOperation {
    const cloned = new ProceduralMeshOperation(newName ?? this.name);
    for (const info of this.iteratorChain) cloned.iteratorChain.push(info.clone());
    for (const [key, value] of this.parameters.entries()) {
      cloned.parameters.set(key, cloneAttributeValue(value));
    }
    return cloned;
  }

  execute(mesh: ProceduralMesh): ProceduralMesh {
    let current = mesh;
    for (const info of this.iteratorChain) {
      switch (info.type) {
        case IteratorType.Detail: {
          const iterator = info.iterator as DetailIterator;
          iterator(current);
          break;
        }
        case IteratorType.Point: {
          const iterator = info.iterator as PointIterator;
          current.forEachPoint((accessor) => iterator(current, accessor));
          break;
        }
        case IteratorType.Primitive: {
          const iterator = info.iterator as PrimitiveIterator;
          current.forEachPrimitive((accessor) => iterator(current, accessor));
          break;
        }
        case IteratorType.Group: {
          const iterator = info.iterator as GroupIterator;
          current.forEachGroup((accessor) => iterator(current, accessor));
          break;
        }
        case IteratorType.Quad:
          // TODO: Quad iterators require quad support; reserved for future port.
          console.warn('[ProceduralMeshOperation] Quad iterators not yet supported.');
          break;
      }
    }
    return current;
  }
}
