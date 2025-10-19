import { GUI } from 'dat.gui';
import { loadGltfSimpleScene, createSimpleTexture, SimpleGltfScene } from '../../../Loaders/GLTF2WGPU2';
import { Matrix4 } from '../../../Math/Matrix4';
import { Vector3 } from '../../../Math/Vector3';
import { QuaternionHelper } from '../../../Math/QuaternionHelper';
import { WebgpuPerspectiveCamera, WebgpuFlyControls } from '../../../WebgpuOrbitControls';
import { input } from '../../../Input';
import { DeferredSampleGBuffer } from './RendererAndSceneAbstractions/DeferredSampleGBuffer';
import { DeferredSampleRenderer } from './RendererAndSceneAbstractions/DeferredSampleRenderer';

const vertexTextureQuad = require('./shaders/vertexTextureQuad.wgsl').default as string;
const fragmentGBuffersDebugView = require('./shaders/fragmentGBuffersDebugView.wgsl').default as string;
const fragmentDeferredRendering = require('./shaders/fragmentDeferredRendering.wgsl').default as string;
const lightUpdate = require('./shaders/lightUpdate.wgsl').default as string;
import { quitIfWebGPUNotAvailable, quitIfLimitLessThan } from './util';

const kMaxNumLights = 1024;
const lightExtentMin = new Vector3(-50, -30, -50);
const lightExtentMax = new Vector3(50, 50, 50);

function makePerspectiveFov(fovY: number, aspect: number, near: number, far: number): Matrix4 {
  const top = near * Math.tan(fovY / 2);
  const height = top * 2;
  const width = aspect * height;
  const left = -width / 2;
  const right = width / 2;
  const bottom = -top;
  return new Matrix4().makePerspective(left, right, top, bottom, near, far);
}

function writeMatrix(device: GPUDevice, buffer: GPUBuffer, offset: number, matrix: Matrix4) {
  const temp = new Float32Array(16);
  for (let i = 0; i < 16; i++) temp[i] = matrix.elements[i];
  device.queue.writeBuffer(buffer, offset, temp);
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const adapter = await navigator.gpu?.requestAdapter({
  featureLevel: 'compatibility',
});
const limits: Record<string, GPUSize32> = {};
quitIfLimitLessThan(adapter, 'maxStorageBuffersInFragmentStage', 1, limits);
const device = await adapter?.requestDevice({
  requiredLimits: limits,
});
quitIfWebGPUNotAvailable(adapter, device);

const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;

const devicePixelRatio = window.devicePixelRatio;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;
const aspect = canvas.width / canvas.height;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
});

const gltfScene: SimpleGltfScene = await loadGltfSimpleScene('assets/stanford_dragon_pbr/scene.gltf');
if (!gltfScene.primitives.length) {
  throw new Error('GLTF file contained no mesh primitives.');
}
const gltfPrimitive = gltfScene.primitives[0];
const positions = gltfPrimitive.positions;
const normals = gltfPrimitive.normals ?? new Float32Array(positions.length);
const uvs = gltfPrimitive.uvs ?? new Float32Array((positions.length / 3) * 2);
const vertexCount = positions.length / 3;

