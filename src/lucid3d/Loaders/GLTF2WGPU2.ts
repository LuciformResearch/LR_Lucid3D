// Copyright 2018 The Immersive Web Community Group
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { AbstractAttributeBase, AbstractDynamicAttributeBase, AbstractFloatAttribute, AbstractDynamicGeom, AbstractIndices, AbstractReadonlyAttributeBase, AbstractReadonlyGeom, AbstractV3Attribute, AbstractV2Attribute, AbstractV4Attribute } from '../WebgpuGeom';

import { Vector4 } from '../Math/Vector4';
import { Vector2 } from '../Math/Vector2';
import { Vector3 } from '../Math/Vector3';
import { GL } from '../WebgpuApp';
import { Matrix4 } from '../Math/Matrix4';
import { WebgpuTransform } from '../WebgpuTransform';
import { MathHelper } from '../Math/MathHelper';
import { WebgpuSkin } from '../WebgpuSkin';
import { WebgpuAnimationSampler } from '../WebgpuAnimationSampler';
import { WebgpuAnimationChannel } from '../WebgpuAnimationChannel';
import { WebgpuAnimation } from '../WebgpuAnimation';
import { ShaderLocations } from '../ShaderLocation';
import { AbstractMeshBase, AbstractMeshGroup } from '../WebgpuMesh';
import { WebgpuMaterial } from '../PBRMaterial/WebgpuMaterial';
import { WebgpuMain } from '../WebgpuMain';
import {gltfAccessor} from './accessor';

export type TypedArray = Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array | Float32Array;
/*



return this.normalizedTypedView;
*/
/*
ce qu'il nous faut c'est refaire tourner l'exemple du renard en mode gltfviewersample, et débugger voir si on a les memes données extraites pour l'animation.
*/

let ExtractTypedArray = async (accessor: gltfAccessor, bv: Gltf2BufferView): Promise<TypedArray> => {
    await Promise.resolve(bv.dataView());

    const bufferView = bv;
    const buffer = await bv.buffer.arrayBuffer();
    const byteOffset = bv.byteOffset + (accessor.byteOffset || 0);
    if (accessor == undefined || accessor.componentType == undefined) {
        debugger;
    }
    const componentSize = getComponentSize(accessor.componentType);
    const componentCount = getComponentCount(accessor.type);
    const arrayLength = accessor.count * componentCount;

    // If data is interleaved (byteStride != 0), deinterleave using DataView
    if (bufferView.byteStride && bufferView.byteStride !== 0 && bufferView.byteStride !== componentCount * componentSize) {
        const stride = bufferView.byteStride;
        const dv = new DataView(buffer, byteOffset, accessor.count * stride);
        let out: TypedArray;
        let getter: (offset: number) => number;
        switch (accessor.componentType) {
            case ComponentType.BYTE:
                out = new Int8Array(arrayLength);
                getter = (o) => dv.getInt8(o);
                break;
            case ComponentType.UNSIGNED_BYTE:
                out = new Uint8Array(arrayLength);
                getter = (o) => dv.getUint8(o);
                break;
            case ComponentType.SHORT:
                out = new Int16Array(arrayLength);
                getter = (o) => dv.getInt16(o, true);
                break;
            case ComponentType.UNSIGNED_SHORT:
                out = new Uint16Array(arrayLength);
                getter = (o) => dv.getUint16(o, true);
                break;
            case ComponentType.UNSIGNED_INT:
                out = new Uint32Array(arrayLength);
                getter = (o) => dv.getUint32(o, true);
                break;
            case ComponentType.FLOAT:
            default:
                out = new Float32Array(arrayLength);
                getter = (o) => dv.getFloat32(o, true);
                break;
        }
        for (let i = 0; i < arrayLength; ++i) {
            const offset = Math.floor(i / componentCount) * stride + (i % componentCount) * componentSize;
            (out as any)[i] = getter(offset);
        }
        // Normalize if needed
        const normalized = accessor.normalized ? gltfAccessor.dequantize(out as any, accessor.componentType) as TypedArray : out;
        return normalized;
    }

    // Non-interleaved: direct typed array view
    let typed: TypedArray;
    switch (accessor.componentType) {
        case ComponentType.BYTE:
            typed = new Int8Array(buffer, byteOffset, arrayLength);
            break;
        case ComponentType.UNSIGNED_BYTE:
            typed = new Uint8Array(buffer, byteOffset, arrayLength);
            break;
        case ComponentType.SHORT:
            typed = new Int16Array(buffer, byteOffset, arrayLength);
            break;
        case ComponentType.UNSIGNED_SHORT:
            typed = new Uint16Array(buffer, byteOffset, arrayLength);
            break;
        case ComponentType.UNSIGNED_INT:
            typed = new Uint32Array(buffer, byteOffset, arrayLength);
            break;
        case ComponentType.FLOAT:
        default:
            typed = new Float32Array(buffer, byteOffset, arrayLength);
            break;
    }
    const normalizedTypedView = accessor.normalized ? gltfAccessor.dequantize(typed as any, accessor.componentType) as TypedArray : typed;
    return normalizedTypedView;
}

const GLConstants = WebGLRenderingContext; // For enums

const GLB_MAGIC = 0x46546C67;
const CHUNK_TYPE = {
    JSON: 0x4E4F534A,
    BIN: 0x004E4942,
};

export type SimpleGltfPrimitive = {
    positions: Float32Array;
    normals?: Float32Array;
    uvs?: Float32Array;
    tangents?: Float32Array;
    indices?: Uint16Array | Uint32Array;
    materialIndex?: number;
};

export type SimpleGltfSampler = {
    minFilter?: number;
    magFilter?: number;
    wrapS?: number;
    wrapT?: number;
};

export type SimpleGltfTexture = {
    index: number;
    resource: Gltf2Resource;
    sampler?: SimpleGltfSampler;
};

export type SimpleGltfMaterial = {
    name?: string;
    baseColorFactor: [number, number, number, number];
    metallicFactor: number;
    roughnessFactor: number;
    emissiveFactor: [number, number, number];
    baseColorTexture?: number;
    metallicRoughnessTexture?: number;
    normalTexture?: number;
    occlusionTexture?: number;
    emissiveTexture?: number;
};

export type SimpleGltfScene = {
    primitives: SimpleGltfPrimitive[];
    materials: SimpleGltfMaterial[];
    textures: SimpleGltfTexture[];
    bufferViews: Gltf2BufferView[];
};

