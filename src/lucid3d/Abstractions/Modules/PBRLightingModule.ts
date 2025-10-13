import { ShaderModuleBase, Snippet, UniformRegistry } from './ShaderModule';

export interface PBRLightingOptions {
  lightDirection?: [number, number, number];
  lightColor?: [number, number, number];
  intensity?: number;
}

export class PBRLightingModule extends ShaderModuleBase {
  private dir: [number, number, number];
  private color: [number, number, number];
  private intensity: number;

  constructor(opts: PBRLightingOptions = {}) {
    super('PBRLighting');
    this.dir = opts.lightDirection ?? [0.3, 0.8, 0.5];
    this.color = opts.lightColor ?? [1.0, 1.0, 1.0];
    this.intensity = opts.intensity ?? 1.0;
  }

  uniforms(reg: UniformRegistry): void {
    const d = this.dir;
    const c = this.color;
    reg.addVec4('LIGHT_DIR_INT', { defaultValue: [d[0], d[1], d[2], this.intensity] });
    reg.addVec4('LIGHT_COLOR', { defaultValue: [c[0], c[1], c[2], 0] });
  }

  snippets(): Snippet[] {
    return [{
      phase: 'LIGHT_COMPUTE_SNIPPETS' as const,
      code: `
let L = normalize(ubo.LIGHT_DIR_INT.xyz);
let NdotL = clampedDot(n, L);
if (NdotL > 0.0) {
  let V = normalize(ubo.CAMERA_POS - in.vPosW);
  let NdotV = clampedDot(n, V);
  if (NdotV > 0.0) {
    let H = normalize(L + V);
    let NdotH = clampedDot(n, H);
    let VdotH = clampedDot(V, H);
    let rough = clamp(roughness, 0.045, 1.0);
    let alpha = rough * rough;
    let f0 = mix(vec3<f32>(0.04), albedo, vec3<f32>(metallic));
    let diffuseColor = albedo * (1.0 - metallic);
    let fDiffuse = BRDF_lambertian(f0, vec3<f32>(1.0), diffuseColor, 1.0, VdotH);
    let fSpec = BRDF_specularGGX(f0, vec3<f32>(1.0), alpha, 1.0, VdotH, NdotL, NdotV, NdotH);
    let lightRadiance = ubo.LIGHT_COLOR.xyz * ubo.LIGHT_DIR_INT.w;
    color += NdotL * lightRadiance * (fDiffuse + fSpec);
  }
}
`,
    }];
  }
}
