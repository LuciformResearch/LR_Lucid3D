export type DeferredSampleGBufferOptions = {
  width: number;
  height: number;
  normalFormat?: GPUTextureFormat;
  albedoFormat?: GPUTextureFormat;
  emissiveFormat?: GPUTextureFormat;
  depthCopyFormat?: GPUTextureFormat;
  depthFormat?: GPUTextureFormat;
};

export class DeferredSampleGBuffer {
  private normalTexture?: GPUTexture;
  private albedoTexture?: GPUTexture;
  private emissiveTexture?: GPUTexture;
  private depthCopyTexture?: GPUTexture;
  private depthTexture?: GPUTexture;
  private normalView?: GPUTextureView;
  private albedoView?: GPUTextureView;
  private emissiveView?: GPUTextureView;
  private depthCopyView?: GPUTextureView;
  private depthView?: GPUTextureView;

  readonly normalFormat: GPUTextureFormat;
  readonly albedoFormat: GPUTextureFormat;
  readonly emissiveFormat: GPUTextureFormat;
  readonly depthCopyFormat: GPUTextureFormat;
  readonly depthFormat: GPUTextureFormat;

  constructor(private device: GPUDevice, private options: DeferredSampleGBufferOptions) {
    this.normalFormat = options.normalFormat ?? 'rgba16float';
    this.albedoFormat = options.albedoFormat ?? 'bgra8unorm';
    this.emissiveFormat = options.emissiveFormat ?? 'rgba16float';
    this.depthCopyFormat = options.depthCopyFormat ?? 'r32float';
    this.depthFormat = options.depthFormat ?? 'depth24plus';
    this.createTextures(options.width, options.height);
  }

  get size(): [number, number] {
    return [this.options.width, this.options.height];
  }

  get normal(): GPUTextureView {
    return this.normalView!;
  }

  get albedo(): GPUTextureView {
    return this.albedoView!;
  }

  get emissive(): GPUTextureView {
    return this.emissiveView!;
  }

  get depthCopy(): GPUTextureView {
    return this.depthCopyView!;
  }

  get depth(): GPUTextureView {
    return this.depthView!;
  }

  ensureSize(width: number, height: number) {
    if (width === this.options.width && height === this.options.height) return;
    this.destroyTextures();
    this.createTextures(width, height);
    this.options.width = width;
    this.options.height = height;
  }

  createGeometryPassDescriptor(): GPURenderPassDescriptor {
    return {
      colorAttachments: [
        {
          view: this.normalView!,
          clearValue: { r: 0, g: 0, b: 1, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
        {
          view: this.albedoView!,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
        {
          view: this.emissiveView!,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
        {
          view: this.depthCopyView!,
          clearValue: { r: 1, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthView!,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
  }

  dispose() {
    this.destroyTextures();
  }

  private createTextures(width: number, height: number) {
    this.normalTexture = this.device.createTexture({
      size: [width, height, 1],
      format: this.normalFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.albedoTexture = this.device.createTexture({
      size: [width, height, 1],
      format: this.albedoFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.emissiveTexture = this.device.createTexture({
      size: [width, height, 1],
      format: this.emissiveFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.depthCopyTexture = this.device.createTexture({
      size: [width, height, 1],
      format: this.depthCopyFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.depthTexture = this.device.createTexture({
      size: [width, height, 1],
      format: this.depthFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.normalView = this.normalTexture.createView();
    this.albedoView = this.albedoTexture.createView();
    this.emissiveView = this.emissiveTexture.createView();
    this.depthCopyView = this.depthCopyTexture.createView();
    this.depthView = this.depthTexture.createView();
  }

  private destroyTextures() {
    this.normalView = undefined;
    this.albedoView = undefined;
    this.emissiveView = undefined;
    this.depthCopyView = undefined;
    this.depthView = undefined;
    if (this.normalTexture) this.normalTexture.destroy();
    if (this.albedoTexture) this.albedoTexture.destroy();
    if (this.emissiveTexture) this.emissiveTexture.destroy();
    if (this.depthCopyTexture) this.depthCopyTexture.destroy();
    if (this.depthTexture) this.depthTexture.destroy();
    this.normalTexture = undefined;
    this.albedoTexture = undefined;
    this.emissiveTexture = undefined;
    this.depthCopyTexture = undefined;
    this.depthTexture = undefined;
  }
}
