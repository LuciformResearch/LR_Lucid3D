title: "Deferred Sample PBR Refactor"

# Deferred Sample PBR Refactor

Date: 2025-10-18T21:51:14+02:00
Category: Plans
Tags: deferred,sample,pbr,plan

## Contexte
- Le sample `deferredRendering` tourne désormais avec nos maths, orbit controls et un modèle GLTF importé via `loadGltfSimplePrimitives`.
- Pour isoler la perf, on veut remonter la pile PBR Lucid3D (GBuffer, matériaux, renderer) mais en gardant la structure légère du sample.
- Objectif: “brancher” progressivement les composants `WebgpuSceneRendererGBuffer`, `WebgpuGBufferMaterial`, `DeferredRenderer`, tout en conservant le comportement visuel original (lighting, sliders, compute update).

## Objectifs
- A. Factoriser la création des textures GBuffer via une classe dédiée (équivalent de `GBuffer` mais minimal). 
- B. Remplacer les pipelines hardcodés du sample par une `DeferredRendererSample` inspirée de `DeferredRenderer`, tout en gardant les shaders d’origine au début.
- C. Mettre en place une génération de matériaux `WebgpuGBufferMaterial` depuis les primitives GLTF (baseColor/MR/normal/emissive).
- D. Étendre le loader pour renvoyer la description complète (primitives + matériaux Lucid3D).
- E. Brancher le rendu sur les classes existantes : `WebgpuSceneRendererGBuffer` pour la géométrie, `DeferredRenderer` pour la lighting pass, en adaptant suffisamment pour ne pas casser la perf.
- F. Garder un flag pour comparer “legacy sample” vs “Lucid3D renderer” afin de détecter rapidement le bottleneck.

## Changements / Analyses
1. Étendre `loadGltfSimplePrimitives` → `loadGltfSceneForDeferred` qui renvoie: primitives, textures, infos MR, nodes.
2. Introduire `DeferredSampleGBuffer` (warp minimal de `GBuffer`) pour gérer les textures, resize, formats.
3. Créer `DeferredSampleMaterial` dérivé de `WebgpuGBufferMaterial` avec pipeline aligné sur les shaders du sample.
4. Créer `DeferredSampleRenderer` qui coordonne geometry pass (via `WebgpuSceneRendererGBuffer`) et lighting pass (recyclage du compute/tiled pipeline minimal).
5. Adapter `main.ts` pour instancier ce renderer (garder GUI, sliders, light update compute).
6. Ajouter un flag `?deferredLucid=1` pour basculer entre rendu sample mémoire et rendu “Lucid stack”.
7. Prévoir instrumentation (timestamps) pour comparer.

## Résultats / Prochaines étapes
- Implémenter étape par étape le plan ci-dessus, en vérifiant la perf après chaque substitution (geometry → materials → full renderer).
- Une fois stable, retester le GLTF complet (textures MR) et noter les écarts vs sample brut.

*Rapport généré par new_report*
