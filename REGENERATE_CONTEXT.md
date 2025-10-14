# Regenerate Context — WebGPU Renderer Status (Oct 2025)

Quick-start for the next Codex session: current branch, build entry points, feature flags, hot modules, and open work items.

## Workspace & Branch
- Repo: `~/lr_webgpu_rendering_library`
- Active branch: `abstractionsv2`
- Legacy WebGL reference (BRDF, matcap GLSL): `~/Téléchargements/webxrelectronmodelingtool-main`

## Build & Run
- Dependencies: `npm install`
- Dev server: `npm start` → `https://localhost:4400`
- Production bundle: `npm run build` (verified 2025‑10‑08; webpack only warns about bundle size)

## Asset Manifests & Scripts
- Regenerate asset list after touching textures: `node scripts/generate-asset-manifest.js`
  - Outputs `src/lucid3d/assets/asset-manifest.ts` (enumerates matcaps + IBL HDRs for UI dropdowns)

## Runtime Flags (URL query)
- `model=fox|dragon|sponza` or `modelurl=<path>`
- `absV2=1` → abstraction forward PBR pipeline (auto shows debug panel)
- `deferred=1` → deferred renderer (3RT/2RT toggle via `gbufTargets`)
- Lighting & diagnostics: `lights=<n>`, `albedo=1`, `metrics=1`, `noanim=1`, `camx/camy/camz`, `yaw/pitch`
- PBR extras (absV2):
  - IBL: `iblEnable=0|1`, `iblDiffus e`, `iblSpec`, `iblEnv=<manifest-name>`
  - Matcap: `matcap=<manifest-name|filename>`, `matcapFactor=<0-1>`
  - Clear coat: `clearcoat`, `ccrough`

## Debug Panel (absV2 only)
- Lives in `src/lucid3d/WebgpuSamples/pbr_debug_panel.ts`
- Controls:
  - Directional light vector/intensity/color + toggle
  - IBL intensity sliders + enable toggle + preset dropdown sourced from manifest
  - Matcap factor toggle/slider + preset dropdown (auto-loads textures on selection)
  - Diagnostic outputs (normals, M/R, AO, emissive, base color)
- Panel maintains GPU texture caches so presets update bound materials at runtime.

## Assets
- HDR environments: `assets/textures/ibl/<env>/<env>.hdr` (+ optional preview jpg/png)
- Matcaps: `assets/textures/matcaps/*.png` (1024²)
- Neutral defaults + BRDF LUT fallbacks remain in `DefaultTextures.ts`

## Key Source Files
- Entry loop / swapchain: `src/lucid3d/WebgpuMain.ts`
- Controls: `src/lucid3d/WebgpuOrbitControls.ts`
- GLTF pipeline: `src/lucid3d/Loaders/GLTF2WGPU2.ts`, `WebgpuTransform.ts`
- Abstraction system:
  - Material factory & generated materials: `src/lucid3d/Abstractions/MaterialFactory.ts`
  - Modules/templates: `src/lucid3d/Abstractions/Modules/`, `.../templates/`
  - Environment + texture utilities: `src/lucid3d/util/texture-loader.ts`, `util/hdr-loader.ts`, `util/environment-loader.ts`
- Samples:
  - Abstraction GLTF demo (hooks manifest + panel): `src/lucid3d/WebgpuSamples/abstractions_gltf_demo.ts`
  - Forward PBR sample: `src/lucid3d/WebgpuSamples/abstractions_forward_pbr_demo.ts`

## Recent Changes (2025‑10‑08)
- Added HDR loader (`util/hdr-loader.ts`) + CPU cube-map generator (`util/environment-loader.ts`) producing RGBA16F cubemaps with mip-chains.
- Forward material can rebuild bind group 1 when textures change, enabling runtime IBL/matcap swaps.
- Debug panel now lists IBL environments & matcaps from the generated manifest and hot-swaps textures.
- `abstractions_gltf_demo` preloads requested IBL/matcap presets and registers them with the panel cache.

## Open Issues & TODO
1. **Specular prefilter quality**
   - Current CPU downsample is box filtered; implement GGX importance sampling per mip (compute shader or offline bake).
   - Persist generated cubemaps (KTX2?) to avoid on-load CPU cost.
2. **Tone mapping & exposure**
   - With real HDRIs the output clips; add filmic/ACES pass or at least exposure slider.
3. **BRDF LUT**
   - Replace placeholder 1×1 with real 2D LUT texture; load via PNG/ktx or bake at runtime.
4. **Matcap UX polish**
   - Show preview swatches, add handedness flip option, allow custom upload.
5. **Skinned mesh abstractions**
   - Fox skinning still missing in absV2 path; wire joint matrices into shader modules.
6. **Deferred multi-light regression**
   - `?lights>0` remains incorrect; revisit light loop/world-space reconstruction in `DeferredRenderer.lightingPass`.
7. **Performance**
   - Sponza saturates fill-rate; investigate half-res G-buffer and frustum/clustered culling.
8. **Codebase convergence**
   - Share abstraction modules with deferred path; migrate legacy WebGL feature parity as needed.

## Quick How-To Next Session
1. Refresh asset manifest if textures changed: `node scripts/generate-asset-manifest.js`.
2. Launch dragon abstraction demo with presets:  
   `https://localhost:4400/?absV2=1&model=dragon&iblEnv=816-hdri-skies-com&matcap=0404E8_0404B5_0404CB_3333FC`.
3. Validate panel preset swaps (IBL + matcap) and ensure new cubemap loader behaves (check console for warnings).
4. Profile specular mip quality; decide on GGX importance sampling approach.
5. If time remains, tackle deferred multi-light shader fix in `src/lucid3d/Deferred/DeferredRenderer.ts`.

Keep this file updated before ending a session (noting new flags, fixes, outstanding risks).
