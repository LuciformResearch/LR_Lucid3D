
  //to group multiple uniforms in a struct like that need to make a buffer by telling its size, (for example if we had 1 4x4 matrix and an additionnal float, the size would be,
  //((16 + 1) * Float32Array.BYTES_PER_ELEMENT) (if we use f32 of course...)
  // donc si je veux le faire une struct par module il va falloir garder un ordre fixe à ses uniforms.
  
struct JointsBuffer {
  useSkinning: i32,
  joints: array<mat4x4<f32>>
};

 @group(2) @binding(0) var<storage, read> jointsBuffer: JointsBuffer;


fn getSkinningMatrix(jointsInfo: JointsInfoAttribute) -> mat4x4<f32> {
    var result: mat4x4<f32> = mat4x4<f32>();
    var jointsIndicesF0 = jointsInfo.a_joints_0;
    var jointsIndicesF1 = jointsInfo.a_joints_1;
    // Normalize across 8 weights (0 and 1)
    let sum0 = jointsInfo.a_weights_0.x + jointsInfo.a_weights_0.y + jointsInfo.a_weights_0.z + jointsInfo.a_weights_0.w;
    let sum1 = jointsInfo.a_weights_1.x + jointsInfo.a_weights_1.y + jointsInfo.a_weights_1.z + jointsInfo.a_weights_1.w;
    let s = sum0 + sum1;
    var jointsWeights0: vec4<f32>;
    var jointsWeights1: vec4<f32>;
    if (s > 0.0) {
        jointsWeights0 = jointsInfo.a_weights_0 / s;
        jointsWeights1 = jointsInfo.a_weights_1 / s;
    } else {
        jointsWeights0 = jointsInfo.a_weights_0;
        jointsWeights1 = jointsInfo.a_weights_1;
    }
    for (var i: i32 = 0; i < 4; i = i + 1) {
        let jointIndex: i32 = i32(jointsIndicesF0[i]);
        let jointWeight: f32 = jointsWeights0[i];
        if (jointWeight > 0.0) {
            let jointMatrix: mat4x4<f32> = jointsBuffer.joints[(jointIndex * 2) + 0];
            result = result + (jointMatrix * jointWeight);
        }
    }
    for (var i: i32 = 0; i < 4; i = i + 1) {
        let jointIndex: i32 = i32(jointsIndicesF1[i]);
        let jointWeight: f32 = jointsWeights1[i];
        if (jointWeight > 0.0) {
            let jointMatrix: mat4x4<f32> = jointsBuffer.joints[(jointIndex * 2) + 0];
            result = result + (jointMatrix * jointWeight);
        }
    }
    return result;
}

fn getSkinningNormalMatrix(jointsInfo: JointsInfoAttribute) -> mat4x4<f32> {
    var result: mat4x4<f32> = mat4x4<f32>();
    var jointsIndicesF0 = jointsInfo.a_joints_0;
    var jointsIndicesF1 = jointsInfo.a_joints_1;
    // Normalize across 8 weights
    let sum0 = jointsInfo.a_weights_0.x + jointsInfo.a_weights_0.y + jointsInfo.a_weights_0.z + jointsInfo.a_weights_0.w;
    let sum1 = jointsInfo.a_weights_1.x + jointsInfo.a_weights_1.y + jointsInfo.a_weights_1.z + jointsInfo.a_weights_1.w;
    let s = sum0 + sum1;
    var jointsWeights0: vec4<f32>;
    var jointsWeights1: vec4<f32>;
    if (s > 0.0) {
        jointsWeights0 = jointsInfo.a_weights_0 / s;
        jointsWeights1 = jointsInfo.a_weights_1 / s;
    } else {
        jointsWeights0 = jointsInfo.a_weights_0;
        jointsWeights1 = jointsInfo.a_weights_1;
    }
    for (var i: i32 = 0; i < 4; i = i + 1) {
        let jointIndex: i32 = i32(jointsIndicesF0[i]);
        let jointWeight: f32 = jointsWeights0[i];
        let jointMatrix: mat4x4<f32> = jointsBuffer.joints[(jointIndex * 2) + 1];
        result = result + (jointMatrix * jointWeight);
    }
    for (var i: i32 = 0; i < 4; i = i + 1) {
        let jointIndex: i32 = i32(jointsIndicesF1[i]);
        let jointWeight: f32 = jointsWeights1[i];
        let jointMatrix: mat4x4<f32> = jointsBuffer.joints[(jointIndex * 2) + 1];
        result = result + (jointMatrix * jointWeight);
    }
    return result;
}

fn toMat3X3(value: mat4x4<f32>) -> mat3x3<f32> {
    return (mat3x3(value[0].xyz, value[1].xyz, value[2].xyz));
}

fn getPosition(a_position: vec3<f32>, jointsInfo: JointsInfoAttribute) -> vec4<f32> {
    var pos: vec4<f32> = vec4<f32>(a_position, 1.0);
    if jointsBuffer.useSkinning == 1 {
        pos = getSkinningMatrix(jointsInfo) * pos;
    }
    return pos;
}
  
fn getNormal(a_normal: vec3<f32>, jointsInfo: JointsInfoAttribute) -> vec3<f32> {
    var normal: vec3<f32> = a_normal;
    if jointsBuffer.useSkinning == 1 {
        normal = toMat3X3(getSkinningNormalMatrix(jointsInfo)) * normal;
    }
    return normalize(normal);
}
  
fn getTangent(a_tangent: vec3<f32>, jointsInfo: JointsInfoAttribute) -> vec3<f32> {
    var tangent: vec3<f32> = a_tangent.xyz;
    if jointsBuffer.useSkinning == 1 {
        tangent = toMat3X3(getSkinningNormalMatrix(jointsInfo)) * tangent;
    }
    return normalize(tangent);
}


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
  
}
//
struct JointsInfoAttribute {
  @location(6) a_joints_0: vec4<f32>,
  @location(7) a_weights_0: vec4<f32>,
  @location(8) a_joints_1: vec4<f32>,
  @location(9) a_weights_1: vec4<f32>,
}
@vertex
fn main(
    @location(0) a_position: vec3<f32>,
    @location(1) a_normal: vec3<f32>,
    @location(2) a_tangent: vec4<f32>,
    @location(3) a_color_0: vec4<f32>,
    @location(4) a_texcoord_0: vec2<f32>,
    @location(5) a_texcoord_1: vec2<f32>,
    jointsInfo: JointsInfoAttribute
) -> VertexOutput {
  var output : VertexOutput;
  // Apply skinning if available, otherwise passthrough position
  let skinnedPos = getPosition(a_position, jointsInfo);
  output.Position = uniforms.modelViewProjectionMatrix * skinnedPos;
  output.fragUV = a_texcoord_0;
  return output;
}
