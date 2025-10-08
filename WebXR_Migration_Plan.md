# WebXR + WebGPU Migration Plan

This plan outlines how to re‑introduce WebXR (HMD presentation, controllers, text rendering) into the current WebGPU project, using the older `webxrelectronmodelingtool-main` as reference while keeping the new WebGPU pipeline stable.

## Goals
- Present the scene in immersive VR (HMD) with per‑eye rendering.
- Support XR input sources (controllers), basic rays/poses, and profile meshes.
- Provide simple text rendering in 3D space.
- Keep the current desktop WebGPU path intact, with minimal duplication.
- Prepare an optional/experimental path for WebXR + WebGPU when available, with sane fallbacks.

## Constraints & Reality Check
- Today, XR presentation in browsers is widely supported via `XRWebGLLayer` (WebGL). WebXR + WebGPU is still evolving (WebXR Layers w/ WebGPU bindings behind flags/OTs). We will:
  - Short‑term: Use a WebGL XR path (guaranteed) to deliver VR now.
  - Long‑term (optional): Add an experimental WebGPU XR path gated by feature flags (detect at runtime, fallback to WebGL).

## Architecture Overview
- Add a renderer abstraction with two backends:
  - `XRWebGLRenderer`: Uses WebGL + `XRWebGLLayer` (ported from the older project).
  - `WebgpuRenderer` (current): For desktop/non‑XR.
- Shared scene graph and loaders: Reuse the existing Lucid3D transforms, GLTF loader, skinning, materials where possible.
- Feature toggles (query args): `?xr=1` to enter XR mode, `?controllers=1` to enable controller meshes/rays, `?text=1` to show sample text billboards.

## Phase 1 — XR Session Skeleton (WebGL)
1. Add an XR bootstrap module (e.g., `src/components/WebxrApp/XRBootstrap.ts`) which:
   - Creates a WebGL2 context (`gl`) and calls `await gl.makeXRCompatible()`.
   - Wires a `webxr-button` to call `navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] })`.
   - On session start: `session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) })`, request reference space, and start the XR frame loop with `session.requestAnimationFrame`.
2. Port minimal pieces from the old `WebglApp.ts`:
   - `RenderView`, `WebXRView` structs.
   - `drawXRFrame(frame, pose, scene)` with per‑eye viewports, binding `baseLayer.framebuffer`, and calling a scene renderer.
3. Scene rendering stub: For now, render a simple colored quad/triangle or a basic box to validate per‑eye draws.

Deliverable: `?xr=1` displays a simple scene in the headset; desktop path unchanged.

## Phase 2 — Controllers (input sources)
1. Add an `XRInput` module (e.g., `src/components/WebxrApp/XRInput.ts`) that:
   - Iterates `session.inputSources` each XR frame.
   - For each source, queries `gripSpace`/`targetRaySpace` poses and optional `gamepad` state.
   - Uses `@webxr-input-profiles/assets` to map controller profiles and optionally load a simple controller mesh (start with rays).
2. Create a minimal `InputRenderer` for WebGL that draws rays/axes at controller positions.
3. Expose poses/transforms in a format also consumable by the WebGPU scene (future reuse).

Deliverable: Rays/axes visible at controller poses; simple button/axis logs.

## Phase 3 — Text Rendering (shared utility)
1. Implement a canvas‑to‑texture text billboard utility:
   - `drawTextToCanvas(text, font, size) → HTMLCanvasElement`
   - `uploadCanvasToTexture(glOrGpuDevice) → texture`
   - Draw as a quad/billboard with a simple shader (WebGL) and mirror a small WebGPU variant for desktop.
2. Later enhancement: optional SDF/MSDF pipeline for crisper text.

Deliverable: `?text=1` shows a 3D text billboard both in XR (WebGL path) and desktop (WebGPU path).

## Phase 4 — Experimental WebXR + WebGPU Path (optional)
1. Feature detection:
   - Check for WebXR Layers w/ WebGPU binding availability (behind flags/OTs).
   - If present, create a WebGPU-compatible XR projection layer and render per‑eye views via WebGPU (per‑eye view/projection from XRView).
2. Fallback:
   - If not available, keep the WebGL XR path.
3. Render sharing alternatives (only if needed):
   - If double‑render is acceptable, render XR scene via WebGL and desktop via WebGPU separately (simplest, avoids fragile interop).

Deliverable: `?xr=1&webgpu=1` uses the experimental WebGPU presentation when supported; otherwise falls back to WebGL.

## Phase 5 — Unification & Cleanup
1. Renderer interface:
   - Define a `Renderer` interface with `beginFrame`, `drawViews(views, scene)`, `endFrame`.
   - Implement `XRWebGLRenderer` and reuse the existing WebGPU renderer.
2. Scene API harmonization:
   - Scene update logic (animations, transforms) shared and independent from the backend.
   - Materials: maintain a small, shared material description. Provide a WebGL shader route (simple) and the existing WebGPU route.
3. Documentation:
   - README: describe `?xr`, `?controllers`, `?text`, and the experimental WebGPU XR flag.

## Risks & Mitigations
- WebXR + WebGPU is not broadly available: Mitigate with a robust WebGL XR path and runtime detection.
- Controller meshes/profile mapping: start with rays; add mesh loading incrementally; cache profiles.
- Text aliasing: start with canvas billboards; add SDF/MSDF later if needed.
- Divergence of code paths: Abstract and share data models (scene graph, transforms, animation); keep backend‑specific code isolated.

## Concrete Task List
- [ ] Add `XRBootstrap.ts` and wire `?xr=1` → start immersive session (WebGL) with `XRWebGLLayer`.
- [ ] Port minimal `RenderView`, `WebXRView`, and `XRWebGLRenderer.drawXRFrame` (per‑eye viewport handling).
- [ ] Add `XRInput.ts` and render controller rays (optional meshes later) with `@webxr-input-profiles`.
- [ ] Add `TextBillboard.ts` (canvas → texture) and simple shaders in both WebGL and WebGPU.
- [ ] Add feature detection + flag plumbing for experimental WebGPU XR presentation; fallback to WebGL.
- [ ] Document flags in README and provide a quick “XR sanity” sample scene.

## References from the old project
- `src/components/WebglApp/WebglApp.ts`: WebGL XR session setup, frame loop, controllers, text mesh usage.
- Controller mapping via `@webxr-input-profiles` and ray rendering.
- Text sample using a font resource; we’ll re‑implement text in a simpler billboard form first.

---
If you’d like, I can start by scaffolding Phase 1 (WebGL XR session + per‑eye draw stub) behind `?xr=1` without touching the current WebGPU desktop path.

