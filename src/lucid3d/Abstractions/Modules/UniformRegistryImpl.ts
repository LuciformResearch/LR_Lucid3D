import {
  BindingRegistry,
  BufferBindingOptions,
  DefineMap,
  SamplerBindingOptions,
  ShaderModuleBase,
  TextureBindingOptions,
  UniformAddOptions,
  UniformRegistry,
  UniformType,
} from './ShaderModule';
import {
  FloatUniform,
  Matrix4Uniform,
  UniformBase,
  UniformBufferPack,
  UniformGPUBuffer,
  UniformRecord,
  Vector2Uniform,
  Vector3Uniform,
  Vector4Uniform,
} from '../Uniforms';

type UniformDefinition = {
  type: UniformType;
  name: string;
  defaultValue?: number | number[] | Float32Array | Int32Array | Uint32Array;
};

type UniformCtor = (name: string, def?: UniformDefinition['defaultValue']) => UniformBase;

const uniformFactories: Record<UniformType, UniformCtor> = {
  mat4: (name, def) =>
    new Matrix4Uniform(name, toFloat32(def, identityMat4)),
  vec4: (name, def) =>
    new Vector4Uniform(name, toTuple(def, [0, 0, 0, 0]) as [number, number, number, number]),
  vec3: (name, def) =>
    new Vector3Uniform(name, toTuple(def, [0, 0, 0]) as [number, number, number]),
  vec2: (name, def) =>
    new Vector2Uniform(name, toTuple(def, [0, 0]) as [number, number]),
  float: (name, def) =>
    new FloatUniform(name, toNumber(def, 0)),
};

function toNumber(value: UniformDefinition['defaultValue'], fallback: number): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') return value[0];
  return fallback;
}

function toTuple(
  value: UniformDefinition['defaultValue'],
  fallback: number[],
): number[] {
  if (value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array) {
    return Array.from(value).slice(0, fallback.length);
  }
  if (Array.isArray(value)) {
    const res = fallback.slice();
    for (let i = 0; i < Math.min(value.length, res.length); i++) {
      const v = value[i];
      res[i] = typeof v === 'number' ? v : res[i];
    }
    return res;
  }
  if (typeof value === 'number') {
    const res = fallback.slice();
    res[0] = value;
    return res;
  }
  return fallback.slice();
}

function toFloat32(
  value: UniformDefinition['defaultValue'],
  fallback: () => Float32Array,
): Float32Array {
  if (value instanceof Float32Array) return value;
  if (Array.isArray(value) && value.every(v => typeof v === 'number')) return Float32Array.from(value as number[]);
  if (value instanceof Int32Array || value instanceof Uint32Array) return Float32Array.from(value);
  return fallback();
}

function identityMat4() {
  return Float32Array.from([1, 0, 0, 0,
                            0, 1, 0, 0,
                            0, 0, 1, 0,
                            0, 0, 0, 1]);
}
function wgslType(type: UniformType): string {
  switch (type) {
    case 'mat4': return 'mat4x4<f32>';
    case 'vec4': return 'vec4<f32>';
    case 'vec3': return 'vec3<f32>';
    case 'vec2': return 'vec2<f32>';
    case 'float': return 'f32';
    default: return 'f32';
  }
}

class ModuleUniformRegistry implements UniformRegistry {
  private order: string[] = [];
  private defs = new Map<string, UniformDefinition>();

  add(type: UniformType, name: string, options?: UniformAddOptions): void {
    const def: UniformDefinition = { type, name, defaultValue: options?.defaultValue };
    const prev = this.defs.get(name);
    if (!prev) {
      this.order.push(name);
      this.defs.set(name, def);
      return;
    }
    // Keep existing type; update default if provided
    if (options?.defaultValue !== undefined) {
      prev.defaultValue = options.defaultValue;
    }
  }

  addMat4(name: string, options?: UniformAddOptions): void { this.add('mat4', name, options); }
  addVec4(name: string, options?: UniformAddOptions): void { this.add('vec4', name, options); }
  addVec3(name: string, options?: UniformAddOptions): void { this.add('vec3', name, options); }
  addVec2(name: string, options?: UniformAddOptions): void { this.add('vec2', name, options); }
  addFloat(name: string, options?: UniformAddOptions): void { this.add('float', name, options); }

