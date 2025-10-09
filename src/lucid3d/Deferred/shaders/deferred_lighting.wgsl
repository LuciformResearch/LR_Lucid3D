const PI : f32 = 3.141592653589793;
const dielectricSpec: vec3<f32> = vec3(0.04);
const black: vec3<f32> = vec3(0.0);

@group(0) @binding(0) var gSampler: sampler;
@group(0) @binding(1) var gAlbedoTex: texture_2d<f32>;
@group(0) @binding(2) var gNormalRoughTex: texture_2d<f32>;
@group(0) @binding(3) var gEmissiveAoTex: texture_2d<f32>;

struct FSIn {
  @location(0) uv: vec2<f32>,
};

fn lambertDiffuse(cDiff: vec3<f32>) -> vec3<f32> {
  return cDiff / PI;
}

fn specD(a: f32, nDotH: f32) -> f32 {
  let aSqr = a * a;
  let f = ((nDotH * nDotH) * (aSqr - 1.0) + 1.0);
  return aSqr / (PI * f * f);
}

fn specG(roughness: f32, nDotL: f32, nDotV: f32) -> f32 {
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let gl = nDotL / (nDotL * (1.0 - k) + k);
  let gv = nDotV / (nDotV * (1.0 - k) + k);
  return gl * gv;
}

fn specF(vDotH: f32, f0: vec3<f32>) -> vec3<f32> {
  let exponent = (-5.55473 * vDotH - 6.98316) * vDotH;
  let base = 2.0;
  return f0 + (1.0 - f0) * pow(base, exponent);
}

@fragment
fn main(in: FSIn) -> @location(0) vec4<f32> {
  // GBuffer render targets are in top-left origin; screen UV here is bottom-left.
  let uv = vec2<f32>(in.uv.x, 1.0 - in.uv.y);
  
  // Sample textures at LOD 0
  let g0 = textureSampleLevel(gAlbedoTex, gSampler, uv, 0.0);       // rgb=albedo, a=metallic
  let g1 = textureSampleLevel(gNormalRoughTex, gSampler, uv, 0.0);  // xyz=normalW, a=roughness
  let g2 = textureSampleLevel(gEmissiveAoTex, gSampler, uv, 0.0);   // rgb=emissive, a=ao
  
  // DEBUG: Force albedo-only rendering (uncomment to debug)
  // return vec4<f32>(g0.rgb, 1.0);

  let albedo = clamp(g0.rgb, vec3(0.0), vec3(1.0));
  let metallic = clamp(g0.a, 0.0, 1.0);
  let n = normalize(g1.xyz);
  let roughness = clamp(g1.a, 0.04, 1.0);
  
  // DEBUG: Force normal towards camera to fix culling issues
  // n = vec3<f32>(0.0, 0.0, 1.0);
  let emissive = g2.rgb;
  let ao = g2.a;

  // Simple directional light
  let lightDir = normalize(vec3(0.3, 0.8, 0.5));
  let lightColor = vec3(1.0, 1.0, 1.0);
  let lightIntensity = 2.0; // Increased intensity to fix dark rendering

  // View direction approx (camera facing -Z)
  let v = normalize(vec3(0.0, 0.0, 1.0));

  let l = normalize(lightDir);
  let h = normalize(l + v);
  let nDotL = clamp(dot(n, l), 0.0, 1.0);
  let nDotV = clamp(abs(dot(n, v)), 0.001, 1.0);
  let nDotH = clamp(dot(n, h), 0.0, 1.0);
  let vDotH = clamp(dot(v, h), 0.0, 1.0);

  // Base colors
  let cDiff = mix(albedo * (1.0 - dielectricSpec.r), black, metallic);
  let f0 = mix(dielectricSpec, albedo, metallic);

  // Specular BRDF
  let a = roughness * roughness;
  let D = specD(a, nDotH);
  let F = specF(vDotH, f0);
  let G = specG(roughness, nDotL, nDotV);
  let spec = (D * F * G) / max(4.0 * nDotL * nDotV, 0.001);

  // Diffuse
  let diff = lambertDiffuse(cDiff) * nDotL;

  var color = (diff + spec) * lightColor * lightIntensity;
  color = mix(color, color * ao, 1.0); // modulate by AO
  color += emissive;

  return vec4<f32>(color, 1.0);
}
