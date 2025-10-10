# Regenerate Context — Current State, Flags, and Next Steps (Oct 2025)

This document summarizes the renderer state (forward + deferred), runtime flags, debug tools, key file locations, and planned work. It provides enough context to resume quickly in a future session.

## Build/Run
- Dev: `npm start` then open `https://localhost:4400`
- Prod: `npm run build` then serve `index.html` via a static server

## Runtime Flags (URL Query)
- `deferred=1` — enable deferred renderer (else forward).
- `gbufTargets=2|3` — G-Buffer color targets (default 3). 2-RT mode reduces bandwidth:
  - 2 RTs: G0=albedo+metallic, G1=normal(octa RG)+roughness(B), A=1.
  - 3 RTs: G0=albedo+metallic, G1=normal+roughness, G2=emissive+ao.
- `oct=1` — enable octa normal encode/decode when `gbufTargets=2`.
- `albedo=1` — debug: force lighting to albedo-only.
- `gbuf=G0|G1|G2` — debug viewer for a G-Buffer target (G2 shows black in 2-RT mode).
- `metrics=1` — overlay metrics snapshot every 0.25s: `buffersCreated`, `bindGroupsCreated`, `textureViewsCreated`, `writes`, `bytes`.
- `noanim=1` — disable animation updates (skinning upload suppressed after buffer creation).
- Model selection:
  - `model=fox|sponza|dragon` (default fox)
  - `modelurl=...` — override path for a custom glTF (e.g., `assets/stanford_dragon_pbr/scene.gltf`).
- Camera:
  - `camx`, `camy`, `camz` — initial camera position
  - `yaw`, `pitch` — initial orientation (radians)
  - `speed` — fly speed

- Abstractions (forward PBR demo)
  - `absDemo=1` — exécute la démo PBR basée sur les abstractions (glTF + factory de matériaux)
  - `albedo=1` — en mode abstractions force l’affichage albedo‑only (utile pour débugger des scènes sombres)

## Camera Controls
- Move: ZQSD (AZERTY) or WASD (QWERTY)
- Vertical: Up = R/E/Space, Down = Ctrl/C
- Mouse: hold left button to yaw/pitch
- Wheel: adjust speed
- Per-model defaults (if no `cam*`): Fox (0,0.8,4), Dragon (0,0.8,2.5), Sponza (0,2.5,8)

## Debug Overlay
- Shows FPS, animation info, texture flags, and (if `metrics=1`) the metrics snapshot.
- Works in both forward and deferred.

## Deferred Pipeline
- Geometry pass writes G-Buffer (2 or 3 RTs). 2-RT mode packs normal via octa (RG) + roughness (B) to reduce fill/bandwidth.
- Lighting pass is a full-screen triangle; samples G-Buffer via `textureSampleLevel`.
- Debug viewer (`gbuf=...`) uses `textureLoad` and clamps UVs.
- Skin storage buffer minBindingSize=80 enforced when no skin (16 header + identity mat4): avoids validation errors.
- Normal encoding/decoding (3-RT): normals sont encodées en [0,1] dans le G-Buffer (G1.xyz) et décodées (2*val-1) en lighting. En 2‑RT octa, on lit/écrit toujours via encode/décode octa.

## Forward Pipeline
- Interleaved big-vertex-buffer assembled when attributes change (single write). Recreated safely when stride/vertex-count change (no immediate destroy) to avoid “used while destroyed”.
- Skin dummy binding used when no skin.

## Performance & Caching (implemented)
- Cached scene traversal and one-time `SetLocations` per geometry.
- MVP: compute `proj*view` once per frame; per-mesh only multiply the model.
- Deferred G-Buffer material packs MVP/Model/Normal/flags into a single 224-byte uniform write per draw.
- Lighting debug/normal variants only recreate bind groups as needed; swapchain view created once per frame in lighting.
- Metrics overlay to track resource churn and upload volume (anti‑flood).

## Current Status
- Dragon + Sponza load in both forward and deferred (camera presets added to stay above ground).
- 2‑RT octa path working; visuals a bit darker vs 3‑RT (expected — will tune post‑validation).
- Forward stabilized (buffer size alignment, VBO resize safety); overlay parity with deferred.
- Observed: Sponza deferred can be 1–2 FPS (likely fill‑rate/bandwidth bound). Use `gbufTargets=2&oct=1` to reduce G‑Buffer cost for profiling.

## Abstractions Mode (Experimental)
- Toggle: `absDemo=1` exécute une démo PBR forward basée sur les nouvelles abstractions (chunks WGSL/defines/factory de matériaux).
- GLTF: réutilise le loader existant; construit un VBO interleavé par primitive (POSITION(3), NORMAL(3), UV0(2), JOINTS_0(4), WEIGHTS_0(4)) et un matériau PBR forward à partir des textures (albedo/MR/normal/AO/emissive si présentes).
- Skinning: supporté (buffer storage avec header useSkinning + paires de matrices skin/normal par joint). Les animations glTF s’updatent aussi en absDemo.
- Flags: `albedo=1` force albedo‑only dans abstractions pour vérification rapide du flux textures.

## Known Issues (Oct 2025)
- Deferred + Multi‑Lights: avec `?lights>0` le modèle peut apparaître inversé/gris. Piste: reconstruction world/depth/normal et handedness dans la passe lights. Workaround: désactiver `lights`.
- Performance: Sponza deferred bound par fill/bandwidth. Préférer `gbufTargets=2&oct=1` pour profiler.

