import { mat4, vec3 } from 'gl-matrix';
import { input } from './Input';
import { WebgpuFlyControls, WebgpuPerspectiveCamera } from './WebgpuOrbitControls';

import { CubeRenderTest } from './WebgpuSamples/CubeGeometry';
import { GltfRenderTest } from './WebgpuSamples/gltfRenderTest';
import { debugOverlay } from '../components/WebgpuApp/util/debug-overlay';



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
  cubeTest: CubeRenderTest;
  gltfTest: GltfRenderTest;
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
    this.isReady = true;
    
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

    });
    
  }
  frame(dt: number) {
    // Sample is no longer the active page.
    if (!this.canvasElem) return;

    this.flyControls.Update(dt);
    this.projectionMatrix = this.flyControls.camera.projectionMatrix.toArray() as mat4;

    this.renderPassDescriptor.colorAttachments[0].resolveTarget = this.context
      .getCurrentTexture()
      .createView();
      const commandEncoder = this.device.createCommandEncoder();
      let passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);

    // Update animations if any
    if (this.gltfTest && this.gltfTest.animations) {
      let channels = 0;
      for (const anim of this.gltfTest.animations) {
        anim.OnUpdate(dt);
        channels += (anim.channels ? anim.channels.length : 0);
      }
      // Gather skin/joints info from the loaded scene
      let hasSkin = false;
      let joints = 0;
      if (this.gltfTest.transforms && this.gltfTest.transforms.length > 0) {
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
      debugOverlay.update({
        useSkinning: hasSkin,
        joints,
        animations: this.gltfTest.animations.length,
        channels,
        time: this.gltfTest.animations.length > 0 ? `${this.gltfTest.animations[0].currentTime.toFixed(2)} / ${this.gltfTest.animations[0].maxTime.toFixed(2)}` : '0 / 0',
      });
    }

    this.gltfTest.draw(passEncoder);

    passEncoder.end();
    
    
    this.device.queue.submit([commandEncoder.finish()]);
  }
}
