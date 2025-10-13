import { mat4 } from 'gl-matrix';
import { WebgpuMain } from '../WebgpuMain';
import { WebgpuTransform } from '../WebgpuTransform';
import { MaterialFactory, ForwardPBRMaterial } from '../Abstractions/MaterialFactory';
import { MaterialFactory2 } from '../Abstractions/MaterialFactory2';
import { AbstractDynamicGeom, AttributeComponentCount, AttributePlacement } from '../WebgpuGeom';
import { WebgpuMaterial } from '../PBRMaterial/WebgpuMaterial';
import { QueryArgs } from '../../components/WebgpuApp/util/query-args';
import { DefaultTextures } from '../Abstractions/DefaultTextures';
import { PBRDebugPanel } from './pbr_debug_panel';
import { loadTexture2D } from '../util/texture-loader';

type PrimInfo = {
  geom: AbstractDynamicGeom;
  material: ForwardPBRMaterial;
  vbo: GPUBuffer;
  ibo: GPUBuffer | null;
  indexCount: number;
  vertexCount: number;
  indexIs32?: boolean;
  owner: WebgpuTransform;
  stride: number;
};

export class AbstractionGltfDemo {
  private prims: PrimInfo[] = [];
  private depthTex: GPUTexture | null = null;
  private depthView: GPUTextureView | null = null;
  private size: [number, number];
  private skinBGCache = new WeakMap<WebgpuTransform, GPUBindGroup>();
  private useNewPipeline = false;
  constructor(private ctx: WebgpuMain, private transforms: WebgpuTransform[]) {
    this.size = [ctx.presentationSize[0], ctx.presentationSize[1]] as [number, number];
  }

