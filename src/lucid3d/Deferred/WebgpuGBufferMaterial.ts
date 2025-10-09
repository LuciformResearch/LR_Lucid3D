import { mat4 } from 'gl-matrix';
import { WebgpuMain } from '../WebgpuMain';
import { QueryArgs } from '../../components/WebgpuApp/util/query-args';
import { AbstractDynamicGeom, AttributeComponentCount, AttributePlacement, AttributeType } from '../WebgpuGeom';
import { WebgpuTransform } from '../WebgpuTransform';
import { TypedArray, WebgpuTexture } from '../Loaders/GLTF2WGPU2';
import { Metrics } from '../util/metrics';

let vertWGSL = require('./shaders/gbuffer_geometry.vert.wgsl').default;
let fragWGSL = require('./shaders/gbuffer_geometry.frag.wgsl').default;

export class WebgpuGBufferMaterial {
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup0: GPUBindGroup; // mvp/model/normal
  bindGroup1: GPUBindGroup; // base color sampler+texture
  bigVertexBuffer: GPUBuffer;
  locations: AttributePlacement[] = [];
  isReady: boolean = false;
  ready: Promise<void>;
  private trace: boolean = false;
  private onlyPosNormUv: boolean = false;
  private cachedStride: number = 0;
  private cachedPosCount: number = 0;
  baseColorTexture?: WebgpuTexture;
  metallicRoughnessTexture?: WebgpuTexture;
  occlusionTexture?: WebgpuTexture;
  emissiveTexture?: WebgpuTexture;
  normalTexture?: WebgpuTexture;
  // Skinning bind group per transform
  private bySkinBindGroup: { [index: string]: GPUBindGroup } = {};
  private dummySkinBuffer: GPUBuffer | null = null;
  private dummySkinBindGroup: GPUBindGroup | null = null;
  
  // Texture availability flags for debugging
  get textureFlags() {
    return {
      hasBaseTexture: !!this.baseColorTexture,
      hasMRTexture: !!this.metallicRoughnessTexture,
      hasNormalTexture: !!this.normalTexture,
      hasAOTexture: !!this.occlusionTexture,
      hasEmissiveTexture: !!this.emissiveTexture,
    };
  }

  constructor(private renderer: WebgpuMain, options?: { baseColorTexture?: WebgpuTexture, metallicRoughnessTexture?: WebgpuTexture, occlusionTexture?: WebgpuTexture, emissiveTexture?: WebgpuTexture, normalTexture?: WebgpuTexture, formats?: GPUTextureFormat[], sampleCount?: number }) {
    if (options?.baseColorTexture) this.baseColorTexture = options.baseColorTexture;
    if (options?.metallicRoughnessTexture) this.metallicRoughnessTexture = options.metallicRoughnessTexture;
    if (options?.occlusionTexture) this.occlusionTexture = options.occlusionTexture;
    if (options?.emissiveTexture) this.emissiveTexture = options.emissiveTexture;
    if (options?.normalTexture) this.normalTexture = options.normalTexture;
    this.trace = QueryArgs.getBool('trace', false) === true;
    this.onlyPosNormUv = (QueryArgs.getString('only', '') || '').toLowerCase() === 'posnormuv';
    this.ready = this.initialize(options).then(() => { this.isReady = true; });
  }

