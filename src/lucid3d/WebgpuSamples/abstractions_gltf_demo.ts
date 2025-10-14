import { mat4 } from 'gl-matrix';
import { WebgpuMain } from '../WebgpuMain';
import { WebgpuTransform } from '../WebgpuTransform';
import { MaterialFactory, ForwardPBRMaterial } from '../Abstractions/MaterialFactory';
import { MaterialFactory2 } from '../Abstractions/MaterialFactory2';
import { AbstractDynamicGeom, AttributeComponentCount, AttributePlacement } from '../WebgpuGeom';
import { WebgpuMaterial } from '../PBRMaterial/WebgpuMaterial';
import { QueryArgs } from '../../components/WebgpuApp/util/query-args';
import { DefaultTextures } from '../Abstractions/DefaultTextures';
import { Vector2 } from '../Math/Vector2';
import { Vector3 } from '../Math/Vector3';
import { createUvSphereMesh, createIcosahedronMesh, sphericalUV } from '../procedural/primitives';
import { ProceduralMesh } from '../procedural/procedural-mesh';
import { PBRDebugPanel } from './pbr_debug_panel';
import { loadTexture2D } from '../util/texture-loader';
import { MATCAP_ASSETS, IBL_ENVIRONMENT_ASSETS } from '../assets/asset-manifest';
import { loadEnvironmentFromHDR, EnvironmentMaps } from '../util/environment-loader';

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
  private matcapPlane: PrimInfo | null = null;
  private matcapPlaneTr: WebgpuTransform | null = null;
  private environmentMaps: EnvironmentMaps | null = null;
  private skyboxPipeline: GPURenderPipeline | null = null;
  private skyboxBindGroupLayout: GPUBindGroupLayout | null = null;
  private skyboxBindGroup: GPUBindGroup | null = null;
  private skyboxVertexBuffer: GPUBuffer | null = null;
  private skyboxVertexCount = 0;
  private skyboxUniformBuffer: GPUBuffer | null = null;
  private skyboxSampler: GPUSampler | null = null;
  private skyboxView = mat4.create();
  private skyboxViewProj = mat4.create();
  constructor(private ctx: WebgpuMain, private transforms: WebgpuTransform[]) {
    this.size = [ctx.presentationSize[0], ctx.presentationSize[1]] as [number, number];
  }

  async initialize() {
    // Traverse transforms, collect mesh primitives
    const stack = [...this.transforms];
    const device = this.ctx.device;
    const useV2 = QueryArgs.getBool('absV2', false);
    const iblEnabled = QueryArgs.getBool('iblEnable', true);
    const iblDiffuseIntensity = (() => {
      const val = QueryArgs.getFloat('iblDiffuse', null);
      return val ?? 1.0;
    })();
    const iblSpecIntensity = (() => {
      const val = QueryArgs.getFloat('iblSpec', null);
      return val ?? iblDiffuseIntensity;
    })();
    const clearcoatFactor = QueryArgs.getFloat('clearcoat', 0.0);
    const clearcoatRoughness = QueryArgs.getFloat('ccrough', 0.25);
    const matcapFactorOverride = QueryArgs.getFloat('matcapFactor', null);
    const findIblAsset = (value: string) => {
      const lower = value.toLowerCase();
      return IBL_ENVIRONMENT_ASSETS.find((asset) =>
        asset.name.toLowerCase() === lower
        || asset.label.toLowerCase() === lower
        || asset.hdrUrl.toLowerCase().endsWith(lower)
      );
    };
    const findMatcapAsset = (value: string) => {
      const lower = value.toLowerCase();
      return MATCAP_ASSETS.find((asset) =>
        asset.name.toLowerCase() === lower
        || asset.url.toLowerCase().endsWith(lower)
      );
    };
    let envMaps: EnvironmentMaps | null = null;
    if (useV2) {
      const envArg = QueryArgs.getString('iblEnv', null);
      if (envArg) {
        const asset = findIblAsset(envArg);
        if (asset) {
          try {
            envMaps = await loadEnvironmentFromHDR(device, asset.hdrUrl, { label: asset.name });
            PBRDebugPanel.getInstance().registerEnvironment(asset.name, envMaps);
          } catch (err) {
            console.warn('Failed to load HDR environment', asset.name, err);
          }
        } else {
          console.warn('Unknown IBL environment', envArg);
        }
      }
    }
    let matcapView: GPUTextureView | null = null;
    if (useV2) {
      const matcapArg = QueryArgs.getString('matcap', null);
      if (matcapArg) {
        const asset = findMatcapAsset(matcapArg);
        if (asset) {
          try {
            matcapView = await loadTexture2D(device, asset.url);
            PBRDebugPanel.getInstance().registerMatcap(asset.name, matcapView);
          } catch (err) {
            console.warn('Failed to load matcap texture', asset.url, err);
          }
        } else {
          console.warn('Unknown matcap asset', matcapArg);
        }
      }
    }
    const primitiveType = QueryArgs.getString('primitive', null);
    const modelArg = (QueryArgs.getString('model', '') || '').toLowerCase();
    const requestedPrimitive = primitiveType
      ?? ((modelArg === 'uvsphere' || modelArg === 'sphere') ? 'uvSphere' : null);
    let proceduralBuilt = false;
    if (requestedPrimitive) {
      this.useNewPipeline = true;
      const built = await this.buildProceduralPrimitive(
        requestedPrimitive,
        envMaps,
        iblEnabled,
        iblDiffuseIntensity,
        iblSpecIntensity,
        matcapView,
        matcapFactorOverride,
      );
      proceduralBuilt = built;
    }
    if (!proceduralBuilt) {
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
            if (useV2) {
              this.useNewPipeline = true;
              const attachEnvironment = iblEnabled || !!envMaps;
              if (attachEnvironment) {
                const initialDiffuse = iblEnabled ? iblDiffuseIntensity : 0;
                const initialSpec = iblEnabled ? iblSpecIntensity : 0;
                const environment = envMaps
                  ? {
                      diffuse: { view: envMaps.diffuse.view },
                      specular: { view: envMaps.specular.view, mipLevels: envMaps.specular.mipLevelCount },
                      brdfLut: { view: DefaultTextures.brdfLutView(device) },
                      diffuseIntensity: initialDiffuse,
                      specularIntensity: initialSpec,
                    }
                  : {
                      diffuse: { view: DefaultTextures.neutralEnvironmentCube(device) },
                      specular: { view: DefaultTextures.neutralEnvironmentCube(device), mipLevels: 1 },
                      brdfLut: { view: DefaultTextures.brdfLutView(device) },
                      diffuseIntensity: initialDiffuse,
                      specularIntensity: initialSpec,
                    };
                desc.environment = environment;
              }
              desc.extensions = desc.extensions ?? {};
              if (clearcoatFactor > 0) {
                desc.extensions.clearcoat = {
                  factor: clearcoatFactor,
                  roughness: clearcoatRoughness,
                };
              }
              const matcapFactor = matcapFactorOverride ?? (matcapView ? 1.0 : 0.0);
              desc.extensions.matcap = {
                factor: matcapFactor,
                ...(matcapView ? { texture: { view: matcapView } } : {}),
              };
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
                  const start = v * comp;
                  for (let k = 0; k < comp; k++) vb[off + k] = src[start + k];
                } else {
                  for (let k = 0; k < comp; k++) vb[off + k] = 0;
                }
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
    }

    if (this.useNewPipeline) {
      this.updateSkyboxEnvironment(envMaps);
      PBRDebugPanel.getInstance().onEnvironmentChange((maps) => {
        this.updateSkyboxEnvironment(maps);
      });
    }

    if (this.useNewPipeline && this.prims.length > 0) {
      const mats = this.prims.map((p: any) => p.material);
      PBRDebugPanel.getInstance().attachMaterials(mats);
      // Hook matcap plane toggle to spawn/despawn a simple UV-mapped plane
      PBRDebugPanel.getInstance().onMatcapPlaneToggle((enabled) => {
        if (enabled) this.spawnMatcapPlane().catch(() => {});
        else this.destroyMatcapPlane();
      });
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

  private destroyMatcapPlane() {
    if (!this.matcapPlane) return;
    // Remove from list and destroy buffers
    const idx = (this.prims as any[]).indexOf(this.matcapPlane);
    if (idx >= 0) (this.prims as any[]).splice(idx, 1);
    try { this.matcapPlane!.vbo.destroy(); } catch {}
    try { this.matcapPlane!.ibo?.destroy(); } catch {}
    this.matcapPlane = null;
    this.matcapPlaneTr = null;
  }

  private async spawnMatcapPlane() {
    if (this.matcapPlane) return;
    const device = this.ctx.device;
    // Build a simple 2x2 quad in XY at Z=0 facing +Z, with UVs
    const positions = [
      -1, -1, 0,
       1, -1, 0,
       1,  1, 0,
      -1, -1, 0,
       1,  1, 0,
      -1,  1, 0,
    ];
    const normals = [
      0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, 1,  0, 0, 1,  0, 0, 1,
    ];
    const uvs = [
      0, 0,
      1, 0,
      1, 1,
      0, 0,
      1, 1,
      0, 1,
    ];
    const tangents = [
      1, 0, 0, 1,
      1, 0, 0, 1,
      1, 0, 0, 1,
      1, 0, 0, 1,
      1, 0, 0, 1,
      1, 0, 0, 1,
    ];

    // Create a dynamic geometry container with named attributes
    const geom = new AbstractDynamicGeom({});
    const posAttr = geom.GetAttribute<number>(AttributePlacement.POSITION, 'POSITION', 3);
    posAttr.PushArray(positions);
    posAttr.Count = positions.length / 3;
    const nAttr = geom.GetAttribute<number>(AttributePlacement.NORMAL, 'NORMAL', 3);
    nAttr.PushArray(normals);
    nAttr.Count = normals.length / 3;
    const uv0Attr = geom.GetAttribute<number>(AttributePlacement.TEXCOORD_0, 'TEXCOORD_0', 2);
    uv0Attr.PushArray(uvs);
    uv0Attr.Count = uvs.length / 2;
    const tanAttr = geom.GetAttribute<number>(AttributePlacement.TANGENT, 'TANGENT', 4);
    tanAttr.PushArray(tangents);
    tanAttr.Count = tangents.length / 4;

    // Map attribute names to expected locations
    geom.SetLocations({
      'POSITION': AttributePlacement.POSITION,
      'NORMAL': AttributePlacement.NORMAL,
      'TEXCOORD_0': AttributePlacement.TEXCOORD_0,
      'TANGENT': AttributePlacement.TANGENT,
    });

    // Create a minimal PBR material with matcap enabled
    const desc: any = { shading: 'pbr', textures: {}, scalars: { metallic: 0.0, roughness: 1.0 } };
    desc.extensions = { matcap: { factor: 1.0 } };
    const material = this.useNewPipeline
      ? MaterialFactory2.buildForward(device, this.ctx.presentationFormat, desc)
      : MaterialFactory.buildForward(device, this.ctx.presentationFormat, desc);

    // Build interleaved VBO like in GLTF path
    const byLoc: any = {};
    for (const k in geom.byNameAttributes) {
      const a: any = geom.byNameAttributes[k];
      if (a.isIndices) continue; else byLoc[a.location] = a;
    }
    const locations = [
      AttributePlacement.POSITION,
      AttributePlacement.NORMAL,
      AttributePlacement.TEXCOORD_0,
      AttributePlacement.TANGENT,
      AttributePlacement.TEXCOORD_1,
      AttributePlacement.JOINTS_0,
      AttributePlacement.WEIGHTS_0,
    ];
    const pos = byLoc[AttributePlacement.POSITION as number];
    const posCount = pos ? pos.Count : 0;
    if (!pos || posCount <= 0) return;
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

    const tr = new WebgpuTransform();
    tr.position.set(0, 0, 0);
    this.matcapPlaneTr = tr;
    const prim: PrimInfo = { geom, material, vbo, ibo: null, indexCount: 0, vertexCount: posCount, owner: tr, stride: strideBytes, indexIs32: false } as any;
    (this.prims as any).push(prim);
    this.matcapPlane = prim;

    // Attach to debug panel so matcap texture and debug params propagate
    PBRDebugPanel.getInstance().attachMaterials([material]);
  }

  private async buildProceduralPrimitive(
    type: string,
    envMaps: EnvironmentMaps | null,
    iblEnabled: boolean,
    iblDiffuseIntensity: number,
    iblSpecularIntensity: number,
    matcapView: GPUTextureView | null,
    matcapFactorOverride: number | null,
  ): Promise<boolean> {
    const device = this.ctx.device;
    const primitive = type.toLowerCase();
    const radius = QueryArgs.getFloat('primitiveRadius', 1.0);
    const segments = Math.max(3, QueryArgs.getInt('primitiveSegments', 32));
    const rings = Math.max(2, QueryArgs.getInt('primitiveRings', segments >> 1));
    const subdivisions = Math.max(0, QueryArgs.getInt('primitiveSubdiv', 1));

    let mesh: ProceduralMesh | null = null;
    if (primitive === 'uvsphere' || primitive === 'sphere') {
      mesh = createUvSphereMesh({ radius, widthSegments: segments, heightSegments: rings, generateUVs: true });
    } else if (primitive === 'icosphere' || primitive === 'icosahedron' || primitive === 'ico') {
      mesh = createIcosahedronMesh({ radius, subdivisions, generateUVs: true });
    } else {
      console.warn(`Unknown procedural primitive "${type}"`);
      return false;
    }

    const desc: any = { shading: 'pbr', textures: {}, scalars: { metallic: 0.0, roughness: 0.4 } };
    const attachEnvironment = iblEnabled || !!envMaps;
    if (attachEnvironment) {
      const envDiffuseView = envMaps
        ? envMaps.diffuse.view
        : DefaultTextures.neutralEnvironmentCube(device);
      const envSpecularView = envMaps
        ? envMaps.specular.view
        : DefaultTextures.neutralEnvironmentCube(device);
      const envBrdfView = DefaultTextures.brdfLutView(device);
      const specularMipLevels = envMaps ? envMaps.specular.mipLevelCount : 1;
      const initialDiffuse = iblEnabled ? iblDiffuseIntensity : 0;
      const initialSpecular = iblEnabled ? iblSpecularIntensity : 0;
      desc.environment = {
        diffuse: { view: envDiffuseView },
        specular: { view: envSpecularView, mipLevels: specularMipLevels },
        brdfLut: { view: envBrdfView },
        diffuseIntensity: initialDiffuse,
        specularIntensity: initialSpecular,
      };
    }

    const matcapFactor = matcapFactorOverride ?? (matcapView ? 1.0 : 0.0);
    desc.extensions = desc.extensions ?? {};
    desc.extensions.matcap = {
      factor: matcapFactor,
      ...(matcapView ? { texture: { view: matcapView } } : {}),
    };

    const material = MaterialFactory2.buildForward(device, this.ctx.presentationFormat, desc);
    material.setBaseColorFactor([1, 1, 1, 1]);

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const triangleIndices: number[] = [];
    const uv1: number[] = [];
    const joints0: number[] = [];
    const weights0: number[] = [];

    for (const primId of mesh.getPrimitiveIds()) {
      const triangles = mesh.getPrimitiveTriangles(primId);
      if (!triangles.length) continue;
      for (const tri of triangles) {
        if (tri.length !== 3) continue;
        const baseData = tri.map((pointId) => {
          const pos = mesh.getPointPosition(pointId);
          const normal = mesh.getPointAttribute<Vector3>(pointId, 'N') ?? pos.clone().normalize();
          const uv = mesh.getPointAttribute<Vector2>(pointId, 'UV') ?? sphericalUV(pos);
          return { pointId, pos, normal, uv };
        });

        if (baseData.length === 3) {
          let expectedX = 0, expectedY = 0, expectedZ = 0;
          for (const data of baseData) {
            expectedX += data.normal.x;
            expectedY += data.normal.y;
            expectedZ += data.normal.z;
          }
          const edge1x = baseData[1].pos.x - baseData[0].pos.x;
          const edge1y = baseData[1].pos.y - baseData[0].pos.y;
          const edge1z = baseData[1].pos.z - baseData[0].pos.z;
          const edge2x = baseData[2].pos.x - baseData[0].pos.x;
          const edge2y = baseData[2].pos.y - baseData[0].pos.y;
          const edge2z = baseData[2].pos.z - baseData[0].pos.z;
          const crossX = edge1y * edge2z - edge1z * edge2y;
          const crossY = edge1z * edge2x - edge1x * edge2z;
          const crossZ = edge1x * edge2y - edge1y * edge2x;
          const orientationDot = crossX * expectedX + crossY * expectedY + crossZ * expectedZ;
          if (orientationDot < 0) {
            const tmp = baseData[1];
            baseData[1] = baseData[2];
            baseData[2] = tmp;
          }
        }

        for (const data of baseData) {
          const vertIndex = positions.length / 3;
          positions.push(data.pos.x, data.pos.y, data.pos.z);
          normals.push(data.normal.x, data.normal.y, data.normal.z);
          uvs.push(data.uv.x, data.uv.y);
          triangleIndices.push(vertIndex);
          uv1.push(0, 0);
          joints0.push(0, 0, 0, 0);
          weights0.push(0, 0, 0, 0);
        }
      }
    }

    const vertexCount = positions.length / 3;
    if (!vertexCount) {
      console.warn('Failed to build procedural primitive: empty vertex data');
      return false;
    }

    const tangents: number[] = [];
    if (uvs.length >= vertexCount * 2) {
      const tan1x = new Float32Array(vertexCount);
      const tan1y = new Float32Array(vertexCount);
      const tan1z = new Float32Array(vertexCount);
      const tan2x = new Float32Array(vertexCount);
      const tan2y = new Float32Array(vertexCount);
      const tan2z = new Float32Array(vertexCount);

      for (let i = 0; i < triangleIndices.length; i += 3) {
        const i0 = triangleIndices[i];
        const i1 = triangleIndices[i + 1];
        const i2 = triangleIndices[i + 2];
        if (
          i0 === undefined || i1 === undefined || i2 === undefined ||
          i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount
        ) {
          continue;
        }

        const x0 = positions[i0 * 3 + 0];
        const y0 = positions[i0 * 3 + 1];
        const z0 = positions[i0 * 3 + 2];
        const x1 = positions[i1 * 3 + 0];
        const y1 = positions[i1 * 3 + 1];
        const z1 = positions[i1 * 3 + 2];
        const x2 = positions[i2 * 3 + 0];
        const y2 = positions[i2 * 3 + 1];
        const z2 = positions[i2 * 3 + 2];

        const u0 = uvs[i0 * 2 + 0];
        const v0 = uvs[i0 * 2 + 1];
        const u1 = uvs[i1 * 2 + 0];
        const v1 = uvs[i1 * 2 + 1];
        const u2 = uvs[i2 * 2 + 0];
        const v2 = uvs[i2 * 2 + 1];

        const dx1 = x1 - x0;
        const dy1 = y1 - y0;
        const dz1 = z1 - z0;
        const dx2 = x2 - x0;
        const dy2 = y2 - y0;
        const dz2 = z2 - z0;

        const du1 = u1 - u0;
        const dv1 = v1 - v0;
        const du2 = u2 - u0;
        const dv2 = v2 - v0;

        const denom = du1 * dv2 - du2 * dv1;
        if (Math.abs(denom) < 1e-8) {
          continue;
        }
        const r = 1.0 / denom;

        const sx = (dv2 * dx1 - dv1 * dx2) * r;
        const sy = (dv2 * dy1 - dv1 * dy2) * r;
        const sz = (dv2 * dz1 - dv1 * dz2) * r;

        const tx = (du1 * dx2 - du2 * dx1) * r;
        const ty = (du1 * dy2 - du2 * dy1) * r;
        const tz = (du1 * dz2 - du2 * dz1) * r;

        tan1x[i0] += sx; tan1y[i0] += sy; tan1z[i0] += sz;
        tan1x[i1] += sx; tan1y[i1] += sy; tan1z[i1] += sz;
        tan1x[i2] += sx; tan1y[i2] += sy; tan1z[i2] += sz;

        tan2x[i0] += tx; tan2y[i0] += ty; tan2z[i0] += tz;
        tan2x[i1] += tx; tan2y[i1] += ty; tan2z[i1] += tz;
        tan2x[i2] += tx; tan2y[i2] += ty; tan2z[i2] += tz;
      }

      for (let i = 0; i < vertexCount; i++) {
        const nx = normals[i * 3 + 0];
        const ny = normals[i * 3 + 1];
        const nz = normals[i * 3 + 2];

        let tx = tan1x[i];
        let ty = tan1y[i];
        let tz = tan1z[i];

        const ndott = nx * tx + ny * ty + nz * tz;
        tx -= nx * ndott;
        ty -= ny * ndott;
        tz -= nz * ndott;

        const len = Math.hypot(tx, ty, tz);
        if (len > 1e-6) {
          tx /= len;
          ty /= len;
          tz /= len;
        } else {
          // Fallback tangent orthogonal to the normal
          const refX = Math.abs(nx) < 0.9 ? 1 : 0;
          const refY = Math.abs(nx) < 0.9 ? 0 : 1;
          const refZ = 0;
          const cx = ny * refZ - nz * refY;
          const cy = nz * refX - nx * refZ;
          const cz = nx * refY - ny * refX;
          const clen = Math.hypot(cx, cy, cz) || 1;
          tx = cx / clen;
          ty = cy / clen;
          tz = cz / clen;
        }

        const bx = tan2x[i];
        const by = tan2y[i];
        const bz = tan2z[i];

        const crossX = ny * tz - nz * ty;
        const crossY = nz * tx - nx * tz;
        const crossZ = nx * ty - ny * tx;
        const handedness = (crossX * bx + crossY * by + crossZ * bz) < 0 ? -1 : 1;
        tangents.push(tx, ty, tz, handedness);
      }
    } else {
      for (let i = 0; i < vertexCount; i++) {
        tangents.push(1, 0, 0, 1);
      }
    }

    const geom = new AbstractDynamicGeom({});
    const posAttr = geom.GetAttribute<number>(AttributePlacement.POSITION, 'POSITION', 3);
    posAttr.PushArray(positions); posAttr.Count = vertexCount;
    const normAttr = geom.GetAttribute<number>(AttributePlacement.NORMAL, 'NORMAL', 3);
    normAttr.PushArray(normals); normAttr.Count = vertexCount;
    const uvAttr = geom.GetAttribute<number>(AttributePlacement.TEXCOORD_0, 'TEXCOORD_0', 2);
    uvAttr.PushArray(uvs); uvAttr.Count = vertexCount;
    const tanAttr = geom.GetAttribute<number>(AttributePlacement.TANGENT, 'TANGENT', 4);
    tanAttr.PushArray(tangents); tanAttr.Count = vertexCount;
    const uv1Attr = geom.GetAttribute<number>(AttributePlacement.TEXCOORD_1, 'TEXCOORD_1', 2);
    uv1Attr.PushArray(uv1); uv1Attr.Count = vertexCount;
    const jointsAttr = geom.GetAttribute<number>(AttributePlacement.JOINTS_0, 'JOINTS_0', 4);
    jointsAttr.PushArray(joints0); jointsAttr.Count = vertexCount;
    const weightsAttr = geom.GetAttribute<number>(AttributePlacement.WEIGHTS_0, 'WEIGHTS_0', 4);
    weightsAttr.PushArray(weights0); weightsAttr.Count = vertexCount;

    geom.SetLocations({
      POSITION: AttributePlacement.POSITION,
      NORMAL: AttributePlacement.NORMAL,
      TEXCOORD_0: AttributePlacement.TEXCOORD_0,
      TANGENT: AttributePlacement.TANGENT,
      TEXCOORD_1: AttributePlacement.TEXCOORD_1,
      JOINTS_0: AttributePlacement.JOINTS_0,
      WEIGHTS_0: AttributePlacement.WEIGHTS_0,
    });

    const byLoc: any = {};
    for (const key in geom.byNameAttributes) {
      const attr: any = (geom.byNameAttributes as any)[key];
      if (!attr.isIndices) byLoc[attr.location] = attr;
    }
    const locations = [
      AttributePlacement.POSITION,
      AttributePlacement.NORMAL,
      AttributePlacement.TEXCOORD_0,
      AttributePlacement.TANGENT,
      AttributePlacement.TEXCOORD_1,
      AttributePlacement.JOINTS_0,
      AttributePlacement.WEIGHTS_0,
    ];
    const updated = { updated: false };
    let strideBytes = 0;
    const buffers: (Float32Array | null)[] = new Array(locations.length).fill(null);
    for (let i = 0; i < locations.length; i++) {
      const ap = locations[i];
      const comp = AttributeComponentCount[AttributePlacement[ap]] as number;
      strideBytes += comp * 4;
      const attr = byLoc[ap as number];
      if (attr && !attr.isIndices) buffers[i] = attr.getArrayBuffer(updated) as Float32Array;
    }
    const floatsPerVertex = strideBytes / 4;
    const vb = new Float32Array(vertexCount * floatsPerVertex);
    for (let v = 0; v < vertexCount; v++) {
      let offset = v * floatsPerVertex;
      for (let i = 0; i < locations.length; i++) {
        const ap = locations[i];
        const comp = AttributeComponentCount[AttributePlacement[ap]] as number;
        const src = buffers[i];
        if (src) {
          const start = v * comp;
          for (let k = 0; k < comp; k++) {
            vb[offset + k] = src[start + k];
          }
        } else {
          for (let k = 0; k < comp; k++) {
            vb[offset + k] = 0;
          }
        }
        offset += comp;
      }
    }

    const vbo = device.createBuffer({ size: vb.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vbo, 0, vb.buffer);

    const transform = new WebgpuTransform();
    transform.position.set(0, 0, 0);

    const prim: PrimInfo = {
      geom,
      material,
      vbo,
      ibo: null,
      indexCount: 0,
      vertexCount,
      owner: transform,
      stride: strideBytes,
      indexIs32: false,
    } as any;

    (this.prims as any).push(prim);
    return true;
  }

  private ensureSkyboxResources() {
    const device = this.ctx.device;
    if (!this.skyboxVertexBuffer) {
      const vertices = new Float32Array([
        -1,  1, -1,
        -1, -1, -1,
         1, -1, -1,
         1,  1, -1,
         1, -1, -1,
        -1,  1, -1,

        -1, -1,  1,
        -1, -1, -1,
        -1,  1, -1,
        -1,  1, -1,
        -1,  1,  1,
        -1, -1,  1,

         1, -1, -1,
         1,  1,  1,
         1,  1,  1,
         1, -1,  1,
         1,  1, -1,
         1, -1, -1,

        -1, -1,  1,
        -1,  1,  1,
         1,  1,  1,
         1,  1,  1,
         1, -1,  1,
        -1, -1,  1,

        -1,  1, -1,
         1,  1, -1,
         1,  1,  1,
         1,  1,  1,
        -1,  1,  1,
        -1,  1, -1,

        -1, -1, -1,
        -1, -1,  1,
         1, -1, -1,
         1, -1, -1,
        -1, -1,  1,
         1, -1,  1,
      ]);
      this.skyboxVertexCount = vertices.length / 3;
      this.skyboxVertexBuffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(this.skyboxVertexBuffer, 0, vertices);
    }
    if (!this.skyboxUniformBuffer) {
      this.skyboxUniformBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    if (!this.skyboxSampler) {
      this.skyboxSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      });
    }
    if (!this.skyboxBindGroupLayout) {
      this.skyboxBindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        ],
      });
    }
    if (!this.skyboxPipeline) {
      const shaderModule = device.createShaderModule({
        code: `
struct VSOut { @builtin(position) position : vec4<f32>, @location(0) dir : vec3<f32>, };

struct SkyboxUniforms { viewProj : mat4x4<f32>, };

@group(0) @binding(0) var<uniform> uSky : SkyboxUniforms;
@group(0) @binding(1) var uSampler : sampler;
@group(0) @binding(2) var uTexture : texture_cube<f32>;

@vertex
fn vs_main(@location(0) position : vec3<f32>) -> VSOut {
  var out : VSOut;
  let clip = uSky.viewProj * vec4<f32>(position, 1.0);
  out.position = vec4<f32>(clip.xy, clip.w, clip.w);
  out.dir = position;
  return out;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let color = textureSampleLevel(uTexture, uSampler, normalize(in.dir), 0.0);
  return vec4<f32>(color.rgb, 1.0);
}
`,
      });
      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this.skyboxBindGroupLayout],
      });
      this.skyboxPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
          module: shaderModule,
          entryPoint: 'vs_main',
          buffers: [
            {
              arrayStride: 12,
              attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }],
            },
          ],
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_main',
          targets: [{ format: this.ctx.presentationFormat }],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { depthWriteEnabled: false, depthCompare: 'less-equal', format: 'depth24plus' },
      });
    }
  }

  private updateSkyboxEnvironment(maps: EnvironmentMaps | null) {
    if (!this.useNewPipeline) return;
    this.environmentMaps = maps;
    if (!maps) {
      this.skyboxBindGroup = null;
      return;
    }
    this.ensureSkyboxResources();
    this.skyboxBindGroup = this.ctx.device.createBindGroup({
      layout: this.skyboxBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this.skyboxUniformBuffer! } },
        { binding: 1, resource: this.skyboxSampler! },
        { binding: 2, resource: maps.specular.view },
      ],
    });
  }

  private renderSkybox(pass: GPURenderPassEncoder, viewMatrix: mat4) {
    if (!this.skyboxPipeline || !this.skyboxBindGroup || !this.skyboxVertexBuffer || !this.skyboxUniformBuffer) return;
    mat4.copy(this.skyboxView, viewMatrix);
    this.skyboxView[12] = 0;
    this.skyboxView[13] = 0;
    this.skyboxView[14] = 0;
    mat4.multiply(this.skyboxViewProj, this.ctx.projectionMatrix, this.skyboxView);
    const matrixData = this.skyboxViewProj as unknown as Float32Array;
    this.ctx.device.queue.writeBuffer(
      this.skyboxUniformBuffer,
      0,
      matrixData.buffer,
      matrixData.byteOffset,
      matrixData.byteLength,
    );
    pass.setPipeline(this.skyboxPipeline);
    pass.setBindGroup(0, this.skyboxBindGroup);
    pass.setVertexBuffer(0, this.skyboxVertexBuffer);
    pass.draw(this.skyboxVertexCount);
  }

  draw(commandEncoder: GPUCommandEncoder, swapView: GPUTextureView, viewProj: mat4, viewMatrix: mat4, cameraPos: [number, number, number]) {
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: swapView, clearValue: { r: 0.02, g: 0.02, b: 0.025, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthView!, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    this.renderSkybox(pass, viewMatrix);
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
