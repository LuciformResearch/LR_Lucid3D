@group(0) @binding(0) var gSampler: sampler;
@group(0) @binding(1) var gAlbedoTex: texture_2d<f32>;

@group(1) @binding(0) var lightingOut: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let px = globalId.xy;
  let dims = textureDimensions(gAlbedoTex);
  if (px.x >= dims.x || px.y >= dims.y) {
    return;
  }

  let uv = vec2<f32>(f32(px.x) / f32(dims.x), f32(px.y) / f32(dims.y));
  let flipUv = vec2<f32>(uv.x, 1.0 - uv.y);

  let g0 = textureSampleLevel(gAlbedoTex, gSampler, flipUv, 0.0);

  textureStore(lightingOut, px, g0);
}
