import {
  AbstractDynamicGeom,
  AbstractPositionAttribute,
  AbstractV3Attribute,
  AbstractV2Attribute,
  AbstractIndices,
} from '../WebgpuGeom';
import {
  MeshBufferOptions,
  buildMeshBuffers,
} from './mesh-buffer-adapter';
import { ProceduralMesh } from './procedural-mesh';

export interface DynamicGeomOptions extends MeshBufferOptions {
  attributeLocations?: Record<string, number>;
  forceUint32?: boolean;
}

export interface DynamicGeomResult {
  geometry: AbstractDynamicGeom;
  indexCount: number;
}

export function proceduralMeshToDynamicGeom(
  mesh: ProceduralMesh,
  options: DynamicGeomOptions = {},
): DynamicGeomResult {
  const buffers = buildMeshBuffers(mesh, options);
  const attributes: Record<string, AbstractPositionAttribute | AbstractV3Attribute | AbstractV2Attribute | AbstractIndices> = {};
  const useUint32 = options.forceUint32 || buffers.maxIndex > 0xffff;

  const positionAttr = new AbstractPositionAttribute(undefined, 'POSITION');
  positionAttr.PushArray(Array.from(buffers.positions));
  positionAttr.RebuildBuffer();
  attributes.POSITION = positionAttr;

  if (buffers.normals) {
    const normalAttr = new AbstractV3Attribute(undefined, 'NORMAL');
    normalAttr.PushArray(Array.from(buffers.normals));
    normalAttr.RebuildBuffer();
    attributes.NORMAL = normalAttr;
  }

  if (buffers.uvs) {
    const uvAttr = new AbstractV2Attribute(undefined, 'TEXCOORD_0');
    uvAttr.PushArray(Array.from(buffers.uvs));
    uvAttr.RebuildBuffer();
    attributes.TEXCOORD_0 = uvAttr;
  }

  const indexAttr = new AbstractIndices(undefined, 'index');
  if (!useUint32 && buffers.maxIndex > 0xffff) {
    console.warn('[proceduralMeshToDynamicGeom] Indices exceed Uint16 range; values will wrap. Set forceUint32=true or split geometry.');
    // TODO: implement automatic sub-geometry partitioning when exceeding uint16 limits (Unity-style splitting).
  }
  if (useUint32) {
    (indexAttr as any).floatArray = new Uint32Array(buffers.indices);
    (indexAttr as any).baseArray = Array.from(buffers.indices);
  } else {
    indexAttr.PushArray(Array.from(buffers.indices, (value) => value & 0xffff));
  }
  indexAttr.RebuildBuffer();
  attributes.index = indexAttr;

  const geom = new AbstractDynamicGeom(attributes);
  if (options.attributeLocations) {
    geom.SetLocations(options.attributeLocations);
  }

  return {
    geometry: geom,
    indexCount: buffers.indices.length,
  };
}
