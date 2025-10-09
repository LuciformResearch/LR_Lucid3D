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
  private lastTransformCount = -1;
  private lastMeshCount = -1;
  private geomLocationsSet = new WeakSet<AbstractDynamicGeom>();
  private matCache = new WeakMap<WebgpuTransform, { model: Float32Array, normal: Float32Array, lastModel: Float32Array }>();
  private updatedSkinThisFrame = new WeakSet<WebgpuTransform>();

  constructor(private renderer: WebgpuMain, private transforms: WebgpuTransform[] = [], private formats?: GPUTextureFormat[], private sampleCount: number = 1) {}
  
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

  private getMatrices(tr: WebgpuTransform, projView: mat4): { mvp: mat4, model: mat4, normal: mat4 } {
    // Compute MVP using precomputed proj*view matrix
    const modelViewProjectionMatrix = mat4.create();
    const modelNow = tr.GetMatrixWorld().toArray() as mat4;
    mat4.multiply(modelViewProjectionMatrix, projView, modelNow);
    
    // Cache model and normal matrices per transform; recompute normal only when model changes
    let cache = this.matCache.get(tr);
    const modelArr = modelNow as unknown as number[];
    if (!cache) {
      const model = Float32Array.from(modelArr);
      const normal = mat4.create();
      mat4.invert(normal, model as unknown as mat4);
      mat4.transpose(normal, normal);
      cache = { model, normal: (normal as unknown as Float32Array), lastModel: Float32Array.from(model) };
      this.matCache.set(tr, cache);
    } else {
      // Compare with previous model; if changed, update cache and recompute normal
      let changed = false;
      if (cache.lastModel.length !== 16) {
        changed = true;
      } else {
        const arr = modelArr as number[];
        for (let i = 0; i < 16; i++) {
          if (cache.lastModel[i] !== (arr[i] as number)) { changed = true; break; }
        }
      }
      if (changed) {
        for (let i = 0; i < 16; i++) cache.model[i] = modelArr[i] as number;
        cache.lastModel.set(cache.model);
        const normalMat = mat4.create();
        mat4.invert(normalMat, cache.model as unknown as mat4);
        mat4.transpose(normalMat, normalMat);
        cache.normal = (normalMat as unknown as Float32Array);
      }
    }
    
    return { 
      mvp: modelViewProjectionMatrix as unknown as mat4, 
      model: cache.model as unknown as mat4, 
      normal: cache.normal as unknown as mat4 
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
        sampleCount: this.sampleCount,
      });
      this.gbufferMaterials.set(srcMat, m);
    }
    return m;
  }

  render(pass: GPURenderPassEncoder) {
    const trace = QueryArgs.getBool('trace', false);
    // Precompute view and proj*view once per frame
    const projMat = this.renderer.projectionMatrix;
    const viewMatrix = this.renderer.flyControls.camera.GetMatrixWorld().invert().toArray() as mat4;
    const projView = mat4.create();
    mat4.multiply(projView, projMat, viewMatrix);
    // Rebuild flattened mesh list when the scene becomes available or changes in size
    const needRebuild = (
      this.transforms.length !== this.lastTransformCount ||
      (this.allMeshes.length === 0 && this.transforms.length > 0)
    );
    if (needRebuild) {
      this.allMeshes = [];
      const collect = (tr: WebgpuTransform) => {
        if (tr && (tr as any).mesh && (tr as any).mesh.primitives) {
          for (let i = 0; i < (tr as any).mesh.primitives.length; i++) {
            this.allMeshes.push({ mesh: (tr as any).mesh.primitives[i], tr });
          }
        }
        if (tr && (tr as any).childs) {
          for (const c of (tr as any).childs) collect(c);
        }
      };
      for (const tr of this.transforms) collect(tr);
      this.lastTransformCount = this.transforms.length;
      this.lastMeshCount = this.allMeshes.length;
      if (trace) console.log('[GBufferScene] rebuilt meshes:', this.allMeshes.length);
    }

    if (trace) console.log('[GBufferScene] transforms=', this.transforms.length, 'meshes=', this.allMeshes.length);
    // Reset per-frame skin update set
    this.updatedSkinThisFrame = new WeakSet<WebgpuTransform>();
    for (const { mesh, tr } of this.allMeshes) {
      // Ensure skin buffer is up-to-date for this transform (if skinned)
      const noAnim = QueryArgs.getBool('noanim', false);
      if (!this.updatedSkinThisFrame.has(tr)) {
        if (!noAnim || !(tr as any).skinBuffer) {
          try { (tr as any).skinBuffer = tr.matricesStorageBuffer(this.renderer.device); } catch {}
        }
        this.updatedSkinThisFrame.add(tr);
      }
      const mats = this.getMatrices(tr, projView);
      const material = mesh.material as WebgpuMaterial;
      const gMat = this.ensureGBufferMaterial(material);

      const geom = mesh.geometry as AbstractDynamicGeom;
      // Attach back-reference for skin bind group resolution
      (geom as any).ownerTransform = tr;
      if (!this.geomLocationsSet.has(geom)) {
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
        this.geomLocationsSet.add(geom);
      }

      gMat.drawGeometryGBuffer(mats.mvp as unknown as mat4, mats.model as unknown as mat4, mats.normal as unknown as mat4, pass, geom);
    }
  }
}
