import { ShaderModuleBase, DefineMap, UniformRegistry, BindingRegistry } from './ShaderModule';

export interface MetallicRoughnessOptions {
  enabled: boolean;
  metallicFactor: number;
  roughnessFactor: number;
  uvSet?: number;
}

export class MetallicRoughnessModule extends ShaderModuleBase {
  constructor(private readonly options: MetallicRoughnessOptions) { super('MetallicRoughness'); }

  defines(defs: DefineMap): void {
    defs.set('USE_MR', this.options.enabled);
  }

  uniforms(reg: UniformRegistry): void {
    reg.addVec2('METAL_ROUGH', { defaultValue: [this.options.metallicFactor, this.options.roughnessFactor] });
    reg.addVec4('MR_UV_SO', { defaultValue: [1, 1, 0, 0] });
    reg.addVec4('MR_UV_RS', { defaultValue: [1, 0, this.options.uvSet ?? 0, 0] });
  }

  bindings(reg: BindingRegistry): void {
    reg.reserveTexture('tMR', { preferredBinding: 2, visibility: GPUShaderStage.FRAGMENT });
  }

  snippets() {
    const code = `
if (USE_MR) {
  let uvMR = applyUV(selectUV(in.vUv, in.vUv1, ubo.MR_UV_RS.z), ubo.MR_UV_SO, ubo.MR_UV_RS);
  let mr = textureSample(tMR, s, uvMR);
  metallic = mr.b;
  roughness = mr.g;
}
metallic = clamp(metallic + ubo.METAL_ROUGH.x, 0.0, 1.0);
roughness = clamp(roughness * ubo.METAL_ROUGH.y, 0.04, 1.0);
`;
    return [{ phase: 'MATERIALINFO_SNIPPETS' as const, code }];
  }
}
