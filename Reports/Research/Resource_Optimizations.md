# LR Lucid3D — Optimisations de Ressources et Pistes Futures

Ce document liste les optimisations déjà présentes dans le moteur (forward + deferred) et propose des pistes concrètes pour aller plus loin, en particulier pour scaler vers beaucoup de modèles et de lights.

## Déjà en place

- CPU/Churn
  - Cache traversal scène et SetLocations: la collecte des meshes est reconstruite seulement quand nécessaire (voir `WebgpuSceneRendererGBuffer`).
  - Calcul `proj*view` une seule fois par frame; par mesh seul `projView * model` est refait.
  - Matrices model/normal mises en cache par `Transform` avec recompute-only-when-changed.
  - Overlay et FPS/thruput mis à jour à 4 Hz pour éviter le spam DOM/console.

- Géométrie/Buffers
  - Gros VBO interleavé (forward et deferred) construit côté CPU puis un seul `queue.writeBuffer` par (re)construction.
  - Recréation sûre du VBO si stride/vertex-count changent; pas de `destroy()` immédiat sur buffer potentiellement en cours d’usage.
  - Rebuild du VBO uniquement quand les attributs/tailles ont vraiment changé (stride/posCount/flags).
  - Index buffer réutilisé; attributs optionnels remplis en zéro si absents pour éviter branches côté shader.

- Materials/Textures
  - Placeholders 1x1 (albedo/MR/AO/Emissive/Normal) au boot pour éviter d’attendre le décodage image.
  - Samplers réutilisés; pipelines `layout: 'auto'` minimalistes.
  - G-Buffer 2 RTs optionnel avec normal en octa (RG) + roughness en B pour réduire bande passante et taille d’attachement.
  - Dans le path lighting, `textureSampleLevel`/`textureLoad` pour contrôler les LODs et éviter filtrage non voulu.

- Forward/Deferred
  - Forward: MSAA + resolve, VBO unique interleavé, bind de skin dummy si absent.
  - Deferred: passe G-Buffer séparée puis lighting full-screen triangle; debug viewer GBuffer via `textureLoad` non filtré.
  - Multi-lights (option `?lights=N`) style webgpu-samples avec SSBO de lights, uniforms `numLights` + `viewProj/InvViewProj`, compute pass d’update (samples=1 requis pour sampler la depth).
  - Depth du G-Buffer sampleable lorsque `samples=1` (pour reconstruction de position monde en lighting).

- Animation/Skinning
  - Uploads skinning désactivables via `?noanim=1` (supprime les writes après création des buffers).
  - `minBindingSize=80` pour le storage de skin « dummy » lorsque pas de skin, afin d’éviter les erreurs de validation.
  - Bind group de skin par transform mis en cache (clé stable) et réutilisé.

- Métriques/Debug
  - Overlay métrique (buffers/bindGroups/textureViews/writes/bytes) anti-flood pour suivre le churn ressource.
  - Flags URL et overlay textures (présence albedo/MR/normal/AO/Emissive).
  - Panneau UI (flags) pour basculer `deferred`, `gbufTargets`, `oct`, `samples`, `metrics`, `noanim`, `model`, `gbuf` et `lights`.

## Pistes d’optimisation — Court terme (faible risque)

- Batching/Sorting
  - Trier les draws par pipeline/material pour réduire les changements de pipeline/bind groups.
  - Réduire les permutations shader (déjà conditionnées par flags) via constants WGSL plutôt que `replace()` string.

- Uniforms/Bindgroups
  - Passer les uniforms frame/camera dans un ring-buffer (`UNIFORM|COPY_DST` avec offset) pour éviter la recréation de bind groups.
  - Centraliser `viewProj/InvViewProj` dans un unique bind group partagé (group 0) pour toutes les passes.

- G‑Buffer
  - Ajouter voie demi‑résolution pour `normal+roughness` (ou `G1/G2`) avec upsample guidé (bilatéral léger) en lighting.
  - Option clamp 8‑bit pour albedo (déjà RGBA8) et normals encodés en octa 2‑RT pour scènes lourdes (Sponza).

- Chargement/CPU
  - Pré‑interleaver les attributs glTF au chargement, garder un cache CPU interleavé par primitive.
  - Éviter conversions matrices/object à chaque frame (utiliser vues Float32Array directes partout).

- Overlay/Profiling
  - Étendre métriques: temps GPU par passe (timestamp queries) si supporté, bytes par frame, surfacique G‑Buffer.

## Pistes — Moyen terme (impact modéré)

- Culling & LOD
  - Frustum culling CPU par AABB/Bounding‑sphere (par node glTF) avant build du VBO.
  - Hi‑Z/occlusion culling approximatif (coarse) en compute (un bool par mesh ⇒ masque de draw indirect).
  - LOD statique par distance (glTF LOD extension si dispo) + imposters/billboards pour petits objets.

