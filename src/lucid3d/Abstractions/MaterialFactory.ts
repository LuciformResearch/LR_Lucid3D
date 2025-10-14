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
import { IBLModule } from './Modules/IBLModule';
import { ClearCoatModule } from './Modules/ClearCoatModule';
import { MatcapModule } from './Modules/MatcapModule';
import { ShaderModuleBase } from './Modules/ShaderModule';

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
  private textureEntries: GPUBindGroupEntry[] | null = null;
  private textureLayout: GPUBindGroupLayout | null = null;
  private textureBindingIndex = new Map<string, number>();
  constructor(device: GPUDevice, pipeline: GPURenderPipeline, bg0: GPUBindGroup, bg1: GPUBindGroup, public uniforms: UniformRecord, public pack: UniformBufferPack, ubo: UniformGPUBuffer) {
    super(device, pipeline, bg0, bg1, ubo);
  }
  setProjView(m: Float32Array | number[]) { (this.uniforms.PROJVIEW as Matrix4Uniform).value = m as any; }
  setModel(m: Float32Array | number[]) { (this.uniforms.MODEL as Matrix4Uniform).value = m as any; }
  setView(m: Float32Array | number[]) { (this.uniforms.VIEW as Matrix4Uniform).value = m as any; }
  setBaseColorFactor(v: [number, number, number, number]) { (this.uniforms.BASE_COLOR_FACTOR as Vector4Uniform).value = v; }
  setMetallicRoughness(v: [number, number]) { (this.uniforms.METAL_ROUGH as Vector2Uniform).value = v; }
  setOcclusionStrength(v: number) { (this.uniforms.OCCLUSION_STRENGTH as FloatUniform).value = v; }
  setEmissiveFactor(v: [number, number, number]) { (this.uniforms.EMISSIVE_FACTOR as Vector3Uniform).value = v; }
  setCameraPosition(v: [number, number, number]) { (this.uniforms.CAMERA_POS as Vector3Uniform).value = v; }
  setLightDirectionIntensity(v: [number, number, number, number]) { (this.uniforms.LIGHT_DIR_INT as Vector4Uniform).value = v; }
  setLightColor(v: [number, number, number, number]) { (this.uniforms.LIGHT_COLOR as Vector4Uniform).value = v; }
  setIBLParams(diffuse: number, specular: number, maxMip: number) { (this.uniforms.IBL_PARAMS as Vector4Uniform).value = [diffuse, specular, maxMip, 0]; }
  setClearCoat(factor: number, roughness: number) { (this.uniforms.CLEARCOAT as Vector2Uniform).value = [factor, roughness]; }
  setMatcapFactor(v: number) { (this.uniforms.MATCAP_FACTOR as FloatUniform).value = v; }
  setDebugMode(mode: number) { (this.uniforms.DEBUG_PARAMS as Vector4Uniform).value = [mode, 0, 0, 0]; }
  updateUniforms() { this.ubo.update(); }
  configureTextureBindings(layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[], nameToIndex: Map<string, number>) {
    this.textureLayout = layout;
    this.textureEntries = entries.map((entry) => ({ ...entry }));
    this.textureBindingIndex = new Map(nameToIndex);
  }
  setTextureBinding(name: string, view: GPUTextureView | null) {
    if (!this.textureEntries || !this.textureLayout) return;
    const idx = this.textureBindingIndex.get(name);
    if (idx === undefined) return;
    const entry = this.textureEntries[idx];
    if (!entry) return;
    this.textureEntries[idx] = { ...entry, resource: view ?? entry.resource };
    this.bindGroup1 = BGPool.getOrCreate(this.device, this.textureLayout, this.textureEntries);
  }
  setEnvironmentTextures(params: {
    irradiance?: GPUTextureView | null;
    radiance?: GPUTextureView | null;
    brdfLut?: GPUTextureView | null;
  }) {
    if (!this.textureEntries || !this.textureLayout) return;
    if (params.irradiance) this.setTextureBinding('tIrradiance', params.irradiance);
    if (params.radiance) this.setTextureBinding('tRadiance', params.radiance);
    if (params.brdfLut) this.setTextureBinding('tBRDF', params.brdfLut);
  }
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

    const environment = desc.environment;
    const iblDiffuseIntensity = environment?.diffuseIntensity ?? 0;
    const iblSpecularIntensity = environment?.specularIntensity ?? 0;
    const specularMaxMip = Math.max((environment?.specular?.mipLevels ?? 1) - 1, 0);
    const clearcoatFactor = desc.extensions?.clearcoat?.factor ?? 0;
    const clearcoatRoughness = desc.extensions?.clearcoat?.roughness ?? 0.25;
    const matcapExt = desc.extensions?.matcap;
    const matcapFactor = matcapExt?.factor ?? 0;

    const modules: ShaderModuleBase[] = [
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
    ];

    if (environment) {
      modules.push(new IBLModule({ diffuseIntensity: iblDiffuseIntensity, specularIntensity: iblSpecularIntensity, maxMipLevel: specularMaxMip }));
    }
    if (clearcoatFactor > 0.0) {
      modules.push(new ClearCoatModule({ factor: clearcoatFactor, roughness: clearcoatRoughness }));
    }
    if (matcapExt) {
      modules.push(new MatcapModule({ factor: matcapFactor }));
    }
    modules.push(new PBRLightingModule());

    const ctx = makeAggregationContext(modules);
    ctx.defines.set('ALBEDO_ONLY', QueryArgs.getBool('albedo', false));
    if (!ctx.defines.has('HAS_CLEARCOAT')) ctx.defines.set('HAS_CLEARCOAT', false);
    if (!ctx.defines.has('HAS_IBL')) ctx.defines.set('HAS_IBL', false);
    if (!ctx.defines.has('HAS_MATCAP')) ctx.defines.set('HAS_MATCAP', false);

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
    const clearcoatUniform = uniforms.CLEARCOAT as Vector2Uniform | undefined;
    if (clearcoatUniform) clearcoatUniform.value = [clearcoatFactor, clearcoatRoughness];
    const matcapUniform = uniforms.MATCAP_FACTOR as FloatUniform | undefined;
    if (matcapUniform) matcapUniform.value = matcapFactor;
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
    const iblUniform = uniforms.IBL_PARAMS as Vector4Uniform | undefined;
    if (iblUniform) {
      if (environment) iblUniform.value = [iblDiffuseIntensity, iblSpecularIntensity, specularMaxMip, 0];
      else iblUniform.value = [0, 0, 0, 0];
    }
    const viewUniform = uniforms.VIEW as Matrix4Uniform | undefined;
    if (viewUniform) viewUniform.value = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
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
    const textureBindingMap = new Map<string, number>();
    const defaultBase = DefaultTextures.whiteView(device);
    const defaultMR = DefaultTextures.whiteView(device);
    const defaultNormal = DefaultTextures.flatNormalView(device);
    const defaultAO = DefaultTextures.whiteView(device);
    const defaultEmissive = DefaultTextures.blackView(device);
    const defaultMatcap = DefaultTextures.whiteView(device);
    const envDiffuseView = environment?.diffuse?.view ?? DefaultTextures.neutralEnvironmentCube(device);
    const envSpecularView = environment?.specular?.view ?? DefaultTextures.neutralEnvironmentCube(device);
    const envBrdfView = environment?.brdfLut?.view ?? DefaultTextures.brdfLutView(device);
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
          case 'tMatcap': view = matcapExt?.texture?.view ?? defaultMatcap; break;
          case 'tIrradiance': view = envDiffuseView; break;
          case 'tRadiance': view = envSpecularView; break;
          case 'tBRDF': view = envBrdfView; break;
          default: view = defaultBase;
        }
        if (!view) view = defaultBase;
        texEntries.push({ binding: binding.binding, resource: view });
        textureBindingMap.set(binding.name, texEntries.length - 1);
      }
    }
    const bg1 = BGPool.getOrCreate(device, bgl1, texEntries);
    const mat = new ForwardPBRMaterial(device, pipeline, bg0, bg1, uniforms, pack, uboGPU);
    mat.configureTextureBindings(bgl1, texEntries, textureBindingMap);
    (mat as any).bglSkin = bgl2;
    mat.setClearCoat(clearcoatFactor, clearcoatRoughness);
    mat.setMatcapFactor(matcapFactor);
    if (environment) mat.setIBLParams(iblDiffuseIntensity, iblSpecularIntensity, specularMaxMip);
    else mat.setIBLParams(0, 0, 0);
    return mat;
  }

  static buildForwardPBRFromDesc(device: GPUDevice, format: GPUTextureFormat, desc: MaterialDesc) {
    return MaterialFactory.buildForward(device, format, desc);
  }

  // Default texture creation moved to DefaultTextures.ts
}
