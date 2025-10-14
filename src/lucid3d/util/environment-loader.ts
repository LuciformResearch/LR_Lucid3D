import { HDRImage, loadHDR } from './hdr-loader';

type Vec3 = [number, number, number];

export type CubeTextureResult = {
  texture: GPUTexture;
  view: GPUTextureView;
  mipLevelCount: number;
};

export type EnvironmentMaps = {
  diffuse: CubeTextureResult;
  specular: CubeTextureResult;
};

export type EnvironmentLoadOptions = {
  diffuseSize?: number;
  specularSize?: number;
  specularMipCount?: number;
  label?: string;
};

const DEFAULT_DIFFUSE_SIZE = 64;
const DEFAULT_SPECULAR_SIZE = 256;
const HEMISPHERE_SAMPLE_COUNT = 64;
const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function addScaled(target: Vec3, source: Vec3, scale: number) {
  target[0] += source[0] * scale;
  target[1] += source[1] * scale;
  target[2] += source[2] * scale;
}

function directionFromCube(face: number, u: number, v: number): Vec3 {
  const x = 2 * u - 1;
  const y = 2 * v - 1;
  switch (face) {
    case 0: return normalize([1, -y, -x]); // +X
    case 1: return normalize([-1, -y, x]); // -X
    case 2: return normalize([x, 1, y]); // +Y
    case 3: return normalize([x, -1, -y]); // -Y
    case 4: return normalize([x, -y, 1]); // +Z
    case 5: return normalize([-x, -y, -1]); // -Z
    default: return [0, 0, 1];
  }
}

function sphericalMap(dir: Vec3, width: number, height: number) {
  const phi = Math.atan2(dir[2], dir[0]);
  const theta = Math.acos(clamp(dir[1], -1, 1));
  let u = (phi / (2 * Math.PI)) + 0.5;
  let v = theta / Math.PI;
  u = (u % 1 + 1) % 1;
  v = clamp(v, 0, 1);
  const x = u * width;
  const y = v * height;
  return { x, y };
}

function sampleBilinear(image: HDRImage, dir: Vec3): Vec3 {
  const { x, y } = sphericalMap(dir, image.width, image.height);
  let ix0 = Math.floor(x);
  const fx = x - ix0;
  ix0 = ((ix0 % image.width) + image.width) % image.width;
  const ix1 = (ix0 + 1) % image.width;
  let iy0 = Math.floor(y);
  const fy = y - iy0;
  iy0 = Math.min(image.height - 1, Math.max(0, iy0));
  const iy1 = Math.min(image.height - 1, iy0 + 1);
  const idx = (iy0 * image.width + ix0) * 3;
  const idxX1 = (iy0 * image.width + ix1) * 3;
  const idxY1 = (iy1 * image.width + ix0) * 3;
  const idxXY = (iy1 * image.width + ix1) * 3;
  const c00: Vec3 = [image.data[idx], image.data[idx + 1], image.data[idx + 2]];
  const c10: Vec3 = [image.data[idxX1], image.data[idxX1 + 1], image.data[idxX1 + 2]];
  const c01: Vec3 = [image.data[idxY1], image.data[idxY1 + 1], image.data[idxY1 + 2]];
  const c11: Vec3 = [image.data[idxXY], image.data[idxXY + 1], image.data[idxXY + 2]];
  const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const c0 = lerp(c00, c10, fx);
  const c1 = lerp(c01, c11, fx);
  const color = lerp(c0, c1, fy);
  return color;
}

function generateHemisphereSamples(count: number): Vec3[] {
  const samples: Vec3[] = [];
  const invCount = 1 / count;
  const invPhi = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < count; i++) {
    const u1 = (i + 0.5) * invCount;
    const u2 = (0.5 + i * invPhi) % 1;
    const r = Math.sqrt(u1);
    const theta = 2 * Math.PI * u2;
    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);
    const y = Math.sqrt(Math.max(0, 1 - u1));
    samples.push([x, y, z]);
  }
  return samples;
}

const hemisphereSamples = generateHemisphereSamples(HEMISPHERE_SAMPLE_COUNT);

function buildTangentBasis(normal: Vec3): { tangent: Vec3; bitangent: Vec3 } {
  const up: Vec3 = Math.abs(normal[1]) < 0.999 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalize(cross(up, normal));
  const bitangent = cross(normal, tangent);
  return { tangent, bitangent };
}

function cosineWeightedSample(normal: Vec3, sample: Vec3): Vec3 {
  const { tangent, bitangent } = buildTangentBasis(normal);
  const world: Vec3 = [
    tangent[0] * sample[0] + bitangent[0] * sample[2] + normal[0] * sample[1],
    tangent[1] * sample[0] + bitangent[1] * sample[2] + normal[1] * sample[1],
    tangent[2] * sample[0] + bitangent[2] * sample[2] + normal[2] * sample[1],
  ];
  return normalize(world);
}

function createCubeFaces(image: HDRImage, size: number, sampler: (dir: Vec3) => Vec3): Float32Array[] {
  const faces: Float32Array[] = [];
  for (let face = 0; face < 6; face++) {
    const data = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size;
        const v = (y + 0.5) / size;
        const dir = directionFromCube(face, u, v);
        const color = sampler(dir);
        const idx = (y * size + x) * 4;
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
        data[idx + 3] = 1.0;
      }
    }
    faces.push(data);
  }
  return faces;
}