- Instancing & Multi‑Model
  - Instancing par matériau/géométrie: buffer per‑instance (model matrix, ids) et draw instancié pour répéter le même mesh.
  - Regrouper primitives identiques de multiples modèles en « batches » de draw instanciés.
  - GPU‑driven indirect draws: construire un buffer d’arguments de draw (indexCount/instanceCount/firstIndex/…) côté compute; faire un seul `drawIndexedIndirect` par matériau.

- Textures
  - Compressions GPU (BasisU/KTX2) pour albedo/RGBA (BC7/ETC2/ASTC selon GPU), normals (BC5/ETC2_RG) et masks (BC4).
  - Streaming MIP progressif (prioriser MIP bas, remplacer dynamiquement une fois prêts).
  - Texture arrays/atlases pour réduire les bind changes dans les matériaux partagés.

- Deferred Lighting
  - Tiled/Clustered lighting (frustum tiles via compute) pour éviter O(Nlights × pixels).
  - Light culling par tile (SSBO de listes compactées) + itération sur une petite liste par pixel.

## Pistes — Long terme (architecture)

- GPU‑Driven Pipeline
  - Graph de rendu explicite, ressources transientes (aliasing d’attachements), planification des passes.
  - Pipeline cache et précompilation WGSL (minimiser coût de création à chaud).
  - Descriptor/bindgroup pooling + cache LRU.

- Animation/Skins
  - Skinning compute en batch vers SSBO de matrices skinnées, réutilisées dans les passes (évite recompute vertex).
  - Compression d’animations (quantization, curves, anim clips partagés), upload delta.

- Scene/Assets
  - Support KHR_meshopt/Draco pour géométries compressées (prétraitement, décompression asynchrone).
  - Virtual texturing / megatexture pour vastes scènes.

## Scénarios « beaucoup de modèles » — Stratégie

- Organization
  - Grouper par matériau/pipeline; instancier plutôt que dupliquer les buffers.
  - Limiter le nombre de textures uniques (palettes, atlases, texture arrays) pour diminuer les bind changes.

- Culling/LOD
  - Frustum culling grossier CPU + masque de visibilité.
  - LOD par distance; fallback impostors pour objets < quelques pixels.

- Streaming
  - Charger d’abord LOD bas + MIP bas; upgrader selon distance/temps budget (frame budget de bytes/s).
  - Prioriser assets visibles; queue de chargement avec backpressure.

- Mémoire
  - Pooling de buffers/texture views; recycler quand models quittent la scène.
  - Budgets par classe (geometry, textures, intermediates); évictions LRU des MIPs élevés.

## Scénarios « beaucoup de lights » — Stratégie

- Passage de base (en place)
  - SSBO de lights + reconstruction position monde depuis depth (samples=1) + loop sur N lights.

- Évolutions
  - Clustered/tiled: construire une grille (x,y,z) côté compute, associer une liste compacte de lights par cluster.
  - Culling de lights par tile via AABB-sphere test; réduire la boucle par pixel de O(N) à O(k) avec k<<N.
  - Option stencil/volume spheres (forward+) si besoin d’alternative.

## G‑Buffer — Réductions bande passante

- Déjà: 2‑RT avec normal octa (RG) + roughness B; 3‑RT pour emissive+AO.
- À envisager:
  - Demi‑rés G1/G2 + upsample (bilatéral léger guidé normal/depth).
  - Pack additions (metallic/roughness/ao) selon usages; basculer dynamiquement 2↔3 RTs.
  - Pas de MSAA en deferred (déjà optionnel); préférer TAA/FXAA post pour edges.

## WebGPU — Tips spécifiques

- Utiliser `textureLoad` (unfilterable-float) pour debug/lighting afin d’éviter sampler state coûteux.
- Préférer réutilisation de `GPUTextureView`/`GPUSampler` et de bind groups (pool) au lieu d’en recréer chaque frame.
- Limiter la création de `TextureView` swapchain à une fois par frame (déjà en place côté lighting).
- Éviter `destroy()` immédiats; laisser la GC de frame suivante si non critique.

## Roadmap suggérée

- R1 (rapide): tri par matériau/pipeline, ring buffer d’uniforms frame, toggle demi‑rés GBuffer, frustum culling CPU.
- R2 (itératif): instancing multi‑modèles, MIP streaming KTX2/BasisU, LOD distances.
- R3 (avancé): clustered lighting, GPU‑driven indirect draws, occlusion culling compute, skinning compute.

## Mesure / Validation

- Étendre `metrics` pour reporter: temps GPU par passe, tailles GBuffer, bytes upload/frame, nb. draw calls.
- Scripts de profils rapides: Fox/Dragon/Sponza en forward/deferred 2‑RT/3‑RT, lights=0/128/512, samples=1.

---

Notes: plusieurs propositions dépendent des limites/implémentations navigateur/GPU (formats compressés, timestamp queries, extensions). Chaque étape doit être feature‑gated et mesurée via l’overlay metrics.

