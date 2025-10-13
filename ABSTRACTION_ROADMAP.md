Voici mon point après lecture de REGENERATE_CONTEXT.md et exploration de l’ancien projet.

État actuel (repo WebGPU)

- Abstractions: Defines → WGSL consts, ShaderChunkRegistry, MaterialDesc, MaterialFactory (forward PBR),
PipelineCache (simple map), UniformBufferPack/UniformGPUBuffer.
- Portée: forward PBR “absDemo” avec baseColor/MR/normal/AO/emissive, UBO pack unique, bind group fixe
(sampler + 5 textures), quelques chunks (brdf, tbn) et templates WGSL.
- Manques notables: skinning non intégré dans les shaders abstraits, pas de TBN/tangent exploités côté
vertex layout, pas de spec/gloss workflow, pas de UV transforms/UV set, pas de bind group pooling ni
pipeline caching branchés, abstractions côté deferred non unifiées, MaterialFactory encore monolithique
(peu modulable).

Référence ancien projet (WebGL Lucid3D)

- Matériaux modulaires: système de ShaderModule très riche (sous-modules, defines dynamiques, injection
de “modifiers” par phase: uniforms, material info, normal mapping, clearcoat, sheen, spec/gloss, layer
blending…), variantes de programmes par clé de defines avec cache.
- Uniform containers avancés: conteneurs par texture (UV set 0/1, UVTransform rotation/scale/offset, valeurs
par défaut) générant code + uniforms automatiquement.
- Pipeline/Passes: classification RenderPass (opaque/transparent/additive) et scène (ViewData), hooks
OnBeforeRender/OnApplyUniforms, gestion centralisée des uniforms standard (proj/view/model, light, camera).
- Assets: PBR metal/rough ET spec/gloss, normal map (TBN), vertex color, doubleSided, etc.
- Outils annexes: IK/skin côté app, mais le moteur de rendu sait consommer les données (tangents, couleurs,
etc.).

Écart d’abstraction (où on est en dessous)

- Modulaire matériaux: l’ancien système permet de composer des capacités matériaux par “modules” (clearcoat/
sheen/specGloss/UV transforms) et de générer les defines + code; le nouveau a des templates/chunks mais pas
encore une composition par modules ni plusieurs workflows PBR.
- Variantes/caching: l’ancien met en cache les variantes shader par clé de defines; le nouveau a
PipelineCache mais non branché et ne génère pas de clés de pipeline à partir de Defines.key + layout.
- Paramétrage textures: manque UV set/UV transforms par texture, et gestion homogène des uniforms associés;
aujourd’hui bgl1 fixe [baseColor, mr, normal, ao, emissive].
- Attributs/TBN: pas de tangent dans le vertex layout abstractions → normal mapping/TBN non abouti; l’ancien
gère TANGENT et TBN.
- Skinning: abstractions forward ne gèrent pas le skinning (fox noir), alors que le reste du moteur le
supporte; ancien projet est prêt côté données.
- RenderGraph/passes: ancien a un découpage simple de passes; le nouveau n’a pas encore d’abstraction de
graph/passes unifiée forward/deferred.
(encode_gbuffer, octEncode…).

Recommandations concrètes (priorisées)

- Tangent/TBN et normal map: ajouter TANGENT au layout vertex abstractions + compléter le chunk tbn pour
calculer TBN; activer/consommer USE_NORMAL dans les templates.
- Skinning abstractions: intégrer le binding skin SSBO et appliquer matrices skin/normal en vertex pour
“absDemo”; ajouter un flag USE_SKINNING géré par MaterialFactory.
- Pipeline cache par clé de defines: construire une clé stable Defines.key + vertexLayout + format +
depthState et brancher PipelineCache<GPURenderPipeline> pour réutiliser pipelines.
- BindGroup pooling: introduire un BindGroupPool simple pour bgl0/bgl1 (clé: layout + ressources) et un
uniform ring buffer pour réduire churn.
- Matériaux modulaires: factoriser MaterialFactory en “modules” (UVTransform module, MetallicRoughness
module, SpecGloss module, Clearcoat/Sheen modules) qui:
    - exposent defines,
    - émettent snippets WGSL par phase (uniforms, material info, normal mapping),
    - déclarent bindings/UBO fields à agréger.
- UV sets/UV transforms: étendre MaterialDesc avec uvSetIndex, uvTransform par texture; générer le code
d’accès UV + uniforms associés (à l’image d’AdvancedColorUniformContainer).
- Workflows PBR: ajouter un shadingMode: 'pbr_mr' | 'pbr_sg' | 'unlit'; sélectionner/combiner les modules
correspondants et générer les defines WGSL.
- Unifier forward/deferred: à partir d’un MaterialDesc, générer deux variantes:
    - forward: comme aujourd’hui,
    - deferred: encode G-Buffer (2/3 RTs, octa option) depuis les mêmes modules/données; exposer
BuildOptions.path.
- Render passes: ajouter un champ renderPass (opaque/transparent/additive) déterminé par propriétés
(depthTest, blending...) et permettre un tri simple par pass (utile même en forward).
- Layout builder: créer un petit “pipeline builder” décrivant attributes/bindings et générant layout + code
interface pour éviter hardcoding bgl1 et faciliter l’ajout de nouvelles textures.

Petites victoires rapides

- Activer normal mapping dans les templates pbr_forward.*.wgsl (le chunk existe).
- Ajouter TANGENT à l’interleaving GLTF (si présent) et fallback à TBN from derivatives si indispo.
- Brancher PipelineCache avec Defines.key.
- Étendre MaterialDesc avec features.vertexColor et gérer USE_VERTEX_COLOR.

Conclusion

- La base actuelle est saine (Defines → const WGSL, chunks, UBO pack, MaterialDesc, templates) mais moins
modulaire et moins riche que le système ShaderModule de l’ancien Lucid3D.
- En migrant 3 éléments clés de l’ancien modèle (modules de matériau, variantes/caches par clé, UV/texture
containers) et en ajoutant TBN/skinning, on retrouvera un niveau d’abstraction comparable, avec en plus la
possibilité d’unifier forward/deferred à partir d’un seul MaterialDesc.