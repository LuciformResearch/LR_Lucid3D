import { ShaderModuleBase, Snippet } from '../../Abstractions/Modules/ShaderModule';

export type GBufferSampleMode = 'sample' | 'load';

export interface DeferredGBufferOptions {
  flip?: boolean;
  hasEmissiveAo?: boolean;
  octEncoded?: boolean;
  sampleMode?: GBufferSampleMode;
  includeDepth?: boolean;
}

export class DeferredGBufferModule extends ShaderModuleBase {
  private readonly flip: boolean;
  private readonly hasEmissiveAo: boolean;
  private readonly octEncoded: boolean;
  private readonly sampleMode: GBufferSampleMode;
  private readonly includeDepth: boolean;

  constructor(opts: DeferredGBufferOptions = {}) {
    super('DeferredGBuffer');
    this.flip = !!opts.flip;
    this.hasEmissiveAo = opts.hasEmissiveAo ?? true;
    this.octEncoded = !!opts.octEncoded;
    this.sampleMode = opts.sampleMode ?? 'sample';
    this.includeDepth = !!opts.includeDepth;
  }

  snippets(): Snippet[] {
    const flipStmt = this.flip ? 'uv = vec2<f32>(uv.x, 1.0 - uv.y);' : '';
    const useLoad = this.sampleMode === 'load';
    const hasEmissive = this.hasEmissiveAo;
    const includeDepth = this.includeDepth;
    const oct = this.octEncoded;

const loadCode = useLoad ? `
let dims = textureDimensions(gAlbedoTex);
let coord = vec2<i32>(i32(uv.x * f32(dims.x - 1)), i32(uv.y * f32(dims.y - 1)));
let g0 = textureLoad(gAlbedoTex, coord, 0);
let g1 = textureLoad(gNormalRoughTex, coord, 0);
${hasEmissive ? 'let g2 = textureLoad(gEmissiveAoTex, coord, 0);' : 'let g2 = vec4<f32>(0.0, 0.0, 0.0, 1.0);'}
${includeDepth ? 'let depthValue = textureLoad(gDepthTex, coord, 0).x;' : 'let depthValue = 1.0;'}
` : `
let g0 = textureSampleLevel(gAlbedoTex, gSampler, uv, 0.0);
let g1 = textureSampleLevel(gNormalRoughTex, gSampler, uv, 0.0);
${hasEmissive ? 'let g2 = textureSampleLevel(gEmissiveAoTex, gSampler, uv, 0.0);' : 'let g2 = vec4<f32>(0.0, 0.0, 0.0, 1.0);'}
${includeDepth ? `
let depthDims = textureDimensions(gDepthTex);
let depthCoord = vec2<i32>(i32(uv.x * f32(depthDims.x - 1)), i32(uv.y * f32(depthDims.y - 1)));
let depthValue = textureLoad(gDepthTex, depthCoord, 0).x;
` : 'let depthValue = 1.0;'}
`;

    const octDecodeFn = oct ? `
fn octDecode(e: vec2<f32>) -> vec3<f32> {
  var v = vec3<f32>(e.x, e.y, 1.0 - abs(e.x) - abs(e.y));
  if (v.z < 0.0) {
    let sx = select(-1.0, 1.0, v.x >= 0.0);
    let sy = select(-1.0, 1.0, v.y >= 0.0);
    let nx = (1.0 - abs(v.y)) * sx;
    let ny = (1.0 - abs(v.x)) * sy;
    v = vec3<f32>(nx, ny, v.z);
  }
  return normalize(v);
}
` : '';

    const normalDecode = oct
      ? `
let n = normalize(octDecode(g1.xy * 2.0 - vec2<f32>(1.0, 1.0)));
let roughness = clamp(g1.z, 0.045, 1.0);
`
      : `
let n = normalize(g1.xyz * 2.0 - vec3<f32>(1.0, 1.0, 1.0));
let roughness = clamp(g1.a, 0.045, 1.0);
`;

    return [
      {
        phase: 'GLOBAL_SNIPPETS',
        code: oct ? octDecodeFn : '',
      },
      {
        phase: 'FRAGMENT_INITIALIZE_SNIPPETS',
        code: `
var uv = vec2<f32>(in.uv.x, 1.0 - in.uv.y);
${flipStmt}
uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
${loadCode}
var albedo = clamp(g0.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
var metallic = clamp(g0.a, 0.0, 1.0);
${normalDecode}
var emissiveColor = ${hasEmissive ? 'g2.rgb' : 'vec3<f32>(0.0, 0.0, 0.0)'};
var ao = ${hasEmissive ? 'g2.a' : '1.0'};
var V = normalize(vec3<f32>(0.0, 0.0, 1.0));
var color = vec3<f32>(0.0, 0.0, 0.0);
`,
      },
    ];
  }
}
