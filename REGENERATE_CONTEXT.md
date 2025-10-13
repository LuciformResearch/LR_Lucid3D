# Regenerate Context — WebGPU Renderer Status (Oct 2025)

This file is the quick start for the next Codex session. It summarizes the active branch, build/run steps, feature flags, key modules, and the roadmap items that remain unfinished.

## Workspace & Branch
- Repo: `~/lr_webgpu_rendering_library`
- Active branch: `abstractionsv2`
- Historical WebGL code (reference for abstractions/BRDF): `~/Téléchargements/webxrelectronmodelingtool-main`

## Build & Run
- Install deps once: `npm install`
- Development server: `npm start` → open `https://localhost:4400`
- Production bundle: `npm run build`, then serve `index.html`

## Runtime Flags (URL query)
- `model=fox|dragon|sponza` (default fox) or `modelurl=<path>`
- `absV2=1` → run the new abstraction-based forward PBR renderer (auto-enables debug panel)
- `deferred=1` → classic deferred renderer (3-RT or 2-RT pack)
- `gbufTargets=2|3`, `oct=1` → control G-Buffer packing
- `lights=<n>` → multi-light deferred test (still buggy)
- `albedo=1` → show albedo-only output (works in abstractions too)
- `metrics=1`, `noanim=1`, `camx/camy/camz`, `yaw/pitch` etc.
- New IBL/matcap params (abstractions only):
  - `iblDiffuse`, `iblSpec`, `iblEnable`
  - `clearcoat`, `ccrough`
  - `matcap=<filename>` (from `assets/textures/matcaps/`), `matcapFactor`

## Debug Panel (absV2)
- Top-right overlay provides live sliders for:
  - Directional light enable/intensity/color
  - IBL diffuse/spec intensity + enable toggle
  - Matcap blend (if matcap extension present)
  - Diagnostic outputs (normals, metallic/roughness, AO, emissive, base color)
- Panel data is backed by `src/lucid3d/WebgpuSamples/pbr_debug_panel.ts`.

## Assets
- HDR environments extracted to `assets/textures/ibl/<zip-name>/*.hdr`
- Matcaps (1024×1024 PNG) at `assets/textures/matcaps/`
- Current loader uses a placeholder cube & LUT (see TODO)

## Key Source Files
- Core renderer loop: `src/lucid3d/WebgpuMain.ts`
- Camera controls: `src/lucid3d/WebgpuOrbitControls.ts`
- GLTF loader: `src/lucid3d/Loaders/GLTF2WGPU2.ts`
- Deferred pipeline: `src/lucid3d/Deferred/`
- Abstractions system:
  - Shader modules: `src/lucid3d/Abstractions/Modules/`
  - WGSL templates: `src/lucid3d/Abstractions/templates/`
  - Material factory: `src/lucid3d/Abstractions/MaterialFactory.ts`
  - Utility loader: `src/lucid3d/util/texture-loader.ts`
- Demos: `src/lucid3d/WebgpuSamples/abstractions_forward_pbr_demo.ts`, `abstractions_gltf_demo.ts`

## Current Feature Snapshot
- **IBL Module** combines irradiance/specular cube maps + BRDF LUT via `IBLModule.ts`. Currently uses fallback neutral cube; real HDR import still TODO.
- **Clear Coat** uniform/define integrated; directional light path adds coat lobes.
- **Matcap Module** blends a matcap texture based on view-space reflection (needs view matrix uniform; implemented).
- **PBR Debug Panel** manipulates directional, IBL, matcap weights and diagnostic views live.
- **Forward demo** loads a default matcap texture via `loadTexture2D` and registers it with the panel.

## Known Issues & TODO (carry forward)
1. **HDR asset ingestion**
   - Convert `assets/textures/ibl/*/*.hdr` into usable GPU textures (need HDR parser → cube conversion or sampling from equirectangular). Currently using neutral placeholder.
   - Evaluate storing prefiltered specular mip chain (KTX2 or baked cubemaps).
2. **Matcap improvements**
   - Optionally flip UV for handedness, allow selecting different matcaps via GUI.
   - Panel currently assumes presence if uniform exists; extend to dropdown of filenames.
3. **Deferred multi-light regression**
   - `?lights>0` still produces grey/inverted shading; revisit world reconstruction & normal decoding in lighting pass.
4. **Tone mapping / exposure**
   - With real HDRI the output will need tonemapping or exposure slider; consider ACES/filmic pass.
5. **Skinned mesh in abstractions**
   - Fox still needs abstraction shaders to consume skin matrices properly (currently handled in non-abs path only).
6. **IBL BRDF LUT**
   - Replace placeholder 1×1 texture with actual 2D LUT (prefiltered GGX). Prepare loader similar to matcap but for LUT PNG.
7. **Codebase convergence**
   - Long-term plan: unify forward/deferred shading via abstractions modules. Need deferred variant of MaterialFactory using same snippet system.
8. **Profiling**
   - Sponza remains fill-rate heavy; consider half-resolution G-buffer or culling improvements.

## Quick How-To for Next Session
1. Load the abstraction demo for the dragon: `https://localhost:4400/?absV2=1&model=dragon&iblDiffuse=1&iblSpec=1&matcap=0404E8_0404B5_0404CB_3333FC.png`
2. Check directional/IBL/matcap sliders update shading live (ensures uniforms and panel wiring still OK).
3. Inspect `assets/textures/ibl/` for HDR skies to convert; plan shader or offline tool to produce cubemaps (reference WebGL project for BRDF & IBL functions).
4. For matcap module reference, review legacy GLSL in `webxrelectronmodelingtool` under `GltfViewerSample/source/shaders/fullFragment.glsl` (clearcoat, sheen, etc.).
5. When ready to work on deferred lights, focus on `DeferredRenderer.lightingPass` and the multi-light branch.

Keep this document updated before ending a session (record new flags, major fixes, outstanding bugs).
