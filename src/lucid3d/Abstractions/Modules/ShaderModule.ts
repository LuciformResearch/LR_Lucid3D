export type Phase =
  | 'GLOBAL_SNIPPETS'
  | 'VERTEX_INITIALIZE_SNIPPETS'
  | 'VERTEX_EXTRA_SNIPPETS'
  | 'FRAGMENT_INITIALIZE_SNIPPETS'
  | 'MATERIALINFO_SNIPPETS'
  | 'NORMALMAP_SNIPPETS'
  | 'LIGHT_INIT_SNIPPETS'
  | 'LIGHT_COMPUTE_SNIPPETS'
  | 'LAYER_BLEND_SNIPPETS'
  | 'FRAGMENT_FINALIZE_SNIPPETS';

export interface Snippet {
  phase: Phase;
  code: string;
  order?: number;
}

export type DefineValue = boolean | number | string;
export type DefineMap = Map<string, DefineValue>;

export type UniformType =
  | 'mat4'
  | 'vec4'
  | 'vec3'
  | 'vec2'
  | 'float';

export interface UniformAddOptions {
  defaultValue?:
    | number
    | number[]
    | Float32Array
    | Int32Array
    | Uint32Array;
}

export interface UniformRegistry {
  add(type: UniformType, name: string, options?: UniformAddOptions): void;
  addMat4(name: string, options?: UniformAddOptions): void;
  addVec4(name: string, options?: UniformAddOptions): void;
  addVec3(name: string, options?: UniformAddOptions): void;
  addVec2(name: string, options?: UniformAddOptions): void;
  addFloat(name: string, options?: UniformAddOptions): void;
}

export interface TextureBindingOptions {
  preferredBinding?: number;
  visibility?: GPUShaderStageFlags;
  sampleType?: GPUTextureSampleType;
  viewDimension?: GPUTextureViewDimension;
  multisampled?: boolean;
}

export interface SamplerBindingOptions {
  preferredBinding?: number;
  visibility?: GPUShaderStageFlags;
  type?: GPUSamplerBindingType;
}

export interface BufferBindingOptions {
  preferredBinding?: number;
  visibility?: GPUShaderStageFlags;
  type?: GPUBufferBindingType;
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
}

export interface BindingRegistry {
  reserveTexture(name: string, options?: TextureBindingOptions): number;
  reserveSampler(name: string, options?: SamplerBindingOptions): number;
  reserveBuffer(name: string, options: BufferBindingOptions): number;
}

export abstract class ShaderModuleBase {
  readonly subModules: ShaderModuleBase[] = [];
  constructor(public readonly name: string | undefined, subModules: ShaderModuleBase[] = []) {
    this.subModules.push(...subModules);
  }

  addSubModule(module: ShaderModuleBase): this {
    this.subModules.push(module);
    return this;
  }

  addSubModules(modules: ShaderModuleBase[]): this {
    this.subModules.push(...modules);
    return this;
  }

  // Local contributions -----------------------------------------------------
  snippets(): Snippet[] { return []; }
  defines(_defs: DefineMap): void {}
  uniforms(_registry: UniformRegistry): void {}
  bindings(_registry: BindingRegistry): void {}

  // Recursive aggregation ---------------------------------------------------
  private collectSnippetsRecursive(out: Snippet[]): void {
    for (const child of this.subModules) {
      child.collectSnippetsRecursive(out);
    }
    const local = this.snippets();
    for (const snippet of local) {
      out.push(snippet);
    }
  }

  private collectDefinesRecursive(map: DefineMap): void {
    for (const child of this.subModules) {
      child.collectDefinesRecursive(map);
    }
    this.defines(map);
  }

  private collectUniformsRecursive(registry: UniformRegistry): void {
    for (const child of this.subModules) {
      child.collectUniformsRecursive(registry);
    }
    this.uniforms(registry);
  }

  private collectBindingsRecursive(registry: BindingRegistry): void {
    for (const child of this.subModules) {
      child.collectBindingsRecursive(registry);
    }
    this.bindings(registry);
  }

  collectSnippets(): Snippet[] {
    const res: Snippet[] = [];
    this.collectSnippetsRecursive(res);
    return res;
  }

  collectDefines(map: DefineMap): void {
    this.collectDefinesRecursive(map);
  }

  collectUniforms(registry: UniformRegistry): void {
    this.collectUniformsRecursive(registry);
  }

  collectBindings(registry: BindingRegistry): void {
    this.collectBindingsRecursive(registry);
  }
}

export function gatherSnippets(modules: readonly ShaderModuleBase[]): Snippet[] {
  const res: Snippet[] = [];
  for (const module of modules) {
    res.push(...module.collectSnippets());
  }
  return res;
}

export function gatherSnippetsForPhase(modules: readonly ShaderModuleBase[], phase: Phase): string[] {
  return gatherSnippets(modules)
    .filter(snippet => snippet.phase === phase)
    .map(snippet => snippet.code);
}

export function applyDefinesFromModules(modules: readonly ShaderModuleBase[], map: DefineMap): DefineMap {
  for (const module of modules) {
    module.collectDefines(map);
  }
  return map;
}

export function registerUniformsFromModules(modules: readonly ShaderModuleBase[], registry: UniformRegistry): void {
  for (const module of modules) {
    module.collectUniforms(registry);
  }
}

export function registerBindingsFromModules(modules: readonly ShaderModuleBase[], registry: BindingRegistry): void {
  for (const module of modules) {
    module.collectBindings(registry);
  }
}
