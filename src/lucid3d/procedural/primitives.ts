import { Vector2 } from '../Math/Vector2';
import { Vector3 } from '../Math/Vector3';
import { ProceduralMesh, PolygonFace, PointId } from './procedural-mesh';

export type UvSphereOptions = {
  radius?: number;
  widthSegments?: number;
  heightSegments?: number;
  generateUVs?: boolean;
};

export function createUvSphereMesh(options: UvSphereOptions = {}): ProceduralMesh {
  const radius = options.radius ?? 1;
  const widthSegments = Math.max(3, Math.floor(options.widthSegments ?? 16));
  const heightSegments = Math.max(2, Math.floor(options.heightSegments ?? 12));
  const generateUVs = options.generateUVs ?? true;

  const mesh = new ProceduralMesh();
  const pointGrid: PointId[][] = [];

  for (let y = 0; y <= heightSegments; y++) {
    const v = y / heightSegments;
    const theta = v * Math.PI; // 0 -> PI
    const row: PointId[] = [];
    for (let x = 0; x <= widthSegments; x++) {
      const u = x / widthSegments;
      const phi = u * Math.PI * 2; // 0 -> 2PI
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const position = new Vector3(
        radius * sinTheta * cosPhi,
        radius * cosTheta,
        radius * sinTheta * sinPhi,
      );
      const pointId = mesh.addPoint(position);
      const normal = position.clone().normalize();
      mesh.setPointAttribute(pointId, 'N', normal);
      if (generateUVs) {
        mesh.setPointAttribute(pointId, 'UV', new Vector2(u, 1 - v));
      }
      row.push(pointId);
    }
    pointGrid.push(row);
  }

  for (let y = 0; y < heightSegments; y++) {
    for (let x = 0; x < widthSegments; x++) {
      const a = pointGrid[y][x];
      const b = pointGrid[y + 1][x];
      const c = pointGrid[y + 1][x + 1];
      const d = pointGrid[y][x + 1];

      if (y !== 0) {
        mesh.addPrimitive([a, b, d]);
      }
      if (y !== heightSegments - 1) {
        mesh.addPrimitive([b, c, d]);
      }
    }
  }

  return mesh;
}

export type IcosahedronOptions = {
  radius?: number;
  subdivisions?: number;
  generateUVs?: boolean;
};

export function createIcosahedronMesh(options: IcosahedronOptions = {}): ProceduralMesh {
  const radius = options.radius ?? 1;
  const subdivisions = Math.max(0, Math.floor(options.subdivisions ?? 0));
  const generateUVs = options.generateUVs ?? true;
  const mesh = new ProceduralMesh();

  const t = (1 + Math.sqrt(5)) / 2;
  const base: Vector3[] = [
    new Vector3(-1, t, 0),
    new Vector3(1, t, 0),
    new Vector3(-1, -t, 0),
    new Vector3(1, -t, 0),

    new Vector3(0, -1, t),
    new Vector3(0, 1, t),
    new Vector3(0, -1, -t),
    new Vector3(0, 1, -t),

    new Vector3(t, 0, -1),
    new Vector3(t, 0, 1),
    new Vector3(-t, 0, -1),
    new Vector3(-t, 0, 1),
  ];

  base.forEach((v) => v.normalize().multiplyScalar(radius));

  const faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],

    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],

    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],

    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  const vertexMap = new Map<string, PointId>();
  const addVertex = (position: Vector3): PointId => {
    const key = `${position.x.toFixed(6)},${position.y.toFixed(6)},${position.z.toFixed(6)}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const id = mesh.addPoint(position.clone());
    mesh.setPointAttribute(id, 'N', position.clone().normalize());
    if (generateUVs) {
      mesh.setPointAttribute(id, 'UV', sphericalUV(position.clone()));
    }
    vertexMap.set(key, id);
    return id;
  };

  const midpointCache = new Map<string, Vector3>();
  const midpoint = (a: Vector3, b: Vector3): Vector3 => {
    const key = `${a.x}:${a.y}:${a.z}|${b.x}:${b.y}:${b.z}`;
    const key2 = `${b.x}:${b.y}:${b.z}|${a.x}:${a.y}:${a.z}`;
    const cached = midpointCache.get(key) ?? midpointCache.get(key2);
    if (cached) return cached.clone();
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(radius);
    midpointCache.set(key, mid.clone());
    return mid;
  };

  let triangles = faces.map(([a, b, c]) => [base[a], base[b], base[c]] as [Vector3, Vector3, Vector3]);

  for (let i = 0; i < subdivisions; i++) {
    const newTriangles: [Vector3, Vector3, Vector3][] = [];
    for (const [v1, v2, v3] of triangles) {
      const a = midpoint(v1, v2);
      const b = midpoint(v2, v3);
      const c = midpoint(v3, v1);
      newTriangles.push([v1, a, c]);
      newTriangles.push([v2, b, a]);
      newTriangles.push([v3, c, b]);
      newTriangles.push([a, b, c]);
    }
    triangles = newTriangles;
  }

  for (const [v1, v2, v3] of triangles) {
    const id1 = addVertex(v1);
    const id2 = addVertex(v2);
    const id3 = addVertex(v3);
    mesh.addPrimitive([id1, id2, id3]);
  }

  return mesh;
}

export function sphericalUV(position: Vector3): Vector2 {
  const n = position.clone().normalize();
  const u = 0.5 + Math.atan2(n.z, n.x) / (2 * Math.PI);
  const v = 0.5 - Math.asin(n.y) / Math.PI;
  return new Vector2((u + 1) % 1, v);
}
