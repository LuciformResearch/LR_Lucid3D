import { Vector2 } from '../Math/Vector2';
import { Vector3 } from '../Math/Vector3';
import { AttributeStore } from './attribute-store';
import { AttributeValue, DetailAttributeTable, cloneAttributeValue } from './types';
import { PointAccessor, PrimitiveAccessor, GroupAccessor } from './accessors';
import { triangulatePolygon } from './polygon-triangulator';

export type PrimitiveId = number;
export type PointId = number;
export type GroupId = number;

export interface GroupDefinition {
  name?: string;
  points?: PointId[];
  primitives?: PrimitiveId[];
}

export interface PolygonFace {
  outer: Vector2[];
  holes?: Vector2[][];
}

/**
 * Modernised version of the legacy ProceduralMesh wrapper.
 * The API remains intentionally close to the original so existing operators
 * can be ported method-by-method.
 */
export class ProceduralMesh {
  private readonly pointAttributes = new AttributeStore();
  private readonly primitiveAttributes = new AttributeStore();
  private readonly groupAttributes = new AttributeStore();

  private readonly detailAttributes: DetailAttributeTable = new Map();
  private readonly parameterAttributes: DetailAttributeTable = new Map();

  private readonly primitiveVertices = new Map<PrimitiveId, PointId[]>();
  private readonly pointPrimitives = new Map<PointId, Set<PrimitiveId>>();
  private readonly primitiveNeighbors = new Map<PrimitiveId, Set<PrimitiveId>>();
  private readonly primitiveGroups = new Map<PrimitiveId, Set<GroupId>>();
  private readonly primitivePolygons = new Map<PrimitiveId, PolygonFace>();
  private readonly primitiveTriangulations = new Map<PrimitiveId, number[]>();
  private readonly groupPoints = new Map<GroupId, Set<PointId>>();
  private readonly groupPrimitives = new Map<GroupId, Set<PrimitiveId>>();

  private nextPointId: PointId = 0;
  private nextPrimitiveId: PrimitiveId = 0;
  private nextGroupId: GroupId = 0;

  clear(): void {
    this.pointAttributes.clear();
    this.primitiveAttributes.clear();
    this.groupAttributes.clear();
    this.detailAttributes.clear();
    this.parameterAttributes.clear();
    this.primitiveVertices.clear();
    this.pointPrimitives.clear();
    this.groupPoints.clear();
    this.groupPrimitives.clear();
    this.nextPointId = 0;
    this.nextPrimitiveId = 0;
    this.nextGroupId = 0;
  }

  clone(): ProceduralMesh {
    const clone = new ProceduralMesh();
    clone.nextPointId = this.nextPointId;
    clone.nextPrimitiveId = this.nextPrimitiveId;
    clone.nextGroupId = this.nextGroupId;

    this.pointAttributes.forEach((index, map) => {
      for (const [name, value] of map.entries()) {
        clone.pointAttributes.set(index, name, cloneAttributeValue(value));
      }
    });
    this.primitiveAttributes.forEach((index, map) => {
      for (const [name, value] of map.entries()) {
        clone.primitiveAttributes.set(index, name, cloneAttributeValue(value));
      }
    });
    this.groupAttributes.forEach((index, map) => {
      for (const [name, value] of map.entries()) {
        clone.groupAttributes.set(index, name, cloneAttributeValue(value));
      }
    });

    for (const [name, value] of this.detailAttributes.entries()) {
      clone.detailAttributes.set(name, cloneAttributeValue(value));
    }
    for (const [name, value] of this.parameterAttributes.entries()) {
      clone.parameterAttributes.set(name, cloneAttributeValue(value));
    }

    for (const [primId, vertices] of this.primitiveVertices.entries()) {
      clone.primitiveVertices.set(primId, [...vertices]);
    }
    for (const [primId, polygon] of this.primitivePolygons.entries()) {
      clone.primitivePolygons.set(primId, {
        outer: polygon.outer.map((v) => v.clone()),
        holes: polygon.holes?.map((loop) => loop.map((v) => v.clone())),
      });
    }
    for (const [primId, indices] of this.primitiveTriangulations.entries()) {
      clone.primitiveTriangulations.set(primId, [...indices]);
    }
    for (const [pointId, primitives] of this.pointPrimitives.entries()) {
      clone.pointPrimitives.set(pointId, new Set(primitives));
    }
    for (const [groupId, points] of this.groupPoints.entries()) {
      clone.groupPoints.set(groupId, new Set(points));
    }
    for (const [groupId, primitives] of this.groupPrimitives.entries()) {
      clone.groupPrimitives.set(groupId, new Set(primitives));
    }

    return clone;
  }

  get pointCount(): number {
    return this.nextPointId;
  }

  get primitiveCount(): number {
    return this.nextPrimitiveId;
  }

  addPoint(position: Vector3): PointId {
    const id = this.nextPointId++;
    this.pointAttributes.ensure(id);
    this.setPointAttribute(id, 'P', position.clone());
    return id;
  }

