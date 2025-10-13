title: "PBR Comparison WebGPU vs WebGL"

# PBR Comparison WebGPU vs WebGL

Date: 2025-10-13T12:09:19+02:00
Category: Research
Tags: shading,pbr,comparison,webgpu

## Contexte

Nous venons de remettre en place une architecture modulaire WGSL pour le chemin forward PBR. Le rendu actuel (renard, dragon) montre toutefois une réponse quasi « unlit » : seule la Lambert diffuse simple est calculée. L’ancien moteur WebGL possédait une implémentation PBR beaucoup plus aboutie (BRDF GGX complet, extensions KHR, IBL). L’objectif est de prendre le meilleur des deux avant de porter la partie physique dans WebGPU.

## Objectifs

- Cartographier précisément ce que la branche WebGPU calcule aujourd’hui (modules, chunks WGSL, pipeline).
- Inventorier les briques PBR disponibles dans le projet WebGL historique (fonctions BRDF, éclairages, extensions) et comprendre la granularité des anciens `ShaderModule`.
- Identifier les éléments à fusionner et les points d’attention (performances, dépendances, uniformes) pour préparer la migration.

## Changements / Analyses

- **État WebGPU (actuel)**  
  - `src/lucid3d/Abstractions/templates/pbr_modules_forward.frag.wgsl` contient uniquement un Lambert ponctuel fixé (`color = max(dot(n,l),0)*albedo`).  
  - Les modules `BaseColorModule`, `MetallicRoughnessModule`, `NormalMapModule`, etc. alimentent déjà les uniforms/bindings (UV transform, facteurs MR, normal map). Le chunk `brdf.wgsl` ne fournit qu’un helper `lambert` et un `schlick` très simplifiés.  
  - Aucun éclairage direct/indirect n’est injecté via les phases `LIGHT_*`; pas de support IBL, ni de clearcoat/transmission. Le pipeline produit donc des résultats “albedo only” malgré la présence des textures PBR.

- **État WebGL (ancien projet)**  
  - `fullFragment.glsl` implémente la totalité de l’algorithme glTF référence : BRDF GGX + Lambert, Fresnel Schlick, V_GGX, D_GGX, Charlie sheen, transmission, clearcoat, parallax pour l’extension KHR_materials_variants, etc.  
  - Support poussé des extensions KHR (clearcoat, sheen, transmission, volume), ponctual lights (`u_Lights`), IBL (préfiltered env map + BRDF LUT), shadowing/masking, tonemapping.  
  - Les anciens `ShaderModule` ajoutaient dynamiquement des snippets dans les phases `LightInit`, `LightComputation`, `Finalize`, etc., alignées avec les modules (BaseColor, MetallicRoughness, IOR, ClearCoat…).

- **Comparaison & gaps**  
  - **Architecture** : WebGPU dispose maintenant d’un composer modulaire équivalent (phases WGSL), mais les snippets physiques n’ont pas été migrés.  
  - **Données** : la nouvelle `ModuleAggregationContext` génère déjà les mêmes uniforms (facteurs MR, UV transforms), ce qui facilitera le “copier/adapter” des calculs existants.  
  - **Fonctionnalités manquantes** : tous les calculs spéculaires (GGX, Fresnel, visibility), l’éclairage multi-lumières, l’IBL, le traitement des extensions (clearcoat, sheen, transmission, volume) sont absents côté WebGPU.  
  - **Opportunités d’amélioration** : réécrire les helpers math dans des chunks WGSL séparés (microfacet, Fresnel, visibility) pour réutiliser le pipeline modulaire ; s’appuyer sur les nouvelles phases `LIGHT_INIT` / `LIGHT_COMPUTE` / `FRAGMENT_FINALIZE` pour insérer les contributions lumineuses et post-traitements; rationaliser les uniforms en profitant du packing WebGPU existant (moins de dépendances GL).  
  - **Risques/contraintes** : vérifier la disponibilité des textures IBL (préfiltered cube, brdfLUT) dans le nouveau moteur; adapter les conversions mat4/mat3 et les fonctions GLSL spécifiques (e.g. `clamp`, `pow`) aux idiomes WGSL; recalculer les signatures de pipeline lorsqu’on ajoute des bind groups (IBL uses extra samplers); anticiper les coûts GPU – WGSL impose parfois des reconstructions matricielles qui diffèrent de GLSL.

## Résultats / Prochaines étapes

- Porter, en WGSL, les blocs mathématiques du BRDF (F/V/D, diffuse, clearcoat, sheen) issus de `fullFragment.glsl` dans de nouveaux `chunks/*.wgsl`, puis injecter ces helpers via un module `PBRLightingModule`.  
- Réintroduire l’éclairage directionnel/punctuel en exploitant les phases `LIGHT_INIT_SNIPPETS` et `LIGHT_COMPUTE_SNIPPETS`; prévoir la structure d’un UBO lumière compatible glTF (`u_Lights`).  
- Planifier la migration IBL (préfiltered env + BRDF LUT) : définir les bindings additionnels (cube map, LUT) et les uniformes (exposition, intensity).  
- Consolider les extensions KHR prioritaires (clearcoat, sheen, transmission) en modules optionnels, en reprenant les équations existantes.  
- Après portage, comparer visuellement avec la version WebGL et profiler pour ajuster (réduire branches, precalc tables).

*Rapport généré par new_report*
