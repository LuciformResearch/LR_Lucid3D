import { ShaderModuleBase, DefineMap, UniformRegistry, BindingRegistry } from './ShaderModule';

export interface AmbientOcclusionOptions {
  enabled: boolean;
  strength: number;
  uvSet?: number;
}

export class AmbientOcclusionModule extends ShaderModuleBase {
  constructor(private readonly options: AmbientOcclusionOptions) {
    super('AmbientOcclusion');
  }

  defines(defs: DefineMap): void {
    defs.set('USE_AO', this.options.enabled);
  }

  uniforms(reg: UniformRegistry): void {
    reg.addFloat('OCCLUSION_STRENGTH', { defaultValue: this.options.strength });
    reg.addVec4('AO_UV_SO', { defaultValue: [1, 1, 0, 0] });
    reg.addVec4('AO_UV_RS', { defaultValue: [1, 0, this.options.uvSet ?? 0, 0] });
  }

  bindings(reg: BindingRegistry): void {
    reg.reserveTexture('tAO', { preferredBinding: 4, visibility: GPUShaderStage.FRAGMENT });
  }

  snippets() {
    const code = `
if (USE_AO) {
  let uvAO = applyUV(selectUV(in.vUv, in.vUv1, ubo.AO_UV_RS.z), ubo.AO_UV_SO, ubo.AO_UV_RS);
  let ao = textureSample(tAO, s, uvAO).r;
  color *= mix(vec3<f32>(1.0), vec3<f32>(ao), ubo.OCCLUSION_STRENGTH);
}
`;
    return [{ phase: 'FRAGMENT_FINALIZE_SNIPPETS' as const, code }];
  }
}
