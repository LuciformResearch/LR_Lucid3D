import { ShaderModuleBase, DefineMap, UniformRegistry, BindingRegistry } from './ShaderModule';

export interface BaseColorOptions {
  enabled: boolean;
  uvSet?: number;
}

export class BaseColorModule extends ShaderModuleBase {
  constructor(private readonly options: BaseColorOptions) { super('BaseColor'); }

  defines(defs: DefineMap): void {
    defs.set('USE_BASE_COLOR', this.options.enabled);
  }

  uniforms(reg: UniformRegistry): void {
    reg.addVec4('BASE_COLOR_FACTOR', { defaultValue: [1, 1, 1, 1] });
    reg.addVec4('BC_UV_SO', { defaultValue: [1, 1, 0, 0] });
    reg.addVec4('BC_UV_RS', { defaultValue: [1, 0, this.options.uvSet ?? 0, 0] });
  }

  bindings(reg: BindingRegistry): void {
    reg.reserveTexture('tBase', { preferredBinding: 1, visibility: GPUShaderStage.FRAGMENT });
  }

  snippets() {
    const code = `
if (USE_BASE_COLOR) {
  let uvBC = applyUV(selectUV(in.vUv, in.vUv1, ubo.BC_UV_RS.z), ubo.BC_UV_SO, ubo.BC_UV_RS);
  albedo = albedo * textureSample(tBase, s, uvBC).rgb;
}
`;
    return [{ phase: 'MATERIALINFO_SNIPPETS' as const, code }];
  }
}
