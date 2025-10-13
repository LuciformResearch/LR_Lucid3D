import { ShaderModuleBase, DefineMap, UniformRegistry, BindingRegistry } from './ShaderModule';

export interface NormalMapOptions {
  enabled: boolean;
  uvSet?: number;
}

export class NormalMapModule extends ShaderModuleBase {
  constructor(private readonly options: NormalMapOptions) { super('NormalMap'); }

  defines(defs: DefineMap): void {
    defs.set('USE_NORMAL', this.options.enabled);
  }

  uniforms(reg: UniformRegistry): void {
    reg.addVec4('NM_UV_SO', { defaultValue: [1, 1, 0, 0] });
    reg.addVec4('NM_UV_RS', { defaultValue: [1, 0, this.options.uvSet ?? 0, 0] });
  }

  bindings(reg: BindingRegistry): void {
    reg.reserveTexture('tNormal', { preferredBinding: 3, visibility: GPUShaderStage.FRAGMENT });
  }

  snippets() {
    const code = `
if (USE_NORMAL) {
  let uvNM = applyUV(selectUV(in.vUv, in.vUv1, ubo.NM_UV_RS.z), ubo.NM_UV_SO, ubo.NM_UV_RS);
  let nm = textureSample(tNormal, s, uvNM).xyz * 2.0 - vec3<f32>(1.0);
  let Traw = in.vT;
  let Braw = in.vB;
  if (!(all(Traw == vec3<f32>(0.0)) || all(Braw == vec3<f32>(0.0)))) {
    let T = normalize(Traw);
    let B = normalize(Braw);
    let N = normalize(n);
    let tbn = mat3x3<f32>(T, B, N);
    n = normalize(tbn * nm);
  }
}
`;
    return [{ phase: 'NORMALMAP_SNIPPETS' as const, code }];
  }
}
