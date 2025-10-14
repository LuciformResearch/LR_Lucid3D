import { ShaderModuleBase, Snippet } from '../../Abstractions/Modules/ShaderModule';

export interface DeferredDirectionalLightOptions {
  direction?: [number, number, number];
  color?: [number, number, number];
  intensity?: number;
}

function formatVec3(v: [number, number, number]): string {
  return `vec3<f32>(${v[0]}, ${v[1]}, ${v[2]})`;
}

export class DeferredDirectionalLightModule extends ShaderModuleBase {
  private readonly dir: [number, number, number];
  private readonly color: [number, number, number];
  private readonly intensity: number;

  constructor(opts: DeferredDirectionalLightOptions = {}) {
    super('DeferredDirectionalLight');
    this.dir = opts.direction ?? [0.3, 0.8, 0.5];
    this.color = opts.color ?? [1, 1, 1];
    this.intensity = opts.intensity ?? 2.0;
  }

  snippets(): Snippet[] {
    const dir = formatVec3(this.dir);
    const col = formatVec3(this.color);
    const intensity = this.intensity.toFixed(6);
    return [{
      phase: 'LIGHT_COMPUTE_SNIPPETS',
      code: `
let lightDir = normalize(${dir});
let lightColor = ${col};
let lightIntensity = ${intensity};

let L = lightDir;
let NdotL = clampedDot(n, L);
if (NdotL > 0.0) {
  let VdotN = clamp(abs(dot(n, V)), 0.001, 1.0);
  let H = normalize(L + V);
  let NdotH = clampedDot(n, H);
  let VdotH = clampedDot(V, H);

  let rough = clamp(roughness, 0.045, 1.0);
  let alpha = rough * rough;
  let f0 = mix(vec3<f32>(0.04), albedo, vec3<f32>(metallic, metallic, metallic));
  let diffuseColor = albedo * (1.0 - metallic);

  let fDiffuse = BRDF_lambertian(f0, vec3<f32>(1.0), diffuseColor, 1.0, VdotH);
  let fSpec = BRDF_specularGGX(f0, vec3<f32>(1.0), alpha, 1.0, VdotH, NdotL, VdotN, NdotH);
  color += NdotL * lightIntensity * lightColor * (fDiffuse + fSpec);
}
color = color * ao;
color += emissiveColor;
`,
    }];
  }
}
