import { DeferredSampleGBuffer } from './DeferredSampleGBuffer';
import { DeferredSampleGeometryPass } from './DeferredSampleGeometry';
import { DeferredSampleMaterialParams } from './DeferredSampleMaterial';

export type DeferredSampleRendererOptions = {
  device: GPUDevice;
  vertexLayout: GPUVertexBufferLayout;
  gbuffer: DeferredSampleGBuffer;
  modelBuffer: GPUBuffer;
  cameraBuffer: GPUBuffer;
  gbufferTexturesLayout: GPUBindGroupLayout;
  gbufferSampler: GPUSampler;
  material: DeferredSampleMaterialParams;
  fallbackTextures: {
    baseColor: GPUTextureView;
    metallicRoughness: GPUTextureView;
    emissive: GPUTextureView;
    occlusion: GPUTextureView;
  };
};

export class DeferredSampleRenderer {
  readonly geometry: DeferredSampleGeometryPass;
  private gbufferBindGroup: GPUBindGroup;

  constructor(private opts: DeferredSampleRendererOptions) {
    this.geometry = new DeferredSampleGeometryPass({
      device: opts.device,
      vertexLayout: opts.vertexLayout,
      gbuffer: opts.gbuffer,
      material: opts.material,
      fallbackTextures: opts.fallbackTextures,
    }, opts.modelBuffer, opts.cameraBuffer);
    this.gbufferBindGroup = this.createGBufBindGroup();
  }

  private createGBufBindGroup(): GPUBindGroup {
    return this.opts.device.createBindGroup({
      layout: this.opts.gbufferTexturesLayout,
      entries: [
        { binding: 0, resource: this.opts.gbuffer.normal },
        { binding: 1, resource: this.opts.gbuffer.albedo },
        { binding: 2, resource: this.opts.gbuffer.emissive },
        { binding: 3, resource: this.opts.gbuffer.depthCopy },
        { binding: 4, resource: this.opts.gbufferSampler },
      ],
    });
  }

  encodeGeometry(passEncoder: GPUCommandEncoder, vertexBuffer: GPUBuffer, indexBuffer: GPUBuffer, indexFormat: GPUIndexFormat, indexCount: number) {
    this.geometry.encode(passEncoder, vertexBuffer, indexBuffer, indexFormat, indexCount);
  }

  ensureSize(width: number, height: number) {
    this.opts.gbuffer.ensureSize(width, height);
    this.gbufferBindGroup = this.createGBufBindGroup();
  }

  get gbufferViews(): { normal: GPUTextureView; albedo: GPUTextureView; depth: GPUTextureView } {
    return {
      normal: this.opts.gbuffer.normal,
      albedo: this.opts.gbuffer.albedo,
      depth: this.opts.gbuffer.depth,
    };
  }

  get gbufferBindGroupHandle(): GPUBindGroup {
    return this.gbufferBindGroup;
  }
}