async function fetchGltfSource(url: string): Promise<{ json: any; baseUrl: string; binaryChunk?: ArrayBuffer }> {
    const response = await fetch(url);
    const slash = url.lastIndexOf('/');
    const baseUrl = slash !== -1 ? url.substring(0, slash + 1) : '';
    if (url.endsWith('.gltf')) {
        const json = await response.json();
        return { json, baseUrl };
    }
    if (url.endsWith('.glb')) {
        const arrayBuffer = await response.arrayBuffer();
        const headerView = new DataView(arrayBuffer, 0, 12);
        const magic = headerView.getUint32(0, true);
        const version = headerView.getUint32(4, true);
        const length = headerView.getUint32(8, true);
        if (magic !== GLB_MAGIC) throw new Error('Invalid magic string in binary header.');
        if (version !== 2) throw new Error('Incompatible version in binary header.');
        let chunks: Record<number, ArrayBuffer> = {};
        let chunkOffset = 12;
        while (chunkOffset < length) {
            const chunkHeaderView = new DataView(arrayBuffer, chunkOffset, 8);
            const chunkLength = chunkHeaderView.getUint32(0, true);
            const chunkType = chunkHeaderView.getUint32(4, true);
            chunks[chunkType] = arrayBuffer.slice(chunkOffset + 8, chunkOffset + 8 + chunkLength);
            chunkOffset += chunkLength + 8;
        }
        if (!chunks[CHUNK_TYPE.JSON]) throw new Error('File contained no json chunk.');
        const decoder = new TextDecoder('utf-8');
        const jsonString = decoder.decode(chunks[CHUNK_TYPE.JSON]);
        const json = JSON.parse(jsonString);
        return { json, baseUrl, binaryChunk: chunks[CHUNK_TYPE.BIN] };
    }
    throw new Error('Unrecognized file extension');
}

export async function loadGltfSimpleScene(url: string): Promise<SimpleGltfScene> {
    const { json, baseUrl, binaryChunk } = await fetchGltfSource(url);
    if (!json.asset) throw new Error('Missing asset description.');
    if (json.asset.minVersion != '2.0' && json.asset.version != '2.0') throw new Error('Incompatible asset version.');

    const buffers: Gltf2Resource[] = [];
    if (binaryChunk) {
        buffers[0] = new Gltf2Resource({}, baseUrl, binaryChunk);
    } else {
        for (const buffer of json.buffers ?? []) {
            buffers.push(new Gltf2Resource(buffer, baseUrl));
        }
    }

const bufferViews: Gltf2BufferView[] = [];
for (const bufferView of json.bufferViews ?? []) {
    bufferViews.push(new Gltf2BufferView(bufferView, buffers));
}

const imageResources: Gltf2Resource[] = [];
for (const image of json.images ?? []) {
    imageResources.push(new Gltf2Resource(image, baseUrl));
}

const samplerDefs = json.samplers ?? [];
const texturesInfo: SimpleGltfTexture[] = [];
for (let tIndex = 0; tIndex < (json.textures?.length ?? 0); tIndex++) {
    const texture = json.textures[tIndex];
    const sampler = texture.sampler !== undefined ? samplerDefs[texture.sampler] : undefined;
    texturesInfo.push({
        index: texture.source,
        resource: imageResources[texture.source],
        sampler: sampler ? {
            minFilter: sampler.minFilter,
            magFilter: sampler.magFilter,
            wrapS: sampler.wrapS,
            wrapT: sampler.wrapT,
        } : undefined,
    });
}

const materials: SimpleGltfMaterial[] = [];
for (const material of json.materials ?? []) {
    const pbr = material.pbrMetallicRoughness ?? {};
    materials.push({
        name: material.name,
        baseColorFactor: (pbr.baseColorFactor ?? [1, 1, 1, 1]) as [number, number, number, number],
        metallicFactor: pbr.metallicFactor ?? 1,
        roughnessFactor: pbr.roughnessFactor ?? 1,
        emissiveFactor: (material.emissiveFactor ?? [0, 0, 0]) as [number, number, number],
        baseColorTexture: pbr.baseColorTexture?.index,
        metallicRoughnessTexture: pbr.metallicRoughnessTexture?.index,
        normalTexture: material.normalTexture?.index,
        occlusionTexture: material.occlusionTexture?.index,
        emissiveTexture: material.emissiveTexture?.index,
    });
}

    const accessors = json.accessors ?? [];
    const primitives: SimpleGltfPrimitive[] = [];

    for (const mesh of json.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
            const prim: SimpleGltfPrimitive = { positions: new Float32Array(), materialIndex: primitive.material };
            for (const name in primitive.attributes) {
                const accessorIndex = primitive.attributes[name];
                const accessor = accessors[accessorIndex];
                const bufferView = bufferViews[accessor.bufferView];
                const array = await ExtractTypedArray(accessor, bufferView);
                switch (name) {
                    case 'POSITION':
                        prim.positions = Float32Array.from(array as any);
                        break;
                    case 'NORMAL':
                        prim.normals = Float32Array.from(array as any);
                        break;
                    case 'TEXCOORD_0':
                        prim.uvs = Float32Array.from(array as any);
                        break;
                    case 'TANGENT':
                        prim.tangents = Float32Array.from(array as any);
                        break;
                    default:
                        break;
                }
            }
            if ('indices' in primitive) {
                const accessor = accessors[primitive.indices];
                const bufferView = bufferViews[accessor.bufferView];
                const array = await ExtractTypedArray(accessor, bufferView);
                if (array instanceof Uint32Array) {
                    prim.indices = new Uint32Array(array);
                } else if (array instanceof Uint16Array) {
                    prim.indices = new Uint16Array(array);
                } else if (array instanceof Uint8Array) {
                    prim.indices = new Uint16Array(array as Uint8Array);
                }
            }
            if (!prim.positions || prim.positions.length === 0) {
                console.warn('[GLTF] primitive without POSITION attribute skipped.');
                continue;
            }
            primitives.push(prim);
        }
    }
    const scene: SimpleGltfScene = {
        primitives,
        materials,
        textures: texturesInfo,
        bufferViews,
    };
    return scene;
}

function isAbsoluteUri(uri) {
    let absRegEx = new RegExp('^' + window.location.protocol, 'i');
    return !!uri.match(absRegEx);
}

function isDataUri(uri) {
    let dataRegEx = /^data:/;
    return !!uri.match(dataRegEx);
}

