import { BindingRegistry, DefineMap, ShaderModuleBase, Snippet, UniformRegistry } from './ShaderModule';

export interface IBLModuleOptions {
  diffuseIntensity?: number;
  specularIntensity?: number;
  maxMipLevel?: number;
}

export class IBLModule extends ShaderModuleBase {
  private diffuse: number;
  private specular: number;
  private maxMip: number;

  constructor(opts: IBLModuleOptions = {}) {
    super('IBL');
    this.diffuse = opts.diffuseIntensity ?? 1.0;
    this.specular = opts.specularIntensity ?? 1.0;
    this.maxMip = opts.maxMipLevel ?? 0.0;
  }

  defines(defs: DefineMap): void {
    defs.set('HAS_IBL', true);
  }

  uniforms(reg: UniformRegistry): void {
    reg.addVec4('IBL_PARAMS', { defaultValue: [this.diffuse, this.specular, this.maxMip, 0] });
  }

  bindings(reg: BindingRegistry): void {
    reg.reserveTexture('tIrradiance', { preferredBinding: 6, visibility: GPUShaderStage.FRAGMENT, viewDimension: 'cube' });
    reg.reserveTexture('tRadiance', { preferredBinding: 7, visibility: GPUShaderStage.FRAGMENT, viewDimension: 'cube' });
    reg.reserveTexture('tBRDF', { preferredBinding: 8, visibility: GPUShaderStage.FRAGMENT });
  }

  snippets(): Snippet[] {
    return [{
      phase: 'FRAGMENT_FINALIZE_SNIPPETS' as const,
      code: `
if (HAS_IBL) {
  let V = normalize(ubo.CAMERA_POS - in.vPosW);
  let NdotV = clampedDot(n, V);
  let irradiance = textureSample(tIrradiance, s, n).rgb;
  let diffuseColor = albedo * (1.0 - metallic);
  let diffuseIBL = irradiance * diffuseColor * ubo.IBL_PARAMS.x;
  let R = reflect(-V, n);
  let lod = roughness * ubo.IBL_PARAMS.z;
  let radiance = textureSampleLevel(tRadiance, s, R, lod).rgb;
  let brdfSample = textureSample(tBRDF, s, vec2<f32>(NdotV, roughness)).rg;
  let specColor = mix(vec3<f32>(0.04), albedo, vec3<f32>(metallic));
  let specularIBL = radiance * (specColor * brdfSample.x + brdfSample.y) * ubo.IBL_PARAMS.y;
  color += diffuseIBL + specularIBL;
}
`,
    }];
  }
}
