struct UBO {
  PROJVIEW: mat4x4<f32>,
  MODEL: mat4x4<f32>,
  BASE_COLOR_FACTOR: vec4<f32>,
  METAL_ROUGH: vec2<f32>,
  OCCLUSION_STRENGTH: f32,
  _pad0: f32,
  EMISSIVE_FACTOR: vec3<f32>,
  _pad1: f32,
  // UV transforms (vec4 scaleOffset, vec4 rotCosSin_uvSet)
  BC_UV_SO: vec4<f32>, BC_UV_RS: vec4<f32>,
  MR_UV_SO: vec4<f32>, MR_UV_RS: vec4<f32>,
  NM_UV_SO: vec4<f32>, NM_UV_RS: vec4<f32>,
  AO_UV_SO: vec4<f32>, AO_UV_RS: vec4<f32>,
  EM_UV_SO: vec4<f32>, EM_UV_RS: vec4<f32>,
}
@group(0) @binding(0) var<uniform> ubo: UBO;
@group(1) @binding(0) var s: sampler;
@group(1) @binding(1) var tBase: texture_2d<f32>;
@group(1) @binding(2) var tMR: texture_2d<f32>;
@group(1) @binding(3) var tNormal: texture_2d<f32>;
@group(1) @binding(4) var tAO: texture_2d<f32>;
@group(1) @binding(5) var tEmissive: texture_2d<f32>;

struct FSIn {
  @location(0) vUv: vec2<f32>,
  @location(1) vN: vec3<f32>,
  @location(2) vT: vec3<f32>,
  @location(3) vB: vec3<f32>,
  @location(4) vUv1: vec2<f32>,
};
fn selectUV(uv0: vec2<f32>, uv1: vec2<f32>, setf: f32) -> vec2<f32> {
  let useUv1 = setf >= 1.0;
  // select(a,b,cond) returns cond ? b : a
  return select(uv0, uv1, useUv1);
}
fn applyUV(uv: vec2<f32>, so: vec4<f32>, rs: vec4<f32>) -> vec2<f32> {
  // so.xy = scale, so.zw = offset; rs.xy = (cos, sin)
  let scaled = uv * so.xy;
  let rotm = mat2x2<f32>(rs.x, -rs.y, rs.y, rs.x);
  return rotm * scaled + so.zw;
}
@fragment fn main(in: FSIn) -> @location(0) vec4<f32> {
  var albedo = ubo.BASE_COLOR_FACTOR.rgb;
  var uvBC = applyUV(selectUV(in.vUv, in.vUv1, ubo.BC_UV_RS.z), ubo.BC_UV_SO, ubo.BC_UV_RS);
  if (USE_BASE_COLOR) { albedo = albedo * textureSample(tBase, s, uvBC).rgb; }
  var metallic: f32 = 0.0; var roughness: f32 = 1.0;
  var uvMR = applyUV(selectUV(in.vUv, in.vUv1, ubo.MR_UV_RS.z), ubo.MR_UV_SO, ubo.MR_UV_RS);
  if (USE_MR) { let mr = textureSample(tMR, s, uvMR); metallic = mr.b; roughness = mr.g; }
  metallic = clamp(metallic + ubo.METAL_ROUGH.x, 0.0, 1.0);
  roughness = clamp(roughness * ubo.METAL_ROUGH.y, 0.04, 1.0);
  var n = in.vN; if (length(n) < 1e-5) { n = vec3<f32>(0.0,0.0,1.0); } n = normalize(n);
  if (USE_NORMAL) {
    var uvNM = applyUV(selectUV(in.vUv, in.vUv1, ubo.NM_UV_RS.z), ubo.NM_UV_SO, ubo.NM_UV_RS);
    let nm = textureSample(tNormal, s, uvNM).xyz * 2.0 - vec3<f32>(1.0);
    let Traw = in.vT;
    let Braw = in.vB;
    // If T or B are zero (no tangent provided), keep n as-is; avoid normalizing zero vectors.
    if (all(Traw == vec3<f32>(0.0)) || all(Braw == vec3<f32>(0.0))) {
      // no-op
    } else {
      let T = normalize(Traw);
      let B = normalize(Braw);
      let N = normalize(in.vN);
      let tbn = mat3x3<f32>(T, B, N);
      n = normalize(tbn * nm);
    }
  }
  let l = normalize(vec3<f32>(0.3, 0.8, 0.5));
  let diff = max(dot(n,l), 0.0) * albedo;
  var color = diff;
  var uvAO = applyUV(selectUV(in.vUv, in.vUv1, ubo.AO_UV_RS.z), ubo.AO_UV_SO, ubo.AO_UV_RS);
  if (USE_AO) { let ao = textureSample(tAO, s, uvAO).r; color *= mix(vec3<f32>(1.0), vec3<f32>(ao), ubo.OCCLUSION_STRENGTH); }
  var uvEM = applyUV(selectUV(in.vUv, in.vUv1, ubo.EM_UV_RS.z), ubo.EM_UV_SO, ubo.EM_UV_RS);
  if (USE_EMISSIVE) { color += textureSample(tEmissive, s, uvEM).rgb * ubo.EMISSIVE_FACTOR; }
  if (ALBEDO_ONLY) { return vec4<f32>(albedo, 1.0); }
  return vec4<f32>(color, 1.0);
}
