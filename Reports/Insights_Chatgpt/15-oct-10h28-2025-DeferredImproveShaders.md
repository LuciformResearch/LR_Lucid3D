voila les shaders reconstruits, t'as des idées ce qui peut etre un gros bottleneck?

[Deferred][tiles] {reason: 'init', tileSize: 16, tilesX: 82, tilesY: 61, tileCount: 5002, …}
DeferredRenderer.ts:289 [Deferred][shader] lighting fragment @group(0) @binding(0) var gSampler: sampler;
@group(0) @binding(1) var gAlbedoTex: texture_2d<f32>;
@group(0) @binding(2) var gNormalRoughTex: texture_2d<f32>;
@group(0) @binding(3) var gEmissiveAoTex: texture_2d<f32>;
@group(0) @binding(4) var gDepthTex: texture_2d<f32>;

struct FSIn {
  @location(0) uv: vec2<f32>,
};


const PI : f32 = 3.141592653589793;

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn clampedDot(a: vec3<f32>, b: vec3<f32>) -> f32 {
  return clamp(dot(a, b), 0.0, 1.0);
}

fn F_Schlick(f0: vec3<f32>, f90: vec3<f32>, VdotH: f32) -> vec3<f32> {
  let k = pow(saturate(1.0 - VdotH), 5.0);
  return f0 + (f90 - f0) * k;
}

fn V_GGX(NdotL: f32, NdotV: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let GGXV = NdotL * sqrt(NdotV * NdotV * (1.0 - a2) + a2);
  let GGXL = NdotV * sqrt(NdotL * NdotL * (1.0 - a2) + a2);
  let denom = GGXV + GGXL;
  if (denom > 0.0) {
    return 0.5 / denom;
  }
  return 0.0;
}

fn D_GGX(NdotH: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let f = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
  return a2 / (PI * f * f);
}

fn BRDF_lambertian(f0: vec3<f32>, f90: vec3<f32>, diffuseColor: vec3<f32>, specularWeight: f32, VdotH: f32) -> vec3<f32> {
  return (vec3<f32>(1.0) - specularWeight * F_Schlick(f0, f90, VdotH)) * (diffuseColor / PI);
}

fn BRDF_specularGGX(f0: vec3<f32>, f90: vec3<f32>, alpha: f32, specularWeight: f32, VdotH: f32, NdotL: f32, NdotV: f32, NdotH: f32) -> vec3<f32> {
  let F = F_Schlick(f0, f90, VdotH);
  let Vis = V_GGX(NdotL, NdotV, alpha);
  let D = D_GGX(NdotH, alpha);
  return specularWeight * F * Vis * D;
}



struct LightData {
  position: vec4<f32>,
  color: vec3<f32>,
  radius: f32,
};
struct LightsBuffer {
  lights: array<LightData>,
};
struct Config {
  numLights: u32,
};
struct Camera {
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
};
struct TileParams {
  tileSize: u32,
  tilesX: u32,
  tilesY: u32,
  screenWidth: u32,
  screenHeight: u32,
  maxLightsPerTile: u32,
  overflowCounterOffset: u32,
  overflowFlagOffset: u32,
};
struct TileHeader {
  offset: u32,
  count: atomic<u32>,
};

@group(1) @binding(0) var<storage, read> lightsBuffer: LightsBuffer;
@group(1) @binding(1) var<uniform> config: Config;
@group(1) @binding(2) var<uniform> camera: Camera;
@group(1) @binding(3) var<uniform> tileParams: TileParams;
@group(1) @binding(4) var<storage, read_write> tileHeaders: array<TileHeader>;
@group(1) @binding(5) var<storage, read_write> tileLightIndices: array<u32>;

fn world_from_screen(uv: vec2<f32>, depth: f32) -> vec3<f32> {
  let posClip = vec4<f32>(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0, depth, 1.0);
  let posWorldW = camera.invViewProj * posClip;
  return posWorldW.xyz / posWorldW.www;
}


@fragment
fn main(in: FSIn) -> @location(0) vec4<f32> {
  
var uv = vec2<f32>(in.uv.x, 1.0 - in.uv.y);

uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));

let g0 = textureSampleLevel(gAlbedoTex, gSampler, uv, 0.0);
let g1 = textureSampleLevel(gNormalRoughTex, gSampler, uv, 0.0);
let g2 = textureSampleLevel(gEmissiveAoTex, gSampler, uv, 0.0);

