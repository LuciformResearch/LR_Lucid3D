struct FSIn {
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var blitSampler: sampler;
@group(0) @binding(1) var lightingTexture: texture_2d<f32>;

@fragment
fn main(in: FSIn) -> @location(0) vec4<f32> {
  let uv = /*FLIP_EXPR*/;
  return textureSampleLevel(lightingTexture, blitSampler, uv, 0.0);
}