  private async initialize(options?: { formats?: GPUTextureFormat[], sampleCount?: number }) {
    // Only include attributes required by GBuffer shaders
    const defaultAttributes: AttributePlacement[] = [
      AttributePlacement.POSITION,
      AttributePlacement.NORMAL,
      AttributePlacement.TANGENT,
      AttributePlacement.TEXCOORD_0,
      AttributePlacement.JOINTS_0,
      AttributePlacement.WEIGHTS_0,
      AttributePlacement.JOINTS_1,
      AttributePlacement.WEIGHTS_1,
    ];
    this.locations = defaultAttributes;

    let arrayStride = 0;
    const attributes: GPUVertexAttribute[] = [];
    defaultAttributes.forEach((ap) => {
      const location = ap as number;
      const name = AttributePlacement[ap];
      const comp = AttributeComponentCount[name] as number;
      const type = AttributeType[name] as string;
      attributes.push({ format: (type + comp) as GPUVertexFormat, offset: arrayStride, shaderLocation: location });
      arrayStride += Float32Array.BYTES_PER_ELEMENT * comp;
    });
    const bigLayout: GPUVertexBufferLayout = { arrayStride, attributes };

    const device = this.renderer.device;
    const formats = options?.formats || [ this.renderer.presentationFormat, 'rgba8unorm', 'rgba8unorm' ];
    const sampleCount = options?.sampleCount || QueryArgs.getInt('samples', 1);
    const noCull = QueryArgs.getBool('nocull', false);
    const noDepth = QueryArgs.getBool('nodepth', false);

    // Choose fragment shader variant based on target count (2 or 3)
    const targetCount = formats.length;
    let fragModuleCode = fragWGSL as string;
    if (targetCount === 2) {
      fragModuleCode = `
      struct Uniforms {
        mvp : mat4x4<f32>,
        model : mat4x4<f32>,
        normal : mat4x4<f32>,
        hasBaseTexture : f32,
        hasMRTexture : f32,
        hasNormalTexture : f32,
        hasAOTexture : f32,
        hasEmissiveTexture : f32,
      };
      @group(0) @binding(0) var<uniform> uniforms : Uniforms;
      @group(1) @binding(0) var baseSampler: sampler;
      @group(1) @binding(1) var baseTexture: texture_2d<f32>;
      @group(1) @binding(2) var mrSampler: sampler;
      @group(1) @binding(3) var mrTexture: texture_2d<f32>;
      @group(1) @binding(8) var normalSampler: sampler;
      @group(1) @binding(9) var normalTexture: texture_2d<f32>;
      struct FSIn {
        @location(0) uv0: vec2<f32>,
        @location(1) normalW: vec3<f32>,
        @location(2) tangentW: vec3<f32>,
        @location(3) bitangentW: vec3<f32>,
      };
      fn octEncode(n: vec3<f32>) -> vec2<f32> {
        var x = n.x;
        var y = n.y;
        var z = n.z;
        let invL1 = 1.0 / (abs(x) + abs(y) + abs(z) + 1e-8);
        x = x * invL1;
        y = y * invL1;
        z = z * invL1;
        if (z < 0.0) {
          let sx = select(-1.0, 1.0, x >= 0.0);
          let sy = select(-1.0, 1.0, y >= 0.0);
          let nx = (1.0 - abs(y)) * sx;
          let ny = (1.0 - abs(x)) * sy;
          x = nx;
          y = ny;
        }
        return vec2<f32>(x, y);
      }
      struct FragOut {
        @location(0) g0: vec4<f32>, // albedo.rgb, metallic.a
        @location(1) g1: vec4<f32>, // normal(oct.xy), roughness.b
      };
      @fragment
      fn main(in: FSIn) -> FragOut {
        let uv = in.uv0;
        var albedo = vec4<f32>(1.0, 1.0, 1.0, 1.0);
        if (uniforms.hasBaseTexture > 0.5) { albedo = textureSample(baseTexture, baseSampler, uv); }
        var metallic = 0.0;
        var roughness = 1.0;
        if (uniforms.hasMRTexture > 0.5) {
          let mr = textureSample(mrTexture, mrSampler, uv);
          metallic = mr.b; roughness = mr.g;
        }
        let nW = normalize(in.normalW);
        var n = nW;
        let tLen = length(in.tangentW);
        let hasNormalTex = uniforms.hasNormalTexture > 0.5;
        if (tLen > 1e-5 && hasNormalTex) {
          let nTex = textureSampleLevel(normalTexture, normalSampler, uv, 0.0).xyz;
          let nTexDecoded = 2.0 * nTex - vec3<f32>(1.0, 1.0, 1.0);
          let tbn = mat3x3<f32>(normalize(in.tangentW), normalize(in.bitangentW), nW);
          n = normalize(tbn * nTexDecoded);
        }
        var out: FragOut;
        out.g0 = vec4<f32>(albedo.rgb, metallic);
        let enc = octEncode(n) * 0.5 + vec2<f32>(0.5, 0.5);
        out.g1 = vec4<f32>(enc, roughness, 1.0);
        return out;
      }`;
    }

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: device.createShaderModule({ code: vertWGSL }), entryPoint: 'main', buffers: [bigLayout] },
      fragment: {
        module: device.createShaderModule({ code: fragModuleCode }),
        entryPoint: 'main',
        targets: formats.map((fmt) => ({ format: fmt })),
      },
      primitive: { topology: 'triangle-list', cullMode: noCull ? undefined : 'back' },
      depthStencil: noDepth ? { depthWriteEnabled: false, depthCompare: 'always', format: 'depth24plus' } : { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
      multisample: { count: sampleCount },
    });

    // 3 mat4x4 (mvp, model, normal) + 5 floats (texture flags) = 192 + 32 = 224 bytes (aligned to 16-byte boundary)
    this.uniformBuffer = device.createBuffer({ size: 64 * 3 + 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', mipmapFilter: 'nearest' });

    const makeTex = (rgba: [number,number,number,number]) => {
      const t = device.createTexture({ size: [1,1,1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      device.queue.writeTexture({ texture: t }, new Uint8Array(rgba), { bytesPerRow: 4 }, { width:1, height:1, depthOrArrayLayers:1});
      return t;
    };

    // Start with placeholder 1x1 textures to avoid blocking on image decode
    const baseTexPlaceholder = makeTex([255,255,255,255]);
    const mrTexPlaceholder = makeTex([0,255,0,255]); // rough=1, metal=0
    const aoTexPlaceholder = makeTex([255,255,255,255]);
    const emTexPlaceholder = makeTex([0,0,0,255]);
    const nmTexPlaceholder = makeTex([128,128,255,255]);

    this.bindGroup0 = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]});
    if (Metrics.isEnabled()) Metrics.incBindGroups(1);
    const makeBG = (b, m, a, e, n) => {
      const entries: GPUBindGroupEntry[] = [];
      // Base color (0,1)
      entries.push({ binding: 0, resource: sampler });
      entries.push({ binding: 1, resource: b.createView() });
      // MR (2,3)
      entries.push({ binding: 2, resource: sampler });
      entries.push({ binding: 3, resource: m.createView() });
      // Optional AO (4,5) and Emissive (6,7) only if pipeline expects them (targetCount===3)
      if (formats.length === 3) {
        entries.push({ binding: 4, resource: sampler });
        entries.push({ binding: 5, resource: a.createView() });
        entries.push({ binding: 6, resource: sampler });
        entries.push({ binding: 7, resource: e.createView() });
      }
      // Normal (8,9)
      entries.push({ binding: 8, resource: sampler });
      entries.push({ binding: 9, resource: n.createView() });
      const bg = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(1), entries });
      if (Metrics.isEnabled()) Metrics.incBindGroups(1);
      return bg;
    };
    this.bindGroup1 = makeBG(baseTexPlaceholder, mrTexPlaceholder, aoTexPlaceholder, emTexPlaceholder, nmTexPlaceholder);

    // If real textures exist, update bind group asynchronously when ready
    const texPromises: Promise<GPUTexture | null>[] = [
      this.baseColorTexture ? this.baseColorTexture.GetGPUTex() : Promise.resolve(null),
      this.metallicRoughnessTexture ? this.metallicRoughnessTexture.GetGPUTex() : Promise.resolve(null),
      this.occlusionTexture ? this.occlusionTexture.GetGPUTex() : Promise.resolve(null),
      this.emissiveTexture ? this.emissiveTexture.GetGPUTex() : Promise.resolve(null),
      this.normalTexture ? this.normalTexture.GetGPUTex() : Promise.resolve(null),
    ];
    Promise.all(texPromises).then(([b, m, a, e, n]) => {
      const bb = b || baseTexPlaceholder;
      const mm = m || mrTexPlaceholder;
      const aa = a || aoTexPlaceholder;
      const ee = e || emTexPlaceholder;
      const nn = n || nmTexPlaceholder;
      this.bindGroup1 = makeBG(bb, mm, aa, ee, nn);
      if (this.trace) console.log('[GBufferMaterial] Textures ready; bind group updated');
    }).catch(() => {/* ignore */});
  }

  drawGeometryGBuffer(mvp: mat4, model: mat4, normal: mat4, passEncoder: GPURenderPassEncoder, geom: AbstractDynamicGeom) {
    if (!this.isReady) {
      if (this.trace) console.warn('[GBufferMaterial] Not ready yet, skipping draw');
      return;
    }
    // Build interleaved big vertex buffer similar to WebgpuMaterial
    let locationsNeeded = this.locations;
    let byLocationAttr: { [index: number]: any } = {};
    let indexAttr: any = undefined;
    for (let key in geom.byNameAttributes) {
      const a: any = geom.byNameAttributes[key];
      if (a.isIndices) indexAttr = a; else byLocationAttr[a.location] = a;
    }
    if (this.onlyPosNormUv) {
      const allowed = new Set<number>([
        AttributePlacement.POSITION as number,
        AttributePlacement.NORMAL as number,
        AttributePlacement.TEXCOORD_0 as number,
      ]);
      for (const k in byLocationAttr) {
        const loc = parseInt(k, 10);
        if (!allowed.has(loc)) byLocationAttr[loc] = undefined;
      }
      if (this.trace) console.log('[GBufferMaterial] only=posnormuv active');
    }
    let posAttr = byLocationAttr[AttributePlacement.POSITION as number];
    let posCount = posAttr ? posAttr.Count : 0;
    if (!posAttr || posCount <= 0) {
      // Nothing to draw
      return;
    }

    // Prepare per-location float buffers
    const buffers: (TypedArray | null)[] = new Array(locationsNeeded.length).fill(null);
    let arrayStride = 0;
    const updated: { updated: boolean } = { updated: false };
    for (let i = 0; i < locationsNeeded.length; i++) {
      const ap = locationsNeeded[i];
      const loc = ap as number;
      const name = AttributePlacement[ap];
      const comp = AttributeComponentCount[name] as number;
      arrayStride += Float32Array.BYTES_PER_ELEMENT * comp;
      const attr = byLocationAttr[loc];
      if (attr && !attr.isIndices) {
        // Use same approach as forward material
        buffers[i] = attr.getArrayBuffer(updated) as TypedArray;
      }
    }
    if (this.trace) {
      const posAttrDbg = byLocationAttr[AttributePlacement.POSITION as number];
      console.log('[GBufferMaterial] VB build', {
        posCount,
        arrayStride,
        hasIndex: !!indexAttr,
        posLen: posAttrDbg ? posAttrDbg.value?.length : 0,
      });
    }
    const needRebuild = (!this.bigVertexBuffer || this.bigVertexBuffer.size !== posCount * arrayStride || updated.updated || this.cachedStride !== arrayStride || this.cachedPosCount !== posCount);
    if (needRebuild) {
      // Do not destroy in-use buffer this frame; allocate a fresh one
      this.bigVertexBuffer = this.renderer.device.createBuffer({ size: posCount * arrayStride, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      if (Metrics.isEnabled()) Metrics.incBuffers(1);
      // Build interleaved CPU buffer once, then a single writeBuffer
      const floatsPerVertex = arrayStride / Float32Array.BYTES_PER_ELEMENT;
      const vb = new Float32Array(posCount * floatsPerVertex);
      for (let v = 0; v < posCount; v++) {
        let fOffset = v * floatsPerVertex;
        for (let i = 0; i < locationsNeeded.length; i++) {
          const ap = locationsNeeded[i];
          const name = AttributePlacement[ap];
          const comp = AttributeComponentCount[name] as number;
          const src = buffers[i] as any;
          if (src) {
            const start = v * comp;
            for (let k = 0; k < comp; k++) {
              vb[fOffset + k] = src[start + k];
            }
          } else {
            // Fill zeros if attribute missing
            for (let k = 0; k < comp; k++) vb[fOffset + k] = 0.0;
          }
          if (this.trace && v === 0) {
            const vals = src ? Array.from(src.slice(0, comp)) : new Array(comp).fill(0);
            console.log('[GBufferMaterial] First vertex slice', { attr: name, comp, values: vals });
          }
          fOffset += comp;
        }
      }
      this.renderer.device.queue.writeBuffer(this.bigVertexBuffer, 0, vb.buffer, 0, vb.byteLength);
      if (Metrics.isEnabled()) Metrics.addWrite(vb.byteLength);
      this.cachedStride = arrayStride;
      this.cachedPosCount = posCount;
    }

    // Write MVP, Model, Normal, and texture flags in a single upload (224 bytes)
    const m = mvp as unknown as Float32Array;
    const mdl = model as unknown as Float32Array;
    const nrm = normal as unknown as Float32Array;
    const q = this.renderer.device.queue;
    const mArr = (m instanceof Float32Array) ? m : Float32Array.from(m as unknown as number[]);
    const mdlArr = (mdl instanceof Float32Array) ? mdl : Float32Array.from(mdl as unknown as number[]);
    const nrmArr = (nrm instanceof Float32Array) ? nrm : Float32Array.from(nrm as unknown as number[]);

    // 3*16 floats for matrices + 8 floats for flags/padding = 56 floats (224 bytes)
    const packed = new Float32Array(16 * 3 + 8);
    packed.set(mArr, 0);
    packed.set(mdlArr, 16);
    packed.set(nrmArr, 32);
    packed[48] = this.baseColorTexture ? 1.0 : 0.0;
    packed[49] = this.metallicRoughnessTexture ? 1.0 : 0.0;
    packed[50] = this.normalTexture ? 1.0 : 0.0;
    packed[51] = this.occlusionTexture ? 1.0 : 0.0;
    packed[52] = this.emissiveTexture ? 1.0 : 0.0;
    // remaining 3 floats left as 0 for alignment
    q.writeBuffer(this.uniformBuffer, 0, packed.buffer, 0, packed.byteLength);
    if (Metrics.isEnabled()) Metrics.addWrite(packed.byteLength);
    if (this.trace) {
      console.log('[GBufferMaterial] Uniforms (single upload)', {
        totalBytes: packed.byteLength,
      });
    }

    // Draw
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup0);
    passEncoder.setBindGroup(1, this.bindGroup1);
    // Skinning group(2): bind real skin buffer only if mesh truly has skin, else dummy
    const noSkin = QueryArgs.getBool('noskin', false);
    const tr: WebgpuTransform | undefined = (geom as any).ownerTransform as WebgpuTransform | undefined;
    const hasRealSkin = (!!tr && (tr as any).mesh && (tr as any).mesh.skin && (tr as any).mesh.skin.joints && (tr as any).mesh.skin.joints.length > 0);
    if (!noSkin && hasRealSkin && tr && tr.skinBuffer) {
      const key = (tr as any).srcNodeId != null ? String((tr as any).srcNodeId) : String((tr as any));
      if (!this.bySkinBindGroup[key]) {
        this.bySkinBindGroup[key] = this.renderer.device.createBindGroup({
          layout: this.pipeline.getBindGroupLayout(2),
          entries: [{ binding: 0, resource: { buffer: tr.skinBuffer } }],
        });
      }
      passEncoder.setBindGroup(2, this.bySkinBindGroup[key]);
    } else {
      // Ensure a dummy buffer exists with useSkinning=0
      if (!this.dummySkinBuffer) {
        this.dummySkinBuffer = this.renderer.device.createBuffer({ size: 80, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.renderer.device.queue.writeBuffer(this.dummySkinBuffer, 0, new Int32Array([0]).buffer);
      }
      if (!this.dummySkinBindGroup) {
        this.dummySkinBindGroup = this.renderer.device.createBindGroup({
          layout: this.pipeline.getBindGroupLayout(2),
          entries: [{ binding: 0, resource: { buffer: this.dummySkinBuffer } }],
        });
      }
      passEncoder.setBindGroup(2, this.dummySkinBindGroup);
    }
    passEncoder.setVertexBuffer(0, this.bigVertexBuffer);
    if (indexAttr) {
      const ib = indexAttr.getWebgpuBuffer(this);
      passEncoder.setIndexBuffer(ib, 'uint16');
      passEncoder.drawIndexed(indexAttr.Count, 1, 0, 0);
    } else {
      passEncoder.draw(posCount, 1, 0, 0);
    }
  }
}
