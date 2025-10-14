import { ShaderModuleBase, Snippet } from './ShaderModule';

/**
 * Shared PBR helpers (BRDF functions, dot clamps, etc.) that are required by
 * both forward and deferred lighting pipelines. Keeps the math in one place so
 * we can compose modules without relying on ad-hoc WGSL chunks.
 */
export class PBRCommonModule extends ShaderModuleBase {
  constructor() {
    super('PBRCommon');
  }

  snippets(): Snippet[] {
    return [{
      phase: 'GLOBAL_SNIPPETS',
      order: -50, // ensure helpers are declared before other snippets use them
      code: `
const PI : f32 = 3.141592653589793;

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn clampedDot(a: vec3<f32>, b: vec3<f32>) -> f32 {
  return clamp(dot(a, b), 0.0, 1.0);
}

fn F_Schlick(f0: vec3<f32>, f90: vec3<f32>, VdotH: f32) -> vec3<f32> {
  let k = pow(saturate(1.0 - VdotH), 5.0);
  return f0 + (f90 - f0) * k;
}

fn V_GGX(NdotL: f32, NdotV: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let GGXV = NdotL * sqrt(NdotV * NdotV * (1.0 - a2) + a2);
  let GGXL = NdotV * sqrt(NdotL * NdotL * (1.0 - a2) + a2);
  let denom = GGXV + GGXL;
  if (denom > 0.0) {
    return 0.5 / denom;
  }
  return 0.0;
}

fn D_GGX(NdotH: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let f = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
  return a2 / (PI * f * f);
}

fn BRDF_lambertian(f0: vec3<f32>, f90: vec3<f32>, diffuseColor: vec3<f32>, specularWeight: f32, VdotH: f32) -> vec3<f32> {
  return (vec3<f32>(1.0) - specularWeight * F_Schlick(f0, f90, VdotH)) * (diffuseColor / PI);
}

fn BRDF_specularGGX(f0: vec3<f32>, f90: vec3<f32>, alpha: f32, specularWeight: f32, VdotH: f32, NdotL: f32, NdotV: f32, NdotH: f32) -> vec3<f32> {
  let F = F_Schlick(f0, f90, VdotH);
  let Vis = V_GGX(NdotL, NdotV, alpha);
  let D = D_GGX(NdotH, alpha);
  return specularWeight * F * Vis * D;
}
`,
    }];
  }
}

