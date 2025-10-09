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

// Optional skinning buffer at group(2)
struct JointsBuffer {
  useSkinning: i32,
  joints: array<mat4x4<f32>>
};
@group(2) @binding(0) var<storage, read> jointsBuffer: JointsBuffer;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv0: vec2<f32>,
  @location(1) normalW: vec3<f32>,
  @location(2) tangentW: vec3<f32>,
  @location(3) bitangentW: vec3<f32>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct JointsInfoAttribute {
  @location(6) a_joints_0: vec4<f32>,
  @location(7) a_weights_0: vec4<f32>,
  @location(8) a_joints_1: vec4<f32>,
  @location(9) a_weights_1: vec4<f32>,
}

fn toMat3X3(value: mat4x4<f32>) -> mat3x3<f32> {
  return (mat3x3(value[0].xyz, value[1].xyz, value[2].xyz));
}

fn skinMatrix(j: JointsInfoAttribute) -> mat4x4<f32> {
  var res: mat4x4<f32> = mat4x4<f32>();
  if jointsBuffer.useSkinning == 1 {
    // normalize weights across 8 components
    let sum0 = j.a_weights_0.x + j.a_weights_0.y + j.a_weights_0.z + j.a_weights_0.w;
    let sum1 = j.a_weights_1.x + j.a_weights_1.y + j.a_weights_1.z + j.a_weights_1.w;
    let s = sum0 + sum1;
    var w0 = select(j.a_weights_0, j.a_weights_0 / s, s > 0.0);
    var w1 = select(j.a_weights_1, j.a_weights_1 / s, s > 0.0);
    for (var i: i32 = 0; i < 4; i = i + 1) {
      let idx = i32(j.a_joints_0[i]);
      let w = w0[i];
      if (w > 0.0) { res = res + jointsBuffer.joints[(idx * 2) + 0] * w; }
    }
    for (var i: i32 = 0; i < 4; i = i + 1) {
      let idx = i32(j.a_joints_1[i]);
      let w = w1[i];
      if (w > 0.0) { res = res + jointsBuffer.joints[(idx * 2) + 0] * w; }
    }
  }
  return res;
}

fn skinNormalMatrix(j: JointsInfoAttribute) -> mat4x4<f32> {
  var res: mat4x4<f32> = mat4x4<f32>();
  if jointsBuffer.useSkinning == 1 {
    let sum0 = j.a_weights_0.x + j.a_weights_0.y + j.a_weights_0.z + j.a_weights_0.w;
    let sum1 = j.a_weights_1.x + j.a_weights_1.y + j.a_weights_1.z + j.a_weights_1.w;
    let s = sum0 + sum1;
    var w0 = select(j.a_weights_0, j.a_weights_0 / s, s > 0.0);
    var w1 = select(j.a_weights_1, j.a_weights_1 / s, s > 0.0);
    for (var i: i32 = 0; i < 4; i = i + 1) {
      let idx = i32(j.a_joints_0[i]);
      let w = w0[i];
      res = res + jointsBuffer.joints[(idx * 2) + 1] * w;
    }
    for (var i: i32 = 0; i < 4; i = i + 1) {
      let idx = i32(j.a_joints_1[i]);
      let w = w1[i];
      res = res + jointsBuffer.joints[(idx * 2) + 1] * w;
    }
  }
  return res;
}

@vertex
fn main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_tangent: vec4<f32>,
  @location(4) a_texcoord_0: vec2<f32>,
  joints: JointsInfoAttribute,
) -> VSOut {
  var out: VSOut;
  var skinnedPos = vec4<f32>(a_position, 1.0);
  if jointsBuffer.useSkinning == 1 { skinnedPos = skinMatrix(joints) * skinnedPos; }
  let pos = uniforms.model * skinnedPos;
  out.position = uniforms.mvp * skinnedPos;
  out.uv0 = a_texcoord_0;
  var nL = a_normal;
  if jointsBuffer.useSkinning == 1 { nL = (toMat3X3(skinNormalMatrix(joints)) * nL); }
  let nW = normalize((uniforms.normal * vec4<f32>(nL, 0.0)).xyz);
  // Robust tangent/bitangent: fallback if tangent not provided (or zero)
  let tIn = a_tangent.xyz;
  var tW: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
  var bW: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
  let hasTan = length(tIn) > 1e-5;
  if (hasTan) {
    var tL = tIn;
    if jointsBuffer.useSkinning == 1 { tL = (toMat3X3(skinNormalMatrix(joints)) * tL); }
    tW = normalize((uniforms.model * vec4<f32>(tL, 0.0)).xyz);
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
