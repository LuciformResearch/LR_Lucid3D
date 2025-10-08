
  //to group multiple uniforms in a struct like that need to make a buffer by telling its size, (for example if we had 1 4x4 matrix and an additionnal float, the size would be,
  //((16 + 1) * Float32Array.BYTES_PER_ELEMENT) (if we use f32 of course...)
  // donc si je veux le faire une struct par module il va falloir garder un ordre fixe à ses uniforms.
  
struct Uniforms {
  modelViewProjectionMatrix : mat4x4<f32>,
}
// var<uniform> means that it is a uniform type of variable somehow.
// binding(0) correspond to the bindgroup set on cpu
// group(0) i think it correspond to a layout index, in case we got multiple bindgroups.
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  // builtin output like gl_position
  @builtin(position) Position : vec4<f32>,
  // additionnal varyings...
  @location(0) fragUV : vec2<f32>,
  // vertex position interpolation on the cube to give nice colors. 
  @location(1) fragPosition: vec4<f32>,
}
//

@vertex
fn main(
  @location(0) position : vec4<f32>,
  @location(1) uv : vec2<f32>
) -> VertexOutput {
  var output : VertexOutput;
  output.Position = uniforms.modelViewProjectionMatrix * position;
  output.fragUV = uv;
  output.fragPosition = 0.5 * (position + vec4<f32>(1.0, 1.0, 1.0, 1.0));
  return output;
}
