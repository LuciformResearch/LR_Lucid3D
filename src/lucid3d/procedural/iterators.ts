import { ProceduralMesh, PointId, PrimitiveId, GroupId } from './procedural-mesh';
import { PointAccessor, PrimitiveAccessor, GroupAccessor } from './accessors';

export enum IteratorType {
  Quad = 0,
  Point = 1,
  Primitive = 2,
  Detail = 3,
  Group = 4,
}

export type DetailIterator = (mesh: ProceduralMesh) => void;
export type PointIterator = (mesh: ProceduralMesh, accessor: PointAccessor) => void;
export type PrimitiveIterator = (mesh: ProceduralMesh, accessor: PrimitiveAccessor) => void;
export type GroupIterator = (mesh: ProceduralMesh, accessor: GroupAccessor) => void;

export type MeshIterator = DetailIterator | PointIterator | PrimitiveIterator | GroupIterator;

export class IteratorInfo {
  constructor(public readonly type: IteratorType, public readonly iterator: MeshIterator) {}

  clone(): IteratorInfo {
    return new IteratorInfo(this.type, this.iterator);
  }
}
