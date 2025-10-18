170 ms pour remplir deux G-buffers, c’est pas du rendu, c’est un braquage de bande passante. Ton code est propre, mais il fait quelques choix “comfort” qui coûtent cher. Voilà ce que j’optimiserais, sans tourner autour du pot.

Ce qui brûle le plus

Interleaver CPU à chaque draw

Tu reconstruis un “bigVertexBuffer” en CPU et queue.writeBuffer potentiellement à chaque frame si updated.updated saute.

Fais-le une fois par géométrie au chargement (ou via une compute pass “interleave once”), puis cache dur. Si les attributs ne changent pas, aucun writeBuffer.

Alternative encore plus radicale: vertex pulling. Stocke les attributs en SSBOs séparés, et dans le vertex shader fais:

@group(… ) @binding(…) var<storage, read> pos: array<vec3<f32>>;
// idem pour normal/uv/tangent


Tu supprimes l’interleaving CPU et passes juste un index. Sur WebGPU, ça scale souvent mieux que de recoller des VBs en JS.

Tangent + bitangent stockés en plein

Tu pousses 3 vec3 world-space par fragment (normal, tangent, bitangent). C’est inutile.

Garde normal + tangent.xyz + signe dans tangent.w (MikkTSpace). Recompose bitangent = sign * normalize(cross(normal, tangent)).

Ça économise un attribut vec3 complet et pas mal de per-pixel math.

Branches de textures dans le fragment

hasBaseTexture, hasMRTexture, hasNormalTexture déclenchent des branches par pixel.

Fais deux variantes de pipeline via constants (overridable) ou carrément deux codes WGSL générés: avec ou sans normal map / MR map. Au pire, bind toujours quelque chose et évite la branche: un 1x1 blanc pour base, un 1x1 [0,1,0] pour MR, et tu samples sans if. Tu le fais déjà à moitié, pousse jusqu’au bout et vire les if.

Formats de G-Buffer

Très bien d’oct-encoder la normale. Reste cohérent et force les cibles en rgba8unorm là où c’est logique.

Pack: g0 = albedo.rgb + metallic.a en rgba8, g1 = normalOct.rg + roughness.b + filler.a en rgba8. Surtout pas de rgba16f “par confort”.

Vérifie que tes targets sont vraiment rgba8unorm en sortie et que tu n’as pas un format plus gros par accident.

Mipmaps et textureSampleLevel

Tu samples la normal map en textureSampleLevel(..., 0.0). Très bien. Fais pareil pour albedo/MR si tu veux stabiliser le coût et éviter les gradients.

Et surtout, génère des mipmaps pour toutes les textures réelles. Pas de mip = cache miss city.

Bind groups et placeholders

Tu crées des placeholders 1x1 par matériel. Fais-en globaux uniques et réutilisés.

Stabilise la pipeline layout (pas de layout:'auto' si tu veux des render bundles plus tard), et évite de recréer des bind groups si rien ne change. Tu le fais déjà pour la skin, applique la même rigueur au groupe 1.

Skinning

Si le mesh n’est pas skinné, ne bind pas le group 2 du tout. Évite le dummy si tu peux faire des layouts alternatifs. Si tu tiens au layout unique, au moins partage un seul dummy global, pas un par matériau.

Index format figé

Tu forces uint16. Sur des grosses meshes ça déborde et te force à rebuffer. Choisis dynamiquement uint16 ou uint32 en fonction de maxIndex.

Taille et stride des VBs

Tu recalcules arrayStride et reconstruis le VB si stride ou count changent. Très bien, mais… si tu vas garder l’interleaving, préalloue un VB au pire cas par géométrie et réécris seulement la tranche utile. Moins d’allocs, moins de pression GC.

Culling et depth

Pendant la G-pass, garde cullMode:'back' activé et assure-toi que tu as un vrai depth prepass si tu as beaucoup d’overdraw. Si tu n’as pas des matériaux opaques chelous, la G-pass sert de prepass, donc évite les draw inutiles.

Micro-optimisations WGSL rapides

Remplace divisions/normalisations multiples par des versions approximées où ça ne se voit pas.

Sors les normalize inutiles. Tu normalises in.normalW puis tu reconstruis TBN et renormalises. Une passe suffit si tes attributs sont déjà normalisés en input.

En normal mapping, renvoie la normale TBN en 2 ops: n = normalize(t * nTex.x + b * nTex.y + n * nTex.z) au lieu de construire une matrice explicite si tu veux chipoter les cycles.

Stratégie “stop the bleeding” en 4 étapes

Supprime les branches dans le fragment en forçant des placeholders et/ou en buildant 2–3 pipelines variants.

Tangent.w = sign, retire bitangentW de tes VBs et recompute côté shader.

Cache fort: interleave une fois, plus jamais dans drawGeometryGBuffer. Ou passe en vertex pulling.

Confirme les formats: G-buffer en rgba8unorm, pas de 16F. Mips activés, textureSampleLevel cohérent.

Tu fais ça et tes 170 ms retombent sur terre. Si après ça c’est encore lent, c’est que ton lighting pass est en mode “chaque pixel boucle sur toutes les lights”. À ce moment-là, on passe en tiled/clustered deferred et on liste les lights par tile, pas par fragment. Bref, on arrête de maltraiter le cache.