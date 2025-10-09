import { mat4, vec3 } from 'gl-matrix';
import { WebgpuMain } from '../WebgpuMain';
import { QueryArgs } from '../../components/WebgpuApp/util/query-args';
import { WebgpuTransform } from '../WebgpuTransform';
import { WebgpuGBufferMaterial } from './WebgpuGBufferMaterial';
import { AbstractDynamicGeom, AttributePlacement } from '../WebgpuGeom';
import { WebgpuMaterial } from '../PBRMaterial/WebgpuMaterial';

export class WebgpuSceneRendererGBuffer {
  private allMeshes: { mesh: any, tr: WebgpuTransform }[] = [];
  private gbufferMaterials = new Map<WebgpuMaterial, WebgpuGBufferMaterial>();

  constructor(private renderer: WebgpuMain, private transforms: WebgpuTransform[] = [], private formats?: GPUTextureFormat[]) {}
  
  // Get texture flags from the first material for debugging
  get textureFlags() {
    const firstMaterial = this.gbufferMaterials.values().next().value;
    return firstMaterial?.textureFlags || {
      hasBaseTexture: false,
      hasMRTexture: false,
      hasNormalTexture: false,
      hasAOTexture: false,
      hasEmissiveTexture: false,
    };
  }

  private getMatrices(tr: WebgpuTransform): { mvp: mat4, model: mat4, normal: mat4 } {
    // Match the forward rendering matrix calculation exactly
    let viewMatrix = mat4.create();
    let projMat = this.renderer.projectionMatrix;
    mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -4));
    viewMatrix = this.renderer.flyControls.camera.GetMatrixWorld().invert().toArray() as mat4;
    
    const modelViewProjectionMatrix = mat4.create();
    mat4.multiply(viewMatrix, viewMatrix, tr.GetMatrixWorld().toArray() as mat4);
    mat4.multiply(modelViewProjectionMatrix, projMat, viewMatrix);
    
    const modelArr = tr.GetMatrixWorld().toArray();
    const model = Float32Array.from(modelArr);
    const normal = mat4.create();
    mat4.invert(normal, model);
    mat4.transpose(normal, normal);
    
    return { 
      mvp: modelViewProjectionMatrix as unknown as mat4, 
      model: model as unknown as mat4, 
      normal: normal as unknown as mat4 
    };
  }

  private ensureGBufferMaterial(srcMat: WebgpuMaterial): WebgpuGBufferMaterial {
    let m = this.gbufferMaterials.get(srcMat);
    if (!m) {
      const anyMat: any = srcMat as any;
      m = new WebgpuGBufferMaterial(this.renderer, {
        baseColorTexture: anyMat.baseColorTexture,
        metallicRoughnessTexture: anyMat.metallicRoughnessTexture,
        occlusionTexture: anyMat.occlusionTexture,
        emissiveTexture: anyMat.emissiveTexture,
        normalTexture: anyMat.normalTexture,
        formats: this.formats,
      });
      this.gbufferMaterials.set(srcMat, m);
    }
    return m;
  }

  render(pass: GPURenderPassEncoder) {
    const trace = QueryArgs.getBool('trace', false);
    // Collect meshes (manual traversal to avoid type constraints on PreparePass)
    this.allMeshes = [];
    const collect = (tr: WebgpuTransform) => {
      if (tr && tr.mesh && tr.mesh.primitives) {
        for (let i = 0; i < tr.mesh.primitives.length; i++) {
          this.allMeshes.push({ mesh: tr.mesh.primitives[i], tr });
        }
      }
      if (tr && tr.childs) {
        for (const c of tr.childs) collect(c);
      }
    };
    for (const tr of this.transforms) collect(tr);

    if (trace) console.log('[GBufferScene] transforms=', this.transforms.length, 'meshes=', this.allMeshes.length);
    for (const { mesh, tr } of this.allMeshes) {
      const mats = this.getMatrices(tr);
      const material = mesh.material as WebgpuMaterial;
      const gMat = this.ensureGBufferMaterial(material);

      const geom = mesh.geometry as AbstractDynamicGeom;
      geom.SetLocations({
        'COLOR_0': AttributePlacement.COLOR,
        'TEXCOORD_1': AttributePlacement.TEXCOORD_1,
        'TANGENT': AttributePlacement.TANGENT,
        'POSITION': AttributePlacement.POSITION,
        'NORMAL': AttributePlacement.NORMAL,
        'TEXCOORD_0': AttributePlacement.TEXCOORD_0,
        'JOINTS_0': AttributePlacement.JOINTS_0,
        'WEIGHTS_0': AttributePlacement.WEIGHTS_0,
        'JOINTS_1': AttributePlacement.JOINTS_1,
        'WEIGHTS_1': AttributePlacement.WEIGHTS_1,
      });

      gMat.drawGeometryGBuffer(mats.mvp as unknown as mat4, mats.model as unknown as mat4, mats.normal as unknown as mat4, pass, geom);
    }
  }
}
