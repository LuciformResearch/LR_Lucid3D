struct Uniforms {
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
