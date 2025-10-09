const PI : f32 = 3.141592653589793;
fn lambert(c: vec3<f32>) -> vec3<f32> { return c / PI; }
fn schlick(vh: f32, f0: vec3<f32>) -> vec3<f32> { let k = pow(1.0 - vh, 5.0); return f0 + (1.0 - f0) * k; }

