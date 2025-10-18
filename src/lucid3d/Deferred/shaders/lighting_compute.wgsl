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
  lambertOnly: u32,
  _pad0: u32,
  _pad1: u32,
};
struct Camera {
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  cameraPos: vec4<f32>,
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
  count: u32,
};

var<workgroup> wgTileHeader: TileHeader;

@group(0) @binding(0) var gSampler: sampler;
@group(0) @binding(1) var gAlbedoTex: texture_2d<f32>;
@group(0) @binding(2) var gNormalRoughTex: texture_2d<f32>;
@group(0) @binding(3) var gEmissiveAoTex: texture_2d<f32>;
@group(0) @binding(4) var gDepthTex: texture_2d<f32>;

@group(1) @binding(0) var<storage, read> lightsBuffer: LightsBuffer;
@group(1) @binding(1) var<uniform> config: Config;
@group(1) @binding(2) var<uniform> camera: Camera;
@group(1) @binding(3) var<uniform> tileParams: TileParams;
@group(1) @binding(4) var<storage, read_write> tileHeaders: array<atomic<u32>>;
@group(1) @binding(5) var<storage, read_write> tileLightIndices: array<u32>;

@group(2) @binding(0) var lightingOut: texture_storage_2d<rgba16float, write>;

fn saturate(v: f32) -> f32 { return clamp(v, 0.0, 1.0); }
fn clampedDot(a: vec3<f32>, b: vec3<f32>) -> f32 { return clamp(dot(a, b), 0.0, 1.0); }

fn world_from_screen(uv: vec2<f32>, depth: f32) -> vec3<f32> {
  let posClip = vec4<f32>(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0, depth, 1.0);
  let posWorldW = camera.invViewProj * posClip;
  return posWorldW.xyz / posWorldW.www;
}

fn F_Schlick(f0: vec3<f32>, VdotH: f32) -> vec3<f32> {
  let k = saturate(1.0 - VdotH);
  let k2 = k * k;
  let k5 = k2 * k2 * k;
  return f0 + (vec3<f32>(1.0) - f0) * k5;
}

fn V_GGX(NdotL: f32, NdotV: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let oneMinusA2 = 1.0 - a2;
  let gv = NdotV + sqrt(a2 + oneMinusA2 * NdotV * NdotV);
  let gl = NdotL + sqrt(a2 + oneMinusA2 * NdotL * NdotL);
  return 1.0 / max(gv * gl, 1e-4);
}

fn D_GGX(NdotH: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let denom = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159265 * denom * denom, 1e-4);
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) globalId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>
) {
  // Load tile info into shared memory. This must be in uniform control flow.
  if (localId.x == 0u && localId.y == 0u) {
    let tileCoord = vec2<u32>(globalId.x / tileParams.tileSize, globalId.y / tileParams.tileSize);
    let tileIndex = tileCoord.y * tileParams.tilesX + tileCoord.x;
    let header_offset = tileIndex * 2u;
    wgTileHeader.offset = atomicLoad(&tileHeaders[header_offset]);
    wgTileHeader.count = atomicLoad(&tileHeaders[header_offset + 1u]);
  }
  workgroupBarrier();

  // Now we can exit for threads outside the screen bounds. This is non-uniform.
  let width = tileParams.screenWidth;
  let height = tileParams.screenHeight;
  let px = globalId.xy;
  if (px.x >= width || px.y >= height) {
    return;
  }

  let uv = vec2<f32>((f32(px.x) + 0.5) / f32(width), (f32(px.y) + 0.5) / f32(height));
  let flipUv = vec2<f32>(uv.x, 1.0 - uv.y);

  let g0 = textureSampleLevel(gAlbedoTex, gSampler, flipUv, 0.0);
  let g1 = textureSampleLevel(gNormalRoughTex, gSampler, flipUv, 0.0);
  let g2 = textureSampleLevel(gEmissiveAoTex, gSampler, flipUv, 0.0);

  let depthValue = textureLoad(gDepthTex, vec2<i32>(i32(px.x), i32(px.y)), 0).x;
  if (depthValue >= 1.0) {
    textureStore(lightingOut, vec2<i32>(i32(px.x), i32(px.y)), vec4<f32>(0.0, 0.0, 0.0, 1.0));
    return;
  }

  var albedo = clamp(g0.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  let metallic = saturate(g0.a);

  let normal = normalize(g1.xyz * 2.0 - vec3<f32>(1.0, 1.0, 1.0));
  let roughness = clamp(g1.a, 0.045, 1.0);

  var emissive = g2.rgb;
  var ao = g2.a;
  if (ao <= 0.0) { ao = 1.0; }

  let posW = world_from_screen(flipUv, depthValue);
  let V = normalize(camera.cameraPos.xyz - posW);
  let NdotV = clamp(abs(dot(normal, V)), 0.001, 1.0);

  let tileOffset = wgTileHeader.offset;
  let tileLightCount = min(wgTileHeader.count, tileParams.maxLightsPerTile);

  var color = vec3<f32>(0.0, 0.0, 0.0);

  for (var listIdx = 0u; listIdx < tileLightCount; listIdx++) {
    let lightIndex = tileLightIndices[tileOffset + listIdx];
    if (lightIndex >= config.numLights) { continue; }
    let light = lightsBuffer.lights[lightIndex];
    let L = light.position.xyz - posW;
    let dist = length(L);
    if (dist > light.radius) { continue; }
    let dir = L / max(dist, 1e-4);
    let NdotL = clampedDot(normal, dir);
    if (NdotL <= 0.0) { continue; }

    let t = max(1.0 - dist / light.radius, 0.0);
    let attenuation = t * t;

    let H = normalize(dir + V);
    let NdotH = clampedDot(normal, H);
    let VdotH = clampedDot(V, H);
    let alpha = roughness * roughness;
    let f0 = mix(vec3<f32>(0.04), albedo, vec3<f32>(metallic, metallic, metallic));
    let diffuseColor = albedo * (1.0 - metallic);
    let fDiffuse = diffuseColor / 3.14159265;

    if (config.lambertOnly != 0u) {
      color += attenuation * NdotL * light.color * fDiffuse;
    } else {
      let F = F_Schlick(f0, VdotH);
      let Vis = V_GGX(NdotL, NdotV, alpha);
      let D = D_GGX(NdotH, alpha);
      color += attenuation * NdotL * light.color * (fDiffuse + F * Vis * D);
    }
  }

  color += vec3<f32>(0.2, 0.2, 0.2);
  color = color * ao + emissive;
  textureStore(lightingOut, vec2<i32>(i32(px.x), i32(px.y)), vec4<f32>(color, 1.0));
}
