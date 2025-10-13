struct UBO {
  PROJVIEW: mat4x4<f32>,
  MODEL: mat4x4<f32>,
  BASE_COLOR_FACTOR: vec4<f32>,
  METAL_ROUGH: vec2<f32>,
  OCCLUSION_STRENGTH: f32,
  _pad0: f32,
  EMISSIVE_FACTOR: vec3<f32>,
  _pad1: f32,
  // UV transforms replicated in VS to keep struct identical; not used in VS but required for layout match
  BC_UV_SO: vec4<f32>, BC_UV_RS: vec4<f32>,
  MR_UV_SO: vec4<f32>, MR_UV_RS: vec4<f32>,
  NM_UV_SO: vec4<f32>, NM_UV_RS: vec4<f32>,
  AO_UV_SO: vec4<f32>, AO_UV_RS: vec4<f32>,
  EM_UV_SO: vec4<f32>, EM_UV_RS: vec4<f32>,
}
struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vN: vec3<f32>,
  // Tangent frame in world space (used when USE_NORMAL)
  @location(2) vT: vec3<f32>,
  @location(3) vB: vec3<f32>,
  @location(4) vUv1: vec2<f32>,
};
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
  @location(0) p: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) uv: vec2<f32>,
  // Tangent with handedness in w (GLTF): optional, zeroed if absent in VBO
  @location(3) tan4: vec4<f32>,
  @location(4) uv1: vec2<f32>,
  @location(6) jointsF: vec4<f32>,
  @location(7) weights: vec4<f32>
) -> VSOut {
  var out: VSOut;
  let joints = vec4<i32>(i32(round(jointsF.x)), i32(round(jointsF.y)), i32(round(jointsF.z)), i32(round(jointsF.w)));
  var posL = vec4<f32>(p, 1.0);
  var nL = n;
  var tL = tan4.xyz;
  var tHanded: f32 = tan4.w;
  if (jointsBuffer.useSkinning == 1) {
    posL = skinMatrix(joints, weights) * posL;
    nL = (skinNormalMatrix(joints, weights) * vec4<f32>(n, 0.0)).xyz;
    tL = (skinNormalMatrix(joints, weights) * vec4<f32>(tL, 0.0)).xyz;
  }
  let mvp = ubo.PROJVIEW * ubo.MODEL;
  out.pos = mvp * posL;
  out.vUv = uv;
  out.vUv1 = uv1;
  let nW = normalize((ubo.MODEL * vec4<f32>(nL, 0.0)).xyz);
  out.vN = nW;
  // Build world-space tangent frame (if tangent provided, else zeros)
  let tW = normalize((ubo.MODEL * vec4<f32>(tL, 0.0)).xyz);
  var hand: f32 = 1.0; if (tHanded != 0.0) { hand = tHanded; }
  // If tangent is missing (tHanded==0 and tL==0), tW will be zero; vT/vB become zeros and frag keeps n.
  let bW = normalize(cross(nW, tW)) * hand;
  out.vT = tW;
  out.vB = bW;
  return out;
}
