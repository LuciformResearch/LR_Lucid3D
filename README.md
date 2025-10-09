# LR Lucid3D — WebGPU/WebXR Rendering Library (WIP)

An in‑progress WebGPU/WebXR rendering library incubated at LuciformResearch. This repository hosts experiments around a small rendering core (camera/controls, GLTF loading + skinning, PBR material experiments) with basic samples (textured cube, glTF Fox) to validate the pipeline.

Project status: early stage, APIs and structure will change frequently.

## Requirements
- Node.js 16+ (recommended: 18+)
- A browser with WebGPU: recent Chrome/Edge (Chrome ≥ 113) or enable the `chrome://flags/#enable-unsafe-webgpu` flag
- Secure context: `https://` or `http://localhost` (considered secure). Dev server runs with a self‑signed certificate.

## Getting started
```bash
npm install
npm start        # dev server (watch + BrowserSync)
# then open https://localhost:4400
```

Notes
- The bundle is emitted to `build/index.js` and referenced from `index.html`.
- For the self‑signed certificate, accept the exception in your browser if prompted.

## Production build
```bash
npm run build
```
Outputs a minified bundle in `build/`.

To serve without BrowserSync for a quick check:
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout
- `src/lucid3d/`: Lucid3D core library (renderer, materials/shaders, GLTF loader, animation/skinning, math)
- `src/components/WebgpuApp/`: app bootstrap and utilities (debug overlay, query flags, WebXR button)
- `src/lucid3d/WebgpuSamples/`: small samples (textured cube, glTF Fox) used by the demo app
- `src/index.ts`: entry point that initializes the WebGPU scene
- `assets/`: models, textures and resources
- `webpack.config.js`: Webpack 5 config (dev: BrowserSync, prod: minification)

TypeScript path aliases
- `@lucid3d` points to `src/lucid3d/index.ts` (barrel exports)
- `@lucid3d/*` resolves to files under `src/lucid3d/*`

Example import
```ts
import { WebgpuMain } from '@lucid3d';
```

## Troubleshooting
- `navigator.gpu` is undefined: use a WebGPU‑capable browser (Chrome 113+) or enable the flag; ensure a secure context (`https://` or `http://localhost`).
- Blank screen: check DevTools console; verify `build/index.js` is served and no CORS errors occur on assets.
- Untrusted certificate: accept the self‑signed cert, or serve via plain HTTP on `localhost`.

## Dual push (GitLab + GitHub)
This repo includes `dual_push.sh` to push to both remotes:

Defaults
- origin: `git@gitlab.com:luciformresearch/lr_lucid3d.git`
- github: `https://github.com/LuciformResearch/LR_Lucid3D.git`

Usage
```bash
./dual_push.sh --message "Initial commit"
# optional: --branch my-branch
```

The script will add remotes if missing, commit (when there are local changes and a message is provided), and push to both remotes with tags.

## Demo flags and controls

Append query parameters to the demo URL to switch modes or tweak behavior.

Rendering
- `deferred=1`: use the deferred renderer (omit for forward).
- `gbufTargets=2|3`: number of G-Buffer color targets (default 3).
  - 2 RTs: G0=albedo+metallic, G1=normal (octa in RG) + roughness (B), A=1.
  - 3 RTs: G0=albedo+metallic, G1=normal+roughness, G2=emissive+ao.
- `oct=1`: enable octa normal encode/decode with `gbufTargets=2`.
- `albedo=1`: lighting debug, show albedo only.
- `gbuf=G0|G1|G2`: debug viewer for a single G-Buffer target (G2 shows black in 2-RT mode).

Models
- `model=fox|sponza|dragon` (default `fox`).
- `modelurl=...`: load a custom glTF path (e.g. `assets/stanford_dragon_pbr/scene.gltf`).

Animations / metrics
- `noanim=1`: disable animation updates (skinning uploads suppressed after first buffer creation).
- `metrics=1`: show aggregated WebGPU metrics in the overlay every 0.25s (buffers/bindGroups/textureViews/writes/bytes).

Camera presets
- `camx`, `camy`, `camz`: initial camera position.
- `yaw`, `pitch`: initial orientation (radians).
- `speed`: initial fly speed.

Fly camera controls
- Move: ZQSD (AZERTY) or WASD (QWERTY)
- Vertical: Up = R/E/Space, Down = Ctrl/C
- Mouse: hold left button to yaw/pitch
- Wheel: adjust speed
- Per-model defaults (if no `cam*`):
  - Fox: (0, 0.8, 4)
  - Dragon: (0, 0.8, 2.5)
  - Sponza: (0, 2.5, 8)

Examples
- Forward Fox: `https://localhost:4400/?model=fox`
- Deferred Dragon (reduced G-Buffer cost): `https://localhost:4400/?deferred=1&model=dragon&gbufTargets=2&oct=1&metrics=1`
- Deferred Sponza baseline: `https://localhost:4400/?deferred=1&model=sponza&metrics=1`

## Notes on current state

- Deferred supports 2-RT mode with octa normal packing to reduce bandwidth (`gbufTargets=2&oct=1`).
- Skin storage buffer binding honors `minBindingSize=80` (dummy buffer when no skin).
- Forward big-vertex-buffer is recreated safely on geometry changes (no in-use destroy).
- The overlay (forward + deferred) shows FPS, textures present, and optional metrics.

## License

Licensed under the Apache License, Version 2.0. See the `LICENSE` file for details.
