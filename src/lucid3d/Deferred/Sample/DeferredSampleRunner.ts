import { mat4, vec3, vec4 } from 'wgpu-matrix';
import { GUI } from 'dat.gui';
import { WebgpuMain } from '../../WebgpuMain';
import { QueryArgs } from '../../../components/WebgpuApp/util/query-args';
import { mesh } from './mesh/stanfordDragon';

const vertexWriteGBuffersWGSL = require('./shaders/vertexWriteGBuffers.wgsl').default as string;
const fragmentWriteGBuffersWGSL = require('./shaders/fragmentWriteGBuffers.wgsl').default as string;
const vertexTextureQuadWGSL = require('./shaders/vertexTextureQuad.wgsl').default as string;
const fragmentGBuffersDebugViewWGSL = require('./shaders/fragmentGBuffersDebugView.wgsl').default as string;
const fragmentDeferredRenderingWGSL = require('./shaders/fragmentDeferredRendering.wgsl').default as string;
const lightUpdateWGSL = require('./shaders/lightUpdate.wgsl').default as string;

type SampleMode = 'rendering' | 'gBuffers view';

const kMaxNumLights = 1024;
const kLightDataStride = 8;

export class DeferredSampleRunner {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;

  private vertexBuffer!: GPUBuffer;
  private indexBuffer!: GPUBuffer;
  private indexCount: number = 0;

  private gbufferNormal!: GPUTexture;
  private gbufferAlbedo!: GPUTexture;
  private gbufferDepth!: GPUTexture;
  private gbufferViews: GPUTextureView[] = [];

  private writeGBuffersPipeline!: GPURenderPipeline;
  private gbufferDebugPipeline!: GPURenderPipeline;
  private deferredPipeline!: GPURenderPipeline;
  private lightUpdatePipeline!: GPUComputePipeline;
  private gbufferTexturesLayout!: GPUBindGroupLayout;
  private lightsLayout!: GPUBindGroupLayout;

  private modelUniformBuffer!: GPUBuffer;
  private cameraUniformBuffer!: GPUBuffer;
  private configUniformBuffer!: GPUBuffer;
  private lightExtentBuffer!: GPUBuffer;
  private lightsBuffer!: GPUBuffer;

  private sceneBindGroup!: GPUBindGroup;
  private gbufferTexturesBindGroup!: GPUBindGroup;
  private lightsBindGroup!: GPUBindGroup;
  private lightsComputeBindGroup!: GPUBindGroup;

  private gbufferPassDesc!: GPURenderPassDescriptor;
  private finalPassDesc!: GPURenderPassDescriptor;

  private projectionMatrix = mat4.create();
  private eyePosition = vec3.fromValues(0, 50, -100);
  private upVector = vec3.fromValues(0, 1, 0);
  private origin = vec3.fromValues(0, 0, 0);

  private gui?: GUI;
  private settings: { mode: SampleMode; numLights: number };
  private configScratch = new Uint32Array(1);

  private lightExtentMin = vec3.fromValues(-50, -30, -50);
  private lightExtentMax = vec3.fromValues(50, 50, 50);

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

  constructor(private main: WebgpuMain) {
    this.device = main.device;
    this.context = main.context;
    this.format = main.presentationFormat;
    this.settings = {
      mode: 'rendering',
      numLights: Math.min(128, kMaxNumLights),
    };
  }

  async initialize(): Promise<void> {
    this.createVertexBuffers();
    this.createUniformBuffers();
    this.createPipelines();
    this.createBindGroups();
    this.createGui();
    this.profileEnabled = QueryArgs.getBool('profile', false) && this.device.features.has('timestamp-query');
    if (this.profileEnabled) this.initializeProfiling();
    this.updateProjectionMatrix();
  }

  resize(width: number, height: number) {
    this.destroyGbuffer();
    this.createGbuffer(width, height);
    this.updateGbufferBindGroup();
    this.updateProjectionMatrix();
    this.recreateDebugPipeline(width, height);
  }

