// Default texture cache (per GPUDevice) to avoid recreating views

type PerDevice = {
  whiteTex?: GPUTexture; whiteView?: GPUTextureView;
  blackTex?: GPUTexture; blackView?: GPUTextureView;
  flatNormalTex?: GPUTexture; flatNormalView?: GPUTextureView;
};

const perDevice = new WeakMap<GPUDevice, PerDevice>();

function ensure(device: GPUDevice): PerDevice {
  let e = perDevice.get(device);
  if (!e) { e = {}; perDevice.set(device, e); }
  return e;
}

function make1x1(device: GPUDevice, rgba: [number, number, number, number]): GPUTexture {
  const tex = device.createTexture({
    size: [1,1,1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: tex }, new Uint8Array(rgba), { bytesPerRow: 4 }, { width:1, height:1, depthOrArrayLayers:1 });
  return tex;
}

export const DefaultTextures = {
  whiteView(device: GPUDevice): GPUTextureView {
    const e = ensure(device);
    if (!e.whiteTex) e.whiteTex = make1x1(device, [255,255,255,255]);
    if (!e.whiteView) e.whiteView = e.whiteTex.createView();
    return e.whiteView;
  },
  blackView(device: GPUDevice): GPUTextureView {
    const e = ensure(device);
    if (!e.blackTex) e.blackTex = make1x1(device, [0,0,0,255]);
    if (!e.blackView) e.blackView = e.blackTex.createView();
    return e.blackView;
  },
  flatNormalView(device: GPUDevice): GPUTextureView {
    const e = ensure(device);
    // Typical flat normal is (128,128,255) in 8-bit
    if (!e.flatNormalTex) e.flatNormalTex = make1x1(device, [128,128,255,255]);
    if (!e.flatNormalView) e.flatNormalView = e.flatNormalTex.createView();
    return e.flatNormalView;
  },
};

