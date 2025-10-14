import { ShaderModuleBase, Snippet } from '../../Abstractions/Modules/ShaderModule';

export class DeferredPointLightModule extends ShaderModuleBase {
  constructor() {
    super('DeferredPointLight');
  }

  snippets(): Snippet[] {
    return [
      {
        phase: 'GLOBAL_SNIPPETS',
        code: `
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
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
};

@group(1) @binding(0) var<storage, read> lightsBuffer: LightsBuffer;
@group(1) @binding(1) var<uniform> config: Config;
@group(1) @binding(2) var<uniform> camera: Camera;

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
for (var i = 0u; i < config.numLights; i++) {
  let light = lightsBuffer.lights[i];
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
`,
      },
    ];
  }
}