  removePoint(id: PointId): void {
    this.pointAttributes.delete(id);
    this.pointPrimitives.delete(id);
    for (const [primId, vertices] of this.primitiveVertices) {
      const index = vertices.indexOf(id);
      if (index >= 0) {
        vertices.splice(index, 1);
        this.setPrimitiveAttribute(primId, 'Vertices', [...vertices]);
      }
    }
    for (const points of this.groupPoints.values()) {
      points.delete(id);
    }
  }

  getPointAttribute<T extends AttributeValue>(id: PointId, name: string): T | undefined {
    return this.pointAttributes.get<T>(id, name);
  }

  getPointPosition(id: PointId): Vector3 {
    const position = this.getPointAttribute<Vector3>(id, 'P');
    if (!position) {
      throw new Error(`Point ${id} has no position attribute 'P'.`);
    }
    return position.clone();
  }

  setPointAttribute(id: PointId, name: string, value: AttributeValue): void {
    this.pointAttributes.set(id, name, cloneAttributeValue(value));
  }

  listPointAttributes(id: PointId): string[] {
    return this.pointAttributes.keys(id);
  }

  getPointIds(): PointId[] {
    return this.pointAttributes.indices();
  }

  addPrimitive(vertices: PointId[], polygon?: PolygonFace): PrimitiveId {
    const id = this.nextPrimitiveId++;
    this.primitiveAttributes.ensure(id);
    this.setPrimitiveVertices(id, vertices);
    if (polygon) {
      this.primitivePolygons.set(id, polygon);
      const { indices } = triangulatePolygon(polygon);
      this.primitiveTriangulations.set(id, indices);
    }
    return id;
  }

  getPrimitiveVertices(id: PrimitiveId): PointId[] {
    return [...(this.primitiveVertices.get(id) ?? [])];
  }

  private setPrimitiveVertices(id: PrimitiveId, vertices: PointId[]): void {
    const unique = [...vertices];
    this.primitiveVertices.set(id, unique);
    this.setPrimitiveAttribute(id, 'Vertices', [...unique]);
    this.primitiveNeighbors.set(id, this.primitiveNeighbors.get(id) ?? new Set());
    for (const vertexId of unique) {
      let set = this.pointPrimitives.get(vertexId);
      if (!set) {
        set = new Set();
        this.pointPrimitives.set(vertexId, set);
      }
      if (!set.has(id)) {
        set.add(id);
      }
      for (const otherPrim of set) {
        if (otherPrim === id) continue;
        this.primitiveNeighbors.get(id)?.add(otherPrim);
        if (!this.primitiveNeighbors.has(otherPrim)) {
          this.primitiveNeighbors.set(otherPrim, new Set());
        }
        this.primitiveNeighbors.get(otherPrim)?.add(id);
      }
    }
  }

  removePrimitive(id: PrimitiveId): void {
    const vertices = this.primitiveVertices.get(id);
    if (vertices) {
      for (const vertexId of vertices) {
        const set = this.pointPrimitives.get(vertexId);
        if (set) {
          set.delete(id);
          for (const other of set) {
            this.primitiveNeighbors.get(other)?.delete(id);
          }
        }
      }
    }
    this.primitiveVertices.delete(id);
    this.primitiveAttributes.delete(id);
    this.primitiveNeighbors.delete(id);
    this.primitivePolygons.delete(id);
    this.primitiveTriangulations.delete(id);
    const groupIds = this.primitiveGroups.get(id);
    if (groupIds) {
      for (const groupId of groupIds) {
        const set = this.groupPrimitives.get(groupId);
        set?.delete(id);
        this.groupPrimitives.set(groupId, new Set(set ?? []));
      }
    }
    this.primitiveGroups.delete(id);
    for (const primitives of this.groupPrimitives.values()) {
      primitives.delete(id);
    }
  }

  getPrimitiveNeighbors(id: PrimitiveId): PrimitiveId[] {
    return Array.from(this.primitiveNeighbors.get(id) ?? []);
  }

  getPrimitivePolygon(id: PrimitiveId): PolygonFace | undefined {
    return this.primitivePolygons.get(id);
  }

  getPrimitiveTriangulation(id: PrimitiveId): number[] | undefined {
    return this.primitiveTriangulations.get(id);
  }

  getPrimitiveTriangles(id: PrimitiveId): PointId[][] {
    const vertices = this.getPrimitiveVertices(id);
    const triangulation = this.getPrimitiveTriangulation(id);
    const triangles: PointId[][] = [];
    if (triangulation && triangulation.length >= 3) {
      for (let i = 0; i < triangulation.length; i += 3) {
        triangles.push([
          vertices[triangulation[i]],
          vertices[triangulation[i + 1]],
          vertices[triangulation[i + 2]],
        ]);
      }
    } else if (vertices.length === 3) {
      triangles.push([...vertices]);
    } else if (vertices.length > 3) {
      for (let i = 1; i < vertices.length - 1; i++) {
        triangles.push([vertices[0], vertices[i], vertices[i + 1]]);
      }
    }
    return triangles;
  }