// Create the model vertex buffer.
const kVertexStride = 8;
const vertexBuffer = device.createBuffer({
  label: 'model vertex buffer',
  size: vertexCount * kVertexStride * Float32Array.BYTES_PER_ELEMENT,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
{
  const mapping = new Float32Array(vertexBuffer.getMappedRange());
  for (let i = 0; i < vertexCount; ++i) {
    const posIndex = i * 3;
    const uvIndex = i * 2;
    const base = kVertexStride * i;
    mapping[base + 0] = positions[posIndex + 0];
    mapping[base + 1] = positions[posIndex + 1];
    mapping[base + 2] = positions[posIndex + 2];
    mapping[base + 3] = normals[posIndex + 0] ?? 0;
    mapping[base + 4] = normals[posIndex + 1] ?? 0;
    mapping[base + 5] = normals[posIndex + 2] ?? 1;
    mapping[base + 6] = uvs[uvIndex + 0] ?? 0;
    mapping[base + 7] = uvs[uvIndex + 1] ?? 0;
  }
  vertexBuffer.unmap();
}

let indexArray = gltfPrimitive.indices;
if (!indexArray || indexArray.length === 0) {
  const generated = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; ++i) generated[i] = i;
  indexArray = generated;
}
const sourceIndexArray = Array.from(indexArray as ArrayLike<number>);
let maxIndex = 0;
for (let i = 0; i < sourceIndexArray.length; ++i) {
  if (sourceIndexArray[i] > maxIndex) maxIndex = sourceIndexArray[i];
}
const useUint32 = maxIndex > 65535;
const finalIndexArray = useUint32
  ? Uint32Array.from(sourceIndexArray)
  : Uint16Array.from(sourceIndexArray);
const indexFormat: GPUIndexFormat = useUint32 ? 'uint32' : 'uint16';

const indexCount = finalIndexArray.length;
const indexBuffer = device.createBuffer({
  label: 'model index buffer',
  size: finalIndexArray.byteLength,
  usage: GPUBufferUsage.INDEX,
  mappedAtCreation: true,
});
{
  if (useUint32) {
    new Uint32Array(indexBuffer.getMappedRange()).set(finalIndexArray as Uint32Array);
  } else {
    new Uint16Array(indexBuffer.getMappedRange()).set(finalIndexArray as Uint16Array);
  }
  indexBuffer.unmap();
}

const gbuffer = new DeferredSampleGBuffer(device, {
  width: canvas.width,
  height: canvas.height,
});

const vertexLayout: GPUVertexBufferLayout = {
  arrayStride: Float32Array.BYTES_PER_ELEMENT * 8,
  attributes: [
    {
      shaderLocation: 0,
      offset: 0,
      format: 'float32x3',
    },
    {
      shaderLocation: 1,
      offset: Float32Array.BYTES_PER_ELEMENT * 3,
      format: 'float32x3',
    },
    {
      shaderLocation: 2,
      offset: Float32Array.BYTES_PER_ELEMENT * 6,
      format: 'float32x2',
    },
  ],
};

const fallbackTextureStore: GPUTexture[] = [];
const createSolidTextureView = (device: GPUDevice, color: [number, number, number, number]) => {
  const texture = device.createTexture({
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const data = new Uint8Array([
    Math.round(Math.min(Math.max(color[0], 0.0), 1.0) * 255.0),
    Math.round(Math.min(Math.max(color[1], 0.0), 1.0) * 255.0),
    Math.round(Math.min(Math.max(color[2], 0.0), 1.0) * 255.0),
    Math.round(Math.min(Math.max(color[3], 0.0), 1.0) * 255.0),
  ]);
  device.queue.writeTexture(
    { texture },
    data,
    { bytesPerRow: 4 },
    { width: 1, height: 1, depthOrArrayLayers: 1 },
  );
  fallbackTextureStore.push(texture);
  return texture.createView();
};

async function textureViewOrFallback(index: number | undefined, fallback: GPUTextureView): Promise<{ view: GPUTextureView; usedFallback: boolean }> {
  if (index === undefined) {
    return { view: fallback, usedFallback: true };
  }
  const tex = createSimpleTexture(device, gltfScene, index);
  if (!tex) {
    return { view: fallback, usedFallback: true };
  }
  try {
    const gpuTex = await tex.GetGPUTex();
    return { view: gpuTex.createView(), usedFallback: false };
  } catch {
    return { view: fallback, usedFallback: true };
  }
}

const fallbackBaseColorView = createSolidTextureView(device, [1, 1, 1, 1]);
const fallbackMetallicRoughnessView = createSolidTextureView(device, [1, 1, 1, 1]);
const fallbackEmissiveView = createSolidTextureView(device, [0, 0, 0, 1]);
const fallbackOcclusionView = createSolidTextureView(device, [1, 1, 1, 1]);

const materialIndex = gltfPrimitive.materialIndex ?? 0;
const defaultMaterialInfo = {
  baseColorFactor: [1, 1, 1, 1] as [number, number, number, number],
  emissiveFactor: [0, 0, 0] as [number, number, number],
  metallicFactor: 1,
  roughnessFactor: 1,
  baseColorTexture: undefined,
  metallicRoughnessTexture: undefined,
  emissiveTexture: undefined,
  occlusionTexture: undefined,
};
const materialInfo = gltfScene.materials[materialIndex] ?? defaultMaterialInfo;

const baseColorTextureInfo = await textureViewOrFallback(materialInfo.baseColorTexture, fallbackBaseColorView);
const metallicRoughnessTextureInfo = await textureViewOrFallback(materialInfo.metallicRoughnessTexture, fallbackMetallicRoughnessView);
const emissiveTextureInfo = await textureViewOrFallback(materialInfo.emissiveTexture, fallbackEmissiveView);
const occlusionTextureInfo = await textureViewOrFallback(materialInfo.occlusionTexture, fallbackOcclusionView);

const materialParams = {
  baseColorFactor: materialInfo.baseColorFactor,
  emissiveFactor: materialInfo.emissiveFactor,
  metallicFactor: materialInfo.metallicFactor,
  roughnessFactor: materialInfo.roughnessFactor,
  aoFactor: 1.0,
  baseColorTexture: baseColorTextureInfo.usedFallback ? undefined : baseColorTextureInfo.view,
  metallicRoughnessTexture: metallicRoughnessTextureInfo.usedFallback ? undefined : metallicRoughnessTextureInfo.view,
  emissiveTexture: emissiveTextureInfo.usedFallback ? undefined : emissiveTextureInfo.view,
  occlusionTexture: occlusionTextureInfo.usedFallback ? undefined : occlusionTextureInfo.view,
};

const primitiveState: GPUPrimitiveState = {
  topology: 'triangle-list',
  cullMode: 'back',
};

const gBufferTexturesBindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      texture: {
        sampleType: 'unfilterable-float',
      },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: {
        sampleType: 'unfilterable-float',
      },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      texture: {
        sampleType: 'unfilterable-float',
      },
    },
    {
      binding: 3,
      visibility: GPUShaderStage.FRAGMENT,
      texture: {
        sampleType: 'unfilterable-float',
      },
    },
    {
      binding: 4,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: {
        type: 'non-filtering',
      },
    },
  ],
});

const lightsBufferBindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
      buffer: {
        type: 'read-only-storage',
      },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
      buffer: {
        type: 'uniform',
      },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: {
        type: 'uniform',
      },
    },
  ],
});

const gBuffersDebugViewPipeline = device.createRenderPipeline({
  label: 'debug view',
  layout: device.createPipelineLayout({
    bindGroupLayouts: [gBufferTexturesBindGroupLayout],
  }),
  vertex: {
    module: device.createShaderModule({
      code: vertexTextureQuad,
    }),
  },
  fragment: {
    module: device.createShaderModule({
      code: fragmentGBuffersDebugView,
    }),
    targets: [
      {
        format: presentationFormat,
      },
    ],
    constants: {
      canvasSizeWidth: canvas.width,
      canvasSizeHeight: canvas.height,
    },
  },
  primitive: primitiveState,
});

const deferredRenderPipeline = device.createRenderPipeline({
  label: 'deferred final',
  layout: device.createPipelineLayout({
    bindGroupLayouts: [
      gBufferTexturesBindGroupLayout,
      lightsBufferBindGroupLayout,
    ],
  }),
  vertex: {
    module: device.createShaderModule({
      code: vertexTextureQuad,
    }),
  },
  fragment: {
    module: device.createShaderModule({
      code: fragmentDeferredRendering,
    }),
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: primitiveState,
});

const textureQuadPassDescriptor: GPURenderPassDescriptor = {
  colorAttachments: [
    {
      // view is acquired and set in render loop.
      view: undefined,

      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
};

const settings = {
  mode: 'rendering',
  numLights: 128,
};
const configUniformBuffer = (() => {
  const buffer = device.createBuffer({
    label: 'config uniforms',
    size: Uint32Array.BYTES_PER_ELEMENT,
    mappedAtCreation: true,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  new Uint32Array(buffer.getMappedRange())[0] = settings.numLights;
  buffer.unmap();
  return buffer;
})();

const gui = new GUI();
gui.add(settings, 'mode', ['rendering', 'gBuffers view']);
gui
  .add(settings, 'numLights', 1, kMaxNumLights)
  .step(1)
  .onChange(() => {
    device.queue.writeBuffer(
      configUniformBuffer,
      0,
      new Uint32Array([settings.numLights])
    );
  });

const modelUniformBuffer = device.createBuffer({
  label: 'model matrix uniform',
  size: 4 * 16 * 2, // two 4x4 matrix
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const cameraUniformBuffer = device.createBuffer({
  label: 'camera matrix uniform',
  size: Float32Array.BYTES_PER_ELEMENT * 36,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const gBufferSampler = device.createSampler({
  label: 'gbuffer sampler',
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
  addressModeW: 'clamp-to-edge',
  magFilter: 'nearest',
  minFilter: 'nearest',
  mipmapFilter: 'nearest',
});

const sampleRenderer = new DeferredSampleRenderer({
  device,
  vertexLayout,
  gbuffer,
  modelBuffer: modelUniformBuffer,
  cameraBuffer: cameraUniformBuffer,
  gbufferTexturesLayout: gBufferTexturesBindGroupLayout,
  gbufferSampler: gBufferSampler,
  material: materialParams,
  fallbackTextures: {
    baseColor: fallbackBaseColorView,
    metallicRoughness: fallbackMetallicRoughnessView,
    emissive: fallbackEmissiveView,
    occlusion: fallbackOcclusionView,
  },
});

let gBufferTexturesBindGroup = sampleRenderer.gbufferBindGroupHandle;


// Lights data are uploaded in a storage buffer
// which could be updated/culled/etc. with a compute shader
const extentVec = lightExtentMax.clone().sub(lightExtentMin);
const lightDataStride = 8;
const bufferSizeInByte =
  Float32Array.BYTES_PER_ELEMENT * lightDataStride * kMaxNumLights;
const lightsBuffer = device.createBuffer({
  label: 'lights storage',
  size: bufferSizeInByte,
  usage: GPUBufferUsage.STORAGE,
  mappedAtCreation: true,
});

// We randomaly populate lights randomly in a box range
// And simply move them along y-axis per frame to show they are
// dynamic lightings
const lightData = new Float32Array(lightsBuffer.getMappedRange());
const tmpVec4 = new Float32Array(4);
let offset = 0;
for (let i = 0; i < kMaxNumLights; i++) {
  offset = lightDataStride * i;
  // position
  for (let i = 0; i < 3; i++) {
    tmpVec4[i] = Math.random() * extentVec.getComponent(i) + lightExtentMin.getComponent(i);
  }
  tmpVec4[3] = 1;
  lightData.set(tmpVec4, offset);
  // color
  tmpVec4[0] = Math.random() * 2;
  tmpVec4[1] = Math.random() * 2;
  tmpVec4[2] = Math.random() * 2;
  // radius
  tmpVec4[3] = 20.0;
  lightData.set(tmpVec4, offset + 4);
}
lightsBuffer.unmap();

const lightExtentBuffer = device.createBuffer({
  label: 'light extent uniform',
  size: 4 * 8,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const lightExtentData = new Float32Array(8);
lightExtentData.set([lightExtentMin.x, lightExtentMin.y, lightExtentMin.z, 0], 0);
lightExtentData.set([lightExtentMax.x, lightExtentMax.y, lightExtentMax.z, 0], 4);
device.queue.writeBuffer(
  lightExtentBuffer,
  0,
  lightExtentData.buffer,
  lightExtentData.byteOffset,
  lightExtentData.byteLength
);

const lightUpdateComputePipeline = device.createComputePipeline({
  label: 'light update',
  layout: 'auto',
  compute: {
    module: device.createShaderModule({
      code: lightUpdate,
    }),
  },
});
const lightsBufferBindGroup = device.createBindGroup({
  layout: lightsBufferBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: {
        buffer: lightsBuffer,
      },
    },
    {
      binding: 1,
      resource: {
        buffer: configUniformBuffer,
      },
    },
    {
      binding: 2,
      resource: {
        buffer: cameraUniformBuffer,
      },
    },
  ],
});
const lightsBufferComputeBindGroup = device.createBindGroup({
  layout: lightUpdateComputePipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: lightsBuffer,
      },
    },
    {
      binding: 1,
      resource: {
        buffer: configUniformBuffer,
      },
    },
    {
      binding: 2,
      resource: {
        buffer: lightExtentBuffer,
      },
    },
  ],
});
//--------------------

// Scene matrices & camera
const origin = new Vector3(0, 0, 0);
const worldUp = new Vector3(0, 1, 0);

const modelMatrix = new Matrix4().makeTranslation(0, -45, 0);
writeMatrix(device, modelUniformBuffer, 0, modelMatrix);
const normalModelData = modelMatrix.clone().invert().transpose();
writeMatrix(device, modelUniformBuffer, 64, normalModelData);

input.ListenDomElement(canvas);
const camera = new WebgpuPerspectiveCamera(72, aspect, 1, 2000);
camera.position.set(0, 50, -100);
camera.fov = 72;
camera.near = 1;
camera.far = 2000;
camera.aspectRatio = aspect;
camera.quaternion.copy(QuaternionHelper.LookAtQuaternion(camera.position, origin, worldUp));
camera.UpdateMatrix();
camera.UpdateMatrixWorld(false);
const flyControls = new WebgpuFlyControls(camera);
const toOrigin = origin.clone().sub(camera.position).normalize();
const initialYaw = Math.atan2(toOrigin.x, -toOrigin.z);
const initialPitch = Math.asin(Math.max(-1, Math.min(1, toOrigin.y)));
flyControls.yaw = initialYaw;
flyControls.pitch = initialPitch;
flyControls.UpdateYawPitch(0);
flyControls.needUpdate = false;

let cameraPositionArray = new Float32Array([camera.position.x, camera.position.y, camera.position.z, 1.0]);
device.queue.writeBuffer(cameraUniformBuffer, 128, cameraPositionArray);

let lastTime = performance.now();

function frame(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  flyControls.Update(dt);
  camera.UpdateMatrixWorld(false);

  const [gbufWidth, gbufHeight] = gbuffer.size;
  if (canvas.width !== gbufWidth || canvas.height !== gbufHeight) {
    sampleRenderer.ensureSize(canvas.width, canvas.height);
    gBufferTexturesBindGroup = sampleRenderer.gbufferBindGroupHandle;
  }

  const viewMatrix = camera.GetMatrixWorld().invert();
  const viewProj = camera.projectionMatrix.clone().multiplyMatrices(camera.projectionMatrix, viewMatrix);
  writeMatrix(device, cameraUniformBuffer, 0, viewProj);
  const cameraInvViewProj = viewProj.clone().invert();
  writeMatrix(device, cameraUniformBuffer, 64, cameraInvViewProj);
  cameraPositionArray[0] = camera.position.x;
  cameraPositionArray[1] = camera.position.y;
  cameraPositionArray[2] = camera.position.z;
  cameraPositionArray[3] = 1.0;
  device.queue.writeBuffer(cameraUniformBuffer, 128, cameraPositionArray);

  const commandEncoder = device.createCommandEncoder();
  {
    sampleRenderer.encodeGeometry(commandEncoder, vertexBuffer, indexBuffer, indexFormat, indexCount);
  }
  {
    // Update lights position
    const lightPass = commandEncoder.beginComputePass();
    lightPass.setPipeline(lightUpdateComputePipeline);
    lightPass.setBindGroup(0, lightsBufferComputeBindGroup);
    lightPass.dispatchWorkgroups(Math.ceil(kMaxNumLights / 64));
    lightPass.end();
  }
  {
    if (settings.mode === 'gBuffers view') {
      // GBuffers debug view
      // Left: depth
      // Middle: normal
      // Right: albedo (use uv to mimic a checkerboard texture)
      textureQuadPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();
      const debugViewPass = commandEncoder.beginRenderPass(
        textureQuadPassDescriptor
      );
      debugViewPass.setPipeline(gBuffersDebugViewPipeline);
      debugViewPass.setBindGroup(0, gBufferTexturesBindGroup);
      debugViewPass.draw(6);
      debugViewPass.end();
    } else {
      // Deferred rendering
      textureQuadPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();
      const deferredRenderingPass = commandEncoder.beginRenderPass(
        textureQuadPassDescriptor
      );
      deferredRenderingPass.setPipeline(deferredRenderPipeline);
      deferredRenderingPass.setBindGroup(0, gBufferTexturesBindGroup);
      deferredRenderingPass.setBindGroup(1, lightsBufferBindGroup);
      deferredRenderingPass.draw(6);
      deferredRenderingPass.end();
    }
  }
  device.queue.submit([commandEncoder.finish()]);

  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => {
  lastTime = t;
  frame(t);
});
