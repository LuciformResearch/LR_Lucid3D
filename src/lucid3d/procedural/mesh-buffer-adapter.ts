import { Vector3 } from '../Math/Vector3';
import { Vector2 } from '../Math/Vector2';
import {
  ProceduralMesh,
  PointId,
  PrimitiveId,
  PolygonFace,
} from './procedural-mesh';
import { triangulatePolygon } from './polygon-triangulator';

export interface MeshBufferOptions {
  includeNormals?: boolean;
  includeUVs?: boolean;
  fanTriangulationFallback?: boolean;
}

export interface MeshBuffers {
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
  pointIndexMap: Map<PointId, number>;
  maxIndex: number;
}

/**
 * Converts a ProceduralMesh into typed arrays consumable by GPU upload code.
 * Triangulation uses stored polygon metadata when available, falling back
 * to simple fan triangulation if requested.
 */
export function buildMeshBuffers(
  mesh: ProceduralMesh,
  options: MeshBufferOptions = {},
): MeshBuffers {
  const {
    includeNormals = true,
    includeUVs = false,
    fanTriangulationFallback = true,
  } = options;

  const pointIds = mesh.getPointIds();
  const pointIndexMap = new Map<PointId, number>();
  pointIds.forEach((id, i) => pointIndexMap.set(id, i));

  const positions = new Float32Array(pointIds.length * 3);
  const normals = includeNormals ? new Float32Array(pointIds.length * 3) : undefined;
  const uvs = includeUVs ? new Float32Array(pointIds.length * 2) : undefined;

  pointIds.forEach((id, i) => {
    const position = mesh.getPointAttribute<Vector3>(id, 'P');
    if (!position) {
      throw new Error(`Point ${id} missing position attribute 'P'.`);
    }
    positions.set([position.x, position.y, position.z], i * 3);

    if (normals) {
      const normal = mesh.getPointAttribute<Vector3>(id, 'N');
      if (normal) {
        normals.set([normal.x, normal.y, normal.z], i * 3);
      }
    }

    if (uvs) {
      const uv =
        mesh.getPointAttribute<Vector2>(id, 'uv') ??
        mesh.getPointAttribute<Vector2>(id, 'UV');
      if (uv) {
        uvs.set([uv.x, uv.y], i * 2);
      }
    }
  });

  const indexArray: number[] = [];
  const pushTriangle = (a: PointId, b: PointId, c: PointId) => {
    const ia = pointIndexMap.get(a);
    const ib = pointIndexMap.get(b);
    const ic = pointIndexMap.get(c);
    if (ia === undefined || ib === undefined || ic === undefined) {
      throw new Error('Primitive references unknown point id.');
    }
    indexArray.push(ia, ib, ic);
  };

  const primitiveIds = mesh.getPrimitiveIds();
  for (const primId of primitiveIds) {
    const vertices = mesh.getPrimitiveVertices(primId);
    if (vertices.length < 3) continue;

    const triangulated = resolveTriangulation(mesh, primId, vertices, fanTriangulationFallback);
    for (let i = 0; i < triangulated.length; i += 3) {
      pushTriangle(
        triangulated[i],
        triangulated[i + 1],
        triangulated[i + 2],
      );
    }
  }

  const indices = new Uint32Array(indexArray);
  let maxIndex = 0;
  for (const idx of indices) {
    if (idx > maxIndex) maxIndex = idx;
  }
  return {
    positions,
    normals,
    uvs,
    indices,
    pointIndexMap,
    maxIndex,
  };
}

function resolveTriangulation(
  mesh: ProceduralMesh,
  primId: PrimitiveId,
  vertexOrder: PointId[],
  allowFanFallback: boolean,
): PointId[] {
  const stored = mesh.getPrimitiveTriangulation(primId);
  if (stored && stored.length > 0) {
    return mapIndicesToPoints(stored, vertexOrder);
  }

  const polygon = mesh.getPrimitivePolygon(primId);
  if (polygon) {
    const { indices } = triangulatePolygon(polygon);
    return mapIndicesToPoints(indices, vertexOrder);
  }

  if (vertexOrder.length === 3) {
    return [...vertexOrder];
  }

  if (allowFanFallback) {
    const triangles: PointId[] = [];
    for (let i = 1; i < vertexOrder.length - 1; i++) {
      triangles.push(vertexOrder[0], vertexOrder[i], vertexOrder[i + 1]);
    }
    return triangles;
  }

  console.warn(
    `[MeshBuffers] Primitive ${primId} has ${vertexOrder.length} vertices and no triangulation info.`,
  );
  return [];
}

function mapIndicesToPoints(indices: number[], vertexOrder: PointId[]): PointId[] {
  const triangles: PointId[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertexOrder[indices[i]];
    const b = vertexOrder[indices[i + 1]];
    const c = vertexOrder[indices[i + 2]];
    if (
      a === undefined ||
      b === undefined ||
      c === undefined
    ) {
      throw new Error('Triangulation references an out-of-range vertex index.');
    }
    triangles.push(a, b, c);
  }
  return triangles;
}
