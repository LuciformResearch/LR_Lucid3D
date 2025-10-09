# Regenerate Context — 2025-10-08 20:52 CET

This note captures current status of Lucid3D deferred/PBR work, key fixes, open issues, and next steps for a stepped debug and feature rollout.

## Status
- Library promoted to `src/lucid3d/` with `@lucid3d` alias. LICENSE Apache-2.0.
- Deferred path behind `?deferred=1`:
  - Geometry pass MSAA x4 → resolve to single-sample GBuffer.
  - Lighting pass fullscreen reads GBuffer, runs PBR BRDF (directional light).
- GBuffer (extended):
  - G0: albedo.rgb + metallic.a (rgba8)
  - G1: normalW.xyz + roughness.a (rgba16f)
  - G2: emissive.rgb + ao.a (rgba8)
  - Depth: depth24plus
- Geometry MRT material (`WebgpuGBufferMaterial`):
  - VS: outputs normalW/tangentW/bitangentW; uniforms: MVP/Model/Normal.
  - FS: samples baseColor, MR, AO, Emissive, Normal (fallbacks if missing), writes G0/G1/G2.
  - Vertex interleave hardened: writes per-vertex/per-attr as float32 slices.
  - Uniform writes use the 5-arg writeBuffer overload (buffer/offset/size).
- Lighting PBR: Cook–Torrance GGX/Smith + Schlick, directional light, AO + emissive applied.
- GLTF linkage: `WebgpuMaterial` carries MR/Normal/AO/Emissive; loader fills; renderer GBuffer forwards.
- Dev/debug: cleaner logs, sourcemaps for TS in dev (`npm start`).

## Open Issue (runtime)
- User still hits `GPUQueue.writeBuffer Overload resolution failed` inside `WebgpuGBufferMaterial.drawGeometryGBuffer` during geometry.
  - Guards in place:
    - Skip draw if `POSITION` missing/posCount<=0.
    - For each attribute, verify availability per vertex, convert to `Float32Array` of exact component size, and write using `writeBuffer(buffer, offset, data.buffer, 0, byteLength)`.
    - Uniforms written with the 5-argument overload to avoid ambiguity.
  - Next debug steps (enable one at a time):
    - Add a `?trace=1` flag to log: `posCount`, `arrayStride`, per-attribute `length/comp`, and first vertex slices before writeBuffer.
    - Add a `?only=posnormuv` flag to limit attributes to POSITION/NORMAL/TEXCOORD_0 and verify the path.
    - Add a `?gbuf=G0|G1|G2` flag to visualize chosen GBuffer target in the lighting pass for sanity.
    - Early bail if any attribute’s `length % comp != 0` with a clear console message that identifies the mesh/primitive.

## Next Features (ordered)
1) Multi-lights support
   - Storage buffer for an array of lights (directional/point/spot), read in lighting pass.
   - Simple attenuation/spot shaping; start with a small fixed-size array.
2) IBL integration
   - Irradiance (diffuse) + prefiltered specular + BRDF LUT (precomputed textures initially).
   - Bind group layout for IBL in the lighting pass.
3) Tone mapping & exposure
   - ACES tone mapping and an exposure scalar uniform.
4) Geometry quality
   - Normal mapping already wired; next: clearcoat/sheen toggles and parameters (layout prepared in future uniforms).
5) Debugging utilities
   - `?gbuf=` visualizer; `?trace` logs; optional overlay for runtime values (light count, formats, sampleCount).
6) Engine abstractions (later)
   - `IMaterialPass` interface with `drawForward`/`drawGBuffer` hooks per material.
   - Pipeline cache keyed by attachment state (formats/sampleCount) to avoid rebuild churn.
   - Optional lightweight RenderGraph if/when passes grow.

## Action Items (short list)
- [ ] Add `?trace=1`: targeted logs around writeBuffer (per-attr checks, indices/lengths) to catch any remaining edge case.
- [ ] Add `?only=posnormuv`: limit attributes used in VB packing to isolate the issue.
- [ ] Add `?gbuf=` switch in lighting to view G0/G1/G2.
- [ ] Implement lights buffer in lighting pass.
- [ ] Add IBL bindings and sampling (with placeholder textures in `assets/`).
- [ ] Implement ACES tone mapping + exposure.

## Notes
- Use dev mode (`npm start`) for TS sourcemaps. Chrome: enable “JavaScript source maps”.
- Loader no longer logs missing textures; defaults are safe and deterministic.

