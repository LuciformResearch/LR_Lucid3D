export async function loadTexture2D(device: GPUDevice, url: string): Promise<GPUTextureView> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load texture ${url}: ${response.status}`);
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'default' });
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
  bitmap.close();
  return texture.createView();
}