  async initialize() {
    // Traverse transforms, collect mesh primitives
    const stack = [...this.transforms];
    const device = this.ctx.device;
    while (stack.length) {
      const tr: any = stack.pop();
      if (!tr) continue;
      if (tr.childs) stack.push(...tr.childs);
      if (tr.mesh && tr.mesh.primitives) {
        for (const prim of tr.mesh.primitives) {
          const srcMat = prim.material as WebgpuMaterial | undefined;
          // Build forward PBR material with textures (placeholders first)
          const desc: any = { shading: 'pbr', textures: {}, scalars: { metallic: 0.0, roughness: 1.0 } };
          if (srcMat?.metallicRoughnessTexture) desc.textures.mr = { view: (await srcMat.metallicRoughnessTexture.GetGPUTex())?.createView() };
          if (srcMat?.baseColorTexture) desc.textures.baseColor = { view: (await srcMat.baseColorTexture.GetGPUTex())?.createView() };
          if (srcMat?.normalTexture) desc.textures.normal = { view: (await srcMat.normalTexture.GetGPUTex())?.createView() };
          if (srcMat?.occlusionTexture) desc.textures.ao = { view: (await srcMat.occlusionTexture.GetGPUTex())?.createView() };
          if (srcMat?.emissiveTexture) desc.textures.emissive = { view: (await srcMat.emissiveTexture.GetGPUTex())?.createView() };
          const useV2 = QueryArgs.getBool('absV2', false);
          if (useV2) {
            this.useNewPipeline = true;
            const iblEnabled = QueryArgs.getBool('iblEnable', true);
            const iblDiffuse = QueryArgs.getFloat('iblDiffuse', 1.0);
            const iblSpec = QueryArgs.getFloat('iblSpec', iblDiffuse);
            if (iblEnabled && (iblDiffuse > 0 || iblSpec > 0)) {
              desc.environment = {
                diffuse: { view: DefaultTextures.neutralEnvironmentCube(device) },
                specular: { view: DefaultTextures.neutralEnvironmentCube(device), mipLevels: 1 },
                brdfLut: { view: DefaultTextures.brdfLutView(device) },
                diffuseIntensity: iblDiffuse,
                specularIntensity: iblSpec,
              };
            }
            const clearcoatFactor = QueryArgs.getFloat('clearcoat', 0.0);
            if (clearcoatFactor > 0) {
              desc.extensions = desc.extensions ?? {};
              desc.extensions.clearcoat = {
                factor: clearcoatFactor,
                roughness: QueryArgs.getFloat('ccrough', 0.25),
              };
            }
            const matcapAsset = QueryArgs.getString('matcap', null);
            if (matcapAsset) {
              try {
                const matcapView = await loadTexture2D(device, `assets/textures/matcaps/${matcapAsset}`);
                desc.extensions = desc.extensions ?? {};
                desc.extensions.matcap = {
                  texture: { view: matcapView },
                  factor: QueryArgs.getFloat('matcapFactor', 1.0),
                };
              } catch (err) {
                console.warn('Failed to load matcap', matcapAsset, err);
              }
            }
          }
          const material = useV2
            ? MaterialFactory2.buildForward(device, this.ctx.presentationFormat, desc)
            : MaterialFactory.buildForward(device, this.ctx.presentationFormat, desc);
          // Build interleaved VBO (pos, normal, uv0, tangent optional)
          const geom = prim.geometry as AbstractDynamicGeom;
          // Ensure attribute locations are defined as expected by our pipeline
          if ((geom as any).SetLocations) {
            (geom as any).SetLocations({
              'POSITION': AttributePlacement.POSITION,
              'NORMAL': AttributePlacement.NORMAL,
              'TEXCOORD_0': AttributePlacement.TEXCOORD_0,
              'TANGENT': AttributePlacement.TANGENT,
              'TEXCOORD_1': AttributePlacement.TEXCOORD_1,
              'COLOR_0': AttributePlacement.COLOR,
              'JOINTS_0': AttributePlacement.JOINTS_0,
              'WEIGHTS_0': AttributePlacement.WEIGHTS_0,
              'JOINTS_1': AttributePlacement.JOINTS_1,
              'WEIGHTS_1': AttributePlacement.WEIGHTS_1,
            });
          }
          // Match the forward PBR pipeline layout: POSITION(3), NORMAL(3), UV0(2), TANGENT(4), UV1(2), JOINTS0(4), WEIGHTS0(4)
          const locations = [
            AttributePlacement.POSITION,
            AttributePlacement.NORMAL,
            AttributePlacement.TEXCOORD_0,
            AttributePlacement.TANGENT,
            AttributePlacement.TEXCOORD_1,
            AttributePlacement.JOINTS_0,
            AttributePlacement.WEIGHTS_0,
          ];
          const byLoc: any = {};
          let indexAttr: any = null;
          for (const k in geom.byNameAttributes) {
            const a: any = geom.byNameAttributes[k];
            if (a.isIndices) indexAttr = a; else byLoc[a.location] = a;
          }
          const pos = byLoc[AttributePlacement.POSITION as number];
          const posCount = pos ? pos.Count : 0;
          if (!pos || posCount <= 0) continue;
          let strideBytes = 0;
          const buffers: (Float32Array | null)[] = new Array(locations.length).fill(null);
          const updated = { updated: false };
          for (let i = 0; i < locations.length; i++) {
            const ap = locations[i];
            const comp = AttributeComponentCount[AttributePlacement[ap]] as number;
            strideBytes += comp * 4;
            const attr = byLoc[ap as number];
            if (attr && !attr.isIndices) buffers[i] = attr.getArrayBuffer(updated) as Float32Array;
          }
          const floatsPerV = strideBytes / 4;
          const vb = new Float32Array(posCount * floatsPerV);
          for (let v = 0; v < posCount; v++) {
            let off = v * floatsPerV;
            for (let i = 0; i < locations.length; i++) {
              const ap = locations[i];
              const comp = AttributeComponentCount[AttributePlacement[ap]] as number;
              const src = buffers[i];
              if (src) {
                const start = v * comp; for (let k = 0; k < comp; k++) vb[off + k] = src[start + k];
              } else { for (let k = 0; k < comp; k++) vb[off + k] = 0; }
              off += comp;
            }
          }
          const vbo = device.createBuffer({ size: vb.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
          device.queue.writeBuffer(vbo, 0, vb.buffer);
          let ibo: GPUBuffer | null = null; let indexCount = 0;
          let indexIs32 = false;
          if (indexAttr) {
            const ib = indexAttr.getArrayBuffer({ updated: false }) as Uint16Array | Uint32Array;
            indexIs32 = (ib instanceof Uint32Array);
            const indexBuf = (ib instanceof Uint32Array) ? new Uint32Array(ib) : new Uint16Array(ib as any);
            ibo = device.createBuffer({ size: indexBuf.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
            device.queue.writeBuffer(ibo, 0, indexBuf.buffer);
            indexCount = indexAttr.Count;
          }
          (this.prims as any).push({ geom, material, vbo, ibo, indexCount, vertexCount: posCount, owner: tr as WebgpuTransform, stride: strideBytes, indexIs32 });
        }
      }
    }

    if (this.useNewPipeline && this.prims.length > 0) {
      PBRDebugPanel.getInstance().attachMaterials(this.prims.map(p => p.material));
    }

    this.createDepth();
  }

  resize(w: number, h: number) {
    this.size = [w, h];
    this.createDepth();
  }

  private createDepth() {
    this.depthTex?.destroy();
    this.depthTex = this.ctx.device.createTexture({ size: this.size, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depthView = this.depthTex.createView();
  }

  draw(commandEncoder: GPUCommandEncoder, swapView: GPUTextureView, viewProj: mat4, viewMatrix: mat4, cameraPos: [number, number, number]) {
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: swapView, clearValue: { r: 0.02, g: 0.02, b: 0.025, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthView!, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    for (const p of this.prims as any[]) {
      // Update model from transform
      const model = (p.owner.GetMatrixWorld().toArray() as unknown) as Float32Array;
      p.material.setProjView(viewProj as unknown as Float32Array);
      p.material.setModel(model);
      p.material.setView(viewMatrix as unknown as Float32Array);
      p.material.setCameraPosition(cameraPos);
      p.material.updateUniforms();
      pass.setPipeline(p.material.pipeline);
      pass.setBindGroup(0, p.material.bindGroup0);
      pass.setBindGroup(1, p.material.bindGroup1);
      // Skin bind group per transform
      const buf = (p.owner as any).matricesStorageBuffer(this.ctx.device);
      let bg = this.skinBGCache.get(p.owner);
      if (!bg) {
        const bgl2 = (p.material as any).bglSkin as GPUBindGroupLayout;
        bg = this.ctx.device.createBindGroup({ layout: bgl2, entries: [{ binding: 0, resource: { buffer: buf } }] });
        this.skinBGCache.set(p.owner, bg);
      }
      pass.setBindGroup(2, bg!);
      pass.setVertexBuffer(0, p.vbo);
      if (p.ibo) { pass.setIndexBuffer(p.ibo, p.indexIs32 ? 'uint32' : 'uint16'); pass.drawIndexed(p.indexCount); }
      else { pass.draw(p.vertexCount); }
    }
    pass.end();
  }
}
