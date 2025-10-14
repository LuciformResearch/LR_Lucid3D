import { Vector3 } from '../Math/Vector3';
import { ProceduralMesh, PrimitiveId, PointId } from './procedural-mesh';
import { ProceduralMeshOperation } from './procedural-mesh-operation';
import { IteratorType } from './iterators';
import { PointAccessor } from './accessors';
import { cloneAttributeValue } from './types';

type OperatorFactory = () => ProceduralMeshOperation;

type PolyExtrudeOptions = {
  distance?: number;
  keepBase?: boolean;
  group?: string;
};

type QuadRecord = {
  primitives: [PrimitiveId, PrimitiveId];
  points: PointId[];
  normal: [number, number, number];
};

const connectivity: OperatorFactory = () =>
  new ProceduralMeshOperation('Connectivity').addIterator(IteratorType.Detail, (mesh: ProceduralMesh) => {
    const visited = new Set<number>();

    const assignGroup = (seedId: number, groupId: number) => {
      const stack: number[] = [seedId];
      while (stack.length) {
        const pointId = stack.pop()!;
        if (visited.has(pointId)) continue;
        visited.add(pointId);
        const points = mesh.getGroupPoints(groupId);
        points.push(pointId);
        mesh.setGroupPoints(groupId, points);
        const accessor = new PointAccessor(mesh, pointId);
        for (const neighborId of accessor.neighbors) {
          if (!visited.has(neighborId)) stack.push(neighborId);
        }
      }
    };

    for (const pointId of mesh.getPointIds()) {
      if (visited.has(pointId)) continue;
      const groupId = mesh.addGroup({ name: 'connectivity', points: [] });
      assignGroup(pointId, groupId);
    }

    for (const primId of mesh.getPrimitiveIds()) {
      const vertexGroups = new Set<number>();
      const vertices = mesh.getPrimitiveVertices(primId);
      for (const vertex of vertices) {
        for (const groupId of mesh.getGroupIds()) {
          const name = mesh.getGroupAttribute<string>(groupId, 'Name') ?? '';
          if (name === 'connectivity' && mesh.getGroupPoints(groupId).includes(vertex)) {
            vertexGroups.add(groupId);
          }
        }
      }
      for (const groupId of vertexGroups) {
        const primitives = new Set(mesh.getGroupPrimitives(groupId));
        primitives.add(primId);
        mesh.setGroupPrimitives(groupId, Array.from(primitives));
      }
    }
  });

const computeQuads: OperatorFactory = () =>
  new ProceduralMeshOperation('ComputeQuads').addIterator(IteratorType.Detail, (mesh: ProceduralMesh) => {
    const edgeOwners = new Map<string, { primId: PrimitiveId; vertices: PointId[]; normal: Vector3 }>();
    const processedPairs = new Set<string>();
    const quads: QuadRecord[] = [];

    for (const primId of mesh.getPrimitiveIds()) {
      const vertices = mesh.getPrimitiveVertices(primId);
      if (vertices.length !== 3) continue; // current implementation works on triangle meshes only
      const normal = mesh.computePrimitiveNormal(primId);
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const key = makeEdgeKey(a, b);
        const twinKey = makeEdgeKey(b, a);
        if (edgeOwners.has(twinKey)) {
          const other = edgeOwners.get(twinKey)!;
          const pairKey = makePairKey(other.primId, primId);
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          const orderedPoints = buildQuadPoints(other.vertices, vertices, a, b);
          if (!orderedPoints) continue;
          const avgNormal = other.normal.clone().add(normal).normalize();
          quads.push({
            primitives: [other.primId, primId],
            points: orderedPoints,
            normal: [avgNormal.x, avgNormal.y, avgNormal.z],
          });
        } else {
          edgeOwners.set(key, { primId, vertices, normal });
        }
      }
    }

    mesh.setDetailAttribute('quads', quads);
  });

