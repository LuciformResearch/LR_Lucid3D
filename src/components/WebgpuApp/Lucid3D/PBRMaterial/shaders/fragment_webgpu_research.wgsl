const PI : f32 = 3.141592653589793;
const dielectricSpec: vec3<f32> = vec3(0.04);
const black: vec3<f32> = vec3(0.0);
struct TextureInfo {
    value: vec4<f32>;
    UVSetIndex: i32;
    UVTransform: mat3x3<f32>;
    has_uv_transform: i32;
    has_texture: i32;
    texture_index: i32;
}

struct Light {
    lightType: f32;
    lightPosition: vec3<f32>;
    lightColor: vec3<f32>;
    lightIntensity: f32;
}

struct Uniforms {
    baseColor: TextureInfo;
    metalRough: TextureInfo;
    normal: TextureInfo;
    occlusionStrength: f32;
    occlusion: TextureInfo;
    emissive: TextureInfo;
    cameraPosition: vec3<f32>;
};

struct Lights {
    lightCount: i32;
    lights: array<Light>;
}


@group(0) @binding(0) var<storage, read> lights: Lights;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;


@group(0) @binding(2) var baseColorSampler: sampler;
@group(0) @binding(3) var baseColorTexture: texture_2d<f32>;

@group(0) @binding(4) var metalRoughSampler: sampler;
@group(0) @binding(5) var metalRoughTexture: texture_2d<f32>;

@group(0) @binding(6) var normalSampler: sampler;
@group(0) @binding(7) var normalTexture: texture_2d<f32>;


@group(0) @binding(8) var occlusionSampler: sampler;
@group(0) @binding(9) var occlusionTexture: texture_2d<f32>;

@group(0) @binding(10) var emissiveSampler: sampler;
@group(0) @binding(11) var emissiveTexture: texture_2d<f32>;


fn lambertDiffuse(cDiff: vec3<f32>) -> vec3<f32> {
    return cDiff / PI;
}

fn specD(a: f32, nDotH: f32) -> f32 {
    let aSqr = a * a;
    let f = ((nDotH * nDotH) * (aSqr - 1.0) + 1.0);
    return aSqr / (PI * f * f);
}

fn specG(roughness: f32, nDotL: f32, nDotV: f32) -> f32 {
    let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    let gl = nDotL / (nDotL * (1.0 - k) + k);
    let gv = nDotV / (nDotV * (1.0 - k) + k);
    return gl * gv;
}


fn specF(vDotH: f32, f0: vec3<f32>) -> vec3 {
    let exponent = (-5.55473 * vDotH - 6.98316) * vDotH;
    let base = 2.0;
    return f0 + (1.0 - f0) * pow(base, exponent);
}


struct FragmentInput {
    @location(0) position: vec3<f32>;
    @location(1) normal: vec3<f32>;
    @location(2) tbn: mat3x3<f32>;
    @location(3) color: vec4<f32>;
    @location(4) texcoord_0: vec2<f32>;
    @location(5) texcoord_1: vec2<f32>;
};

fn getTextureUV(in: FragmentInput, textureInfo: TextureInfo) -> vec2<f32> {
    var uv: vec3<f32> = vec3(in.texcoord_0, 1.0);
    if textureInfo.UVSetIndex == 1 {
        uv = vec3(in.texcoord_1, 1.0);
    }
    if textureInfo.has_uv_transform == 1 {
        uv = textureInfo.UVTransform * uv;
    }
    return uv.xy;
} 
fn getTextureColorUnscaled(in: FragmentInput, textureInfo: TextureInfo, texture: texture_2d<f32>, texture_sampler: sampler) -> vec4<f32> {

    if textureInfo.has_texture == 1 {
        var uv: vec2<f32> = getTextureUV(in, textureInfo);
        return (textureSample(texture, texture_sampler, uv));
    } else {
        return (vec4(1.0, 0.753, 0.796, 1.0));
        //R: 100, G: 75.3, B: 79.6
    }
}

fn getTextureColor(in: FragmentInput, textureInfo: TextureInfo, texture: texture_2d<f32>, texture_sampler: sampler) -> vec4<f32> {
    var baseColor: vec4<f32> = textureInfo.value;
    if textureInfo.has_texture == 1 {
        var uv: vec2<f32> = getTextureUV(in, textureInfo);
        baseColor *= textureSample(texture, texture_sampler, uv);
    }
    return baseColor;
}

