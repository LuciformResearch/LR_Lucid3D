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
  private debugUsesSampler: boolean = false;

  private fsVertModule: GPUShaderModule;
  private lightingFragModule: GPUShaderModule;

  private geoPassDesc: GPURenderPassDescriptor;
  public sceneRenderer?: WebgpuSceneRendererGBuffer;
  // Geometry pipeline formats (G0/G1/G2)
  private formats: GPUTextureFormat[] = [];

  constructor(private renderer: WebgpuMain) {}

  async initialize(transforms?: WebgpuTransform[]) {
    const device = this.renderer.device;
    // Use nearest to avoid any potential filterable-float issues on some GPUs
    this.sampler = device.createSampler({ minFilter: 'nearest', magFilter: 'nearest' });
    this.fsVertModule = device.createShaderModule({ code: require('./shaders/fullscreen_triangle.wgsl').default });
    this.lightingFragModule = device.createShaderModule({ code: require('./shaders/deferred_lighting.wgsl').default });
    this.formats = [
      this.renderer.presentationFormat,                  // G0 albedo+metallic
      'rgba8unorm',                                      // G1 normal+roughness (changed from rgba16float)
      'rgba8unorm',                                      // G2 emissive+ao
    ] as GPUTextureFormat[];
    const samples = QueryArgs.getInt('samples', 1);
    this.gbuffer = new GBuffer(this.renderer, {
      albedo: this.formats[0],
      normalRoughness: this.formats[1],
      emissiveAo: this.formats[2],
      depth: 'depth24plus',
    }, samples);
    this.ensureTargets();
    this.createLightingPipeline();
    if (transforms) this.sceneRenderer = new WebgpuSceneRendererGBuffer(this.renderer, transforms, this.formats);
  }

  ensureTargets() {
    const device = this.renderer.device;
    const size = this.renderer.presentationSize as [number, number];

    this.gbuffer.resize();
    const msaa = this.gbuffer.sampleCount > 1;
    const albedoAttachment: GPURenderPassColorAttachment = msaa ? {
      view: this.gbuffer.albedoMSAAView!,
      resolveTarget: this.gbuffer.albedoView!,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    } : {
      view: this.gbuffer.albedoView!,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    };
    const normalAttachment: GPURenderPassColorAttachment = msaa ? {
      view: this.gbuffer.normalRoughnessMSAAView!,
      resolveTarget: this.gbuffer.normalRoughnessView!,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    } : {
      view: this.gbuffer.normalRoughnessView!,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    };
    const emissiveAttachment: GPURenderPassColorAttachment = msaa ? {
      view: this.gbuffer.emissiveAoMSAAView!,
      resolveTarget: this.gbuffer.emissiveAoView!,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    } : {
      view: this.gbuffer.emissiveAoView!,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    };

    this.geoPassDesc = {
      colorAttachments: [albedoAttachment, normalAttachment, emissiveAttachment],
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
    if (gsel === 'G0' || gsel === 'G1' || gsel === 'G2') {
      const code = `
      @group(0) @binding(1) var gAlbedoTex: texture_2d<f32>;
      @group(0) @binding(2) var gNormalRoughTex: texture_2d<f32>;
      @group(0) @binding(3) var gEmissiveAoTex: texture_2d<f32>;
      struct FSIn { @location(0) uv: vec2<f32>, };
      @fragment fn main(in: FSIn) -> @location(0) vec4<f32> {
        var uv = in.uv;
        if (${flip}) { uv = vec2<f32>(uv.x, 1.0 - uv.y); }
        
        // Clamp UVs to avoid out-of-bounds access
        uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
        let dims = textureDimensions(gAlbedoTex);
        let coords = vec2<i32>(i32(uv.x * f32(dims.x - 1)), i32(uv.y * f32(dims.y - 1)));
        
        if (${gsel === 'G0' ? 'true' : 'false'}) {
          let g0 = textureLoad(gAlbedoTex, coords, 0);
          // G0 contains linear albedo, no gamma correction needed
          return g0;
        }
        if (${gsel === 'G1' ? 'true' : 'false'}) {
          let g1 = textureLoad(gNormalRoughTex, coords, 0);
          // Visualize normals in [0,1]
          let nVis = 0.5 * g1.xyz + vec3<f32>(0.5);
          return vec4<f32>(nVis, 1.0);
        }
        // G2: visualize AO in grayscale
        let g2 = textureLoad(gEmissiveAoTex, coords, 0);
        let ao = g2.a;
        return vec4<f32>(vec3<f32>(ao, ao, ao), 1.0);
      }`;
      fragModule = device.createShaderModule({ code });
    } else {
      // Modify the lighting shader to support albedo-only mode
      const lightingCode = require('./shaders/deferred_lighting.wgsl').default;
      const modifiedCode = lightingCode.replace(
        '// DEBUG: Force albedo-only rendering (uncomment to debug)\n  // return vec4<f32>(g0.rgb, 1.0);',
        `// DEBUG: Force albedo-only rendering
  if (${albedoOnly}) {
    return vec4<f32>(g0.rgb, 1.0);
  }`
      );
      fragModule = device.createShaderModule({ code: modifiedCode });
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

    this.lightingBindGroup = device.createBindGroup({
      layout: this.lightingPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 1, resource: this.gbuffer.albedoView },
        { binding: 2, resource: this.gbuffer.normalRoughnessView },
        { binding: 3, resource: this.gbuffer.emissiveAoView },
      ],
    });
  }

  onResize() {
    this.ensureTargets();
    // Recreate bind group because texture view changed
    this.lightingBindGroup = this.renderer.device.createBindGroup({
      layout: this.lightingPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 1, resource: this.gbuffer.albedoView },
        { binding: 2, resource: this.gbuffer.normalRoughnessView },
        { binding: 3, resource: this.gbuffer.emissiveAoView },
      ],
    });
  }

  beginGeometryPass(encoder: GPUCommandEncoder): GPURenderPassEncoder {
    return encoder.beginRenderPass(this.geoPassDesc);
  }

  lightingPass(encoder: GPUCommandEncoder) {
    const swapView = this.renderer.context.getCurrentTexture().createView();
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
