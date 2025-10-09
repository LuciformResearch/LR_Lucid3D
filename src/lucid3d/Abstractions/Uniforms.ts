export abstract class UniformBase<T = unknown> {
  constructor(public name: string, protected _value: T) {}
  get value(): T { return this._value; }
  set value(v: T) { this._value = v as T; }
  // number of f32 slots used (not bytes)
  abstract floatLength(): number;
  // alignment in floats (std140-like): 1=f32, 2=vec2, 4=vec3/vec4/mat4
  abstract alignFloats(): number;
  // write into a float32 view at offset (floats); return next offset (floats)
  abstract write(view: Float32Array, offsetFloats: number): number;
}

export class FloatUniform extends UniformBase<number> {
  constructor(name: string, v = 0) { super(name, v); }
  floatLength() { return 1; }
  alignFloats() { return 1; }
  write(view: Float32Array, o: number) { view[o] = this._value as number; return o + 1; }
}
export class Vector2Uniform extends UniformBase<[number, number]> {
  constructor(name: string, v: [number, number] = [0,0]) { super(name, v); }
  floatLength() { return 2; }
  alignFloats() { return 2; }
  write(view: Float32Array, o: number) { view[o] = this._value[0]; view[o+1] = this._value[1]; return o + 2; }
}
export class Vector3Uniform extends UniformBase<[number, number, number]> {
  constructor(name: string, v: [number, number, number] = [0,0,0]) { super(name, v); }
  floatLength() { return 3; }
  alignFloats() { return 4; }
  write(view: Float32Array, o: number) { view[o] = this._value[0]; view[o+1] = this._value[1]; view[o+2] = this._value[2]; return o + 3; }
}
export class Vector4Uniform extends UniformBase<[number, number, number, number]> {
  constructor(name: string, v: [number, number, number, number] = [0,0,0,0]) { super(name, v); }
  floatLength() { return 4; }
  alignFloats() { return 4; }
  write(view: Float32Array, o: number) { view[o] = this._value[0]; view[o+1] = this._value[1]; view[o+2] = this._value[2]; view[o+3] = this._value[3]; return o + 4; }
}
export class Matrix4Uniform extends UniformBase<Float32Array | number[]> {
  constructor(name: string, v: Float32Array | number[] = new Float32Array(16)) { super(name, v); }
  floatLength() { return 16; }
  alignFloats() { return 4; }
  write(view: Float32Array, o: number) {
    const src = (this._value instanceof Float32Array) ? this._value : Float32Array.from(this._value as number[]);
    view.set(src, o); return o + 16;
  }
}

export type TextureRef = { view: GPUTextureView | null, sampler?: GPUSampler | null };
export class TextureUniform extends UniformBase<TextureRef> {
  constructor(name: string, v: TextureRef = { view: null, sampler: null }) { super(name, v); }
  // textures do not live in UBO; float length 0
  floatLength() { return 0; }
  alignFloats() { return 1; }
  write(view: Float32Array, o: number) { return o; }
}

export type UniformRecord = Record<string, UniformBase>;

// Simple UBO packer: packs floats sequentially and pads to 4-float (16-byte) alignment per symbol to be conservative.
export class UniformBufferPack {
  private order: string[];
  private totalFloats: number;
  private mapping: Record<string, { offsetFloats: number, lengthFloats: number }>; // for debugging/inspection
  constructor(public readonly uniforms: UniformRecord) {
    this.order = Object.keys(uniforms);
    this.totalFloats = 0;
    this.mapping = {};
    for (const k of this.order) {
      const u = uniforms[k];
      const len = u.floatLength();
      if (len <= 0) continue;
      // std140-like: align offset to the uniform's alignment requirement
      const align = u.alignFloats();
      const alignedOffset = Math.ceil(this.totalFloats / align) * align;
      this.totalFloats = alignedOffset;
      this.mapping[k] = { offsetFloats: this.totalFloats, lengthFloats: len };
      this.totalFloats += len;
    }
    // Final pad to 16-byte boundary
    this.totalFloats = Math.ceil(this.totalFloats / 4) * 4;
  }
  byteLength(): number { return this.totalFloats * 4; }
  writeTo(view: Float32Array) {
    for (const k of this.order) {
      const u = this.uniforms[k];
      const info = this.mapping[k];
      if (!info) continue;
      u.write(view, info.offsetFloats);
    }
  }
  getOffsets() { return this.mapping; }
}

export class UniformGPUBuffer {
  buffer: GPUBuffer;
  constructor(private device: GPUDevice, private pack: UniformBufferPack) {
    this.buffer = device.createBuffer({ size: this.pack.byteLength(), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }
  update() {
    const tmp = new Float32Array(this.pack.byteLength() / 4);
    this.pack.writeTo(tmp);
    this.device.queue.writeBuffer(this.buffer, 0, tmp);
  }
}