function resolveUri(uri, baseUrl) {
    if (isAbsoluteUri(uri) || isDataUri(uri)) {
        return uri;
    }
    return baseUrl + uri;
}


export async function loadGltfSimplePrimitives(url: string): Promise<SimpleGltfPrimitive[]> {
    const scene = await loadGltfSimpleScene(url);
    return scene.primitives;
}

export function createSimpleTexture(device: GPUDevice, scene: SimpleGltfScene, textureIndex: number): WebgpuTexture | null {
    const texInfo = scene.textures[textureIndex];
    if (!texInfo) return null;
    const tex = texInfo.resource.texture(scene.bufferViews, device);
    if (texInfo.sampler) {
        tex.minFilter = texInfo.sampler.minFilter;
        tex.magFilter = texInfo.sampler.magFilter;
        tex.wrapS = texInfo.sampler.wrapS;
        tex.wrapT = texInfo.sampler.wrapT;
    }
    return tex;
}

const CompononentCount = new Map(
    [
        ["SCALAR", 1],
        ["VEC2", 2],
        ["VEC3", 3],
        ["VEC4", 4],
        ["MAT2", 4],
        ["MAT3", 9],
        ["MAT4", 16]
    ]
);

let getComponentCount = (type: string) => {
    return CompononentCount.get(type);
}
export enum ComponentType {
    BYTE = 5120,
    UNSIGNED_BYTE = 5121,
    SHORT = 5122,
    UNSIGNED_SHORT = 5123,
    UNSIGNED_INT = 5125,
    FLOAT = 5126,
}
let getComponentSize = (componentType: number) => {
    switch (componentType) {
        case ComponentType.BYTE:
        case ComponentType.UNSIGNED_BYTE:
            return 1;
        case ComponentType.SHORT:
        case ComponentType.UNSIGNED_SHORT:
            return 2;
        case ComponentType.UNSIGNED_INT:
        case ComponentType.FLOAT:
            return 4;
        default:
            return 0;
    }
}
/*
BYTE = 5120,
UNSIGNED_BYTE = 5121,
SHORT = 5122,
UNSIGNED_SHORT = 5123,
UNSIGNED_INT = 5125,
FLOAT = 5126,

*/


export class RenderBuffer2 {
    _target: any;
    _usage: any;
    _length: number;
    _promise: Promise<this>;
    _ready: boolean = false;
    _glBuffer: WebGLBuffer;
    _data: DataView | Promise<DataView>;
    VertexBuffer(format: string, offset: number, location: number, device: GPUDevice) {

        if (this._data instanceof Promise) {

            this._data.then((data) => {
                const gpuBuffer = device.createBuffer({
                    // Round the buffer size up to the nearest multiple of 4.
                    size: Math.ceil(data.byteLength / 4) * 4,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                    mappedAtCreation: true,
                });

                const gpuBufferArray = new Uint8Array(gpuBuffer.getMappedRange());
                //new Float32Array(data.buffer, data.byteOffset, data.byteLength);
                gpuBufferArray.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
                gpuBuffer.unmap();

            });
        }
    }
    GLBuffer() {

        let gl = GL;
        if (this._glBuffer == undefined) {
            this._glBuffer = gl.createBuffer();
            if (this._data instanceof Promise) {
                console.log("IS PROMISE.");
                this._data.then((data) => {
                    this._ready = true;
                    gl.bindBuffer(this._target, this._glBuffer);
                    gl.bufferData(this._target, data, this._usage);
                    this._length = data.byteLength;
                    return this._glBuffer;
                });
            } else {
                console.log("NOT PROMISE");
                this._ready = true;
                gl.bindBuffer(this._target, this._glBuffer);
                gl.bufferData(this._target, this._data, this._usage);
                this._length = this._data.byteLength;

            }
        }
        return (this._glBuffer);
    }

    constructor(target, usage, buffer: Promise<DataView> | DataView) {
        this._target = target;
        this._usage = usage;
        this._length = length;
        this._data = buffer;
    }

    waitForComplete() {
        return this._promise;
    }
}

export class RenderBuffer {
    _target: any;
    _usage: any;
    _length: number;
    _buffer: any;
    _promise: Promise<this>;
    _ready: boolean = false;
    constructor(target, usage, buffer: WebGLBuffer | Promise<WebGLBuffer>, length = 0) {
        this._target = target;
        this._usage = usage;
        this._length = length;
        if (buffer instanceof Promise) {

            console.log("RenderBuffer data type is promise");
            this._buffer = null;
            this._promise = buffer.then((buffer) => {
                this._buffer = buffer;
                this._ready = true;
                return this;
            });
        } else {

            console.log("RenderBuffer data type is WebglBuffer");
            this._buffer = buffer;
            this._ready = true;
            this._promise = Promise.resolve(this);
        }
    }

    waitForComplete() {
        return this._promise;
    }
}
/**
 * Gltf2SceneLoader
 * Loads glTF 2.0 scenes into a renderable node tree.
 */

export class Gltf2Loader {
    main: WebgpuMain;
    constructor(main: WebgpuMain) {
        this.main = main;
    }

    loadFromUrl(url) {
        return fetch(url)
            .then((response) => {
                let i = url.lastIndexOf('/');
                let baseUrl = (i !== 0) ? url.substring(0, i + 1) : '';

                if (url.endsWith('.gltf')) {
                    return response.json().then((json) => {
                        return this.loadFromJson(json, baseUrl);
                    });
                } else if (url.endsWith('.glb')) {
                    return response.arrayBuffer().then((arrayBuffer) => {
                        return this.loadFromBinary(arrayBuffer, baseUrl);
                    });
                } else {
                    throw new Error('Unrecognized file extension');
                }
            });
    }

    loadFromBinary(arrayBuffer, baseUrl) {
        let headerView = new DataView(arrayBuffer, 0, 12);
        let magic = headerView.getUint32(0, true);
        let version = headerView.getUint32(4, true);
        let length = headerView.getUint32(8, true);

        if (magic != GLB_MAGIC) {
            throw new Error('Invalid magic string in binary header.');
        }

        if (version != 2) {
            throw new Error('Incompatible version in binary header.');
        }

        let chunks = {};
        let chunkOffset = 12;
        while (chunkOffset < length) {
            let chunkHeaderView = new DataView(arrayBuffer, chunkOffset, 8);
            let chunkLength = chunkHeaderView.getUint32(0, true);
            let chunkType = chunkHeaderView.getUint32(4, true);
            chunks[chunkType] = arrayBuffer.slice(chunkOffset + 8, chunkOffset + 8 + chunkLength);
            chunkOffset += chunkLength + 8;
        }

        if (!chunks[CHUNK_TYPE.JSON]) {
            throw new Error('File contained no json chunk.');
        }

        let decoder = new TextDecoder('utf-8');
        let jsonString = decoder.decode(chunks[CHUNK_TYPE.JSON]);
        let json = JSON.parse(jsonString);
        return this.loadFromJson(json, baseUrl, chunks[CHUNK_TYPE.BIN]);
    }

