type ChunkMap = { [name: string]: string };

export class ShaderChunkRegistry {
  private chunks: ChunkMap = {};
  register(name: string, code: string) { this.chunks[name] = code; }
  get(name: string): string { return this.chunks[name] || ''; }
}

export const GlobalChunks = new ShaderChunkRegistry();

export function composeWGSL(defines: string, use: string[], body: string): string {
  const header = ['// Defines', defines, '// Chunks', ...use.map(u => `// chunk ${u}`)].join('\n');
  const chunkCode = use.map(u => GlobalChunks.get(u)).join('\n');
  return [header, chunkCode, body].join('\n');
}

