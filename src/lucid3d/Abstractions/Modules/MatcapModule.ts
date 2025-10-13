import { BindingRegistry, DefineMap, ShaderModuleBase, Snippet, UniformRegistry } from './ShaderModule';

export interface MatcapOptions {
  factor?: number;
}

export class MatcapModule extends ShaderModuleBase {
  private factor: number;

  constructor(opts: MatcapOptions = {}) {
    super('Matcap');
    this.factor = opts.factor ?? 1.0;
  }

  defines(defs: DefineMap): void {
    defs.set('HAS_MATCAP', true);
  }

  uniforms(reg: UniformRegistry): void {
    reg.addFloat('MATCAP_FACTOR', { defaultValue: this.factor });
  }

  bindings(reg: BindingRegistry): void {
    reg.reserveTexture('tMatcap', { preferredBinding: 9, visibility: GPUShaderStage.FRAGMENT });
  }

  snippets(): Snippet[] {
    return [{
      phase: 'FRAGMENT_FINALIZE_SNIPPETS' as const,
      code: `
if (HAS_MATCAP) {
  let V = normalize(ubo.CAMERA_POS - in.vPosW);
  let reflectDir = normalize(reflect(-V, n));
  let viewRot = mat3x3<f32>(ubo.VIEW[0].xyz, ubo.VIEW[1].xyz, ubo.VIEW[2].xyz);
  let rView = normalize(viewRot * reflectDir);
  var uv = rView.xy * 0.5 + vec2<f32>(0.5, 0.5);
  uv = clamp(uv, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
  let matcapColor = textureSample(tMatcap, s, uv).rgb;
  color = mix(color, matcapColor, clamp(ubo.MATCAP_FACTOR, 0.0, 1.0));
}
`,
    }];
  }
}
