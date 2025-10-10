export type TextureRef = { view: GPUTextureView } | null;

export type MaterialDesc = {
  name?: string;
  shading: 'pbr' | 'unlit';
  textures?: {
    baseColor?: TextureRef;
    mr?: TextureRef;
    normal?: TextureRef;
    ao?: TextureRef;
    emissive?: TextureRef;
  };
  scalars?: {
    roughness?: number;
    metallic?: number;
  };
  features?: {
    vertexColor?: boolean;
    doubleSided?: boolean;
  };
};

export type BuildOptions = {
  path: 'forward' | 'deferred';
  gbufTargets?: 2 | 3;
  sampleCount?: number;
};

