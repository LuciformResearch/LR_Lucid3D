export type TextureTransform = {
  scale?: [number, number];
  offset?: [number, number];
  angleDeg?: number; // rotation in degrees
};
export type TextureBinding = {
  view: GPUTextureView;
  uvSet?: 0 | 1;
  uvTransform?: TextureTransform;
} | null;

export type MaterialDesc = {
  name?: string;
  shading: 'pbr' | 'unlit';
  textures?: {
    baseColor?: TextureBinding;
    mr?: TextureBinding;
    normal?: TextureBinding;
    ao?: TextureBinding;
    emissive?: TextureBinding;
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
