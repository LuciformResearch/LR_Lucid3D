import { GUI } from 'dat.gui';
import { mesh } from './mesh/stanfordDragon';
import { Matrix4 } from '../../../Math/Matrix4';
import { Vector3 } from '../../../Math/Vector3';
import { QuaternionHelper } from '../../../Math/QuaternionHelper';
import { WebgpuPerspectiveCamera, WebgpuFlyControls } from '../../../WebgpuOrbitControls';
import { input } from '../../../Input';

const vertexWriteGBuffers = require('./shaders/vertexWriteGBuffers.wgsl').default as string;
const fragmentWriteGBuffers = require('./shaders/fragmentWriteGBuffers.wgsl').default as string;
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

// Create the model vertex buffer.
const kVertexStride = 8;
const vertexBuffer = device.createBuffer({
  label: 'model vertex buffer',
  // position: vec3, normal: vec3, uv: vec2
  size: mesh.positions.length * kVertexStride * Float32Array.BYTES_PER_ELEMENT,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
{
  const mapping = new Float32Array(vertexBuffer.getMappedRange());
  for (let i = 0; i < mesh.positions.length; ++i) {
    mapping.set(mesh.positions[i], kVertexStride * i);
    mapping.set(mesh.normals[i], kVertexStride * i + 3);
    mapping.set(mesh.uvs[i], kVertexStride * i + 6);
  }
  vertexBuffer.unmap();
}

// Create the model index buffer.
const indexCount = mesh.triangles.length * 3;
const indexBuffer = device.createBuffer({
  label: 'model index buffer',
  size: indexCount * Uint16Array.BYTES_PER_ELEMENT,
  usage: GPUBufferUsage.INDEX,
  mappedAtCreation: true,
});
{
  const mapping = new Uint16Array(indexBuffer.getMappedRange());
  for (let i = 0; i < mesh.triangles.length; ++i) {
    mapping.set(mesh.triangles[i], 3 * i);
  }
  indexBuffer.unmap();
}

// GBuffer texture render targets
const gBufferTexture2DFloat16 = device.createTexture({
  size: [canvas.width, canvas.height],
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  format: 'rgba16float',
});
const gBufferTextureAlbedo = device.createTexture({
  size: [canvas.width, canvas.height],
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  format: 'bgra8unorm',
});
const depthTexture = device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
});

const gBufferTextureViews = [
  gBufferTexture2DFloat16.createView({ label: 'gbuffer texture normal' }),
  gBufferTextureAlbedo.createView({ label: 'gbuffer texture albedo' }),
  depthTexture.createView({ label: 'depth normal' }),
];

const vertexBuffers: Iterable<GPUVertexBufferLayout> = [
  {
    arrayStride: Float32Array.BYTES_PER_ELEMENT * 8,
    attributes: [
      {
        // position
        shaderLocation: 0,
        offset: 0,
        format: 'float32x3',
      },
      {
        // normal
        shaderLocation: 1,
        offset: Float32Array.BYTES_PER_ELEMENT * 3,
        format: 'float32x3',
      },
      {
        // uv
        shaderLocation: 2,
        offset: Float32Array.BYTES_PER_ELEMENT * 6,
        format: 'float32x2',
      },
    ],
  },
];

const primitive: GPUPrimitiveState = {
  topology: 'triangle-list',
  cullMode: 'back',
};

const writeGBuffersPipeline = device.createRenderPipeline({
  label: 'write gbuffers',
  layout: 'auto',
  vertex: {
    module: device.createShaderModule({
      code: vertexWriteGBuffers,
    }),
    buffers: vertexBuffers,
  },
  fragment: {
    module: device.createShaderModule({
      code: fragmentWriteGBuffers,
    }),
    targets: [
      // normal
      { format: 'rgba16float' },
      // albedo
      { format: 'bgra8unorm' },
    ],
  },
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth24plus',
  },
  primitive,
});

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
  primitive,
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
  primitive,
});

const writeGBufferPassDescriptor: GPURenderPassDescriptor = {
  colorAttachments: [
    {
      view: gBufferTextureViews[0],

      clearValue: [0.0, 0.0, 1.0, 1.0],
      loadOp: 'clear',
      storeOp: 'store',
    },
    {
      view: gBufferTextureViews[1],

      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
  depthStencilAttachment: {
    view: gBufferTextureViews[2],

    depthClearValue: 1.0,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  },
};

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
  size: 4 * 16 * 2, // two 4x4 matrix
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const sceneUniformBindGroup = device.createBindGroup({
  layout: writeGBuffersPipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: modelUniformBuffer,
      },
    },
    {
      binding: 1,
      resource: {
        buffer: cameraUniformBuffer,
      },
    },
  ],
});

const gBufferTexturesBindGroup = device.createBindGroup({
  layout: gBufferTexturesBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: gBufferTextureViews[0],
    },
    {
      binding: 1,
      resource: gBufferTextureViews[1],
    },
    {
      binding: 2,
      resource: gBufferTextureViews[2],
    },
  ],
});

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

let lastTime = performance.now();

function frame(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  flyControls.Update(dt);
  camera.UpdateMatrixWorld(false);

  const viewMatrix = camera.GetMatrixWorld().invert();
  const viewProj = camera.projectionMatrix.clone().multiplyMatrices(camera.projectionMatrix, viewMatrix);
  writeMatrix(device, cameraUniformBuffer, 0, viewProj);
  const cameraInvViewProj = viewProj.clone().invert();
  writeMatrix(device, cameraUniformBuffer, 64, cameraInvViewProj);

  const commandEncoder = device.createCommandEncoder();
  {
    // Write position, normal, albedo etc. data to gBuffers
    const gBufferPass = commandEncoder.beginRenderPass(
      writeGBufferPassDescriptor
    );
    gBufferPass.setPipeline(writeGBuffersPipeline);
    gBufferPass.setBindGroup(0, sceneUniformBindGroup);
    gBufferPass.setVertexBuffer(0, vertexBuffer);
    gBufferPass.setIndexBuffer(indexBuffer, 'uint16');
    gBufferPass.drawIndexed(indexCount);
    gBufferPass.end();
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
