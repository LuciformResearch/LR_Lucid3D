// Modular forward PBR (vertex)
// @@UBO_STRUCT
struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vN: vec3<f32>,
  @location(2) vT: vec3<f32>,
  @location(3) vB: vec3<f32>,
  @location(4) vUv1: vec2<f32>,
  @location(5) vPosW: vec3<f32>,
};
@group(0) @binding(0) var<uniform> ubo: UBO;

struct JointsBuffer { useSkinning: i32, joints: array<mat4x4<f32>> };
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
  @location(3) tan4: vec4<f32>, @location(4) uv1: vec2<f32>,
  @location(6) jointsF: vec4<f32>, @location(7) weights: vec4<f32>
) -> VSOut {
  var out: VSOut;
  let joints = vec4<i32>(i32(round(jointsF.x)), i32(round(jointsF.y)), i32(round(jointsF.z)), i32(round(jointsF.w)));
  var posL = vec4<f32>(p, 1.0);
  var nL = n; var tL = tan4.xyz; var tHanded: f32 = tan4.w;
  // @@VERTEX_INITIALIZE_SNIPPETS
  if (jointsBuffer.useSkinning == 1) { posL = skinMatrix(joints, weights) * posL; nL = (skinNormalMatrix(joints, weights) * vec4<f32>(n, 0.0)).xyz; tL = (skinNormalMatrix(joints, weights) * vec4<f32>(tL, 0.0)).xyz; }
  let posWorld4 = ubo.MODEL * posL;
  out.pos = ubo.PROJVIEW * posWorld4;
  out.vUv = uv; out.vUv1 = uv1;
  let nW = normalize((ubo.MODEL * vec4<f32>(nL, 0.0)).xyz); out.vN = nW;
  let tW = normalize((ubo.MODEL * vec4<f32>(tL, 0.0)).xyz);
  var hand: f32 = 1.0; if (tHanded != 0.0) { hand = tHanded; }
  let bW = normalize(cross(nW, tW)) * hand;
  out.vT = tW; out.vB = bW;
  out.vPosW = posWorld4.xyz;
  // @@VERTEX_EXTRA_SNIPPETS
  return out;
}
