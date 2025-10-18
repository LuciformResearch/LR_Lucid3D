import { WebgpuMain } from '../WebgpuMain';
import { QueryArgs } from '../../components/WebgpuApp/util/query-args';
import { GBuffer } from './GBuffer';
import { WebgpuSceneRendererGBuffer } from './WebgpuSceneRendererGBuffer';
import { WebgpuTransform } from '../WebgpuTransform';
import { mat4 } from 'gl-matrix';
import { ShaderComposer } from '../Abstractions/Modules/ShaderComposer';
import { PBRCommonModule } from '../Abstractions/Modules/PBRCommonModule';
import { DeferredGBufferModule } from './modules/DeferredGBufferModule';
import { DeferredDirectionalLightModule } from './modules/DeferredDirectionalLightModule';
import { DeferredPointLightModule } from './modules/DeferredPointLightModule';

const deferredLightingTemplate = require('./templates/deferred_lighting.frag.wgsl').default as string;
const deferredLightingMultiTemplate = require('./templates/deferred_lighting_multilight.frag.wgsl').default as string;
const lightingComputeShader = require('./shaders/lighting_compute.wgsl').default as string;
const lightingBlitTemplate = require('./shaders/lighting_blit.frag.wgsl').default as string;
const lightingComputeDebugShader = require('./shaders/lighting_compute_debug.wgsl').default as string;
const lightingComputeDummyShader = require('./shaders/lighting_compute_dummy.wgsl').default as string;

export class DeferredRenderer {
  private gbuffer: GBuffer;

  private sampler: GPUSampler;
  private lightingPipeline: GPURenderPipeline;
  private lightingBindGroup: GPUBindGroup;
  // Lighting shader variants (single light uses sampler; multi-light uses textureLoad)

  private fsVertModule: GPUShaderModule;

  private geoPassDesc: GPURenderPassDescriptor;
  public sceneRenderer?: WebgpuSceneRendererGBuffer;
  // Geometry pipeline formats (G0/G1/G2)
  private formats: GPUTextureFormat[] = [];
  private targetCount: number = 3;
  // Multi-light (webgpu-samples style)
  private lightsCount: number = 0;
  private lightsMax: number = 1024;
  private lightsStride: number = 8;
  private lightsBuffer?: GPUBuffer;
  private configBuffer?: GPUBuffer; // numLights
  private cameraBuffer?: GPUBuffer; // viewProj + invViewProj
  private extentBuffer?: GPUBuffer; // light extent
  private lightsBindGroup?: GPUBindGroup;
  private lightsComputeBindGroup?: GPUBindGroup;
  private lightUpdatePipeline?: GPUComputePipeline;
  private profileEnabled: boolean = false;
  private timestampQuerySet?: GPUQuerySet;
  private timestampResolveBuffer?: GPUBuffer;
  private timestampReadBuffer?: GPUBuffer;
  private profilePending: boolean = false;
  private profileInFlight: boolean = false;
  private profilePromise: Promise<void> | null = null;
  private profileFrameCounter: number = 0;
  private profileEvery: number = 30;
  private timestampPeriod: number = 1;
  private tileSize: number = 16;
  private tilesX: number = 0;
  private tilesY: number = 0;
  private tileCount: number = 0;
  private tileHeaderBuffer?: GPUBuffer;
  private tileDebugEnabled: boolean = false;
  private tileConfigBuffer?: GPUBuffer;
  private tileListBuffer?: GPUBuffer;
  private maxLightsPerTile: number = 0;
  private lightCullingPipeline?: GPUComputePipeline;
  private lightCullingBindGroup?: GPUBindGroup;
  private lightsBindGroupLayout?: GPUBindGroupLayout;
  private tileListCapacity: number = 0;
  private tileDebugBuffer?: GPUBuffer;
  private tileOverflowFrames: number = 0;
  private tileDebugZeroArray?: Uint32Array;
  private tileDebugStagingBuffer?: GPUBuffer;
  private tileDebugNeedsRead: boolean = false;
  private tileDebugReadPromise: Promise<void> | null = null;
  private tileDebugByteLength: number = 0;
  private lambertOnly: boolean = false;
  private lightingTexture?: GPUTexture;
  private lightingTextureView?: GPUTextureView;
  private lightingStorageView?: GPUTextureView;
  private lightingComputePipeline?: GPUComputePipeline;
  private lightingComputeGBufBindGroup?: GPUBindGroup;
  private lightingComputeOutputBindGroup?: GPUBindGroup;
  private lightingBlitPipeline?: GPURenderPipeline;
  private lightingBlitBindGroup?: GPUBindGroup;
  private blitSampler?: GPUSampler;
  private lightingDummyRenderPipeline?: GPURenderPipeline;
  private emissiveFallbackTexture?: GPUTexture;
  private emissiveFallbackView?: GPUTextureView;
  private lightingTextureUsage: GPUTextureUsageFlags = 0;
  private lightingTextureSize: [number, number] = [0, 0];
  private lightingDebugAlbedoPipeline?: GPUComputePipeline;
  private lightingDebugDummyPipeline?: GPUComputePipeline;
  private dummyRenderMode: boolean = false;

  constructor(private renderer: WebgpuMain) {}