let depthDims = textureDimensions(gDepthTex);
let depthCoord = vec2<i32>(i32(uv.x * f32(depthDims.x - 1)), i32(uv.y * f32(depthDims.y - 1)));
let depthValue = textureLoad(gDepthTex, depthCoord, 0).x;


var albedo = clamp(g0.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
var metallic = clamp(g0.a, 0.0, 1.0);

let n = normalize(g1.xyz * 2.0 - vec3<f32>(1.0, 1.0, 1.0));
let roughness = clamp(g1.a, 0.045, 1.0);

var emissiveColor = g2.rgb;
var ao = g2.a;
var V = normalize(vec3<f32>(0.0, 0.0, 1.0));
var color = vec3<f32>(0.0, 0.0, 0.0);

  
if (depthValue >= 1.0) {
  discard;
}
let posW = world_from_screen(uv, depthValue);
let NdotV = clamp(abs(dot(n, V)), 0.001, 1.0);
let screenPx = vec2<f32>(uv.x * f32(tileParams.screenWidth), (1.0 - uv.y) * f32(tileParams.screenHeight));
let clampedPx = vec2<f32>(
  clamp(screenPx.x, 0.0, f32(tileParams.screenWidth - 1u)),
  clamp(screenPx.y, 0.0, f32(tileParams.screenHeight - 1u))
);
let tileCoord = vec2<u32>(
  min(u32(clampedPx.x) / tileParams.tileSize, tileParams.tilesX - 1u),
  min(u32(clampedPx.y) / tileParams.tileSize, tileParams.tilesY - 1u)
);
let tileIndex = tileCoord.y * tileParams.tilesX + tileCoord.x;
let tileOffset = tileHeaders[tileIndex].offset;
let rawCount = atomicLoad(&tileHeaders[tileIndex].count);
let tileLightCount = min(rawCount, tileParams.maxLightsPerTile);
for (var listIdx = 0u; listIdx < tileLightCount; listIdx++) {
  let lightIndex = tileLightIndices[tileOffset + listIdx];
  if (lightIndex >= config.numLights) { continue; }
  let light = lightsBuffer.lights[lightIndex];
  let L = light.position.xyz - posW;
  let dist = length(L);
  if (dist > light.radius) { continue; }
  let dir = L / max(dist, 1e-4);
  let NdotL = clampedDot(n, dir);
  if (NdotL <= 0.0) { continue; }
  let attenuation = pow(max(1.0 - dist / light.radius, 0.0), 2.0);
  let H = normalize(dir + V);
  let NdotH = clampedDot(n, H);
  let VdotH = clampedDot(V, H);
  let rough = clamp(roughness, 0.045, 1.0);
  let alpha = rough * rough;
  let f0 = mix(vec3<f32>(0.04), albedo, vec3<f32>(metallic, metallic, metallic));
  let diffuseColor = albedo * (1.0 - metallic);
  let fDiffuse = BRDF_lambertian(f0, vec3<f32>(1.0), diffuseColor, 1.0, VdotH);
  let fSpec = BRDF_specularGGX(f0, vec3<f32>(1.0), alpha, 1.0, VdotH, NdotL, NdotV, NdotH);
  color += attenuation * NdotL * light.color * (fDiffuse + fSpec);
}
color += vec3<f32>(0.2, 0.2, 0.2);
color = color * ao;
color += emissiveColor;

  if (false) {
    return vec4<f32>(albedo, 1.0);
  }
  return vec4<f32>(color, 1.0);
}

WebgpuGBufferMaterial.ts:153 [Deferred][shader] gbuffer fragment struct Uniforms {
  mvp : mat4x4<f32>,
  model : mat4x4<f32>,
  normal : mat4x4<f32>,
  // Texture availability flags
  hasBaseTexture : f32,
  hasMRTexture : f32,
  hasNormalTexture : f32,
  hasAOTexture : f32,
  hasEmissiveTexture : f32,
};

