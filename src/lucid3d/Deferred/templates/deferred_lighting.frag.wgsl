// @@BINDINGS

struct FSIn {
  @location(0) uv: vec2<f32>,
};

// @@GLOBAL_SNIPPETS

@fragment
fn main(in: FSIn) -> @location(0) vec4<f32> {
  // @@FRAGMENT_INITIALIZE_SNIPPETS
  // @@LIGHT_COMPUTE_SNIPPETS
  return vec4<f32>(color, 1.0);
}
