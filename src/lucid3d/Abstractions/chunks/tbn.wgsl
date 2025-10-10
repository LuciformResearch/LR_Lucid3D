struct TBNIn { n: vec3<f32>, t: vec3<f32>, b: vec3<f32> };
fn make_tbn(i: TBNIn) -> mat3x3<f32> { return mat3x3<f32>(normalize(i.t), normalize(i.b), normalize(i.n)); }

