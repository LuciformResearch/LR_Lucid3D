import { ShaderModuleBase, DefineMap, UniformRegistry, BindingRegistry } from './ShaderModule';

export interface EmissiveOptions {
  enabled: boolean;
  factor: [number, number, number];
  uvSet?: number;
}

export class EmissiveModule extends ShaderModuleBase {
  constructor(private readonly options: EmissiveOptions) {
    super('Emissive');
  }

  defines(defs: DefineMap): void {
    defs.set('USE_EMISSIVE', this.options.enabled);
  }

  uniforms(reg: UniformRegistry): void {
    reg.addVec3('EMISSIVE_FACTOR', { defaultValue: this.options.factor });
    reg.addVec4('EM_UV_SO', { defaultValue: [1, 1, 0, 0] });
    reg.addVec4('EM_UV_RS', { defaultValue: [1, 0, this.options.uvSet ?? 0, 0] });
  }

  bindings(reg: BindingRegistry): void {
    reg.reserveTexture('tEmissive', { preferredBinding: 5, visibility: GPUShaderStage.FRAGMENT });
  }

  snippets() {
    const code = `
if (USE_EMISSIVE) {
  let uvEM = applyUV(selectUV(in.vUv, in.vUv1, ubo.EM_UV_RS.z), ubo.EM_UV_SO, ubo.EM_UV_RS);
  color += textureSample(tEmissive, s, uvEM).rgb * ubo.EMISSIVE_FACTOR;
}
`;
    return [{ phase: 'FRAGMENT_FINALIZE_SNIPPETS' as const, code }];
  }
}
