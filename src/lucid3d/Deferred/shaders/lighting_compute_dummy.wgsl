@group(0) @binding(0) var lightingOut: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  // No need for bounds check, out-of-bounds writes are discarded.
  textureStore(lightingOut, globalId.xy, vec4(1.0, 0.0, 1.0, 1.0)); // Magenta
}
