import { WebgpuMain } from '../WebgpuMain';
import { QueryArgs } from '../../components/WebgpuApp/util/query-args';
import { GBuffer } from './GBuffer';
import { WebgpuSceneRendererGBuffer } from './WebgpuSceneRendererGBuffer';
import { WebgpuTransform } from '../WebgpuTransform';

export class DeferredRenderer {
  private gbuffer: GBuffer;

  private sampler: GPUSampler;
  private lightingPipeline: GPURenderPipeline;
  private lightingBindGroup: GPUBindGroup;
  // Lighting shaders use textureLoad; no sampler needed in bindgroup

  private fsVertModule: GPUShaderModule;
  private lightingFragModule: GPUShaderModule;

  private geoPassDesc: GPURenderPassDescriptor;
  public sceneRenderer?: WebgpuSceneRendererGBuffer;
  // Geometry pipeline formats (G0/G1/G2)
  private formats: GPUTextureFormat[] = [];
  private targetCount: number = 3;

  constructor(private renderer: WebgpuMain) {}

  async initialize(transforms?: WebgpuTransform[]) {
    const device = this.renderer.device;
    // Use nearest to avoid any potential filterable-float issues on some GPUs
    this.sampler = device.createSampler({ minFilter: 'nearest', magFilter: 'nearest' });
    this.fsVertModule = device.createShaderModule({ code: require('./shaders/fullscreen_triangle.wgsl').default });
    this.lightingFragModule = device.createShaderModule({ code: require('./shaders/deferred_lighting.wgsl').default });
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
    this.createLightingPipeline();
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
      // Modify the lighting shader to support albedo-only mode
      let lightingCode = require('./shaders/deferred_lighting.wgsl').default as string;
      if (this.targetCount === 2) {
        // Remove binding(3) usage and set g2 defaults inside shader
        lightingCode = lightingCode.replace('@group(0) @binding(3) var gEmissiveAoTex: texture_2d<f32>;', '')
          .replace(/let g2 = textureSampleLevel\(gEmissiveAoTex, gSampler, uv, 0.0\);/g, 'let g2 = vec4<f32>(0.0, 0.0, 0.0, 1.0);');
        if (QueryArgs.getBool('oct', true)) {
          const octFn = `\nfn octDecode(e: vec2<f32>) -> vec3<f32> {\n  var v = vec3<f32>(e.x, e.y, 1.0 - abs(e.x) - abs(e.y));\n  if (v.z < 0.0) {\n    let s = vec2<f32>(select(-1.0, 1.0, v.x >= 0.0), select(-1.0, 1.0, v.y >= 0.0));\n    let xy = (1.0 - abs(vec2<f32>(v.y, v.x))) * s;\n    v = vec3<f32>(xy.x, xy.y, v.z);\n  }\n  return normalize(v);\n}\n`;
          lightingCode = octFn + lightingCode;
          lightingCode = lightingCode.replace('let n = normalize(g1.xyz);', 'let n = normalize(octDecode(g1.rg * 2.0 - vec2<f32>(1.0, 1.0)));');
          lightingCode = lightingCode.replace('let roughness = clamp(g1.a, 0.04, 1.0);', 'let roughness = clamp(g1.b, 0.04, 1.0);');
        }
      }
      const modifiedCode = lightingCode.replace(
        '// DEBUG: Force albedo-only rendering (uncomment to debug)\n  // return vec4<f32>(g0.rgb, 1.0);',
        `// DEBUG: Force albedo-only rendering
  if (${albedoOnly}) {
    return vec4<f32>(g0.rgb, 1.0);
  }`
      );
      fragModule = device.createShaderModule({ code: modifiedCode });
      // lighting path uses sampler + textureSampleLevel
    }
    this.lightingPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: this.fsVertModule, entryPoint: 'main' },
      fragment: {
        module: fragModule,
        entryPoint: 'main',
        targets: [{ format: this.renderer.presentationFormat }],
      },
      primitive: { topology: 'triangle-list' },
    });

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
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: swapView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.lightingPipeline);
    pass.setBindGroup(0, this.lightingBindGroup);
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
