# LR Lucid3D — WebGPU Rendering Sandbox

This repository hosts the LuciformResearch WebGPU playground. It implements:

- **Forward & deferred PBR pipelines** (skinned glTF support, G-buffer packing, debug overlays)
- A **modular shader system** (TypeScript shader modules → generated WGSL) used by the new abstractions path
- Live **lighting / diagnostic controls** (directional light, IBL blend, matcap mix, debug views)
- A stocked asset library (HDR skies and matcap textures) to experiment with lighting setups

> Current focus: iterate on the abstraction layer (shader modules + material factory) so forward and deferred paths share the same building blocks.

---

## Quick Start

```bash
# install deps
npm install

# dev server (https, auto reload)
npm start
# opens https://localhost:4400 – accept the self-signed cert

# production bundle
npm run build
# emits build/index.js (referenced by index.html)
```

To serve the production bundle quickly:

```bash
python3 -m http.server 8000
# then http://localhost:8000
```

Requirements
- Node.js ≥ 18 recommended (16+ works)
- WebGPU capable browser (Chrome ≥ 113 / Edge ≥ 113 or enable `chrome://flags/#enable-unsafe-webgpu`)
- Secure context (https or `http://localhost`)

---

## Running the Demos

All behaviour is controlled through URL query flags. Examples below assume the dev server.

| Mode | URL |
|------|-----|
| Forward (default fox) | `https://localhost:4400/` |
| Deferred dragon (2-RT octa packing) | `https://localhost:4400/?deferred=1&model=dragon&gbufTargets=2&oct=1` |
| Deferred sponza baseline | `https://localhost:4400/?deferred=1&model=sponza` |
| **Abstractions** dragon (new shader modules) | `https://localhost:4400/?absV2=1&model=dragon` |
| Abstractions with IBL/matcap | `https://localhost:4400/?absV2=1&model=dragon&iblDiffuse=1&iblSpec=1&matcap=0404E8_0404B5_0404CB_3333FC.png` |

Common flags

- `model=fox|dragon|sponza` or `modelurl=assets/.../scene.gltf`
- `metrics=1` → overlay resource counters
- `noanim=1` → freezes animations/skinning uploads
- Forward/abstractions: `albedo=1` to force albedo-only output
- Deferred: `gbufTargets=2|3`, `oct=1`, `gbuf=G0|G1|G2` (visualise G-buffer)
- Camera presets: `camx/camy/camz`, `yaw`, `pitch`, `speed`
- Lighting experiments (abstractions only):
  - `iblDiffuse`, `iblSpec`, `iblEnable`
  - `clearcoat`, `ccrough`
  - `matcap=<PNG in assets/textures/matcaps>` and `matcapFactor`

Camera controls (fly mode)
- Move: ZQSD / WASD
- Vertical: Space / R / E = up, Ctrl / C = down
- Mouse drag (button 1) = yaw/pitch, wheel = adjust speed

---

## Shader Modules – Why They Matter

We author shader features as TypeScript classes (`src/lucid3d/Abstractions/Modules/*`):

- Each module declares **defines**, **uniforms**, **bind-group reservations**, and **WGSL snippets** for named phases (`LIGHT_COMPUTE`, `FRAGMENT_FINALIZE`, etc.).
- `ShaderComposer` injects the snippets into WGSL templates (`src/lucid3d/Abstractions/templates/*.wgsl`).
- `MaterialFactory` collects modules based on the material description (textures present, extensions enabled) and produces the final shader code + pipeline key + bind groups.

Benefits
- **Reusability**: the same normal/metallic module can be consumed by forward and, later, deferred encoders.
- **Extensibility**: toggling clear coat, matcap, or future extensions (sheen/transmission) is just “push module if data present”.
- **Testing**: each feature is isolated (easy to unit-test uniform registration or snippet generation).

Entry points
- `MaterialFactory.ts` – orchestrates modules, uniforms, pipeline caching
- Modules: `BaseColorModule`, `MetallicRoughnessModule`, `NormalMapModule`, `IBLModule`, `ClearCoatModule`, `MatcapModule`, `PBRLightingModule`, …
- Templates: `pbr_modules_forward.vert.wgsl`, `pbr_modules_forward.frag.wgsl`

---

## Assets

- HDR skies: `assets/textures/ibl/<id>/` (equirectangular `.hdr` + preview JPEG) – currently loaded as neutral placeholders; todo: convert to cubemaps & prefiltered mip chains.
- Matcaps: `assets/textures/matcaps/*.png` (1024²) – instantly usable with the Matcap module.
- Models: Fox (glTF, skinned + anims), Stanford dragon, Sponza.

> Note: HDR files are ~80–98 MB each; GitHub recommends migrating to Git LFS in the future.

---

## Debug Tools

### Overlay (all modes)
Shows FPS, texture availability, optional metrics (`metrics=1`). Updated every 0.25 s.

### PBR Debug Panel (absV2)
Auto-appears in abstraction mode. Controls:

- Directional light on/off, intensity, color, direction sliders
- IBL enable, diffuse & specular weights
- Matcap enable, blend factor (visible only if matcap module active)
- Diagnostic views (normals, MR, AO, emissive, base color)

Implementation: `src/lucid3d/WebgpuSamples/pbr_debug_panel.ts`.

---

## Testing & Validation

Automated tests are minimal; recommended manual checks:

1. **Build passes** – `npm run build`
2. **Forward overview** – `https://localhost:4400/?model=fox`
3. **Deferred G-buffer** – `https://localhost:4400/?deferred=1&model=dragon&gbufTargets=2&oct=1`
4. **Abstractions** – `https://localhost:4400/?absV2=1&model=dragon&iblDiffuse=1&iblSpec=1&matcap=0404E8_0404B5_0404CB_3333FC.png`
   - Verify sliders update lighting; try toggling matcap/IBL/off
5. **Skinning** – `https://localhost:4400/?model=fox` (forward) and `?absV2=1&model=fox` (abstractions) to confirm anim playback

When tweaking shaders, keep DevTools console open: WebGPU validation errors surface there (e.g. missing bindings, incompatible usages).

---

## Repository Utilities

`dual_push.sh` pushes to GitLab + GitHub. Example:

```bash
./dual_push.sh --message \"Describe your change\"
```

It ensures both remotes exist, commits staged/dirty changes, and pushes with tags.

---

## Roadmap / TODO

- HDR ingestion: convert `.hdr` equirectangular maps into cubemaps + prefiltered mip levels (specular) and generate a BRDF LUT
- Extend shader modules: sheen / transmission / clearcoat normals / subsurface
- Unify deferred path with shader modules (encode G-buffer via the same material description)
- Fix deferred multi-light regression (`?lights>0`)
- Tone mapping & exposure controls for HDR output
- Investigate Git LFS or compressed asset pipeline for large textures

---

## License

Apache 2.0 — see `LICENSE`.
