// Modular forward PBR (fragment)
// @@UBO_STRUCT
@group(0) @binding(0) var<uniform> ubo: UBO;
// @@BINDINGS_GROUP1

struct FSIn { @location(0) vUv: vec2<f32>, @location(1) vN: vec3<f32>, @location(2) vT: vec3<f32>, @location(3) vB: vec3<f32>, @location(4) vUv1: vec2<f32>, @location(5) vPosW: vec3<f32> };

// @@GLOBAL_SNIPPETS

@fragment fn main(in: FSIn) -> @location(0) vec4<f32> {
  // Base values
  var albedo = ubo.BASE_COLOR_FACTOR.rgb;
  var metallic: f32 = 0.0; var roughness: f32 = 1.0;
  var n = normalize(in.vN);

  // @@FRAGMENT_INITIALIZE_SNIPPETS
  // @@MATERIALINFO_SNIPPETS
  // @@NORMALMAP_SNIPPETS
  // @@LIGHT_INIT_SNIPPETS

  var color = vec3<f32>(0.0);

  // @@LIGHT_COMPUTE_SNIPPETS
  // @@LAYER_BLEND_SNIPPETS
  // @@FRAGMENT_FINALIZE_SNIPPETS

  let debugMode = ubo.DEBUG_PARAMS.x;
  if (debugMode > 0.5) {
    if (debugMode == 1.0) {
      let debugN = normalize(n) * 0.5 + vec3<f32>(0.5);
      return vec4<f32>(debugN, 1.0);
    } else if (debugMode == 2.0) {
      let uvMR = applyUV(selectUV(in.vUv, in.vUv1, ubo.MR_UV_RS.z), ubo.MR_UV_SO, ubo.MR_UV_RS);
      let mrSample = textureSample(tMR, s, uvMR);
      return vec4<f32>(vec3<f32>(mrSample.b, mrSample.g, 0.0), 1.0);
    } else if (debugMode == 3.0) {
      let uvMR = applyUV(selectUV(in.vUv, in.vUv1, ubo.MR_UV_RS.z), ubo.MR_UV_SO, ubo.MR_UV_RS);
      let mrSample = textureSample(tMR, s, uvMR);
      let r = mrSample.g;
      return vec4<f32>(vec3<f32>(r, r, r), 1.0);
    } else if (debugMode == 4.0) {
      let uvAO = applyUV(selectUV(in.vUv, in.vUv1, ubo.AO_UV_RS.z), ubo.AO_UV_SO, ubo.AO_UV_RS);
      let ao = textureSample(tAO, s, uvAO).r;
      return vec4<f32>(vec3<f32>(ao, ao, ao), 1.0);
    } else if (debugMode == 5.0) {
      let uvEM = applyUV(selectUV(in.vUv, in.vUv1, ubo.EM_UV_RS.z), ubo.EM_UV_SO, ubo.EM_UV_RS);
      let em = textureSample(tEmissive, s, uvEM).rgb * ubo.EMISSIVE_FACTOR;
      return vec4<f32>(em, 1.0);
    } else if (debugMode == 6.0) {
      let uvBC = applyUV(selectUV(in.vUv, in.vUv1, ubo.BC_UV_RS.z), ubo.BC_UV_SO, ubo.BC_UV_RS);
      let bc = textureSample(tBase, s, uvBC).rgb * ubo.BASE_COLOR_FACTOR.rgb;
      return vec4<f32>(bc, 1.0);
    } else if (debugMode == 7.0) {
      // Matcap debug - show matcap as sphere
      if (HAS_MATCAP) {
        let V = normalize(ubo.CAMERA_POS - in.vPosW);
        let reflectDir = normalize(reflect(-V, n));
        let viewRot = mat3x3<f32>(ubo.VIEW[0].xyz, ubo.VIEW[1].xyz, ubo.VIEW[2].xyz);
        let rView = normalize(viewRot * reflectDir);
        var uv = rView.xy * 0.5 + vec2<f32>(0.5, 0.5);
        uv = clamp(uv, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
        let matcapColor = textureSample(tMatcap, s, uv).rgb;
        return vec4<f32>(matcapColor, 1.0);
      } else {
        return vec4<f32>(1.0, 0.0, 1.0, 1.0); // Magenta if no matcap
      }
    }
  }

  if (ALBEDO_ONLY) { return vec4<f32>(albedo, 1.0); }
  return vec4<f32>(color, 1.0);
}
