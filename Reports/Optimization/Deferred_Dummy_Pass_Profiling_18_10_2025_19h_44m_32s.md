title: "Deferred Dummy Pass Profiling"

# Deferred Dummy Pass Profiling

Date: 2025-10-18T19:44:32+02:00
Category: Optimization
Tags: deferred,profiling,compute,performance

## Contexte

Tests de perf du nouveau pipeline différé avec l’option `?lightDebug=dummy` censée isoler le coût de la passe d’éclairage. Malgré le shader magenta volontairement trivial, le framerate reste bloqué à ~30 FPS.

## Objectifs

- Comprendre pourquoi la voie “dummy” dépense encore ~20 ms dans la passe lighting.
- Identifier les zones de code responsables et préparer des pistes d’allègement avant de demander conseil.

## Changements / Analyses

- `setupLightingTexture` force la cible d’accumulation en `rgba16float` via un texture storage (`src/lucid3d/Deferred/DeferredRenderer.ts:217`). Même lorsqu’on veut juste remplir en magenta, on reste sur une écriture float16 par pixel.
- Dans la branche `lightDebug === 'dummy'`, on compile une compute pipeline dédiée mais on dispatch toujours `ceil(width/8) × ceil(height/8)` workgroups, chacun écrivant dans la texture storage (`src/lucid3d/Deferred/DeferredRenderer.ts:735`). Le blit fullscreen est ensuite lancé comme dans la voie normale (`src/lucid3d/Deferred/DeferredRenderer.ts:767`).
- Le shader associe directement chaque invocation à un `textureStore` en float16 :  
```wgsl
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  textureStore(lightingOut, globalId.xy, vec4(1.0, 0.0, 1.0, 1.0));
}
```
(`src/lucid3d/Deferred/shaders/lighting_compute_dummy.wgsl:1`)
- Profiling GPU avec timestamps : frame 0 à 39.5 ms dont 34.0 ms pour la passe lighting, frame 30 à 24.9 ms dont 21.3 ms lighting. Conclusion : même sans BRDF ni lecture de GBuffer, l’écriture `rgba16float` + blit coûte ~20 ms.

## Résultats / Prochaines étapes

- Proposer un mode debug qui court-circuite complètement la compute pass en dessinant la couleur constante directement dans le render pass (pas d’écriture storage).
- Variante alternative : générer une texture `rgba8unorm` temporaire pour mesurer le coût purement “blit” et comparer la bande passante nécessaire.
- Partager ces constats pour avis : vaut-il mieux conserver la compute pass mais descendre en UNORM/UNORM8 quand on est en debug, ou introduire un chemin render pipeline dédié ?

*Rapport généré par new_report*
