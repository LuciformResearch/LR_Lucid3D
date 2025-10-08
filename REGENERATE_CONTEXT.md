# Regenerate Context — What Changed and Where to Look

This document reconstructs the context of all meaningful changes and the main hot spots in the codebase, so you can jump back in quickly.

## TL;DR
- Fixed GLTF skinning end‑to‑end (loader + buffers + shader) so animated models render correctly in WebGPU.
- Standardized vertex layout (notably `TANGENT` as vec4) and fixed big‑vertex‑buffer packing.
- Added runtime debug overlay and useful query flags.
- Wrote dual push helper to GitLab + GitHub.
- Cleaned up docs and added migration notes.

## Run/Build
- Dev: `npm start` then open `https://localhost:4400`
- Prod: `npm run build` then serve `index.html` via a static server

## Useful Query Flags (append to URL)
- `?noskin=1` → disables skin bind group, binds a dummy buffer (useSkinning=0). Useful to isolate skinning issues.
- `?only4=1` → force 4 influences (zeros JOINTS_1/WEIGHTS_1) in the interleaved vertex buffer for debugging.


## Files Changed (Core Logic)

1) `src/components/WebgpuApp/Lucid3D/Loaders/GLTF2WGPU2.ts`
- What: Robust accessor extraction for interleaved data and correct offsets.
- Changes:
  - De‑interleaving via DataView when `byteStride != 0`.
  - Uses `byteOffset = bufferView.byteOffset + accessor.byteOffset`.
  - Applies `normalized` after extraction.
  - Adds light logging to inspect weights’ sums.
- Why: Previously JOINTS/WEIGHTS were read with wrong offsets/stride → huge bogus indices and broken animation.

2) `src/components/WebgpuApp/Lucid3D/PBRMaterial/WebgpuMaterial.ts`
- What:
  - Fixed big vertex buffer packing (no corruption when some attributes are missing).
  - Binds a skinning bind group for the transform; adds a dummy group(2) when `?noskin=1` (minBindingSize=80 bytes: 16 header + 64 for one mat4).
  - Adds optional `?only4=1` path to zero out JOINTS_1/WEIGHTS_1 for debug.
- Why: Data corruption in the packed vertex buffer caused deformations; missing bind groups caused validation errors.

3) `src/components/WebgpuApp/Lucid3D/PBRMaterial/shaders/research/vertex.wgsl`
- What (skinning path):
  - Joints read as `vec4<f32>` then cast to `i32` in shader (the buffer provides floats).
  - Normalization across 8 weights (`WEIGHTS_0 + WEIGHTS_1`).
  - Removed invalid WGSL ternaries (replaced with if/else where needed).
- Why: Match CPU vertex layout and ensure stable, normalized blending across all joint influences.

4) `src/components/WebgpuApp/Lucid3D/WebgpuGeom.ts`
- What: `TANGENT` now has 4 components (vec4). Attribute types updated so `JOINTS_0/1` use `float32x` consistently (shader casts to `i32`).
- Why: Prevents vertex attribute layout mismatches → no shader validator errors or interleaving shifts.

5) `src/components/WebgpuApp/Lucid3D/WebgpuTransform.ts`
- What: Skinning storage buffer sizing & writes adjusted to WGSL alignment.
  - Use 16‑byte header + matrices at offset 16.
  - Write matrices with `floatArray.buffer` starting at offset 16.
  - Ensure a small buffer with header is returned when no skin is present.
- Why: Aligns storage with WGSL rules, fixes minBindingSize and buffer content correctness.

6) `src/components/WebgpuApp/Lucid3D/WebgpuSkin.ts`
- What: Same storage alignment/write strategy as above (offset 16) when skin buffers are built here.
- Why: Keep consistency wherever skin buffers are produced.

7) `src/components/WebgpuApp/Lucid3D/WebgpuSceneRenderer.ts`
- What: Pass the node transform into `material.drawGeometry(...)` so the material can bind the appropriate skin bind group per transform.
- Why: Allows per‑mesh skin buffer to be used during draws.

8) `src/components/WebgpuApp/Lucid3D/WebgpuMain.ts`
- What:
  - Calls `OnUpdate(dt)` for animations each frame (was missing → animations didn’t advance).
  - Integrates `debugOverlay` to show runtime stats (skinning status, joints, animations, time).
- Why: Make animation actually animate and make live diagnosis easier.

9) `src/components/WebgpuApp/util/debug-overlay.ts`
- What: Small DOM overlay showing key runtime values.
- Why: Fast visibility into skinning state, anim time, etc.


## Files Changed (Tooling/Docs)

- `package.json`: added `build` script.
- `README.md`: rewritten in English; explains requirements, usage, build, troubleshooting; includes dual push notes.
- `dual_push.sh`: helper to push to GitLab (origin) and GitHub (github).
- `OldProjectMigration.md`: notes comparing the older archive vs this repo.
- `WebXR_Migration_Plan.md`: plan to re‑introduce WebXR (WebGL XR path + optional WebGPU XR in the future).


## Skinning Buffer Layout (Summary)
- Header: 16 bytes
  - Currently used to store `useSkinning` (int) and padding.
- Matrices: start at offset 16
  - Two mat4 per joint (skinning + normal) laid out consecutively.
- Dummy buffer: 80 bytes (16 header + one mat4) bound when `?noskin=1`.


## Vertex Packing (Summary)
- The material constructs a single large vertex buffer with all attributes interleaved by location.
- Packing uses a location‑indexed array to avoid shifting when an attribute is missing.
- `TANGENT` is vec4 (matches shader). `JOINTS_0/1` are written as float arrays; shader casts to i32.


## Where to Look (Hot Spots)
- Loader & accessors: `src/components/WebgpuApp/Lucid3D/Loaders/GLTF2WGPU2.ts`
- Materials & vertex packing: `src/components/WebgpuApp/Lucid3D/PBRMaterial/WebgpuMaterial.ts`
- Skinning shader (WGSL): `src/components/WebgpuApp/Lucid3D/PBRMaterial/shaders/research/vertex.wgsl`
- Skin buffers: `src/components/WebgpuApp/Lucid3D/WebgpuTransform.ts`, `src/components/WebgpuApp/Lucid3D/WebgpuSkin.ts`
- Scene traversal/draw: `src/components/WebgpuApp/Lucid3D/WebgpuSceneRenderer.ts`
- App loop + overlay: `src/components/WebgpuApp/Lucid3D/WebgpuMain.ts`, `src/components/WebgpuApp/util/debug-overlay.ts`


## Known Toggles / Diagnostics
- `?noskin=1`: binds dummy group(2) (useSkinning=0). Desktop render OK; isolates skin issues.
- `?only4=1`: forces 4 influences in packing (zeros JOINTS_1/WEIGHTS_1); helps isolate second‑set problems.
- Console logs: prints first vertex’s joints/weights on first draw; prints weight sums for early sanity.


## Notes
- WebXR: The repo contains scaffolding (`webxr-button.ts`, XR types), but XR presentation is not wired up by default. See `WebXR_Migration_Plan.md` for a safe, incremental re‑integration strategy.
- Do not revert loader/vertex/shader fixes with older archive versions; they contain the root‑cause fixes for animation/stretching.