    async loadFromJson(json, baseUrl, binaryChunk?) {
        if (!json.asset) {
            throw new Error('Missing asset description.');
        }

        if (json.asset.minVersion != '2.0' && json.asset.version != '2.0') {
            throw new Error('Incompatible asset version.');
        }

        let buffers: Gltf2Resource[] = [];
        if (binaryChunk) {
            buffers[0] = new Gltf2Resource({}, baseUrl, binaryChunk);
        } else {
            for (let buffer of json.buffers) {
                buffers.push(new Gltf2Resource(buffer, baseUrl));
            }
        }

        let bufferViews: Gltf2BufferView[] = [];
        for (let bufferView of json.bufferViews) {
            bufferViews.push(new Gltf2BufferView(bufferView, buffers));
        }

        let images: Gltf2Resource[] = [];
        if (json.images) {
            for (let image of json.images) {
                images.push(new Gltf2Resource(image, baseUrl));
            }
        }

        let textures = [];
        if (json.textures) {
            for (let texture of json.textures) {
                let image = images[texture.source];
                let glTexture = image.texture(bufferViews, this.main.device);

                if (texture.sampler) {
                    let sampler = { ...texture.sampler };
                    glTexture.minFilter = sampler.minFilter;
                    glTexture.magFilter = sampler.magFilter;
                    glTexture.wrapS = sampler.wrapS;
                    glTexture.wrapT = sampler.wrapT;
                }
                //console.error("pushed one texture...");
                textures.push(glTexture);
            }
        }

        function getTexture(textureInfo): WebgpuTexture {
            if (!textureInfo) {
                return null;
            }
            return textures[textureInfo.index];
        }

        let materials = [];
        if (json.materials) {

            for (let material of json.materials) {
                let pbr = material.pbrMetallicRoughness || {};
                let baseColorTexture = getTexture(pbr.baseColorTexture);
                let metallicRoughnessTexture = getTexture(pbr.metallicRoughnessTexture);
                let normalTexture = getTexture(material.normalTexture);
                let occlusionTexture = getTexture(material.occlusionTexture);
                let emissiveTexture = getTexture(material.emissiveTexture);
                let mat = new WebgpuMaterial(this.main, { baseColorTexture, metallicRoughnessTexture, normalTexture, occlusionTexture, emissiveTexture });

                materials.push(mat);
                /*      let glMaterial = new PBRCompositeMaterial<any, any>(undefined, undefined);
      
                      let pbr = material.pbrMetallicRoughness || {};
                      glMaterial.mainModule.baseColorModule.value = new Vector4().fromArray(pbr.baseColorFactor || [1, 1, 1, 1]);
                      glMaterial.mainModule.baseColorModule.texture = getTexture(pbr.baseColorTexture);
      
      
                      let pbrModule = new PBRMetallicRougnessShaderModule();
                      glMaterial.mainModule.subModules.push(pbrModule);
                      pbrModule.uniforms.u_MetallicRoughnessFactor.value = new Vector2().fromArray([
                          pbr.metallicFactor || 1.0,
                          pbr.roughnessFactor || 1.0,
                      ]);
      
                      pbrModule.texture.texture = getTexture(pbr.metallicRoughnessTexture);
      
      
      
                      let normalModule = new PBRNormalMapShaderModule();
                      glMaterial.mainModule.subModules.push(normalModule);
                      let normalTex = getTexture(material.normalTexture);
      
                      normalModule.texture = normalTex;
      
                      let occlusionModule = new PBROcclusionShaderModule();
                      glMaterial.mainModule.subModules.push(occlusionModule);
                      occlusionModule.texture.texture = getTexture(material.occlusionTexture);
                      occlusionModule.uniforms.u_OcclusionStrength.value = (material.occlusionTexture && material.occlusionTexture.strength) ?
                          material.occlusionTexture.strength : 1.0;
      
                      let emissiveModule = new PBREmissiveShaderModule();
                      glMaterial.mainModule.subModules.push(emissiveModule);
                      emissiveModule.texture = getTexture(material.emissiveTexture);
                      emissiveModule.value = new Vector4().fromArray(material.emissiveFactor || [0, 0, 0, 0]);
      
      
                      switch (material.alphaMode) {
                          case 'BLEND':
                              glMaterial.blend = true;
                              break;
                          case 'MASK':
                              glMaterial.blend = true;
                              break;
                          default:
                              glMaterial.blend = false;
                      }
                      ;
                      glMaterial.cullFace = !(material.doubleSided);
      
                      materials.push(glMaterial);*/
            }
        }

        let accessors = json.accessors;
        let skins: { joints: number[], inverseBindMatrices: Float32Array, skeleton: number, skinRef: WebgpuSkin }[] = [];
        if (json.skins) {
            for (var i = 0; i < json.skins.length; i++) {
                let skin = json.skins[i];
                let invBindMatricesId = skin.inverseBindMatrices;
                let accessor = accessors[invBindMatricesId];
                let bufferView = bufferViews[accessor.bufferView];
                let elementCount = accessor.count;
                let arr = await ExtractTypedArray(accessor, bufferView);
                let joints = skin.joints;


                let invBindMatricesFlattened = arr as Float32Array;
                let invBindMatrices = Matrix4.FloatArrayToMatrices(invBindMatricesFlattened);
                let skinRef = new WebgpuSkin();

                skinRef.inverseBindMatrices = invBindMatrices;
                skins.push({ joints: joints, inverseBindMatrices: arr as any, skeleton: skin.skeleton, skinRef: skinRef });
            }
        }

        let meshes: AbstractMeshGroup[] = [];
        for (let mesh of json.meshes) {
            let glMesh = new AbstractMeshGroup();
            meshes.push(glMesh);
            for (let primitive of mesh.primitives) {
                let material = null;
                if ('material' in primitive) {
                    material = materials[primitive.material];

                } else {
                    material = new WebgpuMaterial(this.main);
                    /*  let glMaterial = new PBRCompositeMaterial<any, any>(undefined, undefined);
                      material = glMaterial;
  
                      let pbrModule = new PBRMetallicRougnessShaderModule();
                      glMaterial.mainModule.subModules.push(pbrModule);
                      pbrModule.uniforms.u_MetallicRoughnessFactor.value = new Vector2().fromArray([
                          1.0,
                          1.0,
                      ]);
                      pbrModule.texture.texture = getTexture(null);
  
                      let normalModule = new PBRNormalMapShaderModule();
                      glMaterial.mainModule.subModules.push(normalModule);
                      console.error("normal added");
                      let normalTex = null;
                      normalModule.texture = normalTex;
  
  
                      let occlusionModule = new PBROcclusionShaderModule();
                      glMaterial.mainModule.subModules.push(occlusionModule);
                      occlusionModule.texture.texture = null;
                      occlusionModule.uniforms.u_OcclusionStrength.value = 1.0;
  
                      let emissiveModule = new PBREmissiveShaderModule();
                      glMaterial.mainModule.subModules.push(emissiveModule);
                      emissiveModule.texture = null;
                      emissiveModule.value = new Vector4().fromArray([0, 0, 0, 0]);
                      glMaterial.mainModule.baseColorModule.value = new Vector4(1, 1, 1, 1);
                      glMaterial.mainModule.baseColorModule.texture = null;
                      glMaterial.cullFace = false;
                      glMaterial.blend = false;
                      glMaterial.Reset();*/
                }

                let attributes: { [index: string]: AbstractDynamicAttributeBase } = {};
                let elementCount = 0;


                let min = null;
                let max = null;

                for (let name in primitive.attributes) {
                    console.log("NAME FOUND : " + name);
                    let accessor = accessors[primitive.attributes[name]];
                    let bufferView = bufferViews[accessor.bufferView];
                    elementCount = accessor.count;

                    //const shaderLocation = ShaderLocations[name];
                    //if (shaderLocation === undefined) { continue; }


                    let componentCount = getComponentCount(accessor.type);
                    //let arr = ExtractTypedArray(accessor, bufferView);


                    /*let glAttribute = new AbstractReadonlyAttributeBase(name, bufferView, bufferView.renderBuffer(GLConstants.ARRAY_BUFFER), elementCount, componentCount, accessor.componentType, accessor.type, (accessor.normalized || 0),
                        accessor.byteStride || 0, accessor.byteOffset || 0, undefined, false, name == "POSITION"
                    );*/

                    let glAttribute = new AbstractDynamicAttributeBase(componentCount, undefined, name);

                    glAttribute.floatArray = await ExtractTypedArray(accessor, bufferView) as Float32Array | Uint16Array;
                    glAttribute.baseArray = [...glAttribute.floatArray];
                    glAttribute.RebuildBuffer();
                    if (name == "POSITION") {
                        glAttribute.isPositions = true;
                    }
                    attributes[glAttribute.name] = glAttribute;
                }

                let indices: AbstractDynamicAttributeBase = undefined;
                if ('indices' in primitive) {
                    let accessor = accessors[primitive.indices] as gltfAccessor;

                    let bufferView = bufferViews[accessor.bufferView];
                    let glAttribute = new AbstractDynamicAttributeBase(1, undefined, "index");
                    glAttribute.floatArray = await ExtractTypedArray(accessor, bufferView) as Uint16Array;
                    glAttribute.baseArray = [...glAttribute.floatArray];
                    indices = glAttribute;
                    glAttribute.RebuildBuffer();
                    /* new AbstractReadonlyAttributeBase("index", bufferView, bufferView.renderBuffer(GLConstants.ELEMENT_ARRAY_BUFFER), accessor.count,
                        getComponentCount(accessor.type), accessor.componentType, accessor.type, false, 0, accessor.byteOffset || 0,
                        undefined, true, false
                    );*/
                    indices.isIndices = true;
                }
                else {


                }

                if (!('TEXCOORD_0' in primitive.attributes))
                {
                    let posArr = await (attributes["POSITION"] as AbstractDynamicAttributeBase).floatArray;
                    let uvArr: number[] = [];
                    let count = posArr.length / 3;
                    for (let vIndex = 0; vIndex < count; vIndex++)
                    {
                        uvArr.push(0.0, 0.0);
                    }
                    let glAttribute = new AbstractV2Attribute(undefined, "TEXCOORD_0");
                    glAttribute.PushArray(uvArr);
                    glAttribute.RebuildBuffer();
                    attributes['TEXCOORD_0'] = glAttribute;
                }
                if (!('TEXCOORD_1' in primitive.attributes))
                {
                    let posArr = await (attributes["POSITION"] as AbstractDynamicAttributeBase).floatArray;
                    let uvArr: number[] = [];
                    let count = posArr.length / 3;
                    for (let vIndex = 0; vIndex < count; vIndex++)
                    {
                        uvArr.push(0.0, 0.0);
                    }
                    let glAttribute = new AbstractV2Attribute(undefined, "TEXCOORD_1");
                    glAttribute.PushArray(uvArr);
                    glAttribute.RebuildBuffer();
                    attributes['TEXCOORD_1'] = glAttribute;
                }
                if (!('COLOR_0' in primitive.attributes))
                {
                    let posArr = await (attributes["POSITION"] as AbstractDynamicAttributeBase).floatArray;
                    let colorArr: number[] = [];
                    let count = posArr.length / 3;
                    for (let vIndex = 0; vIndex < count; vIndex++)
                    {
                        colorArr.push(1.0, 1.0, 1.0, 1.0);
                    }
                    let glAttribute = new AbstractV4Attribute(undefined, "COLOR_0");
                    glAttribute.PushArray(colorArr);
                    glAttribute.RebuildBuffer();
                    attributes['COLOR_0'] = glAttribute;
                }
                if (!('NORMAL' in primitive.attributes)) {
                    let indicesArr = 'indices' in primitive ? await indices.floatArray : undefined;
                    let posArr = await (attributes["POSITION"] as AbstractDynamicAttributeBase).floatArray;
                    let normals = MathHelper.GetNormalsFromTriangles(Vector3.VectorsFromArray(posArr), indicesArr);
                    let glAttribute = new AbstractV3Attribute(undefined, "NORMAL");
                    let flattenedNormals = Vector3.FlattenArray(normals);
                    glAttribute.PushArray(flattenedNormals);
                    glAttribute.RebuildBuffer();
                    attributes['NORMAL'] = glAttribute;
                }

                if (!('TANGENT' in primitive.attributes)) {
                    // Compute tangents from positions, normals and UVs (TEXCOORD_0)
                    const posArr = await (attributes["POSITION"] as AbstractDynamicAttributeBase).floatArray as Float32Array;
                    const uvArr = await (attributes["TEXCOORD_0"] as AbstractDynamicAttributeBase).floatArray as Float32Array;
                    // Ensure normals exist (generated above if missing)
                    const nArr = await (attributes["NORMAL"] as AbstractDynamicAttributeBase).floatArray as Float32Array;
                    const vcount = posArr.length / 3;
                    const tan = new Float32Array(vcount * 3);
                    const bit = new Float32Array(vcount * 3);
                    const idxArr = ('indices' in primitive) ? (await (indices.floatArray)) as any as ArrayLike<number> : undefined;
                    const triCount = idxArr ? (idxArr.length / 3) : (vcount / 3);
                    const addVec3 = (arr: Float32Array, i: number, x: number, y: number, z: number) => { arr[i*3+0]+=x; arr[i*3+1]+=y; arr[i*3+2]+=z; };
                    for (let t = 0; t < triCount; t++) {
                        const i0 = idxArr ? idxArr[t*3+0] : (t*3+0);
                        const i1 = idxArr ? idxArr[t*3+1] : (t*3+1);
                        const i2 = idxArr ? idxArr[t*3+2] : (t*3+2);
                        const p0x = posArr[i0*3+0], p0y = posArr[i0*3+1], p0z = posArr[i0*3+2];
                        const p1x = posArr[i1*3+0], p1y = posArr[i1*3+1], p1z = posArr[i1*3+2];
                        const p2x = posArr[i2*3+0], p2y = posArr[i2*3+1], p2z = posArr[i2*3+2];
                        const uv0x = uvArr[i0*2+0], uv0y = uvArr[i0*2+1];
                        const uv1x = uvArr[i1*2+0], uv1y = uvArr[i1*2+1];
                        const uv2x = uvArr[i2*2+0], uv2y = uvArr[i2*2+1];
                        const x1 = p1x - p0x, y1 = p1y - p0y, z1 = p1z - p0z;
                        const x2 = p2x - p0x, y2 = p2y - p0y, z2 = p2z - p0z;
                        const s1 = uv1x - uv0x, t1 = uv1y - uv0y;
                        const s2 = uv2x - uv0x, t2 = uv2y - uv0y;
                        const denom = (s1 * t2 - s2 * t1);
                        if (Math.abs(denom) < 1e-6) { continue; }
                        const r = 1.0 / denom;
                        const tx = (x1 * t2 - x2 * t1) * r;
                        const ty = (y1 * t2 - y2 * t1) * r;
                        const tz = (z1 * t2 - z2 * t1) * r;
                        const bx = (x2 * s1 - x1 * s2) * r;
                        const by = (y2 * s1 - y1 * s2) * r;
                        const bz = (z2 * s1 - z1 * s2) * r;
                        addVec3(tan, i0, tx, ty, tz); addVec3(tan, i1, tx, ty, tz); addVec3(tan, i2, tx, ty, tz);
                        addVec3(bit, i0, bx, by, bz); addVec3(bit, i1, bx, by, bz); addVec3(bit, i2, bx, by, bz);
                    }
                    const tangents: number[] = new Array(vcount * 4);
                    for (let i = 0; i < vcount; i++) {
                        const nx = nArr[i*3+0], ny = nArr[i*3+1], nz = nArr[i*3+2];
                        const tx = tan[i*3+0], ty = tan[i*3+1], tz = tan[i*3+2];
                        const bx = bit[i*3+0], by = bit[i*3+1], bz = bit[i*3+2];
                        // Gram-Schmidt orthonormalize tangent against normal
                        const ndott = nx*tx + ny*ty + nz*tz;
                        let rx = tx - nx*ndott, ry = ty - ny*ndott, rz = tz - nz*ndott;
                        const rlen = Math.hypot(rx, ry, rz) || 1.0;
                        rx /= rlen; ry /= rlen; rz /= rlen;
                        // Handedness
                        const cx = ny*rz - nz*ry;
                        const cy = nz*rx - nx*rz;
                        const cz = nx*ry - ny*rx;
                        const handed = (cx*bx + cy*by + cz*bz) < 0.0 ? -1.0 : 1.0;
                        tangents[i*4+0] = rx; tangents[i*4+1] = ry; tangents[i*4+2] = rz; tangents[i*4+3] = handed;
                    }
                    const glAttribute = new AbstractV4Attribute(undefined, "TANGENT");
                    glAttribute.PushArray(tangents);
                    glAttribute.RebuildBuffer();
                    attributes['TANGENT'] = glAttribute;
                }
                if (!('JOINTS_0' in primitive.attributes)) {
                    let posArr = await (attributes["POSITION"] as AbstractDynamicAttributeBase).floatArray;
                    let colorArr: number[] = [];
                    let count = posArr.length / 3;
                    for (let vIndex = 0; vIndex < count; vIndex++)
                    {
                        colorArr.push(0, 0, 0, 0);
                    }
                    let glAttribute = new AbstractV4Attribute(undefined, "JOINTS_0");
                    glAttribute.PushArray(colorArr);
                    glAttribute.RebuildBuffer();
                    attributes['JOINTS_0'] = glAttribute;
                }
                if (!('WEIGHTS_0' in primitive.attributes)) {
                    let posArr = await (attributes["POSITION"] as AbstractDynamicAttributeBase).floatArray;
                    let colorArr: number[] = [];
                    let count = posArr.length / 3;
                    for (let vIndex = 0; vIndex < count; vIndex++)
                    {
                        colorArr.push(1.0, 0.0, 0.0, 0.0);
                    }
                    let glAttribute = new AbstractV4Attribute(undefined, "WEIGHTS_0");
                    glAttribute.PushArray(colorArr);
                    glAttribute.RebuildBuffer();
                    attributes['WEIGHTS_0'] = glAttribute;
                }

                if (!('JOINTS_1' in primitive.attributes)) {
                    let posArr = await (attributes["POSITION"] as AbstractDynamicAttributeBase).floatArray;
                    let colorArr: number[] = [];
                    let count = posArr.length / 3;
                    for (let vIndex = 0; vIndex < count; vIndex++)
                    {
                        colorArr.push(0, 0, 0, 0);
                    }
                    let glAttribute = new AbstractV4Attribute(undefined, "JOINTS_1");
                    glAttribute.PushArray(colorArr);
                    glAttribute.RebuildBuffer();
                    attributes['JOINTS_1'] = glAttribute;
                }
                if (!('WEIGHTS_1' in primitive.attributes)) {
                    let posArr = await (attributes["POSITION"] as AbstractDynamicAttributeBase).floatArray;
                    let colorArr: number[] = [];
                    let count = posArr.length / 3;
                    for (let vIndex = 0; vIndex < count; vIndex++)
                    {
                        colorArr.push(0.0, 0.0, 0.0, 0.0);
                    }
                    let glAttribute = new AbstractV4Attribute(undefined, "WEIGHTS_1");
                    glAttribute.PushArray(colorArr);
                    glAttribute.RebuildBuffer();
                    attributes['WEIGHTS_1'] = glAttribute;
                }

                if (indices)
                {
                    attributes["index"] = indices;
                }
                // Debug: basic validation of weights/joints
                try {
                    const w0 = attributes['WEIGHTS_0'];
                    const w1 = attributes['WEIGHTS_1'];
                    const j0 = attributes['JOINTS_0'];
                    const j1 = attributes['JOINTS_1'];
                    if (w0 && w1 && j0 && j1) {
                        const w0arr: number[] = (w0 as any).baseArray || [];
                        const w1arr: number[] = (w1 as any).baseArray || [];
                        const j0arr: number[] = (j0 as any).baseArray || [];
                        const j1arr: number[] = (j1 as any).baseArray || [];
                        const count = Math.min(w0arr.length, w1arr.length, j0arr.length, j1arr.length) / 4;
                        let minSum = 9999, maxSum = -9999;
                        for (let v = 0; v < Math.min(count, 50); v++) {
                            const s = w0arr[v*4+0]+w0arr[v*4+1]+w0arr[v*4+2]+w0arr[v*4+3]
                                    + w1arr[v*4+0]+w1arr[v*4+1]+w1arr[v*4+2]+w1arr[v*4+3];
                            if (s < minSum) minSum = s;
                            if (s > maxSum) maxSum = s;
                        }
                        console.log(`[GLTF DEBUG] weights sum (first 50) min=${minSum.toFixed(3)} max=${maxSum.toFixed(3)}`);
                    }
                } catch {}

                let glPrimitive = new AbstractDynamicGeom(attributes);
                let locations: { [index: string]: number } = {};
                Object.keys(attributes).map((attrName) => {
                    locations[attrName] = ShaderLocations[attrName];
                });
                //let webgpuGeom = new WebgpuGeom(glPrimitive, locations);
                glMesh.primitives.push(
                    new AbstractMeshBase(glPrimitive, material));
            }
        }

        let sceneRoot = new WebgpuTransform();
        let scene = json.scenes[json.scene];
        let transformById: { [index: string]: WebgpuTransform } = {};
        for (let nodeId of scene.nodes) {
            let scnRootChild = this.processNodes(nodeId, json.nodes, meshes, skins, transformById);
            sceneRoot.Add(scnRootChild);
        }
        for (let i = 0; i < skins.length; i++) {
            let joints = skins[i].joints;
            let skin = skins[i].skinRef;
            if (skins[i].skeleton) {
                skin.root = transformById[skins[i].skeleton];
            }
            for (let k = 0; k < joints.length; k++) {
                skin.joints.push(transformById[joints[k]]);
            }
            //skin.helper = new WebglSkeletonHelper(skin);
            //sceneRoot.mesh.primitives.push(skin.helper);
        }
        let animations: WebgpuAnimation[] = [];
        let animationsJsons = json.animations;
        if (animationsJsons) {
            for (let i = 0; i < animationsJsons.length; i++) {
                let anim = animationsJsons[i];
                let channelsJsons = anim.channels;
                let samplersJsons = anim.samplers;
                let channels: WebgpuAnimationChannel[] = [];
                let samplersById: { [index: number]: WebgpuAnimationSampler } = {};

                for (let k = 0; k < channelsJsons.length; k++) {
                    let samplerId = channelsJsons[k].sampler;

                    let transform = transformById[channelsJsons[k].target.node];
                    if (samplersById[samplerId] == undefined) {
                        let samplerJson = samplersJsons[samplerId];
                        let inputId = samplerJson.input;
                        let outputId = samplerJson.output;
                        let inputAccessor = accessors[inputId];
                        let outputAccessor = accessors[outputId];

                        let input = await ExtractTypedArray(accessors[inputId], bufferViews[inputAccessor.bufferView]);
                        let output = await ExtractTypedArray(accessors[outputId], bufferViews[outputAccessor.bufferView]);
                        //debugger;
                        let interpolation = samplerJson.interpolation;
                        let path = channelsJsons[k].target.path;
                        let sampler = new WebgpuAnimationSampler(path, interpolation, input, output);
                        samplersById[samplerId] = sampler;
                    }
                    let channel = new WebgpuAnimationChannel(samplersById[samplerId], transform);
                    channels.push(channel);
                }
                let animation: WebgpuAnimation = new WebgpuAnimation(channels);
                animations.push(animation);
            }
        }

        return ({ transformRoot: sceneRoot, animations: animations });
    }
    /*
  
  "animations": [
    { // une animation....
        // il y a plusieurs samplers, qui définissent des temps et des valeurs, par exemple pour des rotations ce sera des quaternions.
      "samplers" : [
        {
          "input" : 2, // un accesseur de timestamps, toujours >= 0, et qui vont par ordre croissant.
          "interpolation" : "LINEAR",
          "output" : 3 // un accesseur de valeurs (par exemple rotation ce sera des quaternion)
        }
      ],
      // plusieurs channels a animer, donc simplement par exemple la rotation pour la node 0, etc...
      // pourquoi plusieurs channel, parceque plusieurs os, et des fois des os qui bougent en plus de tourner etc...
      // un channel par mouvement, d'un os.
      "channels" : [ {
        "sampler" : 0,
        "target" : {
          "node" : 0,
          "path" : "rotation"
        }
      } ]
    }
  ],
    
    */

