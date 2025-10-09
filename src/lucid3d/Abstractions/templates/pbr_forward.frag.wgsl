struct UBO {
  PROJVIEW: mat4x4<f32>,
  MODEL: mat4x4<f32>,
  BASE_COLOR_FACTOR: vec4<f32>,
  METAL_ROUGH: vec2<f32>,
  OCCLUSION_STRENGTH: f32,
  _pad0: f32,
  EMISSIVE_FACTOR: vec3<f32>,
  _pad1: f32,
}
@group(0) @binding(0) var<uniform> ubo: UBO;
@group(1) @binding(0) var s: sampler;
@group(1) @binding(1) var tBase: texture_2d<f32>;
@group(1) @binding(2) var tMR: texture_2d<f32>;
@group(1) @binding(3) var tNormal: texture_2d<f32>;
@group(1) @binding(4) var tAO: texture_2d<f32>;
@group(1) @binding(5) var tEmissive: texture_2d<f32>;

struct FSIn { @location(0) vUv: vec2<f32>, @location(1) vN: vec3<f32> };
@fragment fn main(in: FSIn) -> @location(0) vec4<f32> {
  var albedo = ubo.BASE_COLOR_FACTOR.rgb;
  if (USE_BASE_COLOR) { albedo = albedo * textureSample(tBase, s, in.vUv).rgb; }
  var metallic: f32 = 0.0; var roughness: f32 = 1.0;
  if (USE_MR) { let mr = textureSample(tMR, s, in.vUv); metallic = mr.b; roughness = mr.g; }
  metallic = clamp(metallic + ubo.METAL_ROUGH.x, 0.0, 1.0);
  roughness = clamp(roughness * ubo.METAL_ROUGH.y, 0.04, 1.0);
  let n = normalize(in.vN);
  let l = normalize(vec3<f32>(0.3, 0.8, 0.5));
  let diff = max(dot(n,l), 0.0) * albedo;
  var color = diff;
  if (USE_AO) { let ao = textureSample(tAO, s, in.vUv).r; color *= mix(vec3<f32>(1.0), vec3<f32>(ao), ubo.OCCLUSION_STRENGTH); }
  if (USE_EMISSIVE) { color += textureSample(tEmissive, s, in.vUv).rgb * ubo.EMISSIVE_FACTOR; }
  return vec4<f32>(color, 1.0);
}
