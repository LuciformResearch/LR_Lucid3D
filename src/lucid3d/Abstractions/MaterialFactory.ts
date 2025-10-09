import { Defines } from './Defines';
import { composeWGSL, GlobalChunks } from './ShaderChunk';
import { MaterialDesc } from './MaterialDesc';
import { Matrix4Uniform, UniformGPUBuffer, UniformRecord, UniformBufferPack, Vector2Uniform, Vector3Uniform, Vector4Uniform, FloatUniform } from './Uniforms';

// Register a few baseline chunks (small stubs)
GlobalChunks.register('brdf', require('./chunks/brdf.wgsl').default);
GlobalChunks.register('tbn', require('./chunks/tbn.wgsl').default);

export class GeneratedForwardMaterial {
  pipeline: GPURenderPipeline;
  bindGroup0: GPUBindGroup; // uniforms
  bindGroup1: GPUBindGroup; // textures/samplers
  ubo: UniformGPUBuffer;
  constructor(public device: GPUDevice, pipeline: GPURenderPipeline, bg0: GPUBindGroup, bg1: GPUBindGroup, ubo: UniformGPUBuffer) {
    this.pipeline = pipeline; this.bindGroup0 = bg0; this.bindGroup1 = bg1; this.ubo = ubo;
  }
}

export class ForwardPBRMaterial extends GeneratedForwardMaterial {
  constructor(device: GPUDevice, pipeline: GPURenderPipeline, bg0: GPUBindGroup, bg1: GPUBindGroup, public uniforms: UniformRecord, public pack: UniformBufferPack, ubo: UniformGPUBuffer) {
    super(device, pipeline, bg0, bg1, ubo);
  }
  setProjView(m: Float32Array | number[]) { (this.uniforms.PROJVIEW as Matrix4Uniform).value = m as any; }
  setModel(m: Float32Array | number[]) { (this.uniforms.MODEL as Matrix4Uniform).value = m as any; }
  setBaseColorFactor(v: [number, number, number, number]) { (this.uniforms.BASE_COLOR_FACTOR as Vector4Uniform).value = v; }
  setMetallicRoughness(v: [number, number]) { (this.uniforms.METAL_ROUGH as Vector2Uniform).value = v; }
  setOcclusionStrength(v: number) { (this.uniforms.OCCLUSION_STRENGTH as FloatUniform).value = v; }
  setEmissiveFactor(v: [number, number, number]) { (this.uniforms.EMISSIVE_FACTOR as Vector3Uniform).value = v; }
  updateUniforms() { this.ubo.update(); }
}

export class MaterialFactory {
  static buildForward(device: GPUDevice, format: GPUTextureFormat, desc: MaterialDesc): ForwardPBRMaterial {
    const defines = new Defines();
    defines.set('USE_BASE_COLOR', !!desc.textures?.baseColor);
    defines.set('USE_MR', !!desc.textures?.mr);
    defines.set('USE_NORMAL', !!desc.textures?.normal);
    defines.set('USE_AO', !!desc.textures?.ao);
    defines.set('USE_EMISSIVE', !!desc.textures?.emissive);

    const vs = composeWGSL(defines.toWgslConsts(), ['tbn'], require('./templates/pbr_forward.vert.wgsl').default);
    const fs = composeWGSL(defines.toWgslConsts(), ['brdf'], require('./templates/pbr_forward.frag.wgsl').default);
    const vert = device.createShaderModule({ code: vs });
    const frag = device.createShaderModule({ code: fs });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'nearest' });
    // Build a PBR-like uniform record inspired by the old WebGL material
    const uniforms: UniformRecord = {
      PROJVIEW: new Matrix4Uniform('PROJVIEW'),
      MODEL: new Matrix4Uniform('MODEL'),
      BASE_COLOR_FACTOR: new Vector4Uniform('BASE_COLOR_FACTOR', [1,1,1,1]),
      METAL_ROUGH: new Vector2Uniform('METAL_ROUGH', [desc.scalars?.metallic ?? 0.0, desc.scalars?.roughness ?? 1.0]),
      OCCLUSION_STRENGTH: new FloatUniform('OCCLUSION_STRENGTH', 1.0),
      EMISSIVE_FACTOR: new Vector3Uniform('EMISSIVE_FACTOR', [1,1,1]),
    };
    const pack = new UniformBufferPack(uniforms);
    const uboGPU = new UniformGPUBuffer(device, pack);
    uboGPU.update();
    const bgl0 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT, buffer: { type:'uniform' } }]});
    const bgl1 = device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ]});
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1]});

    const pipeline = device.createRenderPipeline({
      layout,
      vertex: { module: vert, entryPoint: 'main', buffers: [
        { arrayStride: 8*4, attributes: [
          { shaderLocation: 0, format: 'float32x3', offset: 0 },
          { shaderLocation: 1, format: 'float32x3', offset: 3*4 },
          { shaderLocation: 2, format: 'float32x2', offset: 6*4 },
        ]}
      ]},
      fragment: { module: frag, entryPoint: 'main', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: (desc.features?.doubleSided ? undefined : 'back') },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    const bg0 = device.createBindGroup({ layout: bgl0, entries: [{ binding: 0, resource: { buffer: uboGPU.buffer } }] });
    const texEntries: GPUBindGroupEntry[] = [ { binding: 0, resource: sampler } ];
    const pushTex = (b: number, t?: { view: GPUTextureView } | null) => texEntries.push({ binding: b, resource: (t?.view || MaterialFactory._white(device).createView()) });
    pushTex(1, desc.textures?.baseColor);
    pushTex(2, desc.textures?.mr);
    pushTex(3, desc.textures?.normal);
    pushTex(4, desc.textures?.ao);
    pushTex(5, desc.textures?.emissive);
    const bg1 = device.createBindGroup({ layout: bgl1, entries: texEntries });
    return new ForwardPBRMaterial(device, pipeline, bg0, bg1, uniforms, pack, uboGPU);
  }

  static buildForwardPBRFromDesc(device: GPUDevice, format: GPUTextureFormat, desc: MaterialDesc) {
    return MaterialFactory.buildForward(device, format, desc);
  }

  private static _whiteTex: GPUTexture | null = null;
  private static _white(device: GPUDevice): GPUTexture {
    if (!this._whiteTex) {
      this._whiteTex = device.createTexture({ size:[1,1,1], format:'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST });
      device.queue.writeTexture({ texture: this._whiteTex }, new Uint8Array([255,255,255,255]), { bytesPerRow:4 }, { width:1, height:1, depthOrArrayLayers:1 });
    }
    return this._whiteTex;
  }
}
