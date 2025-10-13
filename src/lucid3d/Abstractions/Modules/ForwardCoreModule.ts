import { ShaderModuleBase, Snippet, DefineMap, UniformRegistry, BindingRegistry } from './ShaderModule';

export interface ForwardCoreOptions {
  enableSkinning: boolean;
}

export class ForwardCoreModule extends ShaderModuleBase {
  constructor(private readonly options: ForwardCoreOptions) {
    super('ForwardCore');
  }

  defines(defs: DefineMap): void {
    if (this.options.enableSkinning) {
      defs.set('USE_SKINNING', true);
    }
  }

  uniforms(reg: UniformRegistry): void {
    reg.addMat4('PROJVIEW');
    reg.addMat4('MODEL');
    reg.addMat4('VIEW');
    reg.addVec4('BASE_COLOR_FACTOR', { defaultValue: [1, 1, 1, 1] });
    reg.addVec2('METAL_ROUGH', { defaultValue: [0, 1] });
    reg.addFloat('OCCLUSION_STRENGTH', { defaultValue: 1 });
    reg.addVec3('EMISSIVE_FACTOR', { defaultValue: [1, 1, 1] });
    reg.addVec3('CAMERA_POS', { defaultValue: [0, 0, 0] });
    reg.addVec4('DEBUG_PARAMS', { defaultValue: [0, 0, 0, 0] });
    reg.addVec4('LIGHT_DIR_INT', { defaultValue: [0.3, 0.8, 0.5, 1.0] });
    reg.addVec4('LIGHT_COLOR', { defaultValue: [1, 1, 1, 0] });
    reg.addVec2('CLEARCOAT', { defaultValue: [0, 0] });
    reg.addVec4('IBL_PARAMS', { defaultValue: [0, 0, 0, 0] });
    reg.addFloat('MATCAP_FACTOR', { defaultValue: 0 });
    const uvDefaults: Record<string, [number, number, number, number]> = {
      BC_UV_SO: [1, 1, 0, 0],
      BC_UV_RS: [1, 0, 0, 0],
      MR_UV_SO: [1, 1, 0, 0],
      MR_UV_RS: [1, 0, 0, 0],
      NM_UV_SO: [1, 1, 0, 0],
      NM_UV_RS: [1, 0, 0, 0],
      AO_UV_SO: [1, 1, 0, 0],
      AO_UV_RS: [1, 0, 0, 0],
      EM_UV_SO: [1, 1, 0, 0],
      EM_UV_RS: [1, 0, 0, 0],
    };
    for (const [name, value] of Object.entries(uvDefaults)) {
      reg.addVec4(name, { defaultValue: value });
    }
  }

  bindings(reg: BindingRegistry): void {
    reg.reserveSampler('s', { preferredBinding: 0, visibility: GPUShaderStage.FRAGMENT });
  }

  snippets(): Snippet[] {
    const snippets: Snippet[] = [{
      phase: 'GLOBAL_SNIPPETS',
      code: `
fn selectUV(uv0: vec2<f32>, uv1: vec2<f32>, setf: f32) -> vec2<f32> {
  let useUv1 = setf >= 1.0;
  return select(uv0, uv1, useUv1);
}
fn applyUV(uv: vec2<f32>, so: vec4<f32>, rs: vec4<f32>) -> vec2<f32> {
  let scaled = uv * so.xy;
  let rotm = mat2x2<f32>(rs.x, -rs.y, rs.y, rs.x);
  return rotm * scaled + so.zw;
}
`,
    }];
    if (this.options.enableSkinning) {
      snippets.push({
        phase: 'VERTEX_EXTRA_SNIPPETS',
        code: `
// Skinning helper is provided via vertex template; nothing to inject yet.
`,
      });
    }
    return snippets;
  }
}