    processNodes(nodeId, nodes, meshes: AbstractMeshGroup[], skins: { skinRef: WebgpuSkin & any }[], transformsById: { [index: number]: WebgpuTransform } = {}) {
        let glNode = new WebgpuTransform();
        glNode.srcNodeId = nodeId;
        let node = nodes[nodeId];
        transformsById[nodeId] = glNode;
        glNode.name = node.name;

        if ('mesh' in node) {
            let mesh = meshes[node.mesh];
            glNode.mesh = mesh;
        }
        if ('skin' in node) {
            glNode.mesh.skin = skins[node.skin].skinRef;
            for (var i = 0; i < glNode.mesh.primitives.length; i++) {
                let prim = glNode.mesh.primitives[i];
                let mat = (prim.material as  any);
                //let skinModule = new SkinShaderModule();
                //let skin = skins[node.skin].skinRef as WebgpuSkin;
                //skinModule.texture = skin.jointsTexture;



                //mat.mainModule.subModules.push(skinModule);
            }
        }

        if (node.matrix) {
            glNode.SetMatrix(new Matrix4().fromArray(new Float32Array(node.matrix)));
        } else if (node.translation || node.rotation || node.scale) {
            if (node.translation) {
                glNode.position.fromArray(new Float32Array(node.translation));
            }

            if (node.rotation) {
                glNode.quaternion.fromArray(new Float32Array(node.rotation));
            }

            if (node.scale) {
                glNode.scale.fromArray(new Float32Array(node.scale));
            }
        }

        if (node.children) {
            for (let nodeId of node.children) {
                let child = this.processNodes(nodeId, nodes, meshes, skins, transformsById);
                glNode.Add(child);

            }
        }
        return glNode;
    }
}