  computePrimitiveNormal(id: PrimitiveId): Vector3 {
    const triangles = this.getPrimitiveTriangles(id);
    const normal = new Vector3(0, 0, 0);
    for (const triangle of triangles) {
      const [aId, bId, cId] = triangle;
      const a = this.getPointPosition(aId);
      const b = this.getPointPosition(bId);
      const c = this.getPointPosition(cId);
      const ab = b.clone().sub(a);
      const ac = c.clone().sub(a);
      normal.add(ab.cross(ac));
    }
    if (normal.lengthSq() < 1e-8) {
      return new Vector3(0, 0, 1);
    }
    return normal.normalize();
  }

  getPrimitiveAttribute<T extends AttributeValue>(id: PrimitiveId, name: string): T | undefined {
    return this.primitiveAttributes.get<T>(id, name);
  }

  setPrimitiveAttribute(id: PrimitiveId, name: string, value: AttributeValue): void {
    this.primitiveAttributes.set(id, name, cloneAttributeValue(value));
  }

  listPrimitiveAttributes(id: PrimitiveId): string[] {
    return this.primitiveAttributes.keys(id);
  }

  getPrimitiveIds(): PrimitiveId[] {
    return this.primitiveAttributes.indices();
  }

  addGroup(def: GroupDefinition = {}): GroupId {
    const id = this.nextGroupId++;
    this.groupAttributes.ensure(id);
    if (def.name) {
      this.setGroupAttribute(id, 'Name', def.name);
    }
    if (def.points) {
      this.setGroupPoints(id, def.points);
    }
    if (def.primitives) {
      this.setGroupPrimitives(id, def.primitives);
    }
    return id;
  }

  getGroupAttribute<T extends AttributeValue>(id: GroupId, name: string): T | undefined {
    return this.groupAttributes.get<T>(id, name);
  }

  setGroupAttribute(id: GroupId, name: string, value: AttributeValue): void {
    this.groupAttributes.set(id, name, cloneAttributeValue(value));
  }

  listGroupAttributes(id: GroupId): string[] {
    return this.groupAttributes.keys(id);
  }

  getGroupIds(): GroupId[] {
    return this.groupAttributes.indices();
  }

  forEachPoint(callback: (accessor: PointAccessor) => void): void {
    for (const id of this.getPointIds()) {
      callback(new PointAccessor(this, id));
    }
  }

  forEachPrimitive(callback: (accessor: PrimitiveAccessor) => void): void {
    for (const id of this.getPrimitiveIds()) {
      callback(new PrimitiveAccessor(this, id));
    }
  }

  forEachGroup(callback: (accessor: GroupAccessor) => void): void {
    for (const id of this.getGroupIds()) {
      callback(new GroupAccessor(this, id));
    }
  }

  getGroupPoints(id: GroupId): PointId[] {
    return Array.from(this.groupPoints.get(id) ?? []);
  }

  getGroupPrimitives(id: GroupId): PrimitiveId[] {
    return Array.from(this.groupPrimitives.get(id) ?? []);
  }

  setGroupPoints(id: GroupId, points: PointId[]): void {
    this.groupPoints.set(id, new Set(points));
    this.setGroupAttribute(id, 'Points', [...points]);
  }

  setGroupPrimitives(id: GroupId, primitives: PrimitiveId[]): void {
    const previous = this.groupPrimitives.get(id);
    if (previous) {
      for (const prim of previous) {
        this.primitiveGroups.get(prim)?.delete(id);
      }
    }
    const updated = new Set(primitives);
    this.groupPrimitives.set(id, updated);
    for (const prim of updated) {
      let groups = this.primitiveGroups.get(prim);
      if (!groups) {
        groups = new Set();
        this.primitiveGroups.set(prim, groups);
      }
      groups.add(id);
    }
    this.setGroupAttribute(id, 'Primitives', [...primitives]);
  }

  getPointPrimitiveRefs(id: PointId): PrimitiveId[] {
    return Array.from(this.pointPrimitives.get(id) ?? []);
  }

  getPrimitiveGroupIds(id: PrimitiveId): GroupId[] {
    return Array.from(this.primitiveGroups.get(id) ?? []);
  }

  setDetailAttribute(name: string, value: AttributeValue): void {
    this.detailAttributes.set(name, cloneAttributeValue(value));
  }

  getDetailAttribute<T extends AttributeValue>(name: string): T | undefined {
    return this.detailAttributes.get(name) as T | undefined;
  }

  setParameter(name: string, value: AttributeValue): void {
    this.parameterAttributes.set(name, cloneAttributeValue(value));
  }

  getParameter<T extends AttributeValue>(name: string): T | undefined {
    return this.parameterAttributes.get(name) as T | undefined;
  }
}
