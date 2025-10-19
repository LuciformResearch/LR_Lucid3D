struct MaterialUniforms {
  baseColorFactor : vec4f,
  emissiveFactor : vec4f,
  params : vec4f,
  flags : vec4f,
}

struct ModelUniforms {
  modelMatrix : mat4x4f,
  normalModelMatrix : mat4x4f,
}

struct CameraUniforms {
  viewProjectionMatrix : mat4x4f,
  invViewProjectionMatrix : mat4x4f,
  cameraPosition : vec4f,
}

@group(0) @binding(0) var<uniform> uniforms : ModelUniforms;
@group(0) @binding(1) var<uniform> camera : CameraUniforms;

@group(1) @binding(0) var materialSampler : sampler;
@group(1) @binding(1) var baseColorTexture : texture_2d<f32>;
@group(1) @binding(2) var metallicRoughnessTexture : texture_2d<f32>;
@group(1) @binding(3) var emissiveTexture : texture_2d<f32>;
@group(1) @binding(4) var occlusionTexture : texture_2d<f32>;
@group(1) @binding(5) var<uniform> materialUniforms : MaterialUniforms;

struct GBufferOutput {
  @location(0) normalRoughness : vec4f,
  @location(1) albedoMetallic : vec4f,
  @location(2) emissiveAO : vec4f,
  @location(3) depthValue : f32,
}

@fragment
fn main(
  @location(0) fragNormal: vec3f,
  @location(1) fragUV : vec2f,
  @builtin(position) fragCoord : vec4f
) -> GBufferOutput {
  let baseFactor = materialUniforms.baseColorFactor;
  let flags = materialUniforms.flags;
  let params = materialUniforms.params;

  var baseColor = baseFactor.rgb;
  if (flags.x > 0.5) {
    let tex = textureSampleLevel(baseColorTexture, materialSampler, fragUV, 0.0);
    baseColor *= tex.rgb;
  }

  var metallic = clamp(params.x, 0.0, 1.0);
  var roughness = clamp(params.y, 0.045, 1.0);
  var ao = clamp(params.z, 0.0, 1.0);

  if (flags.y > 0.5) {
    let mrSample = textureSampleLevel(metallicRoughnessTexture, materialSampler, fragUV, 0.0);
    ao = clamp(ao * mrSample.r, 0.0, 1.0);
    roughness = clamp(mrSample.g * params.y, 0.045, 1.0);
    metallic = clamp(mrSample.b * params.x, 0.0, 1.0);
  }

  if (flags.w > 0.5) {
    let aoTex = textureSampleLevel(occlusionTexture, materialSampler, fragUV, 0.0).r;
    ao = clamp(ao * aoTex, 0.0, 1.0);
  }

  var emissive = materialUniforms.emissiveFactor.rgb;
  if (flags.z > 0.5) {
    emissive += textureSampleLevel(emissiveTexture, materialSampler, fragUV, 0.0).rgb;
  }

  var output : GBufferOutput;
  output.normalRoughness = vec4(normalize(fragNormal), roughness);
  output.albedoMetallic = vec4(baseColor, metallic);
  output.emissiveAO = vec4(emissive, ao);
  output.depthValue = fragCoord.z;
  return output;
}
