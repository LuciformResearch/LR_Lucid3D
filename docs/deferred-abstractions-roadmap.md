# Deferred Renderer Abstractions Roadmap

## 1. Snapshot of the Current Pipeline
- **Forward PBR (absV2)** already runs on modular shader building blocks (`ForwardCoreModule`, `BaseColorModule`, `MatcapModule`, …) with manifest-driven assets and the debug panel.
- **Deferred renderer** still uses the legacy WebGPU sample code:
  - hard-coded WGSL for G-Buffer encode/decode (`DeferredRenderer.ts`, `WebgpuSceneRendererGBuffer.ts`);
  - a monolithic lighting shader with custom bindings and little reuse;
  - duplicated BRDF logic, tone mapping gaps, no matcap/IBL integration;
  - debug tools limited to query-string switches (`?gbuf=G0` etc.).
- Assets, uniform layouts, and bind group semantics diverge between forward/deferred, making feature parity expensive to maintain.

## 2. Goals
1. **Unify material/shader authoring** so forward and deferred leverage the same ShaderModule abstractions whenever possible.
2. **Modularize the geometry/G-buffer pass** to reuse material factories and attribute packing logic (matcap, clearcoat, etc.).
3. **Modularize the lighting/composition pass** to share PBR BRDF helpers, IBL evaluation, and diagnostic hooks.
4. **Expose a single abstraction surface** (material descriptors, debug panel) regardless of rendering path.
5. **Improve maintainability** (less duplicated WGSL, shared uniform records, automated smoke tests).

## 3. Workstreams

### A. Shared Shader Infrastructure
- Extract shader-common utilities (BRDF, matcap sampling, IBL helpers) from forward into a reusable `PBRCommonModule`.
- Create renderer-agnostic uniforms/defines packages (`LightingUniformsModule`, `EnvironmentModule`) consumed by both forward and deferred.
- Align bind-group numbering and naming conventions (group0 = per-material uniforms, group1 = textures/environment, etc.).

### B. G-Buffer Material Abstractions
- Introduce `DeferredMaterialFactory` mirroring the forward factory:
  - reuse modules for base color, normal map, AO, emissive;
  - add encode modules that pack outputs into G-buffer targets (handles oct-encoding, roughness channels, optional clearcoat).
- Allow procedural meshes / GLTF path to choose forward or deferred simply by switching factories; keep vertex layout identical.
- Surface toggles (e.g., oct-encoding, MRT target count) via material descriptors instead of ad-hoc query params.

### C. Deferred Lighting Modules
- Refactor `deferred_lighting.wgsl` into modules:
  - `GBufferDecodeModule`
  - `DirectLightingModule` (directional + punctual lights)
  - `IBLLightingModule` (shares sampler/uniforms with forward)
  - `MatcapCompositeModule` (optional overlay)
- Support both single-light and multi-light compute accumulation with shared light data structs.
- Integrate debug modes with the PBR debug panel (output G0/G1/G2, lighting breakdown, depth).

### D. Renderer Integration & Tooling
- Build a new `DeferredSceneRenderer` that:
  - orchestrates G-buffer pass using material abstractions;
  - manages bind groups via shared `BindGroupPool`;
  - plugs into the existing debug panel for lighting sliders, environment swaps, matcap controls.
- Unify camera and transform updates (reuse WebgpuTransform handling without reimplementing skinning buffers).
- Ensure asset manifest + texture loader code paths serve both renderers (HDR, matcaps, BRDF LUT).

### E. Validation & Performance
- Author smoke tests (`npm run test:deferred`) that render headless frames for key configurations (single light, multi-light, IBL-only).
- Add GPU capture checklists (RenderDoc profile script) to compare forward vs deferred outputs.
- Profile bandwidth/perf, exposing switches for half-res G-buffer or clustered lighting in future iterations.

## 4. Milestones
| Phase | Focus | Deliverables |
| ----- | ----- | ------------ |
| **P0 – Foundations** | Shared modules & uniform alignment | `PBRCommonModule`, updated uniform registry, doc on binding layout |
| **P1 – G-buffer Abstractions** | Deferred material factory, GLTF/procedural integration | `DeferredMaterialFactory`, geometry pass parity tests |
| **P2 – Lighting Modules** | Modular lighting WGSL, shared BRDF, IBL | `DeferredLightingModule` suite, debug panel hooks |
| **P3 – Renderer Integration** | End-to-end deferred path using abstractions | New scene renderer, toggle in app (`?deferred=1` uses new pipeline) |
| **P4 – QA & Optimization** | Testing, profiling, optional enhancements | Smoke tests, doc updates, perf backlog (clustered lighting, half-res) |

## 5. Risk & Mitigation Highlights
- **Binding layout churn** – lock shared bind group schema early and migrate forward pipeline to it to avoid divergence.
- **Shader duplication** – enforce a single source for BRDF/lighting math via module imports; add lint/test that catches drift.
- **Feature parity** – track matcap, clearcoat, debug outputs on both pipelines; maintain checklist per release.
- **Performance regressions** – measure before/after; provide flags to opt into legacy path until parity confirmed.

## 6. Immediate Next Steps
1. Draft `PBRCommonModule` + shared uniform structs (Forward + Deferred consume the same definitions).
2. Prototype G-buffer encode module using the new factory for a single test material (albedo/normal/roughness).
3. Document binding layout & module contract in `docs/abstractions/README.md` (or equivalent) for contributors.

