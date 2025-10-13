export type TextureTransform = {
  scale?: [number, number];
  offset?: [number, number];
  angleDeg?: number; // rotation in degrees
};
export type TextureBinding = {
  view: GPUTextureView;
  uvSet?: 0 | 1;
  uvTransform?: TextureTransform;
  mipLevels?: number;
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
  environment?: {
    diffuse?: TextureBinding;
    specular?: TextureBinding;
    brdfLut?: TextureBinding;
    diffuseIntensity?: number;
    specularIntensity?: number;
  };
  extensions?: {
    clearcoat?: {
      factor?: number;
      roughness?: number;
    };
    matcap?: {
      texture?: TextureBinding;
      factor?: number;
    };
  };
};

export type BuildOptions = {
  path: 'forward' | 'deferred';
  gbufTargets?: 2 | 3;
  sampleCount?: number;
};
