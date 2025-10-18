Bande passante, pas ALU
Tu écris un écran complet en rgba16float via textureStore, puis tu lis cette texture pour un blit fullscreen. À 1080p, c’est ~16.6 MB pour le write, puis ~16.6 MB pour le read, puis ré-écriture vers le swapchain. Compte large: ~50 MB de trafic par frame, pour afficher… du magenta. Sur un iGPU ou un laptop moyen, 20 ms rien qu’en “memory walk” n’a rien d’absurde. À 1440p/4K, c’est carrément un bain de sang.

Storage write vs render target
Les storage images (compute textureStore) utilisent un chemin moins “compressible” que les render attachments. Les GPUs savent comprimer/tiler agressivement en render pass; en storage, c’est souvent brut de décoffrage. Même shader trivial, coût max.

On a testé un switch `dummyMode=render` qui force le remplissage magenta via un render pass dédié (usage `RENDER_ATTACHMENT`). Résultat sur la machine de test : ~25 FPS contre ~35 FPS pour la version compute. Donc l’idée n’améliore pas le cas “dummy” et peut même faire pire tant qu’on conserve la texture intermédiaire + blit.

Workgroup size pas aligné aux vagues
@workgroup_size(8,8,1) c’est mignon, mais ça ne remplit pas forcément bien les warps/wavefronts (32/64 lanes). Essaie 16x16 ou 8x32 selon le backend. Tu veux des writes bien coalescés, ligne par ligne.

Bounds check implicite
Tu dispatches ceil(width/8) × ceil(height/8) sans garde. En WebGPU, l’out-of-bounds est “robuste”, donc le driver peut te coller des checks implicites. Mets la garde explicite, sinon tu payes une taxe fantôme:

@group(0) @binding(0) var lightingOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var<uniform> uSize: vec2<u32>;

@compute @workgroup_size(16,16,1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= uSize.x || gid.y >= uSize.y) { return; }
  textureStore(lightingOut, gid.xy, vec4(1.0, 0.0, 1.0, 1.0));
}


Réalloc/resize/usage flags trop gourmands
Si tu recrées la texture d’accumulation chaque frame, tu jettes du carburant sur le feu. Même punition si tu lui colles des usages inutiles (STORAGE|RENDER_ATTACHMENT|TEXTURE_BINDING|COPY_SRC|COPY_DST juste “au cas où”). Minimise: pour la voie compute, STORAGE|TEXTURE_BINDING suffit; pour la voie render, RENDER_ATTACHMENT suffit.

Le blit “bonus”
Même en dummy, tu conserves le chemin blit comme en prod. Donc double passe pleine résolution, juste pour montrer un aplat. C’est littéralement le benchmark “mémoire” que personne ne voulait.
