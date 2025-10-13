import { mat4 } from 'gl-matrix';
import { MaterialFactory, ForwardPBRMaterial } from '../Abstractions/MaterialFactory';
import { DefaultTextures } from '../Abstractions/DefaultTextures';
import { PBRDebugPanel } from './pbr_debug_panel';
import { loadTexture2D } from '../util/texture-loader';

// Minimal forward PBR demo using the new abstractions. Not wired by default.
export class AbstractionForwardPBRDemo {
  private material: ForwardPBRMaterial;
  private vertexBuffer: GPUBuffer;
  private indexBuffer: GPUBuffer;
  private indexCount = 0;
  private depthTex: GPUTexture | null = null;
  private depthView: GPUTextureView | null = null;
  private size: [number, number];

  constructor(private device: GPUDevice, private format: GPUTextureFormat, width: number, height: number) {
    this.size = [width, height];
  }

  async initialize() {
    // Material with solid base color, no textures
    const desc: any = {
      shading: 'pbr',
      textures: {},
      scalars: { metallic: 0.0, roughness: 1.0 },
      environment: {
        diffuse: { view: DefaultTextures.neutralEnvironmentCube(this.device) },
        specular: { view: DefaultTextures.neutralEnvironmentCube(this.device), mipLevels: 1 },
        brdfLut: { view: DefaultTextures.brdfLutView(this.device) },
        diffuseIntensity: 1.0,
        specularIntensity: 1.0,
      },
    };
    const matcapUrl = 'assets/textures/matcaps/0404E8_0404B5_0404CB_3333FC.png';
    try {
      const matcapView = await loadTexture2D(this.device, matcapUrl);
      desc.extensions = {
        matcap: {
          texture: { view: matcapView },
          factor: 1.0,
        },
      };
    } catch (err) {
      console.warn('Failed to load default matcap', err);
    }
    this.material = MaterialFactory.buildForward(this.device, this.format, desc);
    this.material.setBaseColorFactor([0.95, 0.55, 0.15, 1.0]);
    PBRDebugPanel.getInstance().attachMaterials([this.material]);

    // Cube geometry interleaved for pipeline: pos3, norm3, uv2, tangent4, joints4, weights4 (stride = 20 floats)
    // Pick a simple consistent tangent per face (not perfect but OK for demo)
    function faceTangent(nx: number, ny: number, nz: number): [number, number, number, number] {
      if (Math.abs(nx) > 0.5) return [0, 0, 1, nx > 0 ? 1 : -1];
      if (Math.abs(nz) > 0.5) return [1, 0, 0, nz > 0 ? 1 : -1];
      return [1, 0, 0, 1];
    }
    const jw = [0,0,0,0, 1,0,0,0];
    const P: number[] = [];
    const pushV = (px:number,py:number,pz:number, nx:number,ny:number,nz:number, u:number,v:number) => {
      const t = faceTangent(nx,ny,nz);
      P.push(px,py,pz, nx,ny,nz, u,v, t[0],t[1],t[2],t[3], u,v, ...jw);
    };
    // Front
    pushV(-1,-1, 1, 0,0,1, 0,0);
    pushV( 1,-1, 1, 0,0,1, 1,0);
    pushV( 1, 1, 1, 0,0,1, 1,1);
    pushV(-1, 1, 1, 0,0,1, 0,1);
    // Back
    pushV( 1,-1,-1, 0,0,-1, 0,0);
    pushV(-1,-1,-1, 0,0,-1, 1,0);
    pushV(-1, 1,-1, 0,0,-1, 1,1);
    pushV( 1, 1,-1, 0,0,-1, 0,1);
    // Left
    pushV(-1,-1,-1,-1,0,0, 0,0);
    pushV(-1,-1, 1,-1,0,0, 1,0);
    pushV(-1, 1, 1,-1,0,0, 1,1);
    pushV(-1, 1,-1,-1,0,0, 0,1);
    // Right
    pushV( 1,-1, 1, 1,0,0, 0,0);
    pushV( 1,-1,-1, 1,0,0, 1,0);
    pushV( 1, 1,-1, 1,0,0, 1,1);
    pushV( 1, 1, 1, 1,0,0, 0,1);
    // Top
    pushV(-1, 1, 1, 0,1,0, 0,0);
    pushV( 1, 1, 1, 0,1,0, 1,0);
    pushV( 1, 1,-1, 0,1,0, 1,1);
    pushV(-1, 1,-1, 0,1,0, 0,1);
    // Bottom
    pushV(-1,-1,-1, 0,-1,0, 0,0);
    pushV( 1,-1,-1, 0,-1,0, 1,0);
    pushV( 1,-1, 1, 0,-1,0, 1,1);
    pushV(-1,-1, 1, 0,-1,0, 0,1);
    const I = [
      0,1,2, 0,2,3,    4,5,6, 4,6,7,
      8,9,10, 8,10,11, 12,13,14, 12,14,15,
      16,17,18, 16,18,19, 20,21,22, 20,22,23,
    ];
    this.indexCount = I.length;
    this.vertexBuffer = this.device.createBuffer({ size: P.length * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.indexBuffer = this.device.createBuffer({ size: I.length * 2, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, new Float32Array(P).buffer);
    this.device.queue.writeBuffer(this.indexBuffer, 0, new Uint16Array(I).buffer);

    this.createDepth();
  }

  resize(width: number, height: number) {
    this.size = [width, height];
    this.createDepth();
  }

  private createDepth() {
    this.depthTex?.destroy();
    this.depthTex = this.device.createTexture({ size: this.size, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depthView = this.depthTex.createView();
  }

  draw(
    commandEncoder: GPUCommandEncoder,
    swapView: GPUTextureView,
    viewProj: mat4,
    viewMatrix: mat4,
    cameraPos: [number, number, number] = [0, 0, 1],
  ) {
    // Update uniforms (model rotates slowly)
    const model = mat4.create();
    const t = performance.now() * 0.001;
    mat4.rotateY(model, model, t);
    mat4.rotateX(model, model, 0.35);
    this.material.setProjView(viewProj as unknown as Float32Array);
    this.material.setModel(model as unknown as Float32Array);
    this.material.setView(viewMatrix as unknown as Float32Array);
    this.material.setCameraPosition(cameraPos);
    this.material.updateUniforms();

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: swapView, clearValue: { r: 0.02, g: 0.02, b: 0.025, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthView!, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setPipeline(this.material.pipeline);
    pass.setBindGroup(0, this.material.bindGroup0);
    pass.setBindGroup(1, this.material.bindGroup1);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.drawIndexed(this.indexCount);
    pass.end();
  }
}
