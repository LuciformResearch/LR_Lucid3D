export type HDRImage = {
  width: number;
  height: number;
  data: Float32Array; // RGB, linear
};

const asciiDecoder = new TextDecoder('ascii');

function readLine(view: Uint8Array, offset: number): { line: string; next: number } {
  let end = offset;
  const len = view.length;
  while (end < len && view[end] !== 0x0a) end++;
  const line = asciiDecoder.decode(view.subarray(offset, end)).replace(/\r$/, '');
  const next = end + 1;
  return { line, next };
}

function parseHeader(bytes: Uint8Array): { offset: number; width: number; height: number; format: string } {
  let offset = 0;
  const sig = readLine(bytes, offset);
  if (!sig.line.startsWith('#?RADIANCE') && !sig.line.startsWith('#?RGBE')) {
    throw new Error('Invalid Radiance HDR header');
  }
  offset = sig.next;
  let width = 0;
  let height = 0;
  let format = '';
  while (offset < bytes.length) {
    const { line, next } = readLine(bytes, offset);
    offset = next;
    if (line.length === 0) break;
    if (line.startsWith('FORMAT=')) format = line.substring(7).trim();
  }
  const dims = readLine(bytes, offset);
  offset = dims.next;
  const tokens = dims.line.trim().split(/\s+/);
  if (tokens.length >= 4) {
    const hIndex = tokens.findIndex((tok) => tok === '+Y' || tok === '-Y');
    const wIndex = tokens.findIndex((tok) => tok === '+X' || tok === '-X');
    if (hIndex !== -1 && wIndex !== -1) {
      height = parseInt(tokens[hIndex + 1], 10);
      width = parseInt(tokens[wIndex + 1], 10);
      if (tokens[hIndex] === '+Y') {
        // nothing, order already top-to-bottom
      }
    }
  }
  if (!width || !height) {
    throw new Error('Failed to parse HDR dimensions');
  }
  return { offset, width, height, format };
}

function decodeScanlines(bytes: Uint8Array, offset: number, width: number, height: number): Float32Array {
  const result = new Float32Array(width * height * 3);
  const scanline = new Uint8Array(width * 4);
  const max = bytes.length;
  let ptr = offset;
  for (let y = 0; y < height; y++) {
    if (ptr + 4 > max) throw new Error('Unexpected EOF in HDR data');
    const b0 = bytes[ptr++];
    const b1 = bytes[ptr++];
    const b2 = bytes[ptr++];
    const b3 = bytes[ptr++];
    if (b0 === 2 && b1 === 2 && ((b2 << 8) | b3) === width) {
      for (let channel = 0; channel < 4; channel++) {
        let x = 0;
        while (x < width) {
          if (ptr >= max) throw new Error('Unexpected EOF in HDR RLE channel');
          const count = bytes[ptr++];
          if (count > 128) {
            const run = count - 128;
            if (ptr >= max) throw new Error('Unexpected EOF in HDR RLE run');
            const value = bytes[ptr++];
            for (let r = 0; r < run; r++) {
              scanline[x * 4 + channel] = value;
              x++;
            }
          } else {
            for (let r = 0; r < count; r++) {
              if (ptr >= max) throw new Error('Unexpected EOF in HDR RLE literal');
              scanline[x * 4 + channel] = bytes[ptr++];
              x++;
            }
          }
        }
      }
    } else {
      scanline[0] = b0;
      scanline[1] = b1;
      scanline[2] = b2;
      scanline[3] = b3;
      let x = 1;
      while (x < width) {
        if (ptr + 4 > max) throw new Error('Unexpected EOF in HDR legacy scanline');
        const r = bytes[ptr++];
        const g = bytes[ptr++];
        const b = bytes[ptr++];
        const e = bytes[ptr++];
        if (r === 1 && g === 1 && b === 1) {
          const run = e;
          const lastIndex = (x - 1) * 4;
          const lr = scanline[lastIndex];
          const lg = scanline[lastIndex + 1];
          const lb = scanline[lastIndex + 2];
          const le = scanline[lastIndex + 3];
          for (let k = 0; k < run && x < width; k++, x++) {
            const idx = x * 4;
            scanline[idx] = lr;
            scanline[idx + 1] = lg;
            scanline[idx + 2] = lb;
            scanline[idx + 3] = le;
          }
        } else {
          const idx = x * 4;
          scanline[idx] = r;
          scanline[idx + 1] = g;
          scanline[idx + 2] = b;
          scanline[idx + 3] = e;
          x++;
        }
      }
    }
    for (let x = 0; x < width; x++) {
      const r = scanline[x * 4];
      const g = scanline[x * 4 + 1];
      const b = scanline[x * 4 + 2];
      const e = scanline[x * 4 + 3];
      const outIdx = (y * width + x) * 3;
      if (e) {
        const scale = Math.pow(2.0, e - 136);
        result[outIdx] = r * scale;
        result[outIdx + 1] = g * scale;
        result[outIdx + 2] = b * scale;
      } else {
        result[outIdx] = 0;
        result[outIdx + 1] = 0;
        result[outIdx + 2] = 0;
      }
    }
  }
  return result;
}

export async function loadHDR(url: string): Promise<HDRImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch HDR ${url}: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const { offset, width, height } = parseHeader(bytes);
  const data = decodeScanlines(bytes, offset, width, height);
  return { width, height, data };
}
