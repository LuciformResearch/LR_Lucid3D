# Old Project Migration — webgpu-rendering-library-save_research_animation → LR_Lucid3D

This note summarizes what differs between the recovered archive at:

- `/home/luciedefraiteur/Téléchargements/webgpu-rendering-library-save_research_animation`

and the current repository in this folder. It also proposes what to port and a safe migration plan.

## Snapshot Overview

Common structure (both projects):
- Tooling: TypeScript + Webpack 5 + ts-loader + BrowserSync
- Entry: `src/index.ts`
- Rendering core: `src/components/WebgpuApp/Lucid3D/*` (camera/controls, GLTF loader, animation, skinning, materials, math, samples)
- Assets: `assets/*`

High‑level differences detected (selected):
- README: current repo has an English, up‑to‑date README; the archive has the older template README.
- package.json: current repo adds a `build` script; dependencies are the same ranges.
- New file in current repo: `src/components/WebgpuApp/util/debug-overlay.ts` (runtime overlay + stats).
- New file in archive only: `src/components/WebgpuApp/Lucid3D/PBRMaterial/shaders/research/vertex_safe.wgsl` (alternative/experimental vertex shader).
- Multiple source files differ (content):
  - GLTF loader: `.../Loaders/GLTF2WGPU2.ts`
  - Material + shaders: `PBRMaterial/WebgpuMaterial.ts`, `PBRMaterial/shaders/research/vertex.wgsl`
  - Skinning/data flow: `WebgpuSkin.ts`, `WebgpuTransform.ts`, `WebgpuSceneRenderer.ts`, `WebgpuMain.ts`, `WebgpuGeom.ts`, `WebgpuSamples/gltfRenderTest.ts`

Command used to compare (for traceability):
- `diff -rq <archive>/src ./src`

## What the current repo improves (keep)

Skinning stability and correctness
- Storage layout/alignment: use 16‑byte header + matrices starting at offset 16; dummy group(2) when `noskin=1` (minBindingSize ≥ 80 bytes).
- Vertex layout consistency: `TANGENT` as vec4; JOINTS read as float (cast to i32 in WGSL); fixed attribute interleaving to avoid corruption.
- GLTF accessors: correct handling of `byteStride` and `accessor.byteOffset` with DataView de‑interleaving; apply `normalized` after extraction.
- Weights normalization across 8 influences (WEIGHTS_0 + WEIGHTS_1) in shader path.

Pipeline integration
- Always bind group(2) (skin) — real or dummy — so pipelines validate cleanly.
- Safe toggles: `?noskin=1` (disable skin bind) and `?only4=1` (force 4 influences) for rapid isolation.

Debuggability
- Runtime overlay: `util/debug-overlay.ts` (shows skinning/use stats, anim time, joints count).
- Startup logs and targeted first‑vertex dumps for joints/weights to spot data issues quickly.

UX/Docs/Tooling
- English README with current usage and dual push docs.
- `npm run build` script and `dual_push.sh` for GitLab/GitHub.

## What the archive brings (consider porting)

Shaders
- `PBRMaterial/shaders/research/vertex_safe.wgsl`: An alternate vertex path that uses a `u_Matrices` uniform block (VP, Model, Normal) and a simple skinning hook. It may be handy as a reference “known‑good/minimal” vertex implementation for experiments.

Material/lighting variations
- The archive’s `vertex.wgsl` references an extended matrix block (`u_Matrices`) and includes additional lighting/TBN preparation code. If we want to bring back PBR experiments or the matrix uniform block, we can re‑introduce that path behind a query flag (e.g., `?shader=legacy`).

Minor differences across:
- `WebgpuMain.ts`, `WebgpuSceneRenderer.ts`, `WebgpuSkin.ts`, `WebgpuTransform.ts`, `WebgpuGeom.ts`, and `gltfRenderTest.ts` — the archive appears to reflect an earlier research phase (more experimental code, fewer runtime toggles). The current repo now includes multiple robustness fixes; we should not regress.

## Recommended merge strategy (safe and incremental)

1) Keep current core as baseline
- Retain: loader fixes (byteStride + accessor.byteOffset), vertex layout fixes, storage layout, shader normalization, bind‑group strategy, interleaving fix, debug overlay.

2) Import archive extras as additive options
- Copy `vertex_safe.wgsl` into the current repo under `PBRMaterial/shaders/research/vertex_safe.wgsl` (if not present) to preserve a fallback. Wire a toggle (e.g., `?shader=safe`) to switch the shader module at runtime for quick A/B.
- If desired, add a compile‑time option in `WebgpuMaterial` to use the `u_Matrices` block for experiments while keeping the default “lean” uniform layout.

3) Verify regressions do not reappear
- Re‑run `Fox.gltf` and a few other skins to ensure: no stretched meshes, no bind‑group errors, and weights sums OK. Check both toggles: `noskin=1`, `only4=1`.

4) (Optional) Refresh docs
- Add a short note in README about the optional `vertex_safe` shader and the debug toggles for future experiments.

## Concrete file actions

Already present (current repo):
- `src/components/WebgpuApp/util/debug-overlay.ts` (keep)
- Fixed files: `GLTF2WGPU2.ts`, `WebgpuMaterial.ts`, `vertex.wgsl`, `WebgpuTransform.ts`, `WebgpuSkin.ts`, `WebgpuSceneRenderer.ts`, `WebgpuMain.ts`, `WebgpuGeom.ts`

From archive (to import as reference only):
- `src/components/WebgpuApp/Lucid3D/PBRMaterial/shaders/research/vertex_safe.wgsl`

Not recommended to overwrite
- Do not overwrite the current `GLTF2WGPU2.ts`, `WebgpuMaterial.ts`, or `vertex.wgsl` with the archive versions (they lack the fixes for accessor offsets, interleaving, layout alignment, and debug/toggles that solved the animation issues).

## Dependency / config diffs

- package.json scripts: current has an extra `build` script; dependencies appear at same versions.
- README: current is updated and English; archive has an old template.
- Webpack/tsconfig: no functional diffs detected in a quick scan (targets and plugins are the same type/path plugins).

## Risks & Mitigations

- Risk: Re‑introducing old shader uniform layouts (e.g., `u_Matrices`) may conflict with current pipeline/bind group assumptions. Mitigation: guard with query flags and separate pipeline init per variant.
- Risk: Mixing attribute layouts (e.g., `TANGENT` vec3 vs vec4) re‑breaks vertex packing. Mitigation: keep the standardized vec4 tangent layout.
- Risk: Animated models using >4 influences may regress if the legacy path ignores `JOINTS_1/WEIGHTS_1`. Mitigation: keep both paths and test with/without `only4`.

## Next Steps (actionable)

- [ ] Copy `vertex_safe.wgsl` from the archive into the current repo (as a reference shader)
- [ ] Add a simple `?shader=safe|default` switch in `WebgpuMaterial` to pick the shader module
- [ ] Update README “Troubleshooting” with toggles: `noskin`, `only4`, `shader`
- [ ] Test Fox and at least one additional skinned model

If you want, I can bring in `vertex_safe.wgsl` now and wire the `?shader` flag to flip shaders at runtime.

