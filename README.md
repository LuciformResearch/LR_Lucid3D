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

## License

Licensed under the Apache License, Version 2.0. See the `LICENSE` file for details.
