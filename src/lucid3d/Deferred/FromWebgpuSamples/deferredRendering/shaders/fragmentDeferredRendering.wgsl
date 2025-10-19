@group(0) @binding(0) var gBufferNormal: texture_2d<f32>;
@group(0) @binding(1) var gBufferAlbedo: texture_2d<f32>;
@group(0) @binding(2) var gBufferEmissive: texture_2d<f32>;
@group(0) @binding(3) var gBufferDepthLinear: texture_2d<f32>;
@group(0) @binding(4) var gBufferSampler: sampler;

struct LightData {
  position : vec4<f32>,
  color : vec3<f32>,
  radius : f32,
}
struct LightsBuffer {
  lights: array<LightData>,
}
@group(1) @binding(0) var<storage, read> lightsBuffer: LightsBuffer;

struct Config {
  numLights : u32,
}
struct Camera {
  viewProjectionMatrix : mat4x4<f32>,
  invViewProjectionMatrix : mat4x4<f32>,
  cameraPosition : vec4<f32>,
}
@group(1) @binding(1) var<uniform> config: Config;
@group(1) @binding(2) var<uniform> camera: Camera;

fn world_from_screen_coord(coord : vec2<f32>, depth_sample: f32) -> vec3<f32> {
  let posClip = vec4<f32>(coord.x * 2.0 - 1.0, (1.0 - coord.y) * 2.0 - 1.0, depth_sample, 1.0);
  let posWorldW = camera.invViewProjectionMatrix * posClip;
  return posWorldW.xyz / posWorldW.www;
}

fn saturate(v: f32) -> f32 { return clamp(v, 0.0, 1.0); }

fn F_Schlick(f0: vec3<f32>, VdotH: f32) -> vec3<f32> {
  let k = saturate(1.0 - VdotH);
  let k2 = k * k;
  let k5 = k2 * k2 * k;
  return f0 + (vec3<f32>(1.0) - f0) * k5;
}

fn V_SmithGGXCorrelated(NdotL: f32, NdotV: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let lambdaV = NdotL * sqrt((-NdotV * a2 + NdotV) * NdotV + a2);
  let lambdaL = NdotV * sqrt((-NdotL * a2 + NdotL) * NdotL + a2);
  return 0.5 / max(lambdaV + lambdaL, 1e-4);
}

fn D_GGX(NdotH: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let denom = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159265 * denom * denom, 1e-4);
}

@fragment
fn main(
  @builtin(position) coord : vec4f
) -> @location(0) vec4f {
  let bufferSize = vec2f(textureDimensions(gBufferDepthLinear));
  let coordUV = coord.xy / bufferSize;
  let depthSample = textureSampleLevel(
    gBufferDepthLinear,
    gBufferSampler,
    coordUV,
    0.0
  ).x;
  if (depthSample >= 1.0) {
    discard;
  }

  let position = world_from_screen_coord(coordUV, depthSample);

  let pixelCoord = vec2<i32>(floor(coord.xy));
  let normalData = textureLoad(gBufferNormal, pixelCoord, 0);
  let albedoData = textureLoad(gBufferAlbedo, pixelCoord, 0);
  let emissiveData = textureLoad(gBufferEmissive, pixelCoord, 0);

  let N = normalize(normalData.xyz);
  let roughness = clamp(normalData.w, 0.045, 1.0);
  let metallic = clamp(albedoData.w, 0.0, 1.0);
  let albedo = clamp(albedoData.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  let emissive = emissiveData.rgb;
  let ao = clamp(emissiveData.a, 0.0, 1.0);

  let V = normalize(camera.cameraPosition.xyz - position);
  let NdotV = max(dot(N, V), 0.0);
  if (NdotV <= 0.0001) {
    discard;
  }

  let F0 = mix(vec3<f32>(0.04), albedo, vec3<f32>(metallic));
  let alpha = roughness * roughness;

  var Lo = vec3<f32>(0.0);
  for (var i = 0u; i < config.numLights; i++) {
    let light = lightsBuffer.lights[i];
    let Lvec = light.position.xyz - position;
    let dist = length(Lvec);
    if (dist > light.radius) {
      continue;
    }
    let attenuation = pow(saturate(1.0 - dist / light.radius), 2.0);
    let radiance = light.color * attenuation;
    let L = normalize(Lvec);
    let H = normalize(V + L);
    let NdotL = max(dot(N, L), 0.0);
    if (NdotL <= 0.0) {
      continue;
    }
    let NdotH = max(dot(N, H), 0.0);
    let VdotH = max(dot(V, H), 0.0);

    let F = F_Schlick(F0, VdotH);
    let D = D_GGX(NdotH, alpha);
    let G = V_SmithGGXCorrelated(NdotL, NdotV, alpha);

    let numerator = D * G * F;
    let denominator = max(4.0 * NdotV * NdotL, 1e-4);
    let specular = numerator / denominator;

    let kS = F;
    let kD = (vec3<f32>(1.0) - kS) * (1.0 - metallic);
    let diffuse = (albedo / 3.14159265) * kD;

    Lo += (diffuse + specular) * radiance * NdotL;
  }

  let ambient = 0.03 * albedo * ao;
  var color = ambient + Lo + emissive;
  color = color / (color + vec3<f32>(1.0));
  color = pow(color, vec3<f32>(1.0 / 2.2));

  return vec4(color, 1.0);
}
