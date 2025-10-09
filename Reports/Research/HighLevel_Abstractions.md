# LR Lucid3D — Abstractions Haut Niveau (Shaders, Matériaux, Backends)

Ce document propose des abstractions pour simplifier l’écriture de shaders/matériaux, unifier forward/deferred, préparer un backend WebGL, et améliorer les performances via pooling/caching. Il s’appuie sur l’existant du projet et des patterns de l’ancienne lib (WebGL) trouvés sous `webxrelectronmodelingtool-main` (ex: `WebglMaterial`, `WebglShader`, `PBRMaterial`).

## Principes
- Modularité: découper les shaders en « snippets » réutilisables (chunks WGSL), combinés dynamiquement.
- Déclaratif: API haut niveau pour décrire un matériau (paramètres, textures, features), la lib génère WGSL/bindings/pipelines.
- Unification: même modèle conceptuel pour forward et deferred; variantes générées/cachées.
- Cross-backend: façade API matériaux/pipelines indépendante du backend, impls WebGPU/WebGL.
- Performance by design: pooling, caches, tri par state, ring-buffers, réduction des variants inutiles.

## 1) Système de « Shader Chunks » WGSL
- But: factoriser code commun (math BRDF, TBN, normal octa, PBR utils, gbuffer encode/décode, debug utils).
- Format: fichiers `*.wgsl` courts, exportés comme modules/chunks (ex: `chunks/brdf.wgsl`, `chunks/tbn.wgsl`, `chunks/gbuffer_util.wgsl`).
- Composition: un petit moteur assemble un vertex/fragment final via directives (simple DSL) et constantes de compilation.
- Variantes: clés de variantes calculées à partir d’un objet `Defines` (analogue à `WebglShaderDefines`), cache de `GPUShaderModule`/`GPURenderPipeline` par clé.
- Bénéfices: moins de duplication, debug ciblé, moins de codegen ad‑hoc par `string.replace`.

Esquisse DSL minimal (pseudo):
- Header: `use brdf, tbn, gbuffer_util`
- Blocks nommés: `fragment main { … }` où des symboles référencent des snippets (`pbr_shading()`, `encode_gbuf()`).
- Génération: résout `use` en concat, injecte `const`s selon `Defines`, puis compile.

## 2) « Material Descriptor » déclaratif
- Objet TS décrivant un matériau: inputs (textures/UV sets), scalars (roughness, metallic), options (normal map, AO, emissive), shadingModel (`pbr`, `unlit`, `toon`).
- Exemple:
  ```ts
  const matDesc: MaterialDesc = {
    shading: 'pbr',
    textures: { baseColor, mr, normal, ao, emissive },
    scalars: { roughness: 0.8, metallic: 0.1 },
    features: { vertexColor: true, doubleSided: false },
  };
  ```
- Build: `MaterialFactory.build(matDesc, { path: 'forward'|'deferred', gbufTargets:2|3 })` retourne un objet `Material` avec:
  - shader modules générés (via chunks + defines)
  - layouts/bindings unifiés
  - pipeline (ou pipeline cache key)
  - apply/draw helpers (set bind groups, push uniforms packés).
- Bénéfices: consumer code simple; la lib gère variants/defines/pipelines/bindings.

## 3) Unifier Forward et Deferred
- Interfaces communes:
  - `MaterialInterface`: `getDefines()`, `getBindGroupLayouts()`, `writeUniforms(frameCtx, drawCtx)`, `draw(encoder, geom)`.
  - `GeomInterface`: décrit `VertexBufferLayout` (locations/stride) unique compatible fwd/deferred.
- Stratégie:
  - Même interleave attributs pour les deux chemins (déjà vrai dans le code).
  - PBR math partagée via chunks; en deferred, un chunk « encode_gbuffer() ». En forward, un chunk « shade_pbr() ».
  - Générer automatiquement les deux variantes depuis le même `MaterialDesc`.
- Gains: moins de duplication, cohérence visuelle, maintenance réduite; facilite l’ajout de features (clearcoat, sheen) dans les deux chemins.

## 4) Génération Haut Niveau des Shaders pour les Consumers
- API « variables de shader »:
  - Mapping simple: `let myVar = mat.addFloat('exposure', 1.2)`, `let myColor = mat.addColor('tint', [1,0.8,0.8])`.
  - Injections sûres WGSL: le consommateur peut injecter un court bloc `fn user_fragment_mod(in: FSIn) -> vec3<f32>` que la lib appelle dans le fragment.
- Préservations:
  - La lib garde le contrôle structurel (IO, bindings, entrypoints), expose de petites « hooks » (pre/post-light, pre-albedo, post-final).
- Bénéfices: flexibilité sans briser la sécurité/compatibilité; pas besoin d’écrire tout un shader à la main.

## 5) Pooling et Caching (abstractions)
- `BufferPool`: aloue des `GPUBuffer` par classes de tailles/usage; recycle sur resize/destroy.
- `BindGroupPool`: clé = layout + views/samplers; réutilise bind groups identiques (LRU).
- `PipelineCache`: clé = (shader key, formats, state, sampleCount); compile lazy; eviction LRU.
- `TextureViewPool`: réutilise `GPUTextureView` temporaires (ex: swapchain per-frame, gbuffer views déjà en place).
- `RingUniformBuffer`: uniform frame/obj via offsets pour éviter reprovision de bind groups.
- Comment l’exposer: façade simple (`frameCtx.uniforms.allocate(224)`) sans révéler la mécanique.
- Gains: baisse du churn (bindgroups/buffers/views), réduction des allocations, meilleures métrriques.