  createUniformRecord(): UniformRecord {
    const res: UniformRecord = {};
    for (const name of this.order) {
      const info = this.defs.get(name)!;
      const factory = uniformFactories[info.type];
      if (!factory) continue;
      res[name] = factory(name, info.defaultValue);
    }
    return res;
  }

  structWGSL(structName: string): string {
    const lines: string[] = [`struct ${structName} {`];
    for (const name of this.order) {
      const info = this.defs.get(name)!;
      lines.push(`  ${name}: ${wgslType(info.type)},`);
    }
    lines.push('};');
    return lines.join('\n');
  }

  getDefinitions(): UniformDefinition[] {
    return this.order.map(name => this.defs.get(name)!);
  }
}

type BindingKind = 'sampler' | 'texture' | 'buffer';

export interface BindingDefinitionBase {
  binding: number;
  visibility: GPUShaderStageFlags;
  name: string;
  kind: BindingKind;
}

export interface SamplerBindingDefinition extends BindingDefinitionBase {
  kind: 'sampler';
  type: GPUSamplerBindingType;
}

export interface TextureBindingDefinition extends BindingDefinitionBase {
  kind: 'texture';
  sampleType?: GPUTextureSampleType;
  viewDimension?: GPUTextureViewDimension;
  multisampled?: boolean;
}

export interface BufferBindingDefinition extends BindingDefinitionBase {
  kind: 'buffer';
  type: GPUBufferBindingType;
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
}

export type BindingDefinition = SamplerBindingDefinition | TextureBindingDefinition | BufferBindingDefinition;

class BindingAllocator {
  private used = new Set<number>();
  private next = 0;
  constructor(start = 0) { this.next = start; }
  allocate(preferred?: number): number {
    if (preferred !== undefined) {
      if (this.used.has(preferred)) {
        throw new Error(`Binding index ${preferred} already reserved`);
      }
      this.used.add(preferred);
      if (preferred >= this.next) this.next = preferred + 1;
      return preferred;
    }
    while (this.used.has(this.next)) this.next++;
    const chosen = this.next;
    this.used.add(chosen);
    this.next++;
    return chosen;
  }
}

class ModuleBindingRegistry implements BindingRegistry {
  private bindings: BindingDefinition[] = [];
  private byName = new Map<string, BindingDefinition>();
  private allocator = new BindingAllocator(0);

  reserveTexture(name: string, options?: TextureBindingOptions): number {
    const existing = this.byName.get(name);
    if (existing && existing.kind === 'texture') {
      return existing.binding;
    }
    const binding = this.allocator.allocate(options?.preferredBinding);
    const def: TextureBindingDefinition = {
      kind: 'texture',
      name,
      binding,
      visibility: options?.visibility ?? GPUShaderStage.FRAGMENT,
      sampleType: options?.sampleType,
      viewDimension: options?.viewDimension,
      multisampled: options?.multisampled,
    };
    this.bindings.push(def);
    this.byName.set(name, def);
    return binding;
  }

  reserveSampler(name: string, options?: SamplerBindingOptions): number {
    const existing = this.byName.get(name);
    if (existing && existing.kind === 'sampler') {
      return existing.binding;
    }
    const binding = this.allocator.allocate(options?.preferredBinding);
    const def: SamplerBindingDefinition = {
      kind: 'sampler',
      name,
      binding,
      visibility: options?.visibility ?? GPUShaderStage.FRAGMENT,
      type: options?.type ?? 'filtering',
    };
    this.bindings.push(def);
    this.byName.set(name, def);
    return binding;
  }

  reserveBuffer(name: string, options: BufferBindingOptions): number {
    const existing = this.byName.get(name);
    if (existing && existing.kind === 'buffer') {
      return existing.binding;
    }
    const binding = this.allocator.allocate(options?.preferredBinding);
    const def: BufferBindingDefinition = {
      kind: 'buffer',
      name,
      binding,
      visibility: options.visibility ?? (GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT),
      type: options.type ?? 'uniform',
      hasDynamicOffset: options.hasDynamicOffset,
      minBindingSize: options.minBindingSize,
    };
    this.bindings.push(def);
    this.byName.set(name, def);
    return binding;
  }

