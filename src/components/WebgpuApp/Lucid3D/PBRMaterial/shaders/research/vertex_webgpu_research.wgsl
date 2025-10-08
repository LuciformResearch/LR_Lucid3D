const WEIGHT_COUNT: i32 = 4;

struct JointsBuffer {
  useSkinning: i32,
  joints: array<mat4x4<f32>>
};

 @group(0) @binding(0) var<storage, read> jointsBuffer: JointsBuffer;
 @group(0) @binding(1) var<uniform> u_ViewProjectionMatrix : mat4x4<f32>;
 @group(0) @binding(2) var<uniform> u_ModelMatrix : mat4x4<f32>;
 @group(0) @binding(3) var<uniform> u_NormalMatrix : mat4x4<f32>;
 @group(0) @binding(4) var<uniform> u_Camera : vec3<f32>;

fn getSkinningMatrix(jointsInfo: JointsInfoAttribute) -> mat4x4<f32> {
    var result: mat4x4<f32> = mat4x4<f32>();
    
    var jointsIndices = jointsInfo.a_joints_0;
    var jointsWeights = jointsInfo.a_weights_0;
    for (var i: i32 = 0; i < 4; i = i + 1) {
        let jointIndex: i32 = jointsIndices[i];
        let jointWeight: f32 = jointsWeights[i];

        let jointMatrix: mat4x4<f32> = jointsBuffer.joints[(jointIndex * 2) + 0];

        result = result + (jointMatrix * jointWeight);
    }

    jointsIndices = jointsInfo.a_joints_1;
    jointsWeights = jointsInfo.a_weights_1;
    for (var i: i32 = 0; i < 4; i = i + 1) {
        let jointIndex: i32 = jointsIndices[i];
        let jointWeight: f32 = jointsWeights[i];

        let jointMatrix: mat4x4<f32> = jointsBuffer.joints[(jointIndex * 2) + 0];

        result = result + (jointMatrix * jointWeight);
    }


    return result;
}

fn getSkinningNormalMatrix(jointsInfo: JointsInfoAttribute) -> mat4x4<f32> {
    var result: mat4x4<f32> = mat4x4<f32>();
    var jointsIndices = jointsInfo.a_joints_0;
    var jointsWeights = jointsInfo.a_weights_0;
    for (var i: i32 = 0; i < 4; i = i + 1) {
        let jointIndex: i32 = jointsIndices[i];
        let jointWeight: f32 = jointsWeights[i];

        let jointMatrix: mat4x4<f32> = jointsBuffer.joints[(jointIndex * 2) + 1];
        result = result + (jointMatrix * jointWeight);
    }
    jointsIndices = jointsInfo.a_joints_1;
    jointsWeights = jointsInfo.a_weights_1;
    for (var i: i32 = 0; i < 4; i = i + 1) {
        let jointIndex: i32 = jointsIndices[i];
        let jointWeight: f32 = jointsWeights[i];

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
        tangent = toMat3X3(getSkinningMatrix(jointsInfo)) * tangent;
    }
    return normalize(tangent);
}

struct JointsInfoAttribute {
      @location(6) a_joints_0: vec4<i32>,
      @location(7) a_joints_1: vec4<i32>,
      @location(8) a_weights_0: vec4<f32>,
      @location(9) a_weights_1: vec4<f32>
    }

struct MainOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vertexPosition: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) texcoord_0: vec2<f32>,
    @location(4) texcoord_1: vec2<f32>,
    @location(5) tangent_w: vec3<f32>,
    @location(6) bitangent_w: vec3<f32>,
    @location(7) normal_w: vec3<f32>
  };

@vertex
fn main(
    @location(0) a_position: vec3<f32>,
    @location(1) a_normal: vec3<f32>,
    @location(2) a_tangent: vec4<f32>,
    @location(3) a_color_0: vec4<f32>,
    @location(4) a_texcoord_0: vec2<f32>,
    @location(5) a_texcoord_1: vec2<f32>,
    jointsInfo: JointsInfoAttribute,
) -> MainOutput {
    var pos: vec4<f32> = u_ModelMatrix * getPosition(a_position, jointsInfo);
    var v_Position: vec3<f32> = vec3<f32>(pos.xyz) / pos.w;

    var tangent: vec3<f32> = getTangent(a_tangent.xyz, jointsInfo);
    var normalW: vec3<f32> = normalize((u_NormalMatrix * vec4<f32>(getNormal(a_normal, jointsInfo), 0.0)).xyz);
    var tangentW: vec3<f32> = normalize((u_ModelMatrix * vec4<f32>(tangent, 0.0)).xyz);
    var bitangentW: vec3<f32> = cross(normalW, tangentW) * a_tangent.w;
    var v_TBN: mat3x3<f32> = mat3x3<f32>(tangentW, bitangentW, normalW);
    var v_Normal: vec3<f32> = normalize((u_NormalMatrix * vec4<f32>(getNormal(a_normal, jointsInfo), 0.0)).xyz);

    var v_texcoord_0: vec2<f32> = vec2<f32>(0.0, 0.0);
    var v_texcoord_1: vec2<f32> = vec2<f32>(0.0, 0.0);

    v_texcoord_0 = a_texcoord_0;
    v_texcoord_1 = a_texcoord_1;

    var v_Color: vec4<f32> = a_color_0;
    v_Color = clamp(v_Color, vec4<f32>(0.0, 0.0, 0.0, 0.0), vec4<f32>(1.0, 1.0, 1.0, 1.0));

    var gl_Position: vec4<f32> = u_ViewProjectionMatrix * pos;

    var vView: vec3<f32> = normalize(u_Camera - v_Position);
    //var vLight: vec3<f32> = normalize()
    var res: MainOutput;
    res.color = v_Color;
    res.normal = v_Normal;
    res.tangent_w = tangentW;
    res.bitangent_w = bitangentW;
    res.normal_w = normalW;
    res.texcoord_0 = v_texcoord_0;
    res.texcoord_1 = v_texcoord_1;
    res.vertexPosition = v_Position;
    res.position = gl_Position;

    return res;
}