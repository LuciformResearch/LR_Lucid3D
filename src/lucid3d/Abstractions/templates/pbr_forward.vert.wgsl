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
@vertex fn main(@location(0) p: vec3<f32>, @location(1) n: vec3<f32>, @location(2) uv: vec2<f32>) -> VSOut {
  var out: VSOut;
  let mvp = ubo.PROJVIEW * ubo.MODEL;
  out.pos = mvp * vec4<f32>(p, 1.0);
  out.vUv = uv;
  out.vN = normalize((ubo.MODEL * vec4<f32>(n, 0.0)).xyz);
  return out;
}