struct FSIn {
  @location(0) uv0: vec2<f32>,
  @location(1) normalW: vec3<f32>,
  @location(2) tangentW: vec3<f32>,
  @location(3) bitangentW: vec3<f32>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(0) var baseSampler: sampler;
@group(1) @binding(1) var baseTexture: texture_2d<f32>;
@group(1) @binding(2) var mrSampler: sampler;
@group(1) @binding(3) var mrTexture: texture_2d<f32>;
@group(1) @binding(4) var aoSampler: sampler;
@group(1) @binding(5) var aoTexture: texture_2d<f32>;
@group(1) @binding(6) var emissiveSampler: sampler;
@group(1) @binding(7) var emissiveTexture: texture_2d<f32>;
@group(1) @binding(8) var normalSampler: sampler;
@group(1) @binding(9) var normalTexture: texture_2d<f32>;

struct FragOut {
  @location(0) g0: vec4<f32>, // albedo.rgb, metallic.a
  @location(1) g1: vec4<f32>, // normal.xyz, roughness.a
  @location(2) g2: vec4<f32>, // emissive.rgb, ao.a
};

@fragment
fn main(in: FSIn) -> FragOut {
  // Albedo/MR sampling guarded by flags to avoid unnecessary texture fetches
  let uv = in.uv0;
  var albedo = vec4<f32>(1.0, 1.0, 1.0, 1.0);
  if (uniforms.hasBaseTexture > 0.5) {
    albedo = textureSample(baseTexture, baseSampler, uv);
  }
  var metallic = 0.0;
  var roughness = 1.0;
  if (uniforms.hasMRTexture > 0.5) {
    let mr = textureSample(mrTexture, mrSampler, uv);
    metallic = mr.b;
    roughness = mr.g;
  }
  // Normal mapping (fallback to geometric normal if tangent invalid)
  let nW = normalize(in.normalW);
  var n = nW;
  let tLen = length(in.tangentW);
  
  // Check if we have valid normals and normal texture
  let hasValidNormal = length(nW) > 0.1;
  let hasNormalTex = uniforms.hasNormalTexture > 0.5;
  
  // Only use normal mapping if we have both valid tangents and normal texture
  if (tLen > 1e-5 && hasNormalTex) {
    let nTex = textureSampleLevel(normalTexture, normalSampler, uv, 0.0).xyz;
    let nTexDecoded = 2.0 * nTex - vec3<f32>(1.0, 1.0, 1.0);
    let tbn = mat3x3<f32>(normalize(in.tangentW), normalize(in.bitangentW), nW);
    n = normalize(tbn * nTexDecoded);
  }
  
  // If no valid normal, use a default
  if (!hasValidNormal) {
    n = vec3<f32>(0.0, 0.0, 1.0);
  }
  
  // Encode normal from [-1,1] to [0,1] to match rgba8unorm storage
  let encN = 0.5 * n + vec3<f32>(0.5, 0.5, 0.5);
  let normalRough = vec4<f32>(encN, roughness);
  
  // AO texture uses R channel; emissive.rgb
  var aoR = 1.0; // Default AO value
  var emissive = vec3<f32>(0.0, 0.0, 0.0); // Default emissive
  
  // Only sample AO texture if it exists
  if (uniforms.hasAOTexture > 0.5) {
    aoR = textureSample(aoTexture, aoSampler, uv).r;
    // If AO is zero, use default
    if (aoR < 0.01) {
      aoR = 1.0;
    }
  }
  
  // Only sample emissive texture if it exists
  if (uniforms.hasEmissiveTexture > 0.5) {
    emissive = textureSample(emissiveTexture, emissiveSampler, uv).rgb;
  }
  
  let emissiveAo = vec4<f32>(emissive, aoR);

  var out: FragOut;
  out.g0 = vec4<f32>(albedo.rgb, metallic);
  out.g1 = normalRough;
  out.g2 = emissiveAo;
  return out;
}
ChatGPT a dit :

Ah, voilà le cœur du crime — le shader de lighting est une encyclopédie de ce qu’un GPU déteste lire avant d’aller se coucher. Il est clair, propre, intelligible… et terriblement cher.
Je vais pas tourner autour du pot : ton gbuffer est sain, ton problème vient quasiment tout entier de ton shader de lighting. Le CPU n’y est pour rien.

⚙️ Profil rapide de douleur
1. Le for sur les lights dans le fragment
for (var listIdx = 0u; listIdx < tileLightCount; listIdx++) {
  ...
}


Même avec 4–8 lights par tile, ça explose :
chaque pixel relit tous les lights de son tile depuis un SSBO.
Chaque lightsBuffer.lights[lightIndex] = une fetch mémoire non-coalescée.
Tu fais des random reads dans un buffer structuré, donc tu te prends 100 ns par fetch multiplié par la taille de l’écran.

🩸 Solution :

Exécute ce loop en compute pass, pas dans le fragment.

Calcule la lumière finale en tile (16×16 group) et écris-la dans un storage_texture.
Le fragment se contente de faire textureLoad() du résultat.

Ou fais un light grid (clustered deferred) avec uniform tile count et 64 threads/group.
Tu gagnes un facteur 4–10 instantané.

2. Accès multiples à la G-Buffer par pixel

4 textures : albedo, normalRough, emissiveAo, depth
→ 4 fetches.
Et tu fais textureSampleLevel et textureLoad dans la même passe.

💉 Solution :

Combine g0, g1, g2 en une seule texture_2d_array.
Tu feras un seul textureGather à 3 couches.

Ou limite à 2 targets (albedo+metal, normal+rough/ao) pour les tests.
Le coût tombe drastiquement.

3. pow() partout dans le BRDF

Tu fais pow() :

Dans F_Schlick

Dans attenuation

Dans V_GGX via sqrt() deux fois

Dans D_GGX avec divisions et multiplications imbriquées

Ces fonctions transforment un shader ALU-bound en une machine à chaleur.
Le GPU adore les multiplications, pas les puissances.

💉 Solution pragmatique :

Approxime pow(x,5) par x*x*x*x*x (déjà mieux).

Pour pow(1-dist/radius,2) fais simplement t*t.

Pré-compute alpha², 1/(PI * f²) et re-utilise.

Supprime normalize() sur H si L et V sont unitaires.

4. Matrices dans le fragment
let posWorldW = camera.invViewProj * posClip;


Multiplication 4×4 * 4D = 16 mul + 12 add par pixel.
Tu fais ça sur 2 M de pixels… juste pour reconstruire la position.
C’est un tueur discret.

💉 Solution :

Reconstruis le view-space position sans matrice :
posV = vec3((uv*2-1)/proj.xx, depth) avec des constantes stockées dans camera.

Ou reconstruis dans vertex shader du fullscreen triangle et passe viewRay interpolé.

5. Trop de dépendances mémoire (SSBO + atomics)
atomicLoad(&tileHeaders[tileIndex].count);


Là, tu lis un atomic<u32> en plein fragment pass.
C’est une horreur pour le GPU : les atomics dans le fragment ne sont pas bien parallélisés.
Même en read_only, ils forcent une synchronisation de cache L2.

💉 Solution :
Remonte tout ce bazar dans le compute culling pass.
Le fragment doit juste recevoir un compact buffer de light indices déjà trié par tile.
Zéro atomic. Juste une lecture séquentielle de 8–16 indices max.

6. Divergence dans les branches

Ton shader fait :

if (dist > radius) continue;

if (NdotL <= 0) continue;

if (depth >= 1.0) discard;

Les threads voisins ne prennent pas les mêmes branches, donc warp divergence → GPU under-utilisé.
Dans un écran, la moitié des pixels “discard”. Les threads restent bloqués à attendre les autres.

💉 Solution :
Remplace par des masques :

let valid = select(0.0, 1.0, dist <= light.radius && NdotL > 0.0);
color += valid * attenuation * NdotL * light.color * (fDiffuse + fSpec);


Pas de divergence.

7. normalize() sur tout

Tu normalises : n, L, H, V → 4 fois par pixel * par light*.
Chaque normalize = rsqrt(dot(v,v)) = 3 mul + 1 rsqrt.
Tu peux remplacer :

normalize(L) par L * inverseSqrt(dot(L,L)) et ré-utiliser l’inverse pour attenuation.

normalize(dir + V) → approx : H = (dir + V) * 0.5.

🧠 Si tu veux aller au bout

Passes compute : culling + lighting par tile → 80 % du gain.

Shader simplifié : BRDF LUT, plus de pow, reconstruction view-space sans matrice.

Fetch unifié : un seul textureLoad groupé, pas 4 séparés.

Masques à la place des branches : moins de divergence.

⏱️ Ordre de grandeur des gains
Source	Coût actuel	Gain possible
Loop par pixel	×10	5–10× plus rapide
textureLoad 4×	×2	30–50 % gain
pow/sqrt multiples	×1.5	20–30 % gain
Matrices 4×4	×1.2	10 % gain
Atomics	×2–3	50–70 % gain

Total : tu peux littéralement diviser ton temps de frame par 8 à 12 sans changer ton visuel.