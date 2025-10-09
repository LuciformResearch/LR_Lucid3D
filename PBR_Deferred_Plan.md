# PBR + Deferred Rendering — Plan & Architecture

This document captures the high‑level design for adding a modular PBR pipeline and a deferred renderer to Lucid3D. The goal is to set clean boundaries now while keeping implementation minimal and iterative.

## Design Goals
- Clear passes: Geometry, Lighting, PostProcess.
- Named resources: A `GBuffer` object encapsulates attachments + MSAA/resolve + resize.
- Materials per pass: A material may implement `drawForward` and/or `drawGBuffer`.
- Stable attachment state: pipelines are built for (formats, sampleCount) and cached.
- Extensible “feature staircase”: enable eye‑candy progressively without breaking APIs.

## Initial Scope (incremental)
1) Skeleton deferred path (done):
   - MSAA geometry pass resolves to single‑sample albedo; lighting pass blits albedo.
2) Extended GBuffer (next):
   - G0: albedo.rgb + metallic.a (rgba8)
   - G1: normal.xyz + roughness.a (rgba16f)
   - G2: emissive.rgb + ao.a (rgba8)
   - Depth: depth24plus
3) GBuffer geometry material:
   - `WebgpuGBufferMaterial` (MRT, sampleCount=4). First version: albedo from baseColor; defaults for MR/normal/ao/emissive. Later: normal map/TBN, MR texture, AO, emissive.
4) Lighting pass BRDF:
   - Cook‑Torrance GGX (D/G/F Schlick) with one directional light. Then lights buffer + IBL (irradiance + prefiltered spec + BRDF LUT).

## Future Enhancements (feature staircase)
- PBR quality: normal mapping, clearcoat, sheen, transmission + thickness, emissive animation.
- Geometry detail: parallax occlusion mapping (POM), displacement (CPU tessellation or micro‑displacement), bent normals.
- Indirect lighting: IBL diffuse + specular, SSAO/SSGI, SSR, contact shadows screen‑space.
- Post‑processing: tone mapping (ACES), auto exposure, bloom/glare, filmic grain, vignette.
- Stability: TAA (optionally motion vectors), temporal reprojection for SSR/SSAO, dithering.

## Abstractions
- `GBuffer`: sizes/formats, MSAA targets + resolved textures, resize().
- `IMaterialPass` (future):
  ```ts
  interface IMaterialPass {
    drawForward?(...): void;      // existing WebgpuMaterial
    drawGBuffer?(...): void;      // new WebgpuGBufferMaterial
  }
  ```
- `DeferredRenderer`: owns `GBuffer`, dispatches geometry (MRT) then lighting (fullscreen triangle).
- `WebgpuSceneRendererGBuffer`: traverses transforms, maps source meshes/materials to their GBuffer counterparts, issues draws in geometry pass.

## Notes
- Skinning: re‑use current storage buffer at @group(2). Vertex shader variants for forward/gbuffer share helpers.
- Matrices: MVP is enough for the first pass (albedo only). For correct normals, add model/normal matrices uniforms later.
- Compatibility: forward path remains untouched; deferred is gated by `?deferred=1`.

