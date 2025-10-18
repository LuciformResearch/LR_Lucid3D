import { ShaderModuleBase, Snippet } from '../../Abstractions/Modules/ShaderModule';

export class DeferredPointLightModule extends ShaderModuleBase {
  constructor(private options: { lambertOnly?: boolean } = {}) {
    super('DeferredPointLight');
  }

  snippets(): Snippet[] {
    const lambert = this.options.lambertOnly === true;
    const specHelpers = lambert ? '' : `
const PI : f32 = 3.141592653589793;

fn F_Schlick(f0: vec3<f32>, f90: vec3<f32>, VdotH: f32) -> vec3<f32> {
  let k = saturate(1.0 - VdotH);
  let k2 = k * k;
  let k5 = k2 * k2 * k;
  return f0 + (f90 - f0) * k5;
}

fn V_GGX(NdotL: f32, NdotV: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let oneMinusA2 = 1.0 - a2;
  let gv = NdotV + sqrt(a2 + oneMinusA2 * NdotV * NdotV);
  let gl = NdotL + sqrt(a2 + oneMinusA2 * NdotL * NdotL);
  return 1.0 / max(gv * gl, 1e-4);
}

fn D_GGX(NdotH: f32, alpha: f32) -> vec3<f32> {
  let a2 = alpha * alpha;
  let denom = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
  return vec3<f32>(a2 / (PI * denom * denom));
}
`;

    const lightingBody = lambert ? `
  color += attenuation * NdotL * light.color * fDiffuse;
` : `
  let F = F_Schlick(f0, vec3<f32>(1.0), VdotH);
  let Vis = V_GGX(NdotL, NdotV, alpha);
  let D = D_GGX(NdotH, alpha);
  let fSpec = Vis * D * F;
  color += attenuation * NdotL * light.color * (fDiffuse + fSpec);
`;

    return [
      {
        phase: 'GLOBAL_SNIPPETS',
        code: `
${specHelpers}
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
`,
      },
      {
        phase: 'LIGHT_COMPUTE_SNIPPETS',
        code: `
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
  let t = max(1.0 - dist / light.radius, 0.0);
  let attenuation = t * t;
  let H = normalize(dir + V);
  let NdotH = clampedDot(n, H);
  let VdotH = clampedDot(V, H);
  let rough = clamp(roughness, 0.045, 1.0);
  let alpha = rough * rough;
  let f0 = mix(vec3<f32>(0.04), albedo, vec3<f32>(metallic, metallic, metallic));
  let diffuseColor = albedo * (1.0 - metallic);
  let fDiffuse = BRDF_lambertian(f0, vec3<f32>(1.0), diffuseColor, 1.0, VdotH);
${lightingBody}}
color += vec3<f32>(0.2, 0.2, 0.2);
color = color * ao;
color += emissiveColor;
`,
      },
    ];
  }
}
