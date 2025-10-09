import { mat4, vec3 } from 'gl-matrix';
import { input } from './Input';
import { WebgpuFlyControls, WebgpuPerspectiveCamera } from './WebgpuOrbitControls';

import { CubeRenderTest } from './WebgpuSamples/CubeGeometry';
import { GltfRenderTest } from './WebgpuSamples/gltfRenderTest';
import { debugOverlay } from '../components/WebgpuApp/util/debug-overlay';
import { DeferredRenderer } from './Deferred/DeferredRenderer';
import { WebgpuSceneRendererGBuffer } from './Deferred/WebgpuSceneRendererGBuffer';
import { QueryArgs } from '../components/WebgpuApp/util/query-args';
import { Metrics } from './util/metrics';



export class WebgpuMain {
  adapter: GPUAdapter;
  device: GPUDevice;
  Ready: Promise<WebgpuMain>;
  presentationFormat: GPUTextureFormat;
  context: GPUCanvasContext;
  presentationSize: number[];
  projectionMatrix: mat4;
  renderPassDescriptor: GPURenderPassDescriptor;
  isReady: boolean;
  flyControls: WebgpuFlyControls;
  depthTexture: GPUTexture;
  renderTarget: GPUTexture;
  renderTargetView: GPUTextureView;
  deferred: DeferredRenderer | null = null;
  cubeTest: CubeRenderTest;
  gltfTest: GltfRenderTest;
  private _fpsAccum: number;
  private _fpsFrames: number;
  private _fps: number;
  private _overlayAccum: number;
  constructor(public readonly canvasElem) {
    this.Ready = new Promise((resolve, reject) => {

      this.initialize().then(() => {
        resolve(this);
      });
    });
  }
  async initialize() {
    this.adapter = await navigator.gpu.requestAdapter();
    const device = await this.adapter.requestDevice();
    this.device = device;
    if (this.canvasElem === null) return;
    this.context = this.canvasElem.getContext('webgpu') as GPUCanvasContext;

    const devicePixelRatio = window.devicePixelRatio || 1;

    this.presentationSize = [
      this.canvasElem.clientWidth * devicePixelRatio,
      this.canvasElem.clientHeight * devicePixelRatio,
    ];
    this.canvasElem.width = this.presentationSize[0];
    this.canvasElem.height = this.presentationSize[1];
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device,
      format: this.presentationFormat,
      alphaMode: 'premultiplied',
    });



    this.depthTexture = device.createTexture({
      size: this.presentationSize,
      format: 'depth24plus',
      sampleCount: 4,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.renderTarget = device.createTexture({
      size: this.presentationSize,
      sampleCount: 4,
      format: this.presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.renderTargetView = this.renderTarget.createView();

    this.renderPassDescriptor = {
      colorAttachments: [
        {
          view: this.renderTargetView, // Assigned later
          resolveTarget: undefined,
          clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };



    this.cubeTest = new CubeRenderTest(this);
    await this.cubeTest.initialize();

    this.gltfTest = new GltfRenderTest(this);
    await this.gltfTest.initialize();

    if (QueryArgs.getBool('deferred', false)) {
      this.deferred = new DeferredRenderer(this);
      await this.deferred.initialize(this.gltfTest.transforms as any);
    }
    this.isReady = true;

    // FPS tracking
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._fps = 0;
    this._overlayAccum = 0;
    Metrics.setEnabled(QueryArgs.getBool('metrics', false));
    
    input.ListenDomElement(this.canvasElem);
    let camera = new WebgpuPerspectiveCamera();
    camera.position.set(0, 0, 4);
    camera.aspectRatio = this.presentationSize[0] / this.presentationSize[1];


    this.flyControls = new WebgpuFlyControls(camera);

    
    window.addEventListener('resize', () => {
      this.canvasElem.style.width = "" + window.innerWidth + "px";
      this.canvasElem.style.height = "" + window.innerHeight + "px";
      const devicePixelRatio = window.devicePixelRatio || 1;

      this.presentationSize = [
        this.canvasElem.clientWidth * devicePixelRatio,
        this.canvasElem.clientHeight * devicePixelRatio,
      ];
      this.canvasElem.width = this.presentationSize[0];
      this.canvasElem.height = this.presentationSize[1];
      camera.aspectRatio = this.presentationSize[0] / this.presentationSize[1];
      this.depthTexture.destroy();
      this.depthTexture = device.createTexture({
        size: this.presentationSize,
        sampleCount: 4,
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.renderTarget.destroy();
      this.renderTarget = device.createTexture({
        size: this.presentationSize,
        sampleCount: 4,
        format: this.presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.renderTargetView = this.renderTarget.createView();
  
 
      this.renderPassDescriptor = {
        colorAttachments: [
          {
            view: this.renderTargetView, // Assigned later
  
            clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depthTexture.createView(),
  
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      };

      if (this.deferred) this.deferred.onResize();

    });
    
  }
  frame(dt: number) {
    // Sample is no longer the active page.
    if (!this.canvasElem) return;

    this.flyControls.Update(dt);
    this.projectionMatrix = this.flyControls.camera.projectionMatrix.toArray() as mat4;

    const commandEncoder = this.device.createCommandEncoder();
    let passEncoder: GPURenderPassEncoder | null = null;
    if (!this.deferred) {
      // Forward path uses MSAA resolve into swapchain; set per-frame resolveTarget only here
      this.renderPassDescriptor.colorAttachments[0].resolveTarget = this.context
        .getCurrentTexture()
        .createView();
      passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
    }

    // Update animations if any (can be disabled via ?noanim=1)
    const noAnim = QueryArgs.getBool('noanim', false);
    if (!noAnim && this.gltfTest && this.gltfTest.animations) {
      for (const anim of this.gltfTest.animations) anim.OnUpdate(dt);
    }

    // FPS accumulate
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.25) { // update ~4x per second
      this._fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    if (!this.deferred) {
      // Forward path
      this.gltfTest.draw(passEncoder!);
      passEncoder!.end();
      this.device.queue.submit([commandEncoder.finish()]);
      return;
    }

    // Deferred path: geometry pass writes into g-buffers
    // Deferred path does not use the forward render pass
    if (passEncoder) passEncoder.end();
    this.deferred.drawGeometry(commandEncoder);
    this.deferred.lightingPass(commandEncoder);
    this.device.queue.submit([commandEncoder.finish()]);

    // Throttled overlay: FPS + textures + animation/skin info
    this._overlayAccum += dt;
    if (this._overlayAccum >= 0.25) {
      let channels = 0;
      let hasSkin = false;
      let joints = 0;
      let timeStr = '';
      const anims = (this.gltfTest?.animations && !noAnim) ? this.gltfTest.animations : [];
      if (anims.length > 0) {
        for (const anim of anims) channels += (anim.channels ? anim.channels.length : 0);
        timeStr = `${anims[0].currentTime.toFixed(2)} / ${anims[0].maxTime.toFixed(2)}`;
      }
      if (this.gltfTest?.transforms && this.gltfTest.transforms.length > 0) {
        const stack = [...this.gltfTest.transforms];
        while (stack.length) {
          const tr: any = stack.pop();
          if (tr && tr.mesh && tr.mesh.skin && tr.mesh.skin.joints) {
            hasSkin = tr.mesh.skin.joints.length > 0 || hasSkin;
            joints = Math.max(joints, tr.mesh.skin.joints.length || 0);
          }
          if (tr && tr.childs) stack.push(...tr.childs);
        }
      }
      const overlay: any = {
        useSkinning: hasSkin,
        joints,
        animations: anims.length,
        channels,
        time: timeStr,
        fps: this._fps,
        textures: this.deferred?.sceneRenderer?.textureFlags,
      };
      if (QueryArgs.getBool('metrics', false)) {
        overlay.metrics = Metrics.snapshotAndReset();
      }
      debugOverlay.update(overlay);
      this._overlayAccum = 0;
    }
  }
}
