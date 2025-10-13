import { Defines } from './Defines';
import { composeWGSL, GlobalChunks } from './ShaderChunk';
import { MaterialDesc } from './MaterialDesc';
import { Matrix4Uniform, UniformGPUBuffer, UniformRecord, UniformBufferPack, Vector2Uniform, Vector3Uniform, Vector4Uniform, FloatUniform } from './Uniforms';
import { PipelineCache } from './PipelineCache';
import { QueryArgs } from '../../components/WebgpuApp/util/query-args';
import { BGPool } from './BindGroupPool';
import { DefaultTextures } from './DefaultTextures';
import { ShaderComposer } from './Modules/ShaderComposer';
import { ForwardCoreModule } from './Modules/ForwardCoreModule';
import { BaseColorModule } from './Modules/BaseColorModule';
import { MetallicRoughnessModule } from './Modules/MetallicRoughnessModule';
import { NormalMapModule } from './Modules/NormalMapModule';
import { AmbientOcclusionModule } from './Modules/AmbientOcclusionModule';
import { EmissiveModule } from './Modules/EmissiveModule';
import { makeAggregationContext } from './Modules/UniformRegistryImpl';
import { PBRLightingModule } from './Modules/PBRLightingModule';

type MaterialTexture = NonNullable<MaterialDesc['textures']>[keyof NonNullable<MaterialDesc['textures']>];

// Register a few baseline chunks (small stubs)
GlobalChunks.register('brdf', require('./chunks/brdf.wgsl').default);
GlobalChunks.register('tbn', require('./chunks/tbn.wgsl').default);

export class GeneratedForwardMaterial {
  pipeline: GPURenderPipeline;
  bindGroup0: GPUBindGroup; // uniforms
  bindGroup1: GPUBindGroup; // textures/samplers
  ubo: UniformGPUBuffer;
  constructor(public device: GPUDevice, pipeline: GPURenderPipeline, bg0: GPUBindGroup, bg1: GPUBindGroup, ubo: UniformGPUBuffer) {
    this.pipeline = pipeline; this.bindGroup0 = bg0; this.bindGroup1 = bg1; this.ubo = ubo;
  }
}

export class ForwardPBRMaterial extends GeneratedForwardMaterial {
  constructor(device: GPUDevice, pipeline: GPURenderPipeline, bg0: GPUBindGroup, bg1: GPUBindGroup, public uniforms: UniformRecord, public pack: UniformBufferPack, ubo: UniformGPUBuffer) {
    super(device, pipeline, bg0, bg1, ubo);
  }
  setProjView(m: Float32Array | number[]) { (this.uniforms.PROJVIEW as Matrix4Uniform).value = m as any; }
  setModel(m: Float32Array | number[]) { (this.uniforms.MODEL as Matrix4Uniform).value = m as any; }
  setBaseColorFactor(v: [number, number, number, number]) { (this.uniforms.BASE_COLOR_FACTOR as Vector4Uniform).value = v; }
  setMetallicRoughness(v: [number, number]) { (this.uniforms.METAL_ROUGH as Vector2Uniform).value = v; }
  setOcclusionStrength(v: number) { (this.uniforms.OCCLUSION_STRENGTH as FloatUniform).value = v; }
  setEmissiveFactor(v: [number, number, number]) { (this.uniforms.EMISSIVE_FACTOR as Vector3Uniform).value = v; }
  setCameraPosition(v: [number, number, number]) { (this.uniforms.CAMERA_POS as Vector3Uniform).value = v; }
  setLightDirectionIntensity(v: [number, number, number, number]) { (this.uniforms.LIGHT_DIR_INT as Vector4Uniform).value = v; }
  setLightColor(v: [number, number, number, number]) { (this.uniforms.LIGHT_COLOR as Vector4Uniform).value = v; }
  setDebugMode(mode: number) { (this.uniforms.DEBUG_PARAMS as Vector4Uniform).value = [mode, 0, 0, 0]; }
  updateUniforms() { this.ubo.update(); }
}