  async initialize(transforms?: WebgpuTransform[]) {
    const device = this.renderer.device;
    // Use nearest to avoid any potential filterable-float issues on some GPUs
    this.sampler = device.createSampler({ minFilter: 'nearest', magFilter: 'nearest' });
    this.blitSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    this.ensurePlaceholderTextures();
    this.fsVertModule = device.createShaderModule({ code: require('./shaders/fullscreen_triangle.wgsl').default });
    this.targetCount = Math.max(2, Math.min(3, QueryArgs.getInt('gbufTargets', 3) || 3));
    const lightDebugArg = (QueryArgs.getString('lightDebug', '') || '').toLowerCase();
    const dummyModeArg = (QueryArgs.getString('dummyMode', '') || '').toLowerCase();
    this.dummyRenderMode = lightDebugArg === 'dummy'
      && (dummyModeArg === 'render' || QueryArgs.getBool('dummyRender', false));
    this.formats = (this.targetCount === 2)
      ? [ 'rgba8unorm', 'rgba8unorm' ]
      : [ 'rgba8unorm', 'rgba8unorm', 'rgba8unorm' ];
    const samples = QueryArgs.getInt('samples', 1);
    this.gbuffer = new GBuffer(this.renderer, {
      albedo: this.formats[0],
      normalRoughness: this.formats[1],
      emissiveAo: this.formats[2],
      depth: 'depth24plus',
    }, samples);
    this.ensureTargets();
    this.setupLightingTexture('init');
    const tileArg = QueryArgs.getInt('tile', null);
    if (tileArg) this.tileSize = Math.max(8, tileArg);
    this.tileDebugEnabled = QueryArgs.getBool('tileDebug', false);
    this.setupTileBuffers('init');
    this.lightsCount = Math.max(0, Math.min(this.lightsMax, QueryArgs.getInt('lights', 0) || 0));
    this.createLightingPipeline();
    if (this.lightsCount > 0) {
      if (this.gbuffer.sampleCount !== 1) {
        console.warn('[Deferred] Multi-light requires samples=1 to sample depth. Disable lights or set ?samples=1.');
        this.lightsCount = 0;
        this.createLightingPipeline();
      } else {
        this.setupLights();
      }
    }
    this.profileEnabled = QueryArgs.getBool('profile', false) && this.renderer.device.features.has('timestamp-query');
    if (this.profileEnabled) {
      try {
        this.timestampQuerySet = device.createQuerySet({ type: 'timestamp', count: 4 });
        this.timestampResolveBuffer = device.createBuffer({
          size: 4 * 8,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE,
        });
        this.timestampReadBuffer = device.createBuffer({
          size: 4 * 8,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const limits = (this.renderer.adapter && (this.renderer.adapter as any).limits) || undefined;
        this.timestampPeriod = limits && typeof limits.timestampPeriod === 'number' ? limits.timestampPeriod : 1;
        const profileEvery = QueryArgs.getInt('profileEvery', 30);
        this.profileEvery = Math.max(1, profileEvery || 30);
      } catch (err) {
        console.warn('[Deferred] Failed to initialize timestamp query set:', err);
        this.profileEnabled = false;
      }
    } else if (QueryArgs.getBool('profile', false) && !this.renderer.device.features.has('timestamp-query')) {
      console.warn('[Deferred] timestamp-query feature unavailable on device; profiling disabled.');
    }
    if (transforms) this.sceneRenderer = new WebgpuSceneRendererGBuffer(this.renderer, transforms, this.formats, this.gbuffer.sampleCount);
  }

  ensureTargets() {
    const device = this.renderer.device;
    const size = this.renderer.presentationSize as [number, number];

    this.gbuffer.resize();
    this.setupLightingTexture('resize');
    const msaa = this.gbuffer.sampleCount > 1;
    const attachments: GPURenderPassColorAttachment[] = [];
    const albedoAttachment: GPURenderPassColorAttachment = msaa ? {
      view: this.gbuffer.albedoMSAAView!,
      resolveTarget: this.gbuffer.albedoView!,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'discard',
    } : {
      view: this.gbuffer.albedoView!,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    };
    attachments.push(albedoAttachment);
    if (this.gbuffer.normalRoughnessView) {
      const normalAttachment: GPURenderPassColorAttachment = msaa ? {
        view: this.gbuffer.normalRoughnessMSAAView!,
        resolveTarget: this.gbuffer.normalRoughnessView!,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'discard',
      } : {
        view: this.gbuffer.normalRoughnessView!,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      };
      attachments.push(normalAttachment);
    }
    if (this.gbuffer.emissiveAoView) {
      const emissiveAttachment: GPURenderPassColorAttachment = msaa ? {
        view: this.gbuffer.emissiveAoMSAAView!,
        resolveTarget: this.gbuffer.emissiveAoView!,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'discard',
      } : {
        view: this.gbuffer.emissiveAoView!,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      };
      attachments.push(emissiveAttachment);
    }

    this.geoPassDesc = {
      colorAttachments: attachments,
      depthStencilAttachment: {
        view: this.gbuffer.depthMSAAView!,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
  }

  private setupLightingTexture(reason: 'init' | 'resize') {
    const device = this.renderer.device;
    const size = this.renderer.presentationSize as [number, number];
    const usage = this.dummyRenderMode
      ? GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      : GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING;
    const needsRecreate =
      !this.lightingTexture
      || this.lightingTextureSize[0] !== size[0]
      || this.lightingTextureSize[1] !== size[1]
      || this.lightingTextureUsage !== usage;
    if (needsRecreate) {
      this.lightingTexture?.destroy();
      this.lightingTexture = device.createTexture({
        size: [size[0], size[1], 1],
        format: 'rgba16float',
        usage,
      });
      this.lightingTextureUsage = usage;
      this.lightingTextureSize = [size[0], size[1]];
    }
    this.lightingTextureView = this.lightingTexture.createView();
    if (this.dummyRenderMode) {
      this.lightingStorageView = undefined;
      this.lightingComputeGBufBindGroup = undefined;
      this.lightingComputeOutputBindGroup = undefined;
    } else {
      this.lightingStorageView = this.lightingTexture.createView();
      this.updateLightingComputeBindGroups();
    }
    this.updateLightingBlitBindGroup();
  }

  private ensurePlaceholderTextures() {
    if (!this.emissiveFallbackTexture) {
      const device = this.renderer.device;
      const tex = device.createTexture({
        size: [1, 1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      device.queue.writeTexture(
        { texture: tex },
        new Uint8Array([0, 0, 0, 255]),
        { bytesPerRow: 4 },
        { width: 1, height: 1, depthOrArrayLayers: 1 },
      );
      this.emissiveFallbackTexture = tex;
      this.emissiveFallbackView = tex.createView();
    }
  }

  private createLightingPipeline() {
    const device = this.renderer.device;
    const gsel = (QueryArgs.getString('gbuf', '') || '').toUpperCase();
    const shaderLog = QueryArgs.getBool('shaderLog', false);
    this.lambertOnly = QueryArgs.getString('brdf', '').toLowerCase() === 'lambert'
      || QueryArgs.getBool('lambert', false);
    const isDebug = (gsel === 'G0' || gsel === 'G1' || gsel === 'G2');

    if (isDebug) {
      const flip = QueryArgs.getBool('flip', false) ? 'true' : 'false';
      const useOct = QueryArgs.getBool('oct', true);
      const hasEmissive = this.targetCount === 3;
      const code = `
      @group(0) @binding(1) var gAlbedoTex: texture_2d<f32>;
      @group(0) @binding(2) var gNormalRoughTex: texture_2d<f32>;
      ${hasEmissive ? '@group(0) @binding(3) var gEmissiveAoTex: texture_2d<f32>;' : ''}
      struct FSIn { @location(0) uv: vec2<f32>, };
      fn octDecode(e: vec2<f32>) -> vec3<f32> {
        var v = vec3<f32>(e.x, e.y, 1.0 - abs(e.x) - abs(e.y));
        if (v.z < 0.0) {
          let s = vec2<f32>(select(-1.0, 1.0, v.x >= 0.0), select(-1.0, 1.0, v.y >= 0.0));
          let xy = (1.0 - abs(vec2<f32>(v.y, v.x))) * s;
          v = vec3<f32>(xy.x, xy.y, v.z);
        }
        return normalize(v);
      }
      @fragment fn main(in: FSIn) -> @location(0) vec4<f32> {
        var uv = in.uv;
        if (${flip}) { uv = vec2<f32>(uv.x, 1.0 - uv.y); }
        uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
        let dims = textureDimensions(gAlbedoTex);
        let coords = vec2<i32>(i32(uv.x * f32(dims.x - 1)), i32(uv.y * f32(dims.y - 1)));
        if (${gsel === 'G0' ? 'true' : 'false'}) {
          let g0 = textureLoad(gAlbedoTex, coords, 0);
          return g0;
        }
        if (${gsel === 'G1' ? 'true' : 'false'}) {
          let g1 = textureLoad(gNormalRoughTex, coords, 0);
          var nVis: vec3<f32>;
          if (${this.targetCount === 2 && useOct ? 'true' : 'false'}) {
            let enc = g1.rg * 2.0 - vec2<f32>(1.0, 1.0);
            let n = octDecode(enc);
            nVis = 0.5 * n + vec3<f32>(0.5);
          } else {
            nVis = 0.5 * g1.xyz + vec3<f32>(0.5);
          }
          return vec4<f32>(nVis, 1.0);
        }
        ${hasEmissive ? `let g2 = textureLoad(gEmissiveAoTex, coords, 0);
        let ao = g2.a;
        return vec4<f32>(vec3<f32>(ao, ao, ao), 1.0);` : `return vec4<f32>(0.0, 0.0, 0.0, 1.0);`}
      }`;
      if (shaderLog) {
        console.log('[Deferred][shader] debug gbuffer fragment', code);
      }
      const fragModule = device.createShaderModule({ code });
      const layout = this.makeGBufferBindGroupLayout(device, { includeDepth: true, includeSampler: false, hasEmissive });
      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [ layout ] });
      this.lightingPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module: this.fsVertModule, entryPoint: 'main' },
        fragment: { module: fragModule, entryPoint: 'main', targets: [{ format: this.renderer.presentationFormat }] },
        primitive: { topology: 'triangle-list' },
      });
      const entries: GPUBindGroupEntry[] = hasEmissive
        ? [
            { binding: 1, resource: this.gbuffer.albedoView },
            { binding: 2, resource: this.gbuffer.normalRoughnessView },
            { binding: 3, resource: this.gbuffer.emissiveAoView },
          ]
        : [
            { binding: 1, resource: this.gbuffer.albedoView },
            { binding: 2, resource: this.gbuffer.normalRoughnessView },
          ];
      this.lightingBindGroup = device.createBindGroup({ layout: this.lightingPipeline.getBindGroupLayout(0), entries });
      try { const { Metrics } = require('../util/metrics'); if (Metrics.isEnabled()) Metrics.incBindGroups(1); } catch {}
      return;
    }

    this.ensureLightingComputePipeline();
    this.ensureLightingBlitPipeline(shaderLog);
    this.updateLightingComputeBindGroups();
    this.updateLightsBindGroup();
    this.updateLightingBlitBindGroup();
  }

  private ensureLightingComputePipeline() {
    if (this.lightingComputePipeline) return;
    const device = this.renderer.device;
    const gbufferLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
    ]});
    const lightsLayout = this.makeLightsBindGroupLayout(device);
    const outputLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
    ]});
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [ gbufferLayout, lightsLayout, outputLayout ] });
    const module = device.createShaderModule({ code: lightingComputeShader });
    this.lightingComputePipeline = device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'main' } });
  }

  private ensureLightingBlitPipeline(shaderLog: boolean) {
    if (this.lightingBlitPipeline) return;
    const device = this.renderer.device;
    const flipExpr = QueryArgs.getBool('flip', false)
      ? 'in.uv'
      : 'vec2<f32>(in.uv.x, 1.0 - in.uv.y)';
    let fragCode = lightingBlitTemplate.replace('/*FLIP_EXPR*/', flipExpr);
    if (shaderLog) {
      console.log('[Deferred][shader] lighting blit fragment', fragCode);
    }
    const fragModule = device.createShaderModule({ code: fragCode });
    const bindLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ]});
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [ bindLayout ] });
    this.lightingBlitPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: this.fsVertModule, entryPoint: 'main' },
      fragment: { module: fragModule, entryPoint: 'main', targets: [{ format: this.renderer.presentationFormat }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  private updateLightingComputeBindGroups() {
    if (!this.lightingComputePipeline || !this.gbuffer.albedoView || !this.gbuffer.normalRoughnessView || !this.gbuffer.depthMSAAView || !this.lightingStorageView) return;
    const device = this.renderer.device;
    const layout0 = this.lightingComputePipeline.getBindGroupLayout(0);
    const emissiveView = this.gbuffer.emissiveAoView ?? this.emissiveFallbackView!;
    this.lightingComputeGBufBindGroup = device.createBindGroup({
      layout: layout0,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.gbuffer.albedoView! },
        { binding: 2, resource: this.gbuffer.normalRoughnessView! },
        { binding: 3, resource: emissiveView },
        { binding: 4, resource: this.gbuffer.depthMSAAView! },
      ],
    });
    const layout2 = this.lightingComputePipeline.getBindGroupLayout(2);
    this.lightingComputeOutputBindGroup = device.createBindGroup({
      layout: layout2,
      entries: [ { binding: 0, resource: this.lightingStorageView! } ],
    });
  }

  private updateLightingBlitBindGroup() {
    if (!this.lightingBlitPipeline || !this.lightingTextureView || !this.blitSampler) return;
    const device = this.renderer.device;
    const layout = this.lightingBlitPipeline.getBindGroupLayout(0);
    this.lightingBlitBindGroup = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: this.blitSampler! },
        { binding: 1, resource: this.lightingTextureView! },
      ],
    });
  }

  private makeGBufferBindGroupLayout(device: GPUDevice, opts: { includeDepth: boolean; includeSampler: boolean; hasEmissive: boolean }): GPUBindGroupLayout {
    const entries: GPUBindGroupLayoutEntry[] = [];
    if (opts.includeSampler) {
      entries.push({ binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } });
    }
    entries.push({ binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } });
    entries.push({ binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } });
    if (opts.hasEmissive) entries.push({ binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } });
    if (opts.includeDepth) {
      const depthBinding = opts.hasEmissive ? 4 : 3;
      entries.push({ binding: depthBinding, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } });
    }
    return device.createBindGroupLayout({ entries });
  }
  private buildGBufferBindingDeclarations(opts: { includeSampler: boolean; hasEmissive: boolean; includeDepth: boolean }): string {
    const { includeSampler, hasEmissive, includeDepth } = opts;
    const lines: string[] = [];
    let nextBinding = includeSampler ? 1 : 1;
    if (includeSampler) {
      lines.push('@group(0) @binding(0) var gSampler: sampler;');
    }
    lines.push(`@group(0) @binding(${nextBinding}) var gAlbedoTex: texture_2d<f32>;`);
    nextBinding++;
    lines.push(`@group(0) @binding(${nextBinding}) var gNormalRoughTex: texture_2d<f32>;`);
    nextBinding++;
    if (hasEmissive) {
      lines.push(`@group(0) @binding(${nextBinding}) var gEmissiveAoTex: texture_2d<f32>;`);
      nextBinding++;
    }
    if (includeDepth) {
      lines.push(`@group(0) @binding(${nextBinding}) var gDepthTex: texture_2d<f32>;`);
    }
    return lines.join('\n');
  }
  private makeLightsBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    this.lightsBindGroupLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ]});
    return this.lightsBindGroupLayout!;
  }

  private setupLights() {
    const device = this.renderer.device;
    const byteSize = Float32Array.BYTES_PER_ELEMENT * this.lightsStride * this.lightsMax;
    this.lightsBuffer = device.createBuffer({ size: byteSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
    const data = new Float32Array(this.lightsBuffer.getMappedRange());
    const min = [-50, -30, -50];
    const max = [50, 50, 50];
    const ext = [max[0]-min[0], max[1]-min[1], max[2]-min[2]];
    for (let i=0;i<this.lightsMax;i++) {
      const off = this.lightsStride * i;
      data[off+0] = Math.random()*ext[0]+min[0];
      data[off+1] = Math.random()*ext[1]+min[1];
      data[off+2] = Math.random()*ext[2]+min[2];
      data[off+3] = 1.0;
      data[off+4] = Math.random()*2.0;
      data[off+5] = Math.random()*2.0;
      data[off+6] = Math.random()*2.0;
      data[off+7] = 20.0;
    }
    this.lightsBuffer.unmap();
    this.configBuffer = device.createBuffer({ size: 4 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.configBuffer, 0, new Uint32Array([this.lightsCount, this.lambertOnly ? 1 : 0, 0, 0]));
    this.cameraBuffer = device.createBuffer({ size: 4 * 16 * 4 + 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.extentBuffer = device.createBuffer({ size: 4*8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const extentFloats = new Float32Array(8); extentFloats.set(min,0); extentFloats.set(max,4);
    device.queue.writeBuffer(this.extentBuffer, 0, extentFloats);
    this.lightUpdatePipeline = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: require('./shaders/light_update.wgsl').default }), entryPoint: 'main' } });
    this.lightsComputeBindGroup = device.createBindGroup({ layout: this.lightUpdatePipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.lightsBuffer } },
      { binding: 1, resource: { buffer: this.configBuffer } },
      { binding: 2, resource: { buffer: this.extentBuffer } },
    ]});
    this.updateLightCullingBindGroup();
    this.updateLightsBindGroup();
  }

  onResize() {
    this.ensureTargets();
    this.setupTileBuffers('resize');
    // Recreate bind group because texture view changed
    const gsel = (QueryArgs.getString('gbuf', '') || '').toUpperCase();
    const isDebug = (gsel === 'G0' || gsel === 'G1' || gsel === 'G2');
    if (isDebug && this.lightingPipeline) {
      this.lightingBindGroup = this.renderer.device.createBindGroup({
        layout: this.lightingPipeline.getBindGroupLayout(0),
        entries: (
          this.targetCount === 3 ? [
            { binding: 1, resource: this.gbuffer.albedoView },
            { binding: 2, resource: this.gbuffer.normalRoughnessView },
            { binding: 3, resource: this.gbuffer.emissiveAoView },
          ] : [
            { binding: 1, resource: this.gbuffer.albedoView },
            { binding: 2, resource: this.gbuffer.normalRoughnessView },
          ]
        ),
      });
      try { const { Metrics } = require('../util/metrics'); if (Metrics.isEnabled()) Metrics.incBindGroups(1); } catch {}
    } else {
      this.updateLightingComputeBindGroups();
      this.updateLightsBindGroup();
      this.updateLightingBlitBindGroup();
    }
  }

  private setupTileBuffers(reason: 'init' | 'resize') {
    const device = this.renderer.device;
    const size = this.renderer.presentationSize as [number, number];
    this.tilesX = Math.max(1, Math.ceil(size[0] / this.tileSize));
    this.tilesY = Math.max(1, Math.ceil(size[1] / this.tileSize));
    this.tileCount = this.tilesX * this.tilesY;

    const headerStride = 8; // uint32 offset + count per tile
    const headerBytes = Math.max(16, this.tileCount * headerStride);
    this.tileHeaderBuffer?.destroy();
    this.tileHeaderBuffer = device.createBuffer({
      size: headerBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const headerZero = new Uint32Array(headerBytes / 4);
    device.queue.writeBuffer(this.tileHeaderBuffer, 0, headerZero);

    const lightsPerTileGuess = Math.max(32, Math.ceil(this.lightsMax / 8));
    this.maxLightsPerTile = lightsPerTileGuess;
    this.tileListCapacity = Math.max(this.tileCount * lightsPerTileGuess, 1);
    const listBytes = this.tileListCapacity * 4;
    this.tileListBuffer?.destroy();
    this.tileListBuffer = device.createBuffer({
      size: listBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const listZero = new Uint32Array(listBytes / 4);
    device.queue.writeBuffer(this.tileListBuffer, 0, listZero);

    if (!this.tileConfigBuffer) {
      this.tileConfigBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    }
    const overflowCounterOffset = 0;
    const overflowFlagsOffset = 1;
    const tileConfig = new Uint32Array([
      this.tileSize,
      this.tilesX,
      this.tilesY,
      size[0],
      size[1],
      this.maxLightsPerTile,
      overflowCounterOffset,
      overflowFlagsOffset,
    ]);
    device.queue.writeBuffer(this.tileConfigBuffer, 0, tileConfig);

    const debugCount = 1 + this.tileCount;
    const debugBytes = debugCount * 4;
    this.tileDebugByteLength = debugBytes;
    this.tileDebugBuffer?.destroy();
    this.tileDebugZeroArray = new Uint32Array(debugCount);
    this.tileDebugBuffer = device.createBuffer({
      size: debugBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.tileDebugBuffer, 0, this.tileDebugZeroArray!.buffer);
    this.tileDebugStagingBuffer?.destroy();
    this.tileDebugStagingBuffer = device.createBuffer({
      size: debugBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    this.tileDebugNeedsRead = false;

    if (this.tileDebugEnabled) {
      console.log('[Deferred][tiles]', {
        reason,
        tileSize: this.tileSize,
        tilesX: this.tilesX,
        tilesY: this.tilesY,
        tileCount: this.tileCount,
        lightsPerTileGuess,
        buffersKB: {
          headers: headerBytes / 1024,
          list: listBytes / 1024,
        },
      });
    }
    this.ensureLightCullingPipeline();
    this.updateLightCullingBindGroup();
    this.updateLightsBindGroup();
  }

  private ensureLightCullingPipeline() {
    if (this.lightCullingPipeline) return;
    const device = this.renderer.device;
    this.lightCullingPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: require('./shaders/light_cull_tiled.wgsl').default }),
        entryPoint: 'main',
      },
    });
  }

  private updateLightCullingBindGroup() {
    if (!this.lightCullingPipeline) return;
    if (!this.lightsBuffer || !this.configBuffer || !this.cameraBuffer || !this.tileConfigBuffer || !this.tileHeaderBuffer || !this.tileListBuffer || !this.tileDebugBuffer) {
      this.lightCullingBindGroup = undefined;
      return;
    }
    const layout = this.lightCullingPipeline.getBindGroupLayout(0);
    this.lightCullingBindGroup = this.renderer.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.lightsBuffer } },
        { binding: 1, resource: { buffer: this.configBuffer } },
        { binding: 2, resource: { buffer: this.cameraBuffer } },
        { binding: 3, resource: { buffer: this.tileConfigBuffer } },
        { binding: 4, resource: { buffer: this.tileHeaderBuffer } },
        { binding: 5, resource: { buffer: this.tileListBuffer } },
        { binding: 6, resource: { buffer: this.tileDebugBuffer } },
      ],
    });
  }

  private updateLightsBindGroup() {
    if (!this.lightsBindGroupLayout || !this.lightsBuffer || !this.configBuffer || !this.cameraBuffer || !this.tileConfigBuffer || !this.tileHeaderBuffer || !this.tileListBuffer || !this.tileDebugBuffer) {
      return;
    }
    this.lightsBindGroup = this.renderer.device.createBindGroup({
      layout: this.lightsBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this.lightsBuffer } },
        { binding: 1, resource: { buffer: this.configBuffer } },
        { binding: 2, resource: { buffer: this.cameraBuffer } },
        { binding: 3, resource: { buffer: this.tileConfigBuffer } },
        { binding: 4, resource: { buffer: this.tileHeaderBuffer } },
        { binding: 5, resource: { buffer: this.tileListBuffer } },
        { binding: 6, resource: { buffer: this.tileDebugBuffer } },
      ],
    });
  }

  private dispatchLightCulling(encoder: GPUCommandEncoder) {
    if (!this.lightCullingPipeline || !this.lightCullingBindGroup) return;
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.lightCullingPipeline);
    pass.setBindGroup(0, this.lightCullingBindGroup);
    pass.dispatchWorkgroups(this.tilesX, this.tilesY);
    pass.end();
  }

  private scheduleTileDebugCopy(encoder: GPUCommandEncoder) {
    if (!this.tileDebugEnabled || !this.tileDebugBuffer || !this.tileDebugStagingBuffer) return;
    if (this.tileDebugNeedsRead || this.tileDebugReadPromise) return;
    encoder.copyBufferToBuffer(this.tileDebugBuffer, 0, this.tileDebugStagingBuffer, 0, this.tileDebugByteLength);
    this.tileDebugNeedsRead = true;
  }

  beginGeometryPass(encoder: GPUCommandEncoder): GPURenderPassEncoder {
    return encoder.beginRenderPass(this.geoPassDesc);
  }

  lightingPass(encoder: GPUCommandEncoder) {
    this.writeTimestamp(encoder, 2);
    const swapView = this.renderer.context.getCurrentTexture().createView();
    try { const { Metrics } = require('../util/metrics'); if (Metrics.isEnabled()) Metrics.incTextureViews(1); } catch {}

    const lightDebug = QueryArgs.getString('lightDebug', '');
    if (lightDebug === 'albedo') {
      const device = this.renderer.device;
      if (!this.lightingDebugAlbedoPipeline) {
        const gbufferLayout = device.createBindGroupLayout({ entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        ]});
        const outputLayout = device.createBindGroupLayout({ entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
        ]});
        const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [ gbufferLayout, outputLayout ] });
        const module = device.createShaderModule({ code: lightingComputeDebugShader });
        this.lightingDebugAlbedoPipeline = device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'main' } });
      }

      if (this.lightingDebugAlbedoPipeline && this.lightingStorageView) {
        const gbufferBindGroup = device.createBindGroup({
          layout: this.lightingDebugAlbedoPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: this.sampler },
            { binding: 1, resource: this.gbuffer.albedoView! },
          ],
        });
        const outputBindGroup = device.createBindGroup({
          layout: this.lightingDebugAlbedoPipeline.getBindGroupLayout(1),
          entries: [ { binding: 0, resource: this.lightingStorageView } ],
        });

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.lightingDebugAlbedoPipeline);
        computePass.setBindGroup(0, gbufferBindGroup);
        computePass.setBindGroup(1, outputBindGroup);
        const size = this.renderer.presentationSize as [number, number];
        computePass.dispatchWorkgroups(Math.ceil(size[0] / 8), Math.ceil(size[1] / 8), 1);
        computePass.end();
      }

      const blitPass = encoder.beginRenderPass({
        colorAttachments: [{ view: swapView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      });
      if (this.lightingBlitPipeline && this.lightingBlitBindGroup) {
        blitPass.setPipeline(this.lightingBlitPipeline);
        blitPass.setBindGroup(0, this.lightingBlitBindGroup);
        blitPass.draw(3, 1, 0, 0);
      }
      blitPass.end();

      this.writeTimestamp(encoder, 3);
      this.resolveProfileQueries(encoder);
      return;
    } else if (lightDebug === 'dummy') {
      const device = this.renderer.device;
      if (this.dummyRenderMode) {
        if (!this.lightingTextureView) {
          this.writeTimestamp(encoder, 3);
          this.resolveProfileQueries(encoder);
          return;
        }
        if (!this.lightingDummyRenderPipeline) {
          const module = device.createShaderModule({
            code: `
            @fragment
            fn main(@location(0) _uv: vec2<f32>) -> @location(0) vec4<f32> {
              return vec4<f32>(1.0, 0.0, 1.0, 1.0);
            }`,
          });
          this.lightingDummyRenderPipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: this.fsVertModule, entryPoint: 'main' },
            fragment: { module, entryPoint: 'main', targets: [{ format: 'rgba16float' }] },
            primitive: { topology: 'triangle-list' },
          });
        }

        const renderPass = encoder.beginRenderPass({
          colorAttachments: [{
            view: this.lightingTextureView!,
            clearValue: { r: 1, g: 0, b: 1, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
        });
        if (this.lightingDummyRenderPipeline) {
          renderPass.setPipeline(this.lightingDummyRenderPipeline);
          renderPass.draw(3, 1, 0, 0);
        }
        renderPass.end();
      } else {
        if (!this.lightingDebugDummyPipeline) {
          const outputLayout = device.createBindGroupLayout({
            entries: [{
              binding: 0,
              visibility: GPUShaderStage.COMPUTE,
              storageTexture: { access: 'write-only', format: 'rgba16float' }
            }]
          });
          const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [outputLayout] });
          const module = device.createShaderModule({ code: lightingComputeDummyShader });
          this.lightingDebugDummyPipeline = device.createComputePipeline({
            layout: pipelineLayout,
            compute: { module, entryPoint: 'main' }
          });
        }

        if (this.lightingDebugDummyPipeline && this.lightingStorageView) {
          const outputBindGroup = device.createBindGroup({
            layout: this.lightingDebugDummyPipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: this.lightingStorageView }]
          });

          const computePass = encoder.beginComputePass();
          computePass.setPipeline(this.lightingDebugDummyPipeline);
          computePass.setBindGroup(0, outputBindGroup);
          const size = this.renderer.presentationSize as [number, number];
          computePass.dispatchWorkgroups(Math.ceil(size[0] / 8), Math.ceil(size[1] / 8), 1);
          computePass.end();
        }
      }

      const blitPass = encoder.beginRenderPass({
        colorAttachments: [{ view: swapView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      });
      if (this.lightingBlitPipeline && this.lightingBlitBindGroup) {
        blitPass.setPipeline(this.lightingBlitPipeline);
        blitPass.setBindGroup(0, this.lightingBlitBindGroup);
        blitPass.draw(3, 1, 0, 0);
      }
      blitPass.end();

      this.writeTimestamp(encoder, 3);
      this.resolveProfileQueries(encoder);
      return;
    }

    if (this.cameraBuffer) {
      const proj = this.renderer.projectionMatrix as unknown as Float32Array;
      const camWorld = this.renderer.flyControls.camera.GetMatrixWorld().toArray() as unknown as number[];
      const view = mat4.create();
      mat4.invert(view as any, Float32Array.from(camWorld) as any);
      const viewProj = mat4.create();
      mat4.multiply(viewProj as any, proj as any, view as any);
      const invViewProj = mat4.create();
      mat4.invert(invViewProj as any, viewProj as any);
      const buf = new Float32Array(68); // 4x mat4 + 1x vec4
      buf.set(view as any, 0);
      buf.set(proj as any, 16);
      buf.set(viewProj as any, 32);
      buf.set(invViewProj as any, 48);
      buf.set([camWorld[12], camWorld[13], camWorld[14], 1.0], 64);
      this.renderer.device.queue.writeBuffer(this.cameraBuffer, 0, buf);
    }
    if (this.configBuffer) {
      this.renderer.device.queue.writeBuffer(this.configBuffer, 0, new Uint32Array([this.lightsCount, this.lambertOnly ? 1 : 0, 0, 0]));
    }
    if (this.tileDebugEnabled && this.tileDebugBuffer && this.tileDebugZeroArray) {
      this.renderer.device.queue.writeBuffer(this.tileDebugBuffer, 0, this.tileDebugZeroArray.buffer);
    }

    if (this.lightsCount > 0 && this.lightUpdatePipeline && this.lightsComputeBindGroup) {
      const c = encoder.beginComputePass();
      c.setPipeline(this.lightUpdatePipeline);
      c.setBindGroup(0, this.lightsComputeBindGroup);
      const groups = Math.ceil(this.lightsCount / 64);
      c.dispatchWorkgroups(Math.max(1, groups));
      c.end();
    }

    if (this.lightCullingPipeline && this.lightsCount > 0) {
      this.updateLightCullingBindGroup();
      if (this.lightCullingBindGroup) {
        this.dispatchLightCulling(encoder);
        this.scheduleTileDebugCopy(encoder);
      }
    }

    const gsel = (QueryArgs.getString('gbuf', '') || '').toUpperCase();
    const isDebug = (gsel === 'G0' || gsel === 'G1' || gsel === 'G2');

    if (isDebug) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: swapView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      });
      if (this.lightingPipeline && this.lightingBindGroup) {
        pass.setPipeline(this.lightingPipeline);
        pass.setBindGroup(0, this.lightingBindGroup);
        pass.draw(3, 1, 0, 0);
      }
      pass.end();
    } else {
      if (this.lightingComputePipeline && this.lightingComputeGBufBindGroup && this.lightsBindGroup && this.lightingComputeOutputBindGroup) {
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.lightingComputePipeline);
        computePass.setBindGroup(0, this.lightingComputeGBufBindGroup);
        computePass.setBindGroup(1, this.lightsBindGroup);
        computePass.setBindGroup(2, this.lightingComputeOutputBindGroup);
        const size = this.renderer.presentationSize as [number, number];
        computePass.dispatchWorkgroups(Math.ceil(size[0] / 8), Math.ceil(size[1] / 8), 1);
        computePass.end();
      }

      const blitPass = encoder.beginRenderPass({
        colorAttachments: [{ view: swapView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      });
      if (this.lightingBlitPipeline && this.lightingBlitBindGroup) {
        blitPass.setPipeline(this.lightingBlitPipeline);
        blitPass.setBindGroup(0, this.lightingBlitBindGroup);
        blitPass.draw(3, 1, 0, 0);
      }
      blitPass.end();
    }

    this.writeTimestamp(encoder, 3);
    this.resolveProfileQueries(encoder);
  }

  private writeTimestamp(encoder: GPUCommandEncoder, slot: number) {
    if (!this.profileEnabled || !this.timestampQuerySet) return;
    const encoderAny = encoder as any;
    if (typeof encoderAny.writeTimestamp === 'function') {
      encoderAny.writeTimestamp(this.timestampQuerySet, slot);
    }
  }

  private resolveProfileQueries(encoder: GPUCommandEncoder) {
    if (!this.profileEnabled || !this.timestampQuerySet || !this.timestampResolveBuffer || !this.timestampReadBuffer) return;
    if (this.profileInFlight) return;
    const encoderAny = encoder as any;
    if (typeof encoderAny.resolveQuerySet === 'function') {
      encoderAny.resolveQuerySet(this.timestampQuerySet, 0, 4, this.timestampResolveBuffer, 0);
    } else {
      return;
    }
    encoder.copyBufferToBuffer(this.timestampResolveBuffer, 0, this.timestampReadBuffer, 0, 4 * 8);
    this.profilePending = true;
    this.profileInFlight = true;
  }

  processProfileReadback() {
    if (!this.profileEnabled || !this.profilePending || !this.timestampReadBuffer) return;
    if (this.profilePromise) return;
    const queue = this.renderer.device.queue;
    const buffer = this.timestampReadBuffer;
    this.profilePromise = queue.onSubmittedWorkDone()
      .then(() => buffer.mapAsync(GPUMapMode.READ))
      .then(() => {
        const data = new BigUint64Array(buffer.getMappedRange());
        const period = this.timestampPeriod > 0 ? this.timestampPeriod : 1;
        if (data.length >= 4) {
          const zero = BigInt(0);
          const geomTicks = data[1] > data[0] ? data[1] - data[0] : zero;
          const lightTicks = data[3] > data[2] ? data[3] - data[2] : zero;
          const totalTicks = geomTicks + lightTicks;
          const toMs = (ticks: bigint) => Number(ticks) * period / 1e6;
          if (this.profileFrameCounter % this.profileEvery === 0) {
            console.log('[Deferred][profile]', {
              frame: this.profileFrameCounter,
              geometryMs: toMs(geomTicks).toFixed(3),
              lightingMs: toMs(lightTicks).toFixed(3),
              totalMs: toMs(totalTicks).toFixed(3),
            });
          }
          this.profileFrameCounter++;
        }
        buffer.unmap();
        this.profilePending = false;
        this.profileInFlight = false;
      })
      .catch((err) => {
        console.warn('[Deferred] Failed to read timestamp query buffer:', err);
        this.profilePending = false;
        this.profileInFlight = false;
      })
      .finally(() => {
        this.profilePromise = null;
      });
  }

  drawGeometry(encoder: GPUCommandEncoder) {
    this.writeTimestamp(encoder, 0);
    const pass = this.beginGeometryPass(encoder);
    if (!this.sceneRenderer) { pass.end(); return; }
    this.sceneRenderer.render(pass);
    pass.end();
    this.writeTimestamp(encoder, 1);
  }

  processTileDebugReadback(queue: GPUQueue) {
    if (!this.tileDebugEnabled || !this.tileDebugNeedsRead || !this.tileDebugStagingBuffer) return;
    if (this.tileDebugReadPromise) return;
    const buffer = this.tileDebugStagingBuffer;
    this.tileDebugReadPromise = queue.onSubmittedWorkDone()
      .then(() => buffer.mapAsync(GPUMapMode.READ))
      .then(() => {
        const data = new Uint32Array(buffer.getMappedRange());
        const overflowCount = data.length > 0 ? data[0] : 0;
        if (overflowCount > 0) {
          this.tileOverflowFrames++;
          const flagged: number[] = [];
          for (let i = 1; i < data.length && flagged.length < 8; i++) {
            if (data[i] > 0) flagged.push(i - 1);
          }
          console.warn('[Deferred][tiles] overflow', { overflowCount, firstTiles: flagged });
        } else if (this.tileDebugEnabled) {
          if (this.tileOverflowFrames > 0) {
            console.log('[Deferred][tiles] overflow resolved');
          }
          this.tileOverflowFrames = 0;
        }
        buffer.unmap();
        this.tileDebugNeedsRead = false;
      })
      .catch((err) => {
        console.warn('[Deferred][tiles] debug read failed', err);
        this.tileDebugNeedsRead = false;
      })
      .finally(() => {
        this.tileDebugReadPromise = null;
      });
  }
}