## 6) Abstraction « Render Graph » (léger)
- But: déclarer des passes + ressources logiques (attachments, transients), la lib crée/détruit au bon moment.
- Noeuds: `GBufferPass`, `LightingPass`, `ForwardPass`, `PostFXPass`.
- Edges: inputs/outputs (`albedo`, `normalRoughness`, `depth`, `swap`) et aliasing possible.
- Bénéfices: clarté, orchestration, réutilisation, préparation future pour aliasing/transient resources.

## 7) Préparer le Backend WebGL
- Inspiré de `WebglMaterial`, `WebglShader`, `WebglShaderDefines`:
  - `Defines` communs (mêmes clés logiques), backends génèrent soit WGSL, soit GLSL (templates parallèles).
  - `Material` backend-agnostique: dispatch `compile` selon backend; conserve la même `MaterialDesc`.
  - `UniformContainers` typés (float, vec2/3/4, mat4, sampler2D) avec API identique; WebGPU: pack/UBO; WebGL: glUniform*.
  - `ProgramVariants`/`PipelineVariants` par clé de defines; cache similaire aux `byDefinePrograms`.
- Bridging G-Buffer:
  - Abstraire `EncodeGBuffer()`/`DecodeGBuffer()` pour que les shaders GLSL ou WGSL convergent.
  - Limiter les locs / formats pour rester compatibles (POSITION/NORMAL/TANGENT/UV0/JOINTS/WEIGHTS).

## 8) Outils Dev & Debug Abstraits
- « Material Inspector »: UI pour voir/appliquer defines, visualiser chunks, toggler RTs et features.
- Log de compilation: liste des variantes, temps de compilation, tailles UBO/SSBO.
- Live‑reload: régénérer les shaders/chunks à chaud (dev only).
- Capture repro: sérialiser un draw avec ses states pour rejouer/debug.

## 9) Lien avec les optimisations
- Variantes contrôlées: réduit explosion de shaders; compilation lazy + cache.
- Pooling: baisse le churn, corrèle avec `metrics` (bindgroups/buffers/views/writes/bytes).
- Unification fwd/deferred: code partagé, meilleurs hotpaths, moins d’incohérences perf.
- Render graph: permet aliasing d’attachements (moins de VRAM), orchestration claire (moins de rebuild inattendus).
- DSL/chunks: évite `string.replace`, moins d’erreurs, génération ciblée (ex: 2‑RT octa vs 3‑RT) ⇒ moins de branches shader.

## 10) Roadmap proposée
- Phase A (foundation)
  - Introduire `Defines`, `ShaderChunk` et `PipelineCache`; migrer PBR forward sur ce système.
  - `MaterialDesc` minimal (PBR/unlit), génération forward; UI d’inspection.
- Phase B (parité)
  - Émettre la variante deferred depuis le même `MaterialDesc` (encode G‑Buffer); unifier layouts/locations.
  - Introduire `RingUniformBuffer` + `BindGroupPool`.
- Phase C (backends)
  - Prototype backend WebGL: templates GLSL, `ProgramVariants`, UniformContainers.
  - Adapter 2–3 samples pour valider (textured cube, Fox).
- Phase D (graph/pooling étendus)
  - Mini render‑graph, aliasing d’attachements, pooling textures/views, tiled/clustered lighting plug‑in compatible.

---

Annexes (références code)
- Ancienne lib WebGL: `WebglMaterial.ts` (defines/variants/uniforms), `PBRMat.ts` (matériau PBR), patterns de hooks et containers.
- Présent WebGPU: `Deferred/WebgpuGBufferMaterial.ts`, `Deferred/DeferredRenderer.ts`, `PBRMaterial/WebgpuMaterial.ts` — candidats à factorisation via `MaterialDesc` + chunks.

## (Annexe) Auteur de matériaux « dynamique » (uniforms/textures à la volée)

Objectif: permettre au consommateur de définir dynamiquement uniforms/textures au niveau haut (sans connaître les layouts), et générer à la volée WGSL, layouts, bindgroups et pipeline.

- API proposée
  - Uniforms: `mat.addFloat('exposure', 1.0)`, `mat.addVec3('tint', [1,0.9,0.9])`, `mat.addMat4('model', m)`.
  - Textures: `mat.addTexture('albedo', texView, { role:'baseColor' })`, `mat.addTexture('normal', texView, { role:'normal' })`.
  - Hooks WGSL optionnels: `mat.addCode('postLighting', (sym) => 'return ' + sym + ' * exposure;')`.

- Génération automatique
  - Signature de layout dérivée de l’ordre déterministe des symboles (hash « layoutSig »). Clés de cache = `shaderKey|layoutSig|state`.
  - BindGroupLayouts synthétisés par rôles (ex: group0 uniforms, group1 textures/samplers), tailles/alignements gérées par la fabrique.
  - WGSL émis via chunks + déclaration auto des `@binding` selon la signature.

- Mise à jour à chaud et sécurité
  - Maj de valeurs (writeBuffer) sans rebuild; ajout/suppression de symboles déclenche un « bump » de version (recréation pipeline+BG).
  - Rebuilds déclenchés en bord de frame (barrière de version) pour éviter états incohérents; pool/recycle anciennes ressources.

- Performance/limites
  - Throttling des rebuilds (coalesce); pool de bindgroups/buffers; pré-déclaration optionnelle d’un superset attendu pour limiter le churn.
  - Diagnostics: afficher `layoutSig`, variantes et temps de compilation dans l’inspecteur.

- Backends
  - WGSL/GLSL générés par le même graphe de symboles; mapping rôles → types GLSL pour WebGL.

- Roadmap
  - Après Phase B: introduire cette API dynamique, puis basculer `MaterialDesc` à l’interne comme une instance pré-déclarée de cette API.
