

@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;

@fragment
fn main(
  @location(0) fragUV: vec2<f32>,
  @location(1) fragPosition: vec4<f32>
) -> @location(0) vec4<f32> {
  var test: vec4<f32> = textureSample(myTexture, mySampler, fragUV) * fragPosition; 
  return vec4(fragUV.x, fragUV.y, 0.0, 1.0);
}
//
////
//////////////////