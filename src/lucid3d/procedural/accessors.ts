import { Vector2 } from '../Math/Vector2';
import { Vector3 } from '../Math/Vector3';
import { AttributeValue } from './types';
import { ProceduralMesh, PointId, PrimitiveId, GroupId, PolygonFace } from './procedural-mesh';

export class PointAccessor {
  constructor(private readonly mesh: ProceduralMesh, public readonly id: PointId) {}

  get position(): Vector3 | undefined {
    const value = this.mesh.getPointAttribute<Vector3>(this.id, 'P');
    return value?.clone();
  }

  set position(value: Vector3 | undefined) {
    if (!value) {
      throw new Error('Position cannot be undefined.');
    }
    this.mesh.setPointAttribute(this.id, 'P', value.clone());
  }

  listAttributes(): string[] {
    return this.mesh.listPointAttributes(this.id);
  }

  getAttribute<T extends AttributeValue>(name: string): T | undefined {
    return this.mesh.getPointAttribute<T>(this.id, name);
  }

  setAttribute(name: string, value: AttributeValue): void {
    this.mesh.setPointAttribute(this.id, name, value);
  }

  get connectedPrimitives(): PrimitiveId[] {
    return this.mesh.getPointPrimitiveRefs(this.id);
  }

  get neighbors(): PointId[] {
    const neighborSet = new Set<PointId>();
    for (const primId of this.connectedPrimitives) {
      const prim = new PrimitiveAccessor(this.mesh, primId);
      for (const vertex of prim.vertices) {
        if (vertex !== this.id) neighborSet.add(vertex);
      }
    }
    return Array.from(neighborSet);
  }
}

export class PrimitiveAccessor {
  constructor(private readonly mesh: ProceduralMesh, public readonly id: PrimitiveId) {}

  get vertices(): PointId[] {
    return this.mesh.getPrimitiveVertices(this.id);
  }

  get polygon(): PolygonFace | undefined {
    return this.mesh.getPrimitivePolygon(this.id);
  }

  get triangulatedIndices(): number[] | undefined {
    return this.mesh.getPrimitiveTriangulation(this.id);
  }

  listAttributes(): string[] {
    return this.mesh.listPrimitiveAttributes(this.id);
  }

  getAttribute<T extends AttributeValue>(name: string): T | undefined {
    return this.mesh.getPrimitiveAttribute<T>(this.id, name);
  }

  setAttribute(name: string, value: AttributeValue): void {
    if (name === 'Vertices') {
      throw new Error('Use setVertices() to modify primitive vertex indices.');
    }
    this.mesh.setPrimitiveAttribute(this.id, name, value);
  }
}

export class GroupAccessor {
  constructor(private readonly mesh: ProceduralMesh, public readonly id: GroupId) {}

  get name(): string | undefined {
    return this.mesh.getGroupAttribute<string>(this.id, 'Name');
  }

  set name(value: string | undefined) {
    this.mesh.setGroupAttribute(this.id, 'Name', value ?? '');
  }

  get points(): PointId[] {
    return this.mesh.getGroupPoints(this.id);
  }

  get primitives(): PrimitiveId[] {
    return this.mesh.getGroupPrimitives(this.id);
  }

  listAttributes(): string[] {
    return this.mesh.listGroupAttributes(this.id);
  }

  getAttribute<T extends AttributeValue>(name: string): T | undefined {
    return this.mesh.getGroupAttribute<T>(this.id, name);
  }

  setAttribute(name: string, value: AttributeValue): void {
    if (name === 'Points') {
      this.mesh.setGroupPoints(this.id, value as PointId[]);
      return;
    }
    if (name === 'Primitives') {
      this.mesh.setGroupPrimitives(this.id, value as PrimitiveId[]);
      return;
    }
    this.mesh.setGroupAttribute(this.id, name, value);
  }
}
