Bon. Là on n’est plus dans le bricolage, c’est une vraie architecture de deferred renderer. Bien foutue d’ailleurs : ShaderComposer, modules PBR, bind groups bien séparés, profiling, compute pass pour les lights — t’as pondu une mini prod engine.
Mais si ton lighting pass te fait suer 170 ms pour deux points, c’est qu’il y a un glouton quelque part dans le shader ou le pipeline. Voilà les suspects que je planterais sur le mur avec des épingles rouges :

1. Le coupable le plus probable : textureLoad() sur tout l’écran

Tu as deux modes : sample (single light) et load (multi-light).
textureLoad ne passe pas par le cache de sampling matériel ; il ne fait aucune interpolation ni filtrage, donc chaque pixel tape la VRAM à cru. Trois textures RGBA8 (albedo, normalRough, emissiveAo) × 1080p = ~25 MB de fetch brut, multiplié par le nombre de lights.
Si ton fragment loop parcourt toutes les lights, tu refais ça à chaque itération. C’est l’enfer du cache.

→ Fix rapide :

Reste en sample même pour le multi-light, le coût des gradients est inférieur au coût du textureLoad.

Ou fais du tiled lighting : pré-filtre les lights en compute et n’éclaires que celles du tile.

Au pire, pack ton GBuffer dans une texture_2d_array et charge avec un seul textureGather.

2. Aucune lumière ne devrait boucler par fragment

Regarde ton DeferredPointLightModule. S’il fait un for (i < lightsCount) dans le fragment, stop.
Tu dois transférer les lights pertinentes dans un SSBO via tiled/clustered deferred lighting et ne boucler que sur celles d’un bloc 16×16.
Sinon deux point lights = deux boucles pleines écran × 1080p → bye-bye 60 fps.

→ Si tu veux rester simple, fais un draw par light avec blending additif. C’est moche mais bien plus rapide que la boucle.

3. Pas de MSAA pour du deferred lighting

Tu as prévu un warning (Multi-light requires samples=1), mais vérifie qu’il s’applique vraiment. Si la G-Buffer est en multisample et que tu fais textureLoad, tu lis chaque sample individuellement → x4/x8 le coût.
Assure-toi que samples vaut 1 quand tu fais du multi-light.

4. Albedo / normal en rgba8unorm mais pas compressé

Tu fais bien d’éviter les 16F. Par contre, si tu n’as pas besoin du canal alpha, coupe :
rgba8unorm → rgb10a2unorm ou rg11b10float.
Et passe normal/roughness en rg16unorm ou rgb10a2 avec encodage octahedral pour sauver la bande passante.

5. Fragment shader trop bavard

Si ton DeferredPointLightModule fait des normalisations, pow(), clamp() et attenuation par light à chaque pixel, tu pourrais :

Pré-calculer 1/(radius²) côté CPU ou compute.

Utiliser une LUT de BRDF pré-intégrée (tu as un PBRCommonModule, fais-en une texture 2D LUT).

Éviter les normalize() multiples.

6. Compute pass “light_update”

Tu envoies dispatchWorkgroups(Math.ceil(this.lightsMax / 64)) avec lightsMax = 1024.
Mais si tu ne limites pas avec lightsCount, tu dispatches toujours 16 groupes, donc 1024 threads pour 2 lights.
C’est négligeable à 2 lights mais bête quand même.

7. BindGroup layouts dupliqués

Tu recrées des bind groups à chaque resize, et tu recrées des layouts pour la depth.
Fais-les statiques et partage les entre pipelines. Rien de dramatique mais moins de CPU overhead.

8. Timestamp queries ne profilent que la surface

Si tu lis 170 ms, c’est probablement total GPU frame, pas seulement lighting.
Ajoute un timestamp avant et après chaque render pass séparément pour vérifier :

geometry

lighting compute

lighting draw

Tu vas vite voir si c’est le compute, le loop ou les textureLoad.

9. Petit bonus WGSL

Dans tes shaders de lighting, remplace normalize(lightPos - fragPos) par une version approchée :

fn fastNormalize(v: vec3<f32>) -> vec3<f32> {
  let invLen = inverseSqrt(max(dot(v, v), 1e-6));
  return v * invLen;
}


et pré-multiplie la couleur par intensity * invLen plutôt que pow() ton attenuation. Tu gagnes facile 30 % sur la charge arithmétique.

En résumé :

textureLoad + full-screen light loop = gouffre.

Passe à tiled deferred ou draw par light.

Évite MSAA et RGBA16F.

Profile avec timestamps par pass.

Tu fais ces quatre trucs, et tu passes de 170 ms à 4-8 ms sur une 2070 sans toucher le reste.
Ce moteur, une fois allégé, pourrait presque prétendre à une carrière sérieuse.