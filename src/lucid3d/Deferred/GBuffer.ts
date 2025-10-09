import { WebgpuMain } from '../WebgpuMain';

export type GBufferFormats = {
  albedo: GPUTextureFormat;
  normalRoughness?: GPUTextureFormat;
  emissiveAo?: GPUTextureFormat;
  depth: GPUTextureFormat;
};

export class GBuffer {
  public albedo: GPUTexture; // single-sample (for sampling in lighting)
  public albedoView: GPUTextureView;
  public albedoMSAA: GPUTexture; // multi-sample render target
  public albedoMSAAView: GPUTextureView;
  public depthMSAA: GPUTexture;
  public depthMSAAView: GPUTextureView;
  public normalRoughness?: GPUTexture;
  public normalRoughnessView?: GPUTextureView;
  public normalRoughnessMSAA?: GPUTexture;
  public normalRoughnessMSAAView?: GPUTextureView;
  public emissiveAo?: GPUTexture;
  public emissiveAoView?: GPUTextureView;
  public emissiveAoMSAA?: GPUTexture;
  public emissiveAoMSAAView?: GPUTextureView;

  private _sampleCount: number;
  constructor(private renderer: WebgpuMain, private formats: GBufferFormats, sampleCount = 4) {
    this._sampleCount = sampleCount;
  }
  get sampleCount() { return this._sampleCount; }

  destroy() {
    this.albedo?.destroy();
    this.albedoMSAA?.destroy();
    this.depthMSAA?.destroy();
    this.normalRoughness?.destroy();
    this.normalRoughnessMSAA?.destroy();
    this.emissiveAo?.destroy();
    this.emissiveAoMSAA?.destroy();
  }

  resize() {
    this.destroy();
    const device = this.renderer.device;
    const size = this.renderer.presentationSize as [number, number];

    this.albedo = device.createTexture({
      size,
      format: this.formats.albedo,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.albedoView = this.albedo.createView();

    this.albedoMSAA = device.createTexture({
      size,
      format: this.formats.albedo,
      sampleCount: this._sampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.albedoMSAAView = this.albedoMSAA.createView();

    this.depthMSAA = device.createTexture({
      size,
      format: this.formats.depth,
      sampleCount: this._sampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthMSAAView = this.depthMSAA.createView();

    if (this.formats.normalRoughness) {
      this.normalRoughness = device.createTexture({
        size,
        format: this.formats.normalRoughness,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.normalRoughnessView = this.normalRoughness.createView();
      this.normalRoughnessMSAA = device.createTexture({
        size,
        format: this.formats.normalRoughness,
        sampleCount: this._sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.normalRoughnessMSAAView = this.normalRoughnessMSAA.createView();
    }
    if (this.formats.emissiveAo) {
      this.emissiveAo = device.createTexture({
        size,
        format: this.formats.emissiveAo,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.emissiveAoView = this.emissiveAo.createView();
      this.emissiveAoMSAA = device.createTexture({
        size,
        format: this.formats.emissiveAo,
        sampleCount: this._sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.emissiveAoMSAAView = this.emissiveAoMSAA.createView();
    }
  }
}
