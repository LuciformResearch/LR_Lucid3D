title: "WebGPU ShaderModule Roadmap"

# WebGPU ShaderModule Roadmap

Date: 2025-10-13T11:31:27+02:00
Category: Research
Tags: shader,modules,abstraction,webgpu

## Contexte

Le moteur WebGPU actuel s'appuie sur des gabarits WGSL enrichis manuellement (chunks + `MaterialFactory`). Dans l'ancien projet WebGL, la hiérarchie `ShaderModule` fournissait une composition modulaire (défines, snippets, uniforms) avec des conventions bien établies. Nous voulons rétablir cette structure dans l'environnement WebGPU pour faciliter la maintenance et le partage d'options matériaux.

## Objectifs

- Cartographier les équivalences entre les phases GLSL historiques (Initialize, MaterialInfo, LightComputation, etc.) et nos points d'injection WGSL (`// @@...`).
- Normaliser l'API côté TypeScript : modules composables, registres d'uniformes/bindings, génération automatique des `struct` UBO et layout bind group 1.
- Garantir la réutilisation du cache pipeline/bind group tout en introduisant des identifiants uniques via `UniqueIDHelper`.
- Poser les fondations pour migrer progressivement chaque fonctionnalité matériau (base color, metallic-roughness, normal map, clear coat, etc.).

## Changements / Analyses

- **Strates de modules** : réintroduire une classe abstraite `ShaderModule` avec gestion des sous-modules, phases et agrégation de snippets. Les phases WebGL seront mappées vers trois familles WGSL à court terme (`MATERIALINFO`, `NORMALMAP`, `VERTEX_EXTRA`), avec extension prévue pour la lumière (`LIGHT_INIT`, `LIGHT_COMPUTE`) lors du port de l'éclairage multiple.
- **Registres uniforms/bindings** : exposer depuis `MaterialFactory` deux registres : l'un construit `struct MaterialUniforms` et les buffers associés, l'autre réserve textures/samplers dans le bind group 1 en conservant les indices préférés pour compatibilité. Les modules pourront y inscrire leurs besoins sans connaître la structure globale.
- **Composer WGSL** : enrichir `ShaderComposer` pour prendre en charge plusieurs phases et injections répétables (avant `fn main`, dans `main`, après). Les snippets seront ordonnés par priorité (module parent → enfants) comme dans l'implémentation WebGL.
- **Défines et permutations** : les modules alimenteront une map de `defines`; `MaterialFactory` dérivera une signature stable (clé de cache pipeline) basée sur `defines`, `layout` et `entry-points`. Cela permet de réutiliser la logique du cache existant en introduisant des conventions de nommage proches de l'ancien projet.
- **Intégration UniqueIDHelper** : envelopper la logique d'ID dans un utilitaire (`getObjectId(obj)`) pour étiqueter pipelines, bind groups et buffers. Cela évite la recréation de maps manuelles et s'aligne sur les attentes mentionnées par l'utilisateur.

## Résultats / Prochaines étapes

- Valider la conception avec un POC minimal : `BaseColorModule`, `MetallicRoughnessModule`, `NormalMapModule` réécrits via la nouvelle hiérarchie.
- Implémenter le registre d'uniformes et la génération de WGSL struct/UBO afin de garantir la compatibilité avec le code existant.
- Étendre `ShaderComposer` et les templates pour supporter les nouvelles phases tout en conservant le rendu actuel.
- Adapter `MaterialFactory`/`PipelineCache` pour consommer les modules et produire les pipelines/bind groups configurés.
- Préparer une suite de tests/démos ciblés (`?absDemo=1` et scénarios GLTF variés) afin de valider chaque étape avant la migration complète.

*Rapport généré par new_report*
