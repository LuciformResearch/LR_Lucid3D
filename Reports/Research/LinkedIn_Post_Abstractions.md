Leveling Up Our WebGPU Pipeline: Introducing Lucid3D’s High‑Level Abstractions (WIP)

I’ve been heads‑down evolving Lucid3D’s rendering core (WebGPU/WebXR) to make shader and material authoring significantly easier — while keeping performance front‑of‑mind. Today we’re sharing the first milestone of our new abstractions layer (still experimental) now merged to main.

What’s in now
- Shader chunks + defines: small, composable WGSL snippets with variant keys (no more brittle string hacks).
- Material factory (forward PBR stub): generates WGSL + bind layouts + pipeline from a compact MaterialDesc.
- glTF integration: builds per‑primitive interleaved VBOs and PBR materials from textures (albedo/MR/normal/AO/emissive).
- Skinning support: Fox animates in the abstractions path (storage buffer with header + paired skin/normal matrices).
- Albedo‑only toggle: quick visual sanity check (texture flow / dark scenes) via a simple URL flag.
- Flags panel: fast switching between forward/deferred, 2‑RT octa, metrics, models, and the new abstractions demo.

Why it matters
- Faster iteration for custom looks without re‑plumbing the engine.
- Cleaner separation of “what” (material intent) vs “how” (optimal WGSL + pipeline state).
- A solid foundation to unify forward & deferred (generate G‑Buffer encoders from the same high‑level spec).

What’s next
- Parity PBR: TBN + normal map in abstractions (forward), then the same spec to “encode G‑Buffer” (deferred).
- Pooling/caches: bindgroup pool, uniform ring buffer, and a pipeline cache wired into the factory.
- Multi‑lights: fix and upgrade (clustered/tiled) for large light counts.
- Material inspector: browse defines/chunks, variants, and compile logs live.

Try it
- Repo: https://github.com/LuciformResearch/LR_Lucid3D
- Dev server: npm start → https://localhost:4400
- Demos:
  - Abstractions Dragon: https://localhost:4400/?absDemo=1&model=dragon
  - Abstractions Fox (skinning): https://localhost:4400/?absDemo=1&model=fox
  - Albedo‑only (quick check): add &albedo=1

If this resonates — or if you want to collaborate on high‑performance WebGPU tooling — I’d love to chat.

— Lucie Defraiteur, Founder @ LuciformResearch
luciedefraiteur@luciformresearch.com

#WebGPU #WebXR #glTF #PBR #Shaders #WGSL #Rendering #GameDev #GraphicsProgramming #TypeScript #OpenSource #Abstractions #DeferredRendering #ClusteredLighting #LuciformResearch