export class Gltf2BufferView {
    buffer: Gltf2Resource;
    byteOffset: number;
    byteLength: number;
    byteStride: number;
    _viewPromise: Promise<DataView>;
    _renderBuffer: any;
    constructor(json, buffers: Gltf2Resource[]) {
        this.buffer = buffers[json.buffer];
        this.byteOffset = json.byteOffset || 0;
        this.byteLength = json.byteLength || null;
        this.byteStride = json.byteStride;

        this._viewPromise = null;
        this._renderBuffer = null;
    }

    dataView() {
        if (!this._viewPromise) {
            this._viewPromise = this.buffer.arrayBuffer().then((arrayBuffer) => {
                return new DataView(arrayBuffer, this.byteOffset, this.byteLength);
            });
        }
        return this._viewPromise;
    }

    renderBuffer(target) {


        let data = this.dataView();
        return (new RenderBuffer2(target, GLConstants.STATIC_DRAW, data));

    }
}
export class WebgpuTexture {
    GPUtex: GPUTexture = undefined;
    minFilter: any;
    magFilter: any;
    wrapS: any;
    wrapT: any;
    promise: Promise<GPUTexture>;
    GetGPUTex(): Promise<GPUTexture> {
        return (this.promise);
    }
    constructor(device: GPUDevice, img: HTMLImageElement) {
        this.promise = new Promise<GPUTexture>(async (resolve, reject) => {
            await img.decode();
            this.GPUtex = device.createTexture({
                size: [img.width, img.height, 1],
                format: 'rgba8unorm-srgb',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST |
                    GPUTextureUsage.RENDER_ATTACHMENT,
            });
            var bmp = await createImageBitmap(img);
            var src = { source: bmp };
            var dst = { texture: this.GPUtex };
            device.queue.copyExternalImageToTexture(src, dst, [img.width, img.height, 1]);
            resolve(this.GPUtex);
        });
    }
}
export class Gltf2Resource {
    json: any;
    baseUrl: any;
    _dataPromise: any;
    _texture: WebgpuTexture;
    constructor(json, baseUrl, arrayBuffer?) {
        this.json = json;
        this.baseUrl = baseUrl;

        this._dataPromise = null;
        this._texture = null;
        if (arrayBuffer) {
            this._dataPromise = Promise.resolve(arrayBuffer);
        }
    }

