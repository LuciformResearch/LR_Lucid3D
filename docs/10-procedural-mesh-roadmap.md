# Procedural Mesh Toolkit Roadmap

## 1. Legacy Toolkit Archaeology
- Inventory the Houdini-inspired tooling under `Games/**/Tools/proceduralMesh/` (ProceduralMesh, Accessors, Iterators, Operators, custom Fall/PaintRunner ops).
- Capture dependencies on `THREE.*`, global namespaces, and expected data structures (point/prim/group attribute maps).
- Document existing operator graphs and sample usages to ensure feature parity targets.

## 2. Modern TypeScript Moduleization
- Refactor namespaces into ES module layout compatible with modern TS (strict mode, ESNext).
- Replace THREE.js vector types with existing math infrastructure (`src/lucid3d/Math/Vector2|Vector3|Quaternion`) and optionally `gl-matrix` for matrix utilities; unify numeric storage in typed arrays for GPU upload friendliness.
- Separate responsibilities:
  - `core/ProceduralMesh` (topology + attribute management)
  - `core/AttributeHandles` / iterators
  - `operators/*` (mesh ops, e.g., connectivity, extrude)
- Establish Vitest unit coverage for mesh mutations (add/remove points, attribute propagation, primitive edits).

## 3. Rendering Bridge
- Design adapters to convert `ProceduralMesh` into renderer-friendly buffers (interleaved vertex arrays + index buffers).
- Support multiple primitive topologies: triangle list, polygon (n-gon), quad strips.
- Integrate with current WebGPU abstraction pipeline (`AbstractDynamicGeom`, `ForwardPBRMaterial`), including tangent/normal generation.
- Define asset handshake (procedural mesh → GPU texture/IBL caches).

## 4. Earcut & Polygon Support
- Add `earcut` triangulation during CPU preprocessing for n-gons and polygons with holes.
- Extend primitive data to store polygon loops, winding, and hole offsets.
- Ensure UV/normal attribute preservation through triangulation; expose API for re-triangulation when mesh updates occur.

## 5. Procedural Primitive Library (MVP)
- Implement reusable generators:
  - UV sphere (for IBL/matcap validation)
  - Box, plane, cylinder/cone, torus
  - Polygon extrusion (earcut + sweep)
- Provide parameterized builders (segments, radius, caps) to match Houdini-like UX.
- Hook into debug panel / CLI to spawn primitives for fast testing.

## 6. Operator Pipeline Revival
- Port critical legacy operators: Connectivity, Group by attribute, PolyExtrude, Subdivide, Smooth, Attribute transfer.
- Modernize iterator helpers to yield ergonomic ES iterables (e.g., `for (const prim of mesh.primitives())`).
- Define serialization (JSON or binary) for procedural graphs and attribute payloads.

## 7. Tooling & Documentation
- Publish `docs/procedural-mesh.md` with architecture, API cheatsheet, data layout diagrams, and integration recipes.
- Create sample pipelines in `samples/` demonstrating procedural graph execution and WebGPU rendering.
- Integrate lint/format rules; ensure CI runs unit tests and sample builds.

## 8. Stretch Goals
- Investigate GPU compute acceleration for heavy operators (re-meshing, subdivision).
- Prototype a node-graph editor or debug overlay to visualize procedural stacks.
- Explore interoperability with Houdini Engine/USD for asset interchange once core system stabilizes.

## Immediate Next Steps
1. Export existing procedural mesh sources and create baseline documentation of capabilities.
2. Scaffold new module structure in target repo with strict TS config and testing harness.
3. Port minimal mesh core + sphere generator, validate via WebGPU sphere render with current IBL/matcap pipeline.

### Current Implementation Status
- ✅ Legacy snapshot (`legacy/procedural-mesh`) captured from PaintRunner build for reference only.
- ✅ Initial TS scaffolding added under `src/lucid3d/procedural/` (mesh core, attribute store, accessors, operator registry placeholder).
- ✅ Connectivity operator skeleton ported (group discovery + neighbor bookkeeping; still flagged for refinement).
- ✅ `ComputeQuads` + `PolyExtrude` operators functional (triangular meshes, simple extrusion) with smoke tests.
- ✅ Earcut-based polygon triangulation + mesh buffer adapter (`mesh-buffer-adapter.ts`) with smoke test (`npm run test:procedural`).
- ⚠️ Pending: sub-geometry partitioning for meshes > 65k indices, full operator suite (Subdivide, smoothing…), richer quad editing tools, renderer bridge using actual GPU buffers, and deeper automated coverage.
