# Exemple — UniformRecord PBR (inspiré WebGL) et WGSL associé

Ce document montre comment définir un set d’uniforms « à l’ancienne » (baseColorFactor, metallicRoughnessFactor, etc.) et le packer dans un UBO pour un shader WGSL forward PBR minimal.

## 1) Définition des uniforms

```ts
import { Matrix4Uniform, Vector4Uniform, Vector2Uniform, FloatUniform, Vector3Uniform, UniformBufferPack, UniformGPUBuffer } from '../../src/lucid3d/Abstractions/Uniforms';

const uniforms = {
  PROJVIEW: new Matrix4Uniform('PROJVIEW'),
  MODEL: new Matrix4Uniform('MODEL'),
  BASE_COLOR_FACTOR: new Vector4Uniform('BASE_COLOR_FACTOR', [1,1,1,1]),
  METAL_ROUGH: new Vector2Uniform('METAL_ROUGH', [0.0, 1.0]), // x=metallic add, y=roughness mul
  OCCLUSION_STRENGTH: new FloatUniform('OCCLUSION_STRENGTH', 1.0),
  EMISSIVE_FACTOR: new Vector3Uniform('EMISSIVE_FACTOR', [1,1,1]),
};

const pack = new UniformBufferPack(uniforms);
const uboGPU = new UniformGPUBuffer(device, pack);
uboGPU.update(); // écrit dans le GPUBuffer
```

## 2) WGSL correspondant (extraits)

Vertex (structure UBO partagée):
```wgsl
struct UBO {
  PROJVIEW: mat4x4<f32>,
  MODEL: mat4x4<f32>,
  BASE_COLOR_FACTOR: vec4<f32>,
  METAL_ROUGH: vec2<f32>,
  OCCLUSION_STRENGTH: f32,
  _pad0: f32,
  EMISSIVE_FACTOR: vec3<f32>,
  _pad1: f32,
}
@group(0) @binding(0) var<uniform> ubo: UBO;
```

Fragment (utilisation des champs):
```wgsl
var albedo = ubo.BASE_COLOR_FACTOR.rgb * textureSample(tBase, s, in.vUv).rgb;
var metallic: f32 = clamp(textureSample(tMR, s, in.vUv).b + ubo.METAL_ROUGH.x, 0.0, 1.0);
var roughness: f32 = clamp(textureSample(tMR, s, in.vUv).g * ubo.METAL_ROUGH.y, 0.04, 1.0);
if (USE_AO) { let ao = textureSample(tAO, s, in.vUv).r; color *= mix(vec3<f32>(1.0), vec3<f32>(ao), ubo.OCCLUSION_STRENGTH); }
if (USE_EMISSIVE) { color += textureSample(tEmissive, s, in.vUv).rgb * ubo.EMISSIVE_FACTOR; }
```

Note: les champs `_pad0/_pad1` garantissent un layout compatible (alignement 16 octets) pour les types non multiples de `vec4`.

## 3) Intégration rapide via MaterialFactory

`MaterialFactory.buildForward()` construit déjà ce UBO (mêmes champs) et renvoie un `ForwardPBRMaterial` avec `pipeline`, `bindGroup0/1` et l’`UniformGPUBuffer`.

```ts
const mat = MaterialFactory.buildForward(device, preferredFormat, {
  shading: 'pbr',
  textures: { baseColor, mr, normal, ao, emissive },
  scalars: { metallic: 0.0, roughness: 1.0 },
});
// Mise à jour par draw
mat.setProjView(viewProj);
mat.setModel(model);
mat.updateUniforms();
```

Le wrapper expose `setProjView`, `setModel`, etc., puis `updateUniforms()`. Pour un contrôle total, vous pouvez aussi manipuler directement `mat.uniforms` et `mat.ubo.update()`.
