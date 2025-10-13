import { DefineMap, ShaderModuleBase, UniformRegistry } from './ShaderModule';

export interface ClearCoatOptions {
  factor?: number;
  roughness?: number;
}

export class ClearCoatModule extends ShaderModuleBase {
  private factor: number;
  private roughness: number;
  constructor(opts: ClearCoatOptions = {}) {
    super('ClearCoat');
    this.factor = opts.factor ?? 0;
    this.roughness = opts.roughness ?? 0.25;
  }

  defines(defs: DefineMap): void {
    defs.set('HAS_CLEARCOAT', true);
  }

  uniforms(reg: UniformRegistry): void {
    reg.addVec2('CLEARCOAT', { defaultValue: [this.factor, this.roughness] });
  }
}
