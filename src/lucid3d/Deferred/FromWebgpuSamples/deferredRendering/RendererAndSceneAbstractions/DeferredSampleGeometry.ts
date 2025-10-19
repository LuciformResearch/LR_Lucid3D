import { DeferredSampleGBuffer } from './DeferredSampleGBuffer';
import { DeferredSampleMaterial, DeferredSampleMaterialParams } from './DeferredSampleMaterial';

export type DeferredSampleGeometryOptions = {
  device: GPUDevice;
  vertexLayout: GPUVertexBufferLayout;
  gbuffer: DeferredSampleGBuffer;
  material: DeferredSampleMaterialParams;
  fallbackTextures: {
    baseColor: GPUTextureView;
    metallicRoughness: GPUTextureView;
    emissive: GPUTextureView;
    occlusion: GPUTextureView;
  };
};

export class DeferredSampleGeometryPass {
  readonly material: DeferredSampleMaterial;
  readonly sceneBindGroup: GPUBindGroup;

  constructor(private opts: DeferredSampleGeometryOptions, modelBuffer: GPUBuffer, cameraBuffer: GPUBuffer) {
    this.material = new DeferredSampleMaterial(opts.device, {
      vertexLayout: opts.vertexLayout,
      normalFormat: opts.gbuffer.normalFormat,
      albedoFormat: opts.gbuffer.albedoFormat,
      emissiveFormat: opts.gbuffer.emissiveFormat,
      depthCopyFormat: opts.gbuffer.depthCopyFormat,
      depthFormat: opts.gbuffer.depthFormat,
      material: opts.material,
      fallbackTextures: opts.fallbackTextures,
    });
    this.sceneBindGroup = this.material.createSceneBindGroup(modelBuffer, cameraBuffer);
  }

  encode(passEncoder: GPUCommandEncoder, vertexBuffer: GPUBuffer, indexBuffer: GPUBuffer, indexFormat: GPUIndexFormat, indexCount: number) {
    const renderPass = passEncoder.beginRenderPass(this.opts.gbuffer.createGeometryPassDescriptor());
    this.material.draw(renderPass, this.sceneBindGroup, vertexBuffer, indexBuffer, indexFormat, indexCount);
    renderPass.end();
  }
}