## Abstractions Mode (Experimental)
- Toggle: `absDemo=1` runs a forward PBR demo built from new abstractions (shader chunks/defines/material factory).
- GLTF: Uses the existing loader; builds per‑primitive VBO (pos3+norm3+uv2) and a forward PBR material from textures (albedo/MR/normal/AO/emissive when present).
- Flags: `albedo=1` now also forces albedo‑only in abstractions (helps debug very dark scenes / texture correctness).
- Known: Fox (skinned) currently black in abstractions (skinning not yet implemented in the abstraction shaders). Dragon renders but can be dark — use `albedo=1` to verify data flow. Skinning support planned next.

## Known Issues (Oct 2025)
- Deferred + Multi‑Lights: when `?lights > 0`, model can appear inverted and grey on black. Root cause under investigation (depth/normal reconstruction or coordinate mismatch in the multi‑light path). Workaround: disable lights or use standard deferred without `lights` until fixed.
- Abstractions Fox: black screen (skinned mesh not handled yet). Abstractions Dragon: renders but dark; use `albedo=1` to validate albedo flow.

## Next Steps (Showcase Many Point Lights)
1) Multi‑light support in deferred
   - Add `?lights=N` and allocate a storage buffer of N point lights.
   - Optional compute pass to update light positions/colors (like webgpu‑samples), else CPU init + per‑frame jitter.
   - Accumulate lighting in fragment shader for baseline demo (clustered/tiled later if needed).

2) G‑Buffer tuning
   - Recommend `gbufTargets=2` when AO/Emissive unused. Keep `gbufTargets` configurable.
   - If needed, add half‑res G1/G2 + upsample path.

3) UX
   - Optional pointer‑lock for mouse look.
   - Simple UI toggles for `gbufTargets`, `oct`, `noanim`, and model switching.

## Key Files
- Deferred: `src/lucid3d/Deferred/DeferredRenderer.ts`, `src/lucid3d/Deferred/WebgpuGBufferMaterial.ts`, `src/lucid3d/Deferred/WebgpuSceneRendererGBuffer.ts`, shaders in `src/lucid3d/Deferred/shaders/`.
- Forward: `src/lucid3d/PBRMaterial/WebgpuMaterial.ts`, shaders under `src/lucid3d/PBRMaterial/shaders/`, `src/lucid3d/WebgpuSceneRenderer.ts`.
- Common: camera `src/lucid3d/WebgpuOrbitControls.ts`, main loop `src/lucid3d/WebgpuMain.ts`, geometry `src/lucid3d/WebgpuGeom.ts`, GLTF loader `src/lucid3d/Loaders/GLTF2WGPU2.ts`, overlay `src/components/WebgpuApp/util/debug-overlay.ts`, query args `src/components/WebgpuApp/util/query-args.ts`, metrics `src/lucid3d/util/metrics.ts`.
- Models: Fox (`assets/Fox/glTF/Fox.gltf`), Sponza (`assets/media/gltf/sponza/Sponza.gltf`), Dragon (`assets/stanford_dragon_pbr/scene.gltf`).

### Abstractions (nouveaux fichiers)
- `src/lucid3d/Abstractions/Defines.ts`, `ShaderChunk.ts`, `Uniforms.ts`, `PipelineCache.ts`
- `src/lucid3d/Abstractions/templates/pbr_forward.{vert,frag}.wgsl`, `chunks/`
- `src/lucid3d/Abstractions/MaterialFactory.ts` (Forward PBR stub avec skinning + albedo‑only)
- Démos: `src/lucid3d/WebgpuSamples/abstractions_forward_pbr_demo.ts`, `src/lucid3d/WebgpuSamples/abstractions_gltf_demo.ts`

## Quick Profiles

## Next Steps (Abstractions Roadmap)
1) Parité PBR complète en abstractions
   - Ajout TBN + normal mapping dans la factory abstractions (forward) pour parité visuelle avec le deferred.
   - Pooling: `BindGroupPool`, `Uniform ring buffer`, `PipelineCache` branchés sous la factory pour réduire le churn.

2) Abstractions côté deferred
   - Générer automatiquement une variante « encode G‑Buffer » depuis le même `MaterialDesc` (chunks `encode_gbuffer`, `octEncode`, etc.).
   - Unifier layouts/attributs (POSITION/NORMAL/TANGENT/UVs/JOINTS/WEIGHTS) pour forward et deferred.
   - Exposer un switch haut niveau « path: forward|deferred » au niveau factory.

3) Multi‑lights deferred (fix + upgrade)
   - Corriger la reconstruction world (clip/depth) et handedness pour `?lights>0`.
   - Étudier tiled/clustered lighting (liste compacte de lights par cluster) pour scaler N lights.

4) Outils & UI
   - Étendre le panneau de flags (absDemo): toggles PBR (albedo‑only, normal map on/off, roughness/metallic scalars).
   - Material inspector (visualiser defines/chunks; mini log de compilation).
- Forward Fox: `?model=fox`
- Deferred Dragon (reduced G‑Buffer cost): `?deferred=1&model=dragon&gbufTargets=2&oct=1&metrics=1`
- Deferred Sponza baseline: `?deferred=1&model=sponza&metrics=1`
- Isolate CPU uploads: add `&noanim=1`
- Abstractions PBR Dragon: `?absDemo=1&model=dragon`
- Abstractions PBR Fox (skinning): `?absDemo=1&model=fox`
- Abstractions albedo‑only check: `?absDemo=1&model=dragon&albedo=1`
- Abstractions PBR Dragon: `?absDemo=1&model=dragon`
- Abstractions albedo‑only check: `?absDemo=1&model=dragon&albedo=1`