    arrayBuffer(): Promise<ArrayBuffer | SharedArrayBuffer> {
        if (!this._dataPromise) {
            if (isDataUri(this.json.uri)) {
                let base64String = this.json.uri.replace('data:application/octet-stream;base64,', '');
                let binaryArray = Uint8Array.from(atob(base64String), (c) => c.charCodeAt(0));
                this._dataPromise = Promise.resolve(binaryArray.buffer);
                return this._dataPromise;
            }

            this._dataPromise = fetch(resolveUri(this.json.uri, this.baseUrl))
                .then((response) => response.arrayBuffer());
        }
        return this._dataPromise;
    }

    /*
              for (var i = 0; i < glbJsonData['images'].length; ++i) {
                    var imgJson = glbJsonData['images'][i];
                    var imageView = new GLTFBufferView(
                        glbBuffer, glbJsonData['bufferViews'][imgJson['bufferView']]);
                    var imgBlob = new Blob([imageView.buffer], {type: imgJson['mime/type']});
                    var img = await createImageBitmap(imgBlob);
        
                    // TODO: For glTF we need to look at where an image is used to know
                    // if it should be srgb or not. We basically need to pass through
                    // the material list and find if the texture which uses this image
                    // is used by a metallic/roughness param
                    var gpuImg = device.createTexture({
                        size: [img.width, img.height, 1],
                        format: 'rgba8unorm-srgb',
                        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST |
                            GPUTextureUsage.RENDER_ATTACHMENT,
                    });
        
                    var src = {source: img};
                    var dst = {texture: gpuImg};
                    device.queue.copyExternalImageToTexture(src, dst, [img.width, img.height, 1]);
        
                    images.push(gpuImg);
                }
    
    */
    private _img: HTMLImageElement = undefined;
    private _loading: boolean = false;
    texture(bufferViews, device: GPUDevice): WebgpuTexture {
        if (!this._img) {
            let img = document.createElement("img") as HTMLImageElement;
            this._img = img;
            if (this.json.uri) {
                if (isDataUri(this.json.uri)) {
                    img.src = this.json.uri;

                } else {
                    img.src = `${this.baseUrl}${this.json.uri}`;
                }
            } else {
                //this._texture.genDataKey();
                let view = bufferViews[this.json.bufferView];
                view.dataView().then((dataView) => {
                    let blob = new Blob([dataView], { type: this.json.mimeType });
                    img.src = window.URL.createObjectURL(blob);
                });
            }

        }
        if (!this._texture) {
            this._texture = new WebgpuTexture(device, this._img);
        }
        return (this._texture);
    }
}
