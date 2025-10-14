import assert from 'assert';
import { Vector2 } from '../src/lucid3d/Math/Vector2';
import { Vector3 } from '../src/lucid3d/Math/Vector3';

const globalWindow = (globalThis as any).window ?? {
  location: { search: '', hash: '' },
  addEventListener() {},
  removeEventListener() {},
  onhashchange: null,
};
(globalThis as any).window = globalWindow;

async function main() {
  const [{ ProceduralMesh, PolygonFace }, { buildMeshBuffers }, { Operators }] = await Promise.all([
    import('../src/lucid3d/procedural/procedural-mesh'),
    import('../src/lucid3d/procedural/mesh-buffer-adapter'),
    import('../src/lucid3d/procedural/operators'),
  ]);
  const { createUvSphereMesh, createIcosahedronMesh } = await import('../src/lucid3d/procedural/primitives');

function buildQuadMesh(): ProceduralMesh {
  const mesh = new ProceduralMesh();
  const p0 = mesh.addPoint(new Vector3(0, 0, 0));
  const p1 = mesh.addPoint(new Vector3(1, 0, 0));
  const p2 = mesh.addPoint(new Vector3(1, 1, 0));
  const p3 = mesh.addPoint(new Vector3(0, 1, 0));

  const polygon: PolygonFace = {
    outer: [
      new Vector2(0, 0),
      new Vector2(1, 0),
      new Vector2(1, 1),
      new Vector2(0, 1),
    ],
  };

  mesh.addPrimitive([p0, p1, p2, p3], polygon);
  return mesh;
}

function testTriangulation() {
  const mesh = buildQuadMesh();
  const buffers = buildMeshBuffers(mesh, { includeNormals: false, includeUVs: false });
  assert.strictEqual(buffers.positions.length, 12, 'quad should expose four vertices');
  assert.strictEqual(buffers.indices.length, 6, 'quad triangulation should output two triangles');
}

function buildTrianglePair(): ProceduralMesh {
  const mesh = new ProceduralMesh();
  const p0 = mesh.addPoint(new Vector3(0, 0, 0));
  const p1 = mesh.addPoint(new Vector3(1, 0, 0));
  const p2 = mesh.addPoint(new Vector3(1, 1, 0));
  const p3 = mesh.addPoint(new Vector3(0, 1, 0));
  mesh.addPrimitive([p0, p1, p2]);
  mesh.addPrimitive([p0, p2, p3]);
  return mesh;
}

function testComputeQuads() {
  const mesh = buildTrianglePair();
  Operators.ComputeQuads().execute(mesh);
  const quads = mesh.getDetailAttribute<QuadRecord[]>('quads');
  assert(quads && quads.length === 1, 'expected one quad record');
}

type QuadRecord = {
  primitives: [number, number];
  points: number[];
  normal: [number, number, number];
};

function testPolyExtrude() {
  const mesh = buildQuadMesh();
  const initialCount = mesh.getPrimitiveIds().length;
  Operators.PolyExtrude({ distance: 0.25, keepBase: true }).execute(mesh);
  const afterCount = mesh.getPrimitiveIds().length;
  assert(afterCount === initialCount + 1 + 4, 'polyExtrude should add top + 4 sides');
}

function testConnectivity() {
  const mesh = buildQuadMesh();
  // add a disconnected triangle
  const offset = new Vector3(3, 0, 0);
  const p4 = mesh.addPoint(new Vector3().copy(offset));
  const p5 = mesh.addPoint(new Vector3(0.5, 1, 0).add(offset));
  const p6 = mesh.addPoint(new Vector3(1, 0, 0).add(offset));
  mesh.addPrimitive([p4, p5, p6]);

  const opFactory = Operators.Connectivity;
  const op = opFactory();
  op.execute(mesh);

  const connectivityGroups = mesh
    .getGroupIds()
    .filter((id) => mesh.getGroupAttribute<string>(id, 'Name') === 'connectivity');

  assert.strictEqual(connectivityGroups.length, 2, 'two disconnected patches expected');
}

function main() {
  testTriangulation();
  testComputeQuads();
  testPolyExtrude();
  testConnectivity();
  testPrimitives();
  console.log('Procedural mesh smoke tests passed.');
}

function testPrimitives() {
  const uvSphere = createUvSphereMesh({ widthSegments: 8, heightSegments: 6 });
  const isoSphere = createIcosahedronMesh({ subdivisions: 1 });
  assert(uvSphere.pointCount > 0 && uvSphere.primitiveCount > 0, 'uvSphere should have points/primitives');
  assert(isoSphere.pointCount > 0 && isoSphere.primitiveCount > 0, 'icosahedron should have points/primitives');
}
main();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