const polyExtrude = (options: PolyExtrudeOptions = {}): ProceduralMeshOperation =>
  new ProceduralMeshOperation('PolyExtrude').addIterator(IteratorType.Detail, (mesh: ProceduralMesh) => {
    const distance = options.distance ?? 0.1;
    const keepBase = options.keepBase ?? true;
    const groupName = options.group?.toLowerCase();

    const targetPrimitives = groupName
      ? gatherPrimitivesByGroup(mesh, groupName)
      : mesh.getPrimitiveIds();

    const originals = [...targetPrimitives];
    for (const primId of originals) {
      extrudePrimitive(mesh, primId, distance, keepBase);
    }
  });

export const Operators = {
  Connectivity: connectivity,
  ComputeQuads: computeQuads,
  PolyExtrude: polyExtrude,
};

export type OperatorName = keyof typeof Operators;

function makeEdgeKey(a: PointId, b: PointId): string {
  return `${a}:${b}`;
}

function makePairKey(a: PrimitiveId, b: PrimitiveId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildQuadPoints(verticesA: PointId[], verticesB: PointId[], sharedA: PointId, sharedB: PointId): PointId[] | null {
  if (verticesA.length !== 3 || verticesB.length !== 3) return null;
  const uniqueA = verticesA.find((id) => id !== sharedA && id !== sharedB);
  const uniqueB = verticesB.find((id) => id !== sharedA && id !== sharedB);
  if (uniqueA === undefined || uniqueB === undefined) return null;
  return [uniqueA, sharedA, uniqueB, sharedB];
}

function gatherPrimitivesByGroup(mesh: ProceduralMesh, groupName: string): PrimitiveId[] {
  const result: PrimitiveId[] = [];
  for (const groupId of mesh.getGroupIds()) {
    const name = mesh.getGroupAttribute<string>(groupId, 'Name') ?? '';
    if (name.toLowerCase() === groupName) {
      result.push(...mesh.getGroupPrimitives(groupId));
    }
  }
  return result;
}

function extrudePrimitive(mesh: ProceduralMesh, primId: PrimitiveId, distance: number, keepBase: boolean): void {
  const vertices = mesh.getPrimitiveVertices(primId);
  if (vertices.length < 3) return;

  const basePositions = vertices.map((id) => mesh.getPointPosition(id));
  const normal = mesh.computePrimitiveNormal(primId);
  const offset = normal.clone().multiplyScalar(distance);
  const newPointIds: PointId[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const newPos = basePositions[i].clone().add(offset);
    const newPointId = mesh.addPoint(newPos);
    copyPointAttributes(mesh, vertices[i], newPointId);
    mesh.setPointAttribute(newPointId, 'N', normal.clone());
    newPointIds.push(newPointId);
  }

  const topPrimId = mesh.addPrimitive(newPointIds, mesh.getPrimitivePolygon(primId));
  copyPrimitiveAttributes(mesh, primId, topPrimId);
  mesh.setPrimitiveAttribute(topPrimId, 'N', normal.clone());

  const sidePrimitives: PrimitiveId[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const next = (i + 1) % vertices.length;
    const side = [vertices[i], vertices[next], newPointIds[next], newPointIds[i]];
    sidePrimitives.push(mesh.addPrimitive(side));
  }

  const groupIds = mesh.getPrimitiveGroupIds(primId);
  for (const groupId of groupIds) {
    const set = new Set(mesh.getGroupPrimitives(groupId));
    if (!keepBase) set.delete(primId);
    set.add(topPrimId);
    sidePrimitives.forEach((id) => set.add(id));
    mesh.setGroupPrimitives(groupId, Array.from(set));
  }

  if (!keepBase) {
    mesh.removePrimitive(primId);
  }
}

function copyPointAttributes(mesh: ProceduralMesh, source: PointId, target: PointId): void {
  for (const name of mesh.listPointAttributes(source)) {
    if (name === 'P') continue;
    const value = mesh.getPointAttribute(source, name);
    if (value !== undefined) {
      mesh.setPointAttribute(target, name, cloneAttributeValue(value));
    }
  }
}

function copyPrimitiveAttributes(mesh: ProceduralMesh, source: PrimitiveId, target: PrimitiveId): void {
  for (const name of mesh.listPrimitiveAttributes(source)) {
    if (name === 'Vertices') continue;
    const value = mesh.getPrimitiveAttribute(source, name);
    if (value !== undefined) {
      mesh.setPrimitiveAttribute(target, name, cloneAttributeValue(value));
    }
  }
}
