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

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv0: vec2<f32>,
  @location(1) normalW: vec3<f32>,
  @location(2) tangentW: vec3<f32>,
  @location(3) bitangentW: vec3<f32>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

@vertex
fn main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_tangent: vec4<f32>,
  @location(4) a_texcoord_0: vec2<f32>
) -> VSOut {
  var out: VSOut;
  let pos = uniforms.model * vec4<f32>(a_position, 1.0);
  out.position = uniforms.mvp * vec4<f32>(a_position, 1.0);
  out.uv0 = a_texcoord_0;
  let nW = normalize((uniforms.normal * vec4<f32>(a_normal, 0.0)).xyz);
  // Robust tangent/bitangent: fallback if tangent not provided (or zero)
  let tIn = a_tangent.xyz;
  var tW: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
  var bW: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
  let hasTan = length(tIn) > 1e-5;
  if (hasTan) {
    tW = normalize((uniforms.model * vec4<f32>(tIn, 0.0)).xyz);
    let handedness = select(1.0, a_tangent.w, a_tangent.w != 0.0);
    bW = normalize(cross(nW, tW)) * handedness;
  } else {
    var up = vec3<f32>(0.0, 1.0, 0.0);
    if (abs(nW.y) > 0.99) { up = vec3<f32>(1.0, 0.0, 0.0); }
    tW = normalize(cross(up, nW));
    bW = normalize(cross(nW, tW));
  }
  out.normalW = nW;
  out.tangentW = tW;
  out.bitangentW = bW;
  return out;
}
