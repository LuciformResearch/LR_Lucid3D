import { mat4 } from 'gl-matrix';
import { MaterialFactory, ForwardPBRMaterial } from '../Abstractions/MaterialFactory';

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
    this.material = MaterialFactory.buildForward(this.device, this.format, {
      shading: 'pbr',
      textures: {},
      scalars: { metallic: 0.0, roughness: 1.0 },
    });
    this.material.setBaseColorFactor([0.95, 0.55, 0.15, 1.0]);

    // Cube geometry (positions, normals, uvs) interleaved (stride = 8 floats)
    const P = [
      // Front
      -1,-1, 1, 0,0,1, 0,0,
       1,-1, 1, 0,0,1, 1,0,
       1, 1, 1, 0,0,1, 1,1,
      -1, 1, 1, 0,0,1, 0,1,
      // Back
       1,-1,-1, 0,0,-1, 0,0,
      -1,-1,-1, 0,0,-1, 1,0,
      -1, 1,-1, 0,0,-1, 1,1,
       1, 1,-1, 0,0,-1, 0,1,
      // Left
      -1,-1,-1,-1,0,0, 0,0,
      -1,-1, 1,-1,0,0, 1,0,
      -1, 1, 1,-1,0,0, 1,1,
      -1, 1,-1,-1,0,0, 0,1,
      // Right
       1,-1, 1, 1,0,0, 0,0,
       1,-1,-1, 1,0,0, 1,0,
       1, 1,-1, 1,0,0, 1,1,
       1, 1, 1, 1,0,0, 0,1,
      // Top
      -1, 1, 1, 0,1,0, 0,0,
       1, 1, 1, 0,1,0, 1,0,
       1, 1,-1, 0,1,0, 1,1,
      -1, 1,-1, 0,1,0, 0,1,
      // Bottom
      -1,-1,-1, 0,-1,0, 0,0,
       1,-1,-1, 0,-1,0, 1,0,
       1,-1, 1, 0,-1,0, 1,1,
      -1,-1, 1, 0,-1,0, 0,1,
    ];
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

  draw(commandEncoder: GPUCommandEncoder, swapView: GPUTextureView, viewProj: mat4) {
    // Update uniforms (model rotates slowly)
    const model = mat4.create();
    const t = performance.now() * 0.001;
    mat4.rotateY(model, model, t);
    mat4.rotateX(model, model, 0.35);
    this.material.setProjView(viewProj as unknown as Float32Array);
    this.material.setModel(model as unknown as Float32Array);
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