  getBindings(): BindingDefinition[] { return this.bindings.slice().sort((a, b) => a.binding - b.binding); }

  getByName(name: string): BindingDefinition | undefined { return this.byName.get(name); }
}

function textureTypeToWGSL(def: TextureBindingDefinition): string {
  const dim = def.viewDimension ?? '2d';
  const multisampled = def.multisampled ?? false;
  const sampleType = def.sampleType ?? 'float';
  if (sampleType === 'depth') {
    if (multisampled) {
      return `texture_depth_multisampled_${dim}`;
    }
    return `texture_depth_${dim}`;
  }
  const prefix = multisampled ? 'texture_multisampled_' : 'texture_';
  const component = (() => {
    switch (sampleType) {
      case 'sint': return 'i32';
      case 'uint': return 'u32';
      default: return 'f32';
    }
  })();
  return `${prefix}${dim}<${component}>`;
}

export class ModuleAggregationContext {
  readonly uniformRegistry: ModuleUniformRegistry;
  readonly bindingRegistry: ModuleBindingRegistry;
  readonly defines: DefineMap;
  constructor() {
    this.uniformRegistry = new ModuleUniformRegistry();
    this.bindingRegistry = new ModuleBindingRegistry();
    this.defines = new Map<string, boolean | number | string>();
  }

  applyModules(modules: ShaderModuleBase[]): void {
    for (const module of modules) {
      module.collectDefines(this.defines);
      module.collectUniforms(this.uniformRegistry);
      module.collectBindings(this.bindingRegistry);
    }
  }

  createUniformRecord(): UniformRecord {
    return this.uniformRegistry.createUniformRecord();
  }

  createUniformPack(device: GPUDevice, uniforms: UniformRecord): { pack: UniformBufferPack, gpu: UniformGPUBuffer } {
    const pack = new UniformBufferPack(uniforms);
    const gpu = new UniformGPUBuffer(device, pack);
    return { pack, gpu };
  }

  uniformStructWGSL(structName: string): string {
    return this.uniformRegistry.structWGSL(structName);
  }

  bindingDeclarationsWGSL(groupIndex: number): string {
    const lines: string[] = [];
    for (const binding of this.bindingRegistry.getBindings()) {
      if (binding.kind === 'sampler') {
        lines.push(`@group(${groupIndex}) @binding(${binding.binding}) var ${binding.name}: sampler;`);
      } else if (binding.kind === 'texture') {
        lines.push(`@group(${groupIndex}) @binding(${binding.binding}) var ${binding.name}: ${textureTypeToWGSL(binding)};`);
      } else if (binding.kind === 'buffer') {
        const qualifier = binding.type === 'storage'
          ? `var<storage, read>`
          : binding.type === 'read-only-storage'
            ? `var<storage, read>`
            : `var<uniform>`;
        lines.push(`@group(${groupIndex}) @binding(${binding.binding}) ${qualifier} ${binding.name}: ${binding.type === 'uniform' ? 'UniformBuffer' : 'Buffer'};`);
      }
    }
    return lines.join('\n');
  }

  createBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    const entries: GPUBindGroupLayoutEntry[] = this.bindingRegistry.getBindings().map(binding => {
      const base = { binding: binding.binding, visibility: binding.visibility };
      switch (binding.kind) {
        case 'sampler':
          return { ...base, sampler: { type: binding.type } };
        case 'texture':
          return { ...base, texture: {
            sampleType: binding.sampleType ?? 'float',
            viewDimension: binding.viewDimension,
            multisampled: binding.multisampled ?? false,
          }};
        case 'buffer':
          return { ...base, buffer: {
            type: binding.type,
            hasDynamicOffset: binding.hasDynamicOffset ?? false,
            minBindingSize: binding.minBindingSize,
          }};
        default:
          throw new Error('Unknown binding kind');
      }
    });
    return device.createBindGroupLayout({ entries });
  }

  bindingInfo(name: string): BindingDefinition | undefined {
    return this.bindingRegistry.getByName(name);
  }

  bindingDefinitions(): BindingDefinition[] {
    return this.bindingRegistry.getBindings();
  }
}

export function makeAggregationContext(modules: ShaderModuleBase[]): ModuleAggregationContext {
  const ctx = new ModuleAggregationContext();
  ctx.applyModules(modules);
  return ctx;
}