export class MaterialFactory {
  private static _pipelineCache = new PipelineCache<GPURenderPipeline>();
  static buildForward(device: GPUDevice, format: GPUTextureFormat, desc: MaterialDesc): ForwardPBRMaterial {
    const baseColorTex = desc.textures?.baseColor ?? null;
    const mrTex = desc.textures?.mr ?? null;
    const normalTex = desc.textures?.normal ?? null;
    const aoTex = desc.textures?.ao ?? null;
    const emissiveTex = desc.textures?.emissive ?? null;

    const metallicFactor = desc.scalars?.metallic ?? 0.0;
    const roughnessFactor = desc.scalars?.roughness ?? 1.0;
    const occlusionStrength = 1.0;
    const emissiveFactor: [number, number, number] = [1, 1, 1];

    const modules = [
      new ForwardCoreModule({ enableSkinning: true }),
      new BaseColorModule({ enabled: !!baseColorTex, uvSet: baseColorTex?.uvSet ?? 0 }),
      new MetallicRoughnessModule({
        enabled: !!mrTex,
        metallicFactor,
        roughnessFactor,
        uvSet: mrTex?.uvSet ?? 0,
      }),
      new NormalMapModule({ enabled: !!normalTex, uvSet: normalTex?.uvSet ?? 0 }),
      new AmbientOcclusionModule({ enabled: !!aoTex, strength: occlusionStrength, uvSet: aoTex?.uvSet ?? 0 }),
      new EmissiveModule({ enabled: !!emissiveTex, factor: emissiveFactor, uvSet: emissiveTex?.uvSet ?? 0 }),
      new PBRLightingModule(),
    ];

    const ctx = makeAggregationContext(modules);
    ctx.defines.set('ALBEDO_ONLY', QueryArgs.getBool('albedo', false));

    const defines = new Defines();
    for (const [key, value] of ctx.defines.entries()) {
      defines.set(key, value);
    }

    const uboStruct = ctx.uniformStructWGSL('UBO');
    const bindingsWGSL = ctx.bindingDeclarationsWGSL(1);
    const vertTemplate = (require('./templates/pbr_modules_forward.vert.wgsl').default as string)
      .replace('// @@UBO_STRUCT', uboStruct);
    const fragTemplate = (require('./templates/pbr_modules_forward.frag.wgsl').default as string)
      .replace('// @@UBO_STRUCT', uboStruct)
      .replace('// @@BINDINGS_GROUP1', bindingsWGSL);

    const composed = ShaderComposer.compose(vertTemplate, fragTemplate, modules);
    const vs = composeWGSL(defines.toWgslConsts(), ['tbn'], composed.codeVert);
    const fs = composeWGSL(defines.toWgslConsts(), ['brdf'], composed.codeFrag);
    const vert = device.createShaderModule({ code: vs });
    const frag = device.createShaderModule({ code: fs });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'nearest' });

    const uniforms = ctx.createUniformRecord();
    const metalUniform = uniforms.METAL_ROUGH as Vector2Uniform | undefined;
    if (metalUniform) metalUniform.value = [metallicFactor, roughnessFactor];
    const aoUniform = uniforms.OCCLUSION_STRENGTH as FloatUniform | undefined;
    if (aoUniform) aoUniform.value = occlusionStrength;
    const emissiveUniform = uniforms.EMISSIVE_FACTOR as Vector3Uniform | undefined;
    if (emissiveUniform) emissiveUniform.value = emissiveFactor;
    const lightDirUniform = uniforms.LIGHT_DIR_INT as Vector4Uniform | undefined;
    if (lightDirUniform) {
      let dir = [0.3, 0.8, 0.5];
      const len = Math.hypot(dir[0], dir[1], dir[2]);
      if (len > 1e-5) {
        dir = [dir[0] / len, dir[1] / len, dir[2] / len];
      }
      lightDirUniform.value = [dir[0], dir[1], dir[2], 1.0];
    }
    const lightColorUniform = uniforms.LIGHT_COLOR as Vector4Uniform | undefined;
    if (lightColorUniform) lightColorUniform.value = [1, 1, 1, 0];
    const debugUniform = uniforms.DEBUG_PARAMS as Vector4Uniform | undefined;
    if (debugUniform) debugUniform.value = [0, 0, 0, 0];
    const cameraUniform = uniforms.CAMERA_POS as Vector3Uniform | undefined;
    if (cameraUniform) cameraUniform.value = [0, 0, 0];
    const applyUV = (tex: MaterialTexture | null, so: string, rs: string) => {
      if (!tex) return;
      const uSO = uniforms[so] as Vector4Uniform | undefined;
      const uRS = uniforms[rs] as Vector4Uniform | undefined;
      if (!uSO || !uRS) return;
      const scale = tex.uvTransform?.scale ?? [1, 1];
      const offset = tex.uvTransform?.offset ?? [0, 0];
      const ang = tex.uvTransform?.angleDeg ?? 0;
      const rad = ang * Math.PI / 180.0;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      uSO.value = [scale[0], scale[1], offset[0], offset[1]];
      uRS.value = [cos, sin, tex.uvSet ?? 0, 0];
    };
    applyUV(baseColorTex, 'BC_UV_SO', 'BC_UV_RS');
    applyUV(mrTex, 'MR_UV_SO', 'MR_UV_RS');
    applyUV(normalTex, 'NM_UV_SO', 'NM_UV_RS');
    applyUV(aoTex, 'AO_UV_SO', 'AO_UV_RS');
    applyUV(emissiveTex, 'EM_UV_SO', 'EM_UV_RS');

    const { pack, gpu: uboGPU } = ctx.createUniformPack(device, uniforms);
    uboGPU.update();

    const bgl0 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT, buffer: { type:'uniform' } }]});
    const bgl1 = ctx.createBindGroupLayout(device);
    const bgl2 = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ]});
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1, bgl2]});
    // Vertex layout now includes TANGENT at @location(3)
    const arrayStrideFloats = (3+3+2+4+2+4+4);
    const bigLayout: GPUVertexBufferLayout = {
      arrayStride: arrayStrideFloats * 4,
      attributes: [
        { shaderLocation: 0, format: 'float32x3', offset: 0 },           // POSITION
        { shaderLocation: 1, format: 'float32x3', offset: 3*4 },         // NORMAL
        { shaderLocation: 2, format: 'float32x2', offset: 6*4 },         // TEXCOORD_0
        { shaderLocation: 3, format: 'float32x4', offset: 8*4 },         // TANGENT (xyz, w)
        { shaderLocation: 4, format: 'float32x2', offset: 12*4 },        // TEXCOORD_1
        { shaderLocation: 6, format: 'float32x4', offset: 14*4 },        // JOINTS_0 as float, cast to int in shader
        { shaderLocation: 7, format: 'float32x4', offset: 18*4 },        // WEIGHTS_0
      ]
    };

    // Pipeline cache key
    const key = [
      'fwd', format,
      defines.key,
      desc.features?.doubleSided ? 'ds' : 'ss',
      'v2'
    ].join('|');
    let pipeline = MaterialFactory._pipelineCache.get(key);
    if (!pipeline) {
      pipeline = device.createRenderPipeline({
        layout,
        vertex: { module: vert, entryPoint: 'main', buffers: [ bigLayout ] },
        fragment: { module: frag, entryPoint: 'main', targets: [{ format }] },
        primitive: { topology: 'triangle-list', cullMode: (desc.features?.doubleSided ? undefined : 'back') },
        depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
      });
      MaterialFactory._pipelineCache.set(key, pipeline);
    }

    const bg0 = BGPool.getOrCreate(device, bgl0, [{ binding: 0, resource: { buffer: uboGPU.buffer } }]);
    const texEntries: GPUBindGroupEntry[] = [];
    const defaultBase = DefaultTextures.whiteView(device);
    const defaultMR = DefaultTextures.whiteView(device);
    const defaultNormal = DefaultTextures.flatNormalView(device);
    const defaultAO = DefaultTextures.whiteView(device);
    const defaultEmissive = DefaultTextures.blackView(device);
    for (const binding of ctx.bindingDefinitions()) {
      if (binding.kind === 'sampler') {
        texEntries.push({ binding: binding.binding, resource: sampler });
        continue;
      }
      if (binding.kind === 'texture') {
        let view: GPUTextureView | undefined | null;
        switch (binding.name) {
          case 'tBase': view = baseColorTex?.view ?? defaultBase; break;
          case 'tMR': view = mrTex?.view ?? defaultMR; break;
          case 'tNormal': view = normalTex?.view ?? defaultNormal; break;
          case 'tAO': view = aoTex?.view ?? defaultAO; break;
          case 'tEmissive': view = emissiveTex?.view ?? defaultEmissive; break;
          default: view = defaultBase;
        }
        if (!view) view = defaultBase;
        texEntries.push({ binding: binding.binding, resource: view });
      }
    }
    const bg1 = BGPool.getOrCreate(device, bgl1, texEntries);
    const mat = new ForwardPBRMaterial(device, pipeline, bg0, bg1, uniforms, pack, uboGPU);
    (mat as any).bglSkin = bgl2;
    return mat;
  }

  static buildForwardPBRFromDesc(device: GPUDevice, format: GPUTextureFormat, desc: MaterialDesc) {
    return MaterialFactory.buildForward(device, format, desc);
  }

  // Default texture creation moved to DefaultTextures.ts
}