function downsampleFaces(source: Float32Array[], size: number): Float32Array[] {
  const nextSize = Math.max(1, size >> 1);
  const faces: Float32Array[] = [];
  for (const face of source) {
    const dst = new Float32Array(nextSize * nextSize * 4);
    for (let y = 0; y < nextSize; y++) {
      for (let x = 0; x < nextSize; x++) {
        const baseX = x * 2;
        const baseY = y * 2;
        const accum: Vec3 = [0, 0, 0];
        let samples = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = clamp(baseX + dx, 0, size - 1);
            const sy = clamp(baseY + dy, 0, size - 1);
            const idx = (sy * size + sx) * 4;
            addScaled(accum, [face[idx], face[idx + 1], face[idx + 2]], 1);
            samples++;
          }
        }
        const dstIdx = (y * nextSize + x) * 4;
        dst[dstIdx] = accum[0] / samples;
        dst[dstIdx + 1] = accum[1] / samples;
        dst[dstIdx + 2] = accum[2] / samples;
        dst[dstIdx + 3] = 1.0;
      }
    }
    faces.push(dst);
  }
  return faces;
}

function float32ToHalfArray(input: Float32Array): Uint16Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(input.length * 2);
  const output = new Uint16Array(buffer);
  for (let i = 0; i < input.length; i++) {
    output[i] = floatToHalf(input[i]);
  }
  return output;
}

const floatBuffer = new ArrayBuffer(4);
const floatView = new Float32Array(floatBuffer);
const intView = new Uint32Array(floatBuffer);

function floatToHalf(val: number): number {
  floatView[0] = val;
  const x = intView[0];
  const sign = (x >> 16) & 0x8000;
  let mantissa = x & 0x7fffff;
  let exponent = (x >> 23) & 0xff;
  if (exponent === 0xff) {
    if (mantissa !== 0) {
      return sign | 0x7fff;
    }
    return sign | 0x7c00;
  }
  if (exponent === 0) {
    if (mantissa === 0) return sign;
    while ((mantissa & 0x800000) === 0) {
      mantissa <<= 1;
      exponent--;
    }
    exponent++;
    mantissa &= ~0x800000;
  }
  exponent = exponent - 127 + 15;
  if (exponent >= 0x1f) {
    return sign | 0x7c00;
  }
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    mantissa = (mantissa | 0x800000) >> (1 - exponent);
    return sign | ((mantissa + 0x1000) >> 13);
  }
  return sign | (exponent << 10) | ((mantissa + 0x1000) >> 13);
}

function uploadCubeTexture(
  device: GPUDevice,
  label: string,
  size: number,
  mipFaces: Float32Array[][],
): CubeTextureResult {
  const mipLevelCount = mipFaces.length;
  const texture = device.createTexture({
    label,
    size: [size, size, 6],
    mipLevelCount,
    dimension: '2d',
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const queue = device.queue;
  for (let mip = 0; mip < mipLevelCount; mip++) {
    const levelSize = Math.max(1, size >> mip);
    const faces = mipFaces[mip];
    for (let face = 0; face < 6; face++) {
      const data = float32ToHalfArray(faces[face]);
      queue.writeTexture(
        { texture, mipLevel: mip, origin: { x: 0, y: 0, z: face } },
        data,
        {
          bytesPerRow: levelSize * 4 * 2,
          rowsPerImage: levelSize,
        },
        {
          width: levelSize,
          height: levelSize,
          depthOrArrayLayers: 1,
        },
      );
    }
  }
  return {
    texture,
    view: texture.createView({ dimension: 'cube' }),
    mipLevelCount,
  };
}

function cosineIrradianceSampler(image: HDRImage): (dir: Vec3) => Vec3 {
  return (dir: Vec3) => {
    const normal = normalize(dir);
    const accum: Vec3 = [0, 0, 0];
    let weight = 0;
    for (const sample of hemisphereSamples) {
      const world = cosineWeightedSample(normal, sample);
      const cosTheta = Math.max(0, world[0] * normal[0] + world[1] * normal[1] + world[2] * normal[2]);
      if (cosTheta <= 0) continue;
      const color = sampleBilinear(image, world);
      addScaled(accum, color, cosTheta);
      weight += cosTheta;
    }
    if (weight > EPSILON) {
      accum[0] /= weight;
      accum[1] /= weight;
      accum[2] /= weight;
    }
    return accum;
  };
}

export async function loadEnvironmentFromHDR(device: GPUDevice, url: string, options: EnvironmentLoadOptions = {}): Promise<EnvironmentMaps> {
  const hdr = await loadHDR(url);
  const maxCubeSize = Math.pow(2, Math.floor(Math.log2(Math.min(hdr.width, hdr.height))));
  const specularSize = clamp(options.specularSize ?? DEFAULT_SPECULAR_SIZE, 16, maxCubeSize);
  const diffuseSize = clamp(options.diffuseSize ?? DEFAULT_DIFFUSE_SIZE, 8, specularSize);
  const specularMipCount = options.specularMipCount ?? (Math.floor(Math.log2(specularSize)) + 1);

  const specSampler = (dir: Vec3) => sampleBilinear(hdr, dir);
  const specBaseFaces = createCubeFaces(hdr, specularSize, specSampler);
  const specMipFaces: Float32Array[][] = [specBaseFaces];
  let currentFaces = specBaseFaces;
  let currentSize = specularSize;
  for (let mip = 1; mip < specularMipCount; mip++) {
    currentFaces = downsampleFaces(currentFaces, currentSize);
    currentSize = Math.max(1, currentSize >> 1);
    specMipFaces.push(currentFaces);
    if (currentSize === 1) break;
  }
  const specular = uploadCubeTexture(device, options.label ? `${options.label}-specular` : 'ibl-specular', specularSize, specMipFaces);

  const diffuseSampler = cosineIrradianceSampler(hdr);
  const diffuseFaces = createCubeFaces(hdr, diffuseSize, diffuseSampler);
  const diffuse = uploadCubeTexture(device, options.label ? `${options.label}-diffuse` : 'ibl-diffuse', diffuseSize, [diffuseFaces]);

  return { diffuse, specular };
}