  frame(): void {
    this.updateCameraBuffer();
    this.updateConfigBuffer();

    const encoder = this.device.createCommandEncoder();
    this.writeTimestamp(encoder, 0);
    this.recordGeometryPass(encoder);
    this.writeTimestamp(encoder, 1);
    this.recordLightUpdatePass(encoder);
    this.writeTimestamp(encoder, 2);
    this.recordLightingPass(encoder);
    this.writeTimestamp(encoder, 3);
    this.resolveProfileQueries(encoder);

    this.device.queue.submit([encoder.finish()]);
    this.processProfileReadback();
  }

  dispose() {
    this.gui?.destroy();
    this.destroyGbuffer();
    this.vertexBuffer.destroy();
    this.indexBuffer.destroy();
    this.modelUniformBuffer.destroy();
    this.cameraUniformBuffer.destroy();
    this.configUniformBuffer.destroy();
    this.lightExtentBuffer.destroy();
    this.lightsBuffer.destroy();
    this.timestampResolveBuffer?.destroy();
    this.timestampReadBuffer?.destroy();
  }

  private createVertexBuffers() {
    const vertexStride = 8;
    this.indexCount = mesh.triangles.length * 3;

    this.vertexBuffer = this.device.createBuffer({
      label: 'DeferredSample vertex buffer',
      size: mesh.positions.length * vertexStride * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    const vertexMapping = new Float32Array(this.vertexBuffer.getMappedRange());
    for (let i = 0; i < mesh.positions.length; ++i) {
      const base = vertexStride * i;
      vertexMapping.set(mesh.positions[i], base);
      vertexMapping.set(mesh.normals[i], base + 3);
      vertexMapping.set(mesh.uvs[i], base + 6);
    }
    this.vertexBuffer.unmap();

    this.indexBuffer = this.device.createBuffer({
      label: 'DeferredSample index buffer',
      size: this.indexCount * Uint16Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.INDEX,
      mappedAtCreation: true,
    });
    const indexMapping = new Uint16Array(this.indexBuffer.getMappedRange());
    for (let i = 0; i < mesh.triangles.length; ++i) {
      indexMapping.set(mesh.triangles[i], i * 3);
    }
    this.indexBuffer.unmap();
  }

  private createUniformBuffers() {
    this.modelUniformBuffer = this.device.createBuffer({
      label: 'DeferredSample model uniform',
      size: 2 * 16 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.cameraUniformBuffer = this.device.createBuffer({
      label: 'DeferredSample camera uniform',
      size: 2 * 16 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.configUniformBuffer = this.device.createBuffer({
      label: 'DeferredSample config uniform',
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.configUniformBuffer.getMappedRange())[0] = this.settings.numLights;
    this.configUniformBuffer.unmap();

    this.lightExtentBuffer = this.device.createBuffer({
      label: 'DeferredSample light extent',
      size: 8 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const extentData = new Float32Array(8);
    extentData.set(this.lightExtentMin, 0);
    extentData.set(this.lightExtentMax, 4);
    this.device.queue.writeBuffer(this.lightExtentBuffer, 0, extentData);

    const bufferSize = Float32Array.BYTES_PER_ELEMENT * kLightDataStride * kMaxNumLights;
    this.lightsBuffer = this.device.createBuffer({
      label: 'DeferredSample lights storage',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    const lightData = new Float32Array(this.lightsBuffer.getMappedRange());
    const extent = vec3.sub(this.lightExtentMax, this.lightExtentMin);
    const tmp = vec4.create();
    for (let i = 0; i < kMaxNumLights; ++i) {
      let base = i * kLightDataStride;
      tmp[0] = Math.random() * extent[0] + this.lightExtentMin[0];
      tmp[1] = Math.random() * extent[1] + this.lightExtentMin[1];
      tmp[2] = Math.random() * extent[2] + this.lightExtentMin[2];
      tmp[3] = 1;
      lightData.set(tmp, base);
      tmp[0] = Math.random() * 2;
      tmp[1] = Math.random() * 2;
      tmp[2] = Math.random() * 2;
      tmp[3] = 20;
      lightData.set(tmp, base + 4);
    }
    this.lightsBuffer.unmap();
  }

  private createGbuffer(width: number, height: number) {
    const size: GPUExtent3D = [width, height, 1];
    this.gbufferNormal = this.device.createTexture({
      size,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba16float',
    });
    this.gbufferAlbedo = this.device.createTexture({
      size,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'bgra8unorm',
    });
    this.gbufferDepth = this.device.createTexture({
      size,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'depth24plus',
    });
    this.gbufferViews = [
      this.gbufferNormal.createView(),
      this.gbufferAlbedo.createView(),
      this.gbufferDepth.createView(),
    ];
    this.gbufferPassDesc = {
      colorAttachments: [
        {
          view: this.gbufferViews[0],
          clearValue: { r: 0, g: 0, b: 1, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
        {
          view: this.gbufferViews[1],
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.gbufferViews[2],
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
    this.finalPassDesc = {
      colorAttachments: [
        {
          view: undefined,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
  }

  private destroyGbuffer() {
    this.gbufferNormal?.destroy();
    this.gbufferAlbedo?.destroy();
    this.gbufferDepth?.destroy();
    this.gbufferViews = [];
  }

  private createPipelines() {
    const size = this.main.presentationSize;
    this.createGbuffer(size[0], size[1]);

    this.writeGBuffersPipeline = this.device.createRenderPipeline({
      label: 'DeferredSample write G-buffer',
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({ code: vertexWriteGBuffersWGSL }),
        buffers: [
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 8,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: Float32Array.BYTES_PER_ELEMENT * 3, format: 'float32x3' },
              { shaderLocation: 2, offset: Float32Array.BYTES_PER_ELEMENT * 6, format: 'float32x2' },
            ],
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({ code: fragmentWriteGBuffersWGSL }),
        targets: [
          { format: 'rgba16float' },
          { format: 'bgra8unorm' },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    this.gbufferTexturesLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    this.lightsLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    this.deferredPipeline = this.device.createRenderPipeline({
      label: 'DeferredSample final lighting',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.gbufferTexturesLayout, this.lightsLayout] }),
      vertex: { module: this.device.createShaderModule({ code: vertexTextureQuadWGSL }) },
      fragment: {
        module: this.device.createShaderModule({ code: fragmentDeferredRenderingWGSL }),
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.lightUpdatePipeline = this.device.createComputePipeline({
      label: 'DeferredSample light update',
      layout: 'auto',
      compute: { module: this.device.createShaderModule({ code: lightUpdateWGSL }) },
    });
  }

  private recreateDebugPipeline(width: number, height: number) {
    this.gbufferDebugPipeline = this.device.createRenderPipeline({
      label: 'DeferredSample gbuffer debug',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.gbufferTexturesLayout],
      }),
      vertex: { module: this.device.createShaderModule({ code: vertexTextureQuadWGSL }) },
      fragment: {
        module: this.device.createShaderModule({ code: fragmentGBuffersDebugViewWGSL }),
        targets: [{ format: this.format }],
        constants: {
          canvasSizeWidth: width,
          canvasSizeHeight: height,
        },
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  private createBindGroups() {
    const sceneLayout = this.writeGBuffersPipeline.getBindGroupLayout(0);
    this.sceneBindGroup = this.device.createBindGroup({
      layout: sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.modelUniformBuffer } },
        { binding: 1, resource: { buffer: this.cameraUniformBuffer } },
      ],
    });

    this.updateGbufferBindGroup();

    this.lightsBindGroup = this.device.createBindGroup({
      layout: this.lightsLayout,
      entries: [
        { binding: 0, resource: { buffer: this.lightsBuffer } },
        { binding: 1, resource: { buffer: this.configUniformBuffer } },
        { binding: 2, resource: { buffer: this.cameraUniformBuffer } },
      ],
    });

    this.lightsComputeBindGroup = this.device.createBindGroup({
      layout: this.lightUpdatePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.lightsBuffer } },
        { binding: 1, resource: { buffer: this.configUniformBuffer } },
        { binding: 2, resource: { buffer: this.lightExtentBuffer } },
      ],
    });

    const modelMatrix = mat4.translation([0, -45, 0]);
    this.device.queue.writeBuffer(
      this.modelUniformBuffer,
      0,
      modelMatrix.buffer,
      modelMatrix.byteOffset,
      modelMatrix.byteLength,
    );
    const invertTranspose = mat4.invert(modelMatrix);
    mat4.transpose(invertTranspose, invertTranspose);
    this.device.queue.writeBuffer(
      this.modelUniformBuffer,
      64,
      invertTranspose.buffer,
      invertTranspose.byteOffset,
      invertTranspose.byteLength,
    );
  }

  private updateGbufferBindGroup() {
    if (!this.gbufferTexturesLayout || this.gbufferViews.length !== 3) return;
    this.gbufferTexturesBindGroup = this.device.createBindGroup({
      layout: this.gbufferTexturesLayout,
      entries: [
        { binding: 0, resource: this.gbufferViews[0] },
        { binding: 1, resource: this.gbufferViews[1] },
        { binding: 2, resource: this.gbufferViews[2] },
      ],
    });
  }

  private createGui() {
    const enableGui = !QueryArgs.getBool('nogui', false);
    if (!enableGui) return;
    this.gui = new GUI();
    this.gui.domElement.style.position = 'absolute';
    this.gui.add(this.settings, 'mode', ['rendering', 'gBuffers view'] as SampleMode[]);
    this.gui.add(this.settings, 'numLights', 1, kMaxNumLights, 1).onChange((value: number) => {
      this.settings.numLights = Math.min(kMaxNumLights, Math.max(1, Math.floor(value)));
      this.updateConfigBuffer();
    });
  }

  private updateProjectionMatrix() {
    const aspect = this.main.presentationSize[0] / this.main.presentationSize[1];
    this.projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 2000);
  }

  private updateCameraBuffer() {
    const rad = Math.PI * (Date.now() / 5000);
    const rotation = mat4.rotateY(mat4.translation(this.origin), rad);
    const rotatedEye = vec3.transformMat4(this.eyePosition, rotation);
    const viewMatrix = mat4.lookAt(rotatedEye, this.origin, this.upVector);
    const viewProj = mat4.multiply(this.projectionMatrix, viewMatrix);
    this.device.queue.writeBuffer(
      this.cameraUniformBuffer,
      0,
      viewProj.buffer,
      viewProj.byteOffset,
      viewProj.byteLength,
    );
    const invViewProj = mat4.invert(viewProj);
    this.device.queue.writeBuffer(
      this.cameraUniformBuffer,
      64,
      invViewProj.buffer,
      invViewProj.byteOffset,
      invViewProj.byteLength,
    );
  }

  private updateConfigBuffer() {
    this.configScratch[0] = this.settings.numLights;
    this.device.queue.writeBuffer(this.configUniformBuffer, 0, this.configScratch);
  }

  private recordGeometryPass(encoder: GPUCommandEncoder) {
    const pass = encoder.beginRenderPass(this.gbufferPassDesc);
    pass.setPipeline(this.writeGBuffersPipeline);
    pass.setBindGroup(0, this.sceneBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.drawIndexed(this.indexCount);
    pass.end();
  }

  private recordLightUpdatePass(encoder: GPUCommandEncoder) {
    const compute = encoder.beginComputePass();
    compute.setPipeline(this.lightUpdatePipeline);
    compute.setBindGroup(0, this.lightsComputeBindGroup);
    compute.dispatchWorkgroups(Math.ceil(kMaxNumLights / 64));
    compute.end();
  }

  private recordLightingPass(encoder: GPUCommandEncoder) {
    this.finalPassDesc.colorAttachments![0].view = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass(this.finalPassDesc);
    if (this.settings.mode === 'gBuffers view') {
      pass.setPipeline(this.gbufferDebugPipeline);
      pass.setBindGroup(0, this.gbufferTexturesBindGroup);
    } else {
      pass.setPipeline(this.deferredPipeline);
      pass.setBindGroup(0, this.gbufferTexturesBindGroup);
      pass.setBindGroup(1, this.lightsBindGroup);
    }
    pass.draw(6);
    pass.end();
  }

  private initializeProfiling() {
    try {
      this.timestampQuerySet = this.device.createQuerySet({ type: 'timestamp', count: 4 });
      this.timestampResolveBuffer = this.device.createBuffer({
        size: 4 * 8,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE,
      });
      this.timestampReadBuffer = this.device.createBuffer({
        size: 4 * 8,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const limits = (this.main.adapter && (this.main.adapter as any).limits) || undefined;
      this.timestampPeriod = limits && typeof limits.timestampPeriod === 'number' ? limits.timestampPeriod : 1;
      this.profileEvery = Math.max(1, QueryArgs.getInt('profileEvery', 30) || 30);
    } catch (err) {
      console.warn('[DeferredSample] Failed to init timestamp queries', err);
      this.profileEnabled = false;
    }
  }

  private writeTimestamp(encoder: GPUCommandEncoder, slot: number) {
    if (!this.profileEnabled || !this.timestampQuerySet) return;
    const anyEnc = encoder as any;
    if (typeof anyEnc.writeTimestamp === 'function') {
      anyEnc.writeTimestamp(this.timestampQuerySet, slot);
    }
  }

  private resolveProfileQueries(encoder: GPUCommandEncoder) {
    if (!this.profileEnabled || !this.timestampQuerySet || !this.timestampResolveBuffer || !this.timestampReadBuffer) return;
    if (this.profileInFlight) return;
    const anyEnc = encoder as any;
    if (typeof anyEnc.resolveQuerySet !== 'function') return;
    anyEnc.resolveQuerySet(this.timestampQuerySet, 0, 4, this.timestampResolveBuffer, 0);
    encoder.copyBufferToBuffer(this.timestampResolveBuffer, 0, this.timestampReadBuffer, 0, 4 * 8);
    this.profilePending = true;
    this.profileInFlight = true;
  }

  private processProfileReadback() {
    if (!this.profileEnabled || !this.profilePending || !this.timestampReadBuffer) return;
    if (this.profilePromise) return;
    const queue = this.device.queue;
    const buffer = this.timestampReadBuffer;
    this.profilePromise = queue.onSubmittedWorkDone()
      .then(() => buffer.mapAsync(GPUMapMode.READ))
      .then(() => {
        const data = new BigUint64Array(buffer.getMappedRange());
        const toMs = (ticks: bigint) => Number(ticks) * this.timestampPeriod / 1e6;
        if (data.length >= 4) {
          const geomTicks = data[1] > data[0] ? data[1] - data[0] : 0n;
          const lightTicks = data[3] > data[2] ? data[3] - data[2] : 0n;
          if (this.profileFrameCounter % this.profileEvery === 0) {
            console.log('[DeferredSample][profile]', {
              frame: this.profileFrameCounter,
              geometryMs: toMs(geomTicks).toFixed(3),
              lightingMs: toMs(lightTicks).toFixed(3),
              totalMs: toMs(geomTicks + lightTicks).toFixed(3),
            });
          }
          this.profileFrameCounter++;
        }
        buffer.unmap();
        this.profilePending = false;
        this.profileInFlight = false;
      })
      .catch((err) => {
        console.warn('[DeferredSample] timestamp read failed', err);
        this.profilePending = false;
        this.profileInFlight = false;
      })
      .finally(() => {
        this.profilePromise = null;
      });
  }

  getStats() {
    return {
      mode: this.settings.mode,
      numLights: this.settings.numLights,
      profile: this.profileEnabled,
    };
  }
}
