const vertexWriteGBuffers = require('../shaders/vertexWriteGBuffers.wgsl').default as string;
const fragmentWriteGBuffers = require('../shaders/fragmentWriteGBuffers.wgsl').default as string;

export type DeferredSampleMaterialParams = {
  baseColorFactor: [number, number, number, number];
  emissiveFactor: [number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  aoFactor: number;
  baseColorTexture?: GPUTextureView;
  metallicRoughnessTexture?: GPUTextureView;
  emissiveTexture?: GPUTextureView;
  occlusionTexture?: GPUTextureView;
};

export type DeferredSampleMaterialOptions = {
  normalFormat?: GPUTextureFormat;
  albedoFormat?: GPUTextureFormat;
  emissiveFormat?: GPUTextureFormat;
  depthCopyFormat?: GPUTextureFormat;
  depthFormat?: GPUTextureFormat;
  vertexLayout: GPUVertexBufferLayout;
  material: DeferredSampleMaterialParams;
  fallbackTextures: {
    baseColor: GPUTextureView;
    metallicRoughness: GPUTextureView;
    emissive: GPUTextureView;
    occlusion: GPUTextureView;
  };
};

export class DeferredSampleMaterial {
  readonly pipeline: GPURenderPipeline;
  readonly sceneLayout: GPUBindGroupLayout;
  readonly materialLayout: GPUBindGroupLayout;
  readonly materialBindGroup: GPUBindGroup;
  readonly sampler: GPUSampler;

  private uniformBuffer: GPUBuffer;

  constructor(private device: GPUDevice, opts: DeferredSampleMaterialOptions) {
    const normalFormat = opts.normalFormat ?? 'rgba16float';
    const albedoFormat = opts.albedoFormat ?? 'bgra8unorm';
    const emissiveFormat = opts.emissiveFormat ?? 'rgba16float';
    const depthCopyFormat = opts.depthCopyFormat ?? 'r32float';
    const depthFormat = opts.depthFormat ?? 'depth24plus';

    this.pipeline = device.createRenderPipeline({
      label: 'DeferredSampleGeometryPipeline',
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: vertexWriteGBuffers }),
        entryPoint: 'main',
        buffers: [opts.vertexLayout],
      },
      fragment: {
        module: device.createShaderModule({ code: fragmentWriteGBuffers }),
        entryPoint: 'main',
        targets: [
          { format: normalFormat },
          { format: albedoFormat },
          { format: emissiveFormat },
          { format: depthCopyFormat },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: {
        format: depthFormat,
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    this.sceneLayout = this.pipeline.getBindGroupLayout(0);
    this.materialLayout = this.pipeline.getBindGroupLayout(1);

    const params = opts.material;
    const fallback = opts.fallbackTextures;

    const baseColorTex = params.baseColorTexture ?? fallback.baseColor;
    const mrTex = params.metallicRoughnessTexture ?? fallback.metallicRoughness;
    const emissiveTex = params.emissiveTexture ?? fallback.emissive;
    const occlusionTex = params.occlusionTexture ?? fallback.occlusion;

    this.uniformBuffer = device.createBuffer({
      size: 4 * 4 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniforms = new Float32Array(16);
    uniforms.set(params.baseColorFactor, 0);
    uniforms.set([...params.emissiveFactor, 0], 4);
    uniforms[8] = params.metallicFactor;
    uniforms[9] = params.roughnessFactor;
    uniforms[10] = params.aoFactor;
    uniforms[11] = 0;
    uniforms[12] = params.baseColorTexture ? 1 : 0;
    uniforms[13] = params.metallicRoughnessTexture ? 1 : 0;
    uniforms[14] = params.emissiveTexture ? 1 : 0;
    uniforms[15] = params.occlusionTexture ? 1 : 0;
    device.queue.writeBuffer(this.uniformBuffer, 0, uniforms.buffer);

    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });

    this.materialBindGroup = device.createBindGroup({
      layout: this.materialLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: baseColorTex },
        { binding: 2, resource: mrTex },
        { binding: 3, resource: emissiveTex },
        { binding: 4, resource: occlusionTex },
        { binding: 5, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  createSceneBindGroup(modelBuffer: GPUBuffer, cameraBuffer: GPUBuffer): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: modelBuffer } },
        { binding: 1, resource: { buffer: cameraBuffer } },
      ],
    });
  }

  draw(pass: GPURenderPassEncoder, sceneBindGroup: GPUBindGroup, vertexBuffer: GPUBuffer, indexBuffer: GPUBuffer, indexFormat: GPUIndexFormat, indexCount: number) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, sceneBindGroup);
    pass.setBindGroup(1, this.materialBindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, indexFormat);
    pass.drawIndexed(indexCount);
  }
}
