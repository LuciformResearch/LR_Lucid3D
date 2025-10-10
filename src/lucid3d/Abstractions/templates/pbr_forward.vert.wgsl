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
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) vUv: vec2<f32>, @location(1) vN: vec3<f32> };
@group(0) @binding(0) var<uniform> ubo: UBO;
// Skinning buffer: 16-byte header (useSkinning) then pairs of matrices per joint
struct JointsBuffer {
  useSkinning: i32,
  joints: array<mat4x4<f32>>
}
@group(2) @binding(0) var<storage, read> jointsBuffer: JointsBuffer;

fn skinMatrix(j: vec4<i32>, w: vec4<f32>) -> mat4x4<f32> {
  var m: mat4x4<f32> = mat4x4<f32>();
  for (var i: i32 = 0; i < 4; i = i + 1) { let idx: i32 = j[i]; let wt: f32 = w[i]; m = m + jointsBuffer.joints[(idx * 2) + 0] * wt; }
  return m;
}
fn skinNormalMatrix(j: vec4<i32>, w: vec4<f32>) -> mat4x4<f32> {
  var m: mat4x4<f32> = mat4x4<f32>();
  for (var i: i32 = 0; i < 4; i = i + 1) { let idx: i32 = j[i]; let wt: f32 = w[i]; m = m + jointsBuffer.joints[(idx * 2) + 1] * wt; }
  return m;
}

@vertex fn main(
  @location(0) p: vec3<f32>, @location(1) n: vec3<f32>, @location(2) uv: vec2<f32>,
  @location(6) jointsF: vec4<f32>, @location(7) weights: vec4<f32>
) -> VSOut {
  var out: VSOut;
  let joints = vec4<i32>(i32(round(jointsF.x)), i32(round(jointsF.y)), i32(round(jointsF.z)), i32(round(jointsF.w)));
  var posL = vec4<f32>(p, 1.0);
  var nL = n;
  if (jointsBuffer.useSkinning == 1) {
    posL = skinMatrix(joints, weights) * posL;
    nL = (skinNormalMatrix(joints, weights) * vec4<f32>(n, 0.0)).xyz;
  }
  let mvp = ubo.PROJVIEW * ubo.MODEL;
  out.pos = mvp * posL;
  out.vUv = uv;
  out.vN = normalize((ubo.MODEL * vec4<f32>(nL, 0.0)).xyz);
  return out;
}
