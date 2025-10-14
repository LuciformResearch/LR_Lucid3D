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

  constructor(private renderer: WebgpuMain) {}

  async initialize(transforms?: WebgpuTransform[]) {
    const device = this.renderer.device;
    // Use nearest to avoid any potential filterable-float issues on some GPUs
    this.sampler = device.createSampler({ minFilter: 'nearest', magFilter: 'nearest' });
    this.fsVertModule = device.createShaderModule({ code: require('./shaders/fullscreen_triangle.wgsl').default });
    this.targetCount = Math.max(2, Math.min(3, QueryArgs.getInt('gbufTargets', 3) || 3));
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
    this.lightsCount = Math.max(0, Math.min(this.lightsMax, QueryArgs.getInt('lights', 0) || 0));
    this.createLightingPipeline();
    if (this.lightsCount > 0) {
      if (this.gbuffer.sampleCount !== 1) {
        console.warn('[Deferred] Multi-light requires samples=1 to sample depth. Disable lights or set ?samples=1.');
        this.lightsCount = 0;
      } else {
        this.setupLights();
      }
    }
    if (transforms) this.sceneRenderer = new WebgpuSceneRendererGBuffer(this.renderer, transforms, this.formats, this.gbuffer.sampleCount);
  }

  ensureTargets() {
    const device = this.renderer.device;
    const size = this.renderer.presentationSize as [number, number];

    this.gbuffer.resize();
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

  private createLightingPipeline() {
    const device = this.renderer.device;
    // Optional GBuffer debug visualizer via ?gbuf=G0|G1|G2
    const gsel = (QueryArgs.getString('gbuf', '') || '').toUpperCase();
    const flip = QueryArgs.getBool('flip', false) ? 'true' : 'false';
    const albedoOnly = QueryArgs.getBool('albedo', false) ? 'true' : 'false';
    let fragModule: GPUShaderModule;
    const isDebugGbuf = (gsel === 'G0' || gsel === 'G1' || gsel === 'G2');
    if (isDebugGbuf) {
      const useOct = QueryArgs.getBool('oct', true);
      const code = `
      // no sampler required for textureLoad path
      @group(0) @binding(1) var gAlbedoTex: texture_2d<f32>;
      @group(0) @binding(2) var gNormalRoughTex: texture_2d<f32>;
      ${this.targetCount === 3 ? '@group(0) @binding(3) var gEmissiveAoTex: texture_2d<f32>;' : ''}
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
        ${this.targetCount === 3 ? `let g2 = textureLoad(gEmissiveAoTex, coords, 0);
        let ao = g2.a;
        return vec4<f32>(vec3<f32>(ao, ao, ao), 1.0);` : `return vec4<f32>(0.0, 0.0, 0.0, 1.0);`}
      }`;
      fragModule = device.createShaderModule({ code });
    } else {
      const flipEnabled = QueryArgs.getBool('flip', false);
      const hasEmissive = this.targetCount === 3;
      const useOct = this.targetCount === 2 && QueryArgs.getBool('oct', true);
      const sampleMode: 'sample' | 'load' = this.lightsCount > 0 ? 'load' : 'sample';
      const modules = [
        new PBRCommonModule(),
        new DeferredGBufferModule({
          flip: flipEnabled,
          hasEmissiveAo: hasEmissive,
          octEncoded: useOct,
          sampleMode,
          includeDepth: this.lightsCount > 0,
        }),
        this.lightsCount > 0 ? new DeferredPointLightModule() : new DeferredDirectionalLightModule(),
      ];
      const template = this.lightsCount > 0
        ? deferredLightingMultiTemplate
        : deferredLightingTemplate;
      const { codeFrag } = ShaderComposer.compose('', template, modules);
      const bindings = this.buildGBufferBindingDeclarations({
        includeSampler: sampleMode === 'sample',
        hasEmissive,
        includeDepth: this.lightsCount > 0,
      });
      let lightingCode = codeFrag.replace('// @@BINDINGS', bindings);
      lightingCode = lightingCode.replace(
        'return vec4<f32>(color, 1.0);',
        `if (${albedoOnly}) {
    return vec4<f32>(albedo, 1.0);
  }
  return vec4<f32>(color, 1.0);`
      );
      fragModule = device.createShaderModule({ code: lightingCode });
    }
    if (this.lightsCount > 0) {
      const layout = device.createPipelineLayout({ bindGroupLayouts: [ this.makeGBufferBindGroupLayout(device, true), this.makeLightsBindGroupLayout(device) ] });
      this.lightingPipeline = device.createRenderPipeline({
        layout,
        vertex: { module: this.fsVertModule, entryPoint: 'main' },
        fragment: { module: fragModule, entryPoint: 'main', targets: [{ format: this.renderer.presentationFormat }] },
        primitive: { topology: 'triangle-list' },
      });
    } else {
      this.lightingPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: this.fsVertModule, entryPoint: 'main' },
        fragment: { module: fragModule, entryPoint: 'main', targets: [{ format: this.renderer.presentationFormat }] },
        primitive: { topology: 'triangle-list' },
      });
    }

    if (isDebugGbuf) {
      this.lightingBindGroup = device.createBindGroup({
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
    } else if (this.lightsCount > 0) {
      const entries: GPUBindGroupEntry[] = [];
      entries.push({ binding: 1, resource: this.gbuffer.albedoView });
      entries.push({ binding: 2, resource: this.gbuffer.normalRoughnessView! });
      if (this.targetCount === 3) entries.push({ binding: 3, resource: this.gbuffer.emissiveAoView! });
      entries.push({ binding: (this.targetCount === 3 ? 4 : 3), resource: this.gbuffer.depthMSAAView! });
      this.lightingBindGroup = device.createBindGroup({ layout: this.makeGBufferBindGroupLayout(device, true), entries });
      try { const { Metrics } = require('../util/metrics'); if (Metrics.isEnabled()) Metrics.incBindGroups(1); } catch {}
    } else {
      this.lightingBindGroup = device.createBindGroup({
        layout: this.lightingPipeline.getBindGroupLayout(0),
        entries: (
          this.targetCount === 3 ? [
            { binding: 0, resource: this.sampler },
            { binding: 1, resource: this.gbuffer.albedoView },
            { binding: 2, resource: this.gbuffer.normalRoughnessView },
            { binding: 3, resource: this.gbuffer.emissiveAoView },
          ] : [
            { binding: 0, resource: this.sampler },
            { binding: 1, resource: this.gbuffer.albedoView },
            { binding: 2, resource: this.gbuffer.normalRoughnessView },
          ]
        ),
      });
      try { const { Metrics } = require('../util/metrics'); if (Metrics.isEnabled()) Metrics.incBindGroups(1); } catch {}
    }
  }

  private makeGBufferBindGroupLayout(device: GPUDevice, includeDepth: boolean): GPUBindGroupLayout {
    const entries: GPUBindGroupLayoutEntry[] = [];
    entries.push({ binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } });
    entries.push({ binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } });
    if (this.targetCount === 3) entries.push({ binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } });
    if (includeDepth) entries.push({ binding: (this.targetCount === 3 ? 4 : 3), visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } });
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
    return device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ]});
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
    this.configBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.configBuffer, 0, new Uint32Array([this.lightsCount]));
    this.cameraBuffer = device.createBuffer({ size: 4*16*2, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.extentBuffer = device.createBuffer({ size: 4*8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const extentFloats = new Float32Array(8); extentFloats.set(min,0); extentFloats.set(max,4);
    device.queue.writeBuffer(this.extentBuffer, 0, extentFloats);
    this.lightUpdatePipeline = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: require('./shaders/light_update.wgsl').default }), entryPoint: 'main' } });
    this.lightsBindGroup = device.createBindGroup({ layout: this.makeLightsBindGroupLayout(device), entries: [
      { binding: 0, resource: { buffer: this.lightsBuffer } },
      { binding: 1, resource: { buffer: this.configBuffer } },
      { binding: 2, resource: { buffer: this.cameraBuffer } },
    ]});
    this.lightsComputeBindGroup = device.createBindGroup({ layout: this.lightUpdatePipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.lightsBuffer } },
      { binding: 1, resource: { buffer: this.configBuffer } },
      { binding: 2, resource: { buffer: this.extentBuffer } },
    ]});
  }

  onResize() {
    this.ensureTargets();
    // Recreate bind group because texture view changed
    const gsel = (QueryArgs.getString('gbuf', '') || '').toUpperCase();
    const isDebug = (gsel === 'G0' || gsel === 'G1' || gsel === 'G2');
    if (isDebug) {
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
    } else if (this.lightsCount > 0) {
      const entries: GPUBindGroupEntry[] = [];
      entries.push({ binding: 1, resource: this.gbuffer.albedoView });
      entries.push({ binding: 2, resource: this.gbuffer.normalRoughnessView! });
      if (this.targetCount === 3) entries.push({ binding: 3, resource: this.gbuffer.emissiveAoView! });
      entries.push({ binding: (this.targetCount === 3 ? 4 : 3), resource: this.gbuffer.depthMSAAView! });
      this.lightingBindGroup = this.renderer.device.createBindGroup({ layout: this.makeGBufferBindGroupLayout(this.renderer.device, true), entries });
      try { const { Metrics } = require('../util/metrics'); if (Metrics.isEnabled()) Metrics.incBindGroups(1); } catch {}
    } else {
      this.lightingBindGroup = this.renderer.device.createBindGroup({
        layout: this.lightingPipeline.getBindGroupLayout(0),
        entries: (
          this.targetCount === 3 ? [
            { binding: 0, resource: this.sampler },
            { binding: 1, resource: this.gbuffer.albedoView },
            { binding: 2, resource: this.gbuffer.normalRoughnessView },
            { binding: 3, resource: this.gbuffer.emissiveAoView },
          ] : [
            { binding: 0, resource: this.sampler },
            { binding: 1, resource: this.gbuffer.albedoView },
            { binding: 2, resource: this.gbuffer.normalRoughnessView },
          ]
        ),
      });
      try { const { Metrics } = require('../util/metrics'); if (Metrics.isEnabled()) Metrics.incBindGroups(1); } catch {}
    }
  }

  beginGeometryPass(encoder: GPUCommandEncoder): GPURenderPassEncoder {
    return encoder.beginRenderPass(this.geoPassDesc);
  }

  lightingPass(encoder: GPUCommandEncoder) {
    const swapView = this.renderer.context.getCurrentTexture().createView();
    // Metrics: count view creations when enabled
    try { const { Metrics } = require('../util/metrics'); if (Metrics.isEnabled()) Metrics.incTextureViews(1); } catch {}
    // Update camera uniforms for lights
    if (this.lightsCount > 0 && this.cameraBuffer) {
      const proj = this.renderer.projectionMatrix as unknown as Float32Array;
      const camWorld = this.renderer.flyControls.camera.GetMatrixWorld().toArray() as unknown as number[];
      const view = mat4.create();
      mat4.invert(view as any, Float32Array.from(camWorld) as any);
      const viewProj = mat4.create();
      mat4.multiply(viewProj as any, proj as any, view as any);
      const invViewProj = mat4.create();
      mat4.invert(invViewProj as any, viewProj as any);
      const buf = new Float32Array(32);
      buf.set(viewProj as any, 0); buf.set(invViewProj as any, 16);
      this.renderer.device.queue.writeBuffer(this.cameraBuffer, 0, buf);
    }
    // Compute lights update (simple y movement)
    if (this.lightsCount > 0 && this.lightUpdatePipeline && this.lightsComputeBindGroup) {
      const c = encoder.beginComputePass();
      c.setPipeline(this.lightUpdatePipeline);
      c.setBindGroup(0, this.lightsComputeBindGroup);
      c.dispatchWorkgroups(Math.ceil(this.lightsMax / 64));
      c.end();
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: swapView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.lightingPipeline);
    if (this.lightsCount > 0) {
      pass.setBindGroup(0, this.lightingBindGroup);
      pass.setBindGroup(1, this.lightsBindGroup!);
    } else {
      pass.setBindGroup(0, this.lightingBindGroup);
    }
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  drawGeometry(encoder: GPUCommandEncoder) {
    const pass = this.beginGeometryPass(encoder);
    if (!this.sceneRenderer) { pass.end(); return; }
    this.sceneRenderer.render(pass);
    pass.end();
  }
}
