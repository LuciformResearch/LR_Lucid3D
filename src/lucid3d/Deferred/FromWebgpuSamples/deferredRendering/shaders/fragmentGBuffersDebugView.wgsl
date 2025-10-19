@group(0) @binding(0) var gBufferNormal: texture_2d<f32>;
@group(0) @binding(1) var gBufferAlbedo: texture_2d<f32>;
@group(0) @binding(2) var gBufferEmissive: texture_2d<f32>;
@group(0) @binding(3) var gBufferDepthLinear: texture_2d<f32>;
@group(0) @binding(4) var gBufferSampler: sampler;

override canvasSizeWidth: f32;
override canvasSizeHeight: f32;

@fragment
fn main(
  @builtin(position) coord : vec4f
) -> @location(0) vec4f {
  var result : vec4f;
  let c = coord.xy / vec2f(canvasSizeWidth, canvasSizeHeight);
  if (c.x < 0.25) {
    let rawDepth = textureSampleLevel(
      gBufferDepthLinear,
      gBufferSampler,
      c,
      0.0
    ).x;
    let depth = (1.0 - rawDepth) * 50.0;
    result = vec4(depth);
  } else if (c.x < 0.5) {
    var normalSample = textureLoad(
      gBufferNormal,
      vec2i(floor(coord.xy)),
      0
    );
    normalSample = normalSample * 0.5 + vec4(0.5, 0.5, 0.5, 0.0);
    result = vec4(normalSample.xyz, 1.0);
  } else if (c.x < 0.75) {
    let albedoSample = textureLoad(
      gBufferAlbedo,
      vec2i(floor(coord.xy)),
      0
    );
    result = vec4(albedoSample.rgb, 1.0);
  } else {
    let emissiveSample = textureLoad(
      gBufferEmissive,
      vec2i(floor(coord.xy)),
      0
    );
    result = vec4(emissiveSample.rgb, 1.0);
  }
  return result;
}