struct MaterialInfo {
  roughness: f32;
  metallic: f32;
  fullyRough: f32;
  baseColor: vec4<f32>;
  normal: vec3<f32>;
  occlusion: f32;
  occlusionStrength: f32;
  emissive: vec3<f32>;
  finalColor: vec4<f32>;
  nDotL: f32;
  nDotV: f32;
  nDotH: f32;
  vDotH: f32;
  cDiff: vec3<f32>;
  f0: vec3<f32>;
  specular: vec3<f32>;
};

fn getNormal(in: FragmentInput) -> vec3<f32> {
    if uniforms.normal.has_texture == 1 {
        uniforms.normal.value = vec4<f32>(1.0, 1.0, 1.0, 1.0);
        var n: vec3<f32> = getTextureColor(in, uniforms.normal, normalTexture, normalSampler).rgb;
        n = in.tbn * (2.0 * n - 1.0);
        n = normalize(n);
        return (n);
    } else {
        var n: vec3<f32> = normalize(in.normal);
        return (n);
    }
}

fn getMetallicRoughness(in: FragmentInput, info: MaterialInfo) {
    var fully_rough: f32 = 0.0;
    if uniforms.metalRough.has_texture == 0 {
        if uniforms.metalRough.value.y >= 1.0 {
            fully_rough = 1.0;
        }
    }
    if fully_rough == 1.0 {
        info.metallic = 0.0;
    } else {
        info.metallic = uniforms.metalRough.value.x;
    }
    info.roughness = uniforms.metalRough.value.y;
    if uniforms.metalRough.has_texture == 0 {
        var metallicRoughness: vec4<f32> = getTextureColorUnscaled(in, uniforms.metalRough, metalRoughTexture, metalRoughSampler);
        info.metallic *= metallicRoughness.b;
        info.roughness *= metallicRoughness.g;
    }
    info.fullyRough = fully_rough;
}

@fragment
fn main(
    in: FragmentInput
) -> @location(0) vec4<f32> {
    var info: MaterialInfo;
    info.normal = getNormal(in);
    var n: vec3<f32> = info.normal;
    info.baseColor = getTextureColor(in, uniforms.baseColor, baseColorTexture, baseColorSampler);
    getMetallicRoughness(in, info);

    var vLight: vec3<f32>;
    var vView: vec3<f32> = uniforms.cameraPosition - in.position;
    
    info.cDiff = mix(info.baseColor.rgb * (1.0 - dielectricSpec.r), black, info.metallic); // Diffuse color
    info.f0 = mix(dielectricSpec, info.baseColor.rgb, info.metallic); // Specular color
    for (var i: i32 = 0; i < lights.lightCount; i++) {
        var light: Light = lights.lights[i];
        var lightPos: vec3<f32> = light.lightPosition;
        vLight = lightPos - in.position;
        
        var l: vec3<f32> = normalize(vLight);
        var v: vec3<f32> = normalize(vView);
        var h: vec3<f32> = normalize(l + v);

        info.nDotL = clamp(dot(n, l), 0.001, 1.0);
        info.nDotV = abs(dot(n, v)) + 0.001;
        info.nDotH = max(dot(n, h), 0.0);
        info.vDotH = max(dot(v, h), 0.0);

        var a: f32 = info.roughness * info.roughness;

        if info.fullyRough == 1.0 {
            info.specular = info.f0 * 0.45;
        } else {
            var test: f32 = info.vDotH;
            var test2: vec3<f32> = info.f0;
            var D: f32 = specD(a, info.nDotH);
            var F: vec3<f32> = specF(info.vDotH, info.f0);
            var D: f32 = specD(a, info.nDotH);
            var G: f32 = specG(info.roughness, info.nDotL, info.nDotV);
            info.specular += (D * F * G) / (4.0 * info.nDotL * info.nDotV);
        }

        var halfLambert: f32 = dot(n, l) * 0.5 + 0.5;
        halfLambert *= halfLambert;

        var color: vec3<f32> = (halfLambert * light.lightColor * lambertDiffuse(info.cDiff));
        info.finalColor += vec4<f32>(color.xyz, info.baseColor.a);
    }
    info.finalColor.rbg += info.specular;
    var occlusion: f32 = getTextureColor(in, uniforms.occlusion, occlusionTexture, occlusionSampler).r;
    info.finalColor.rgb = mix(info.finalColor.rgb, info.finalColor.rgb * occlusion, uniforms.occlusionStrength);
    var emissive: vec3<f32> = getTextureColor(in, uniforms.emissive, emissiveTexture, emissiveSampler).rgb;
    info.finalColor.rgb += emissive;// getemissive().rgb;
}