type OverlayState = {
  useSkinning: boolean;
  joints: number;
  animations: number;
  channels: number;
  time: string;
  fps?: number;
  // Texture debug info
  textures?: {
    hasBaseTexture: boolean;
    hasMRTexture: boolean;
    hasNormalTexture: boolean;
    hasAOTexture: boolean;
    hasEmissiveTexture: boolean;
  };
};

class DebugOverlay {
  private el: HTMLDivElement | null = null;
  ensure() {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.id = 'debug-overlay';
    el.style.position = 'fixed';
    el.style.top = '8px';
    el.style.left = '8px';
    el.style.zIndex = '9999';
    el.style.fontFamily = 'monospace';
    el.style.fontSize = '12px';
    el.style.color = '#fff';
    el.style.background = 'rgba(0,0,0,0.6)';
    el.style.padding = '8px 10px';
    el.style.borderRadius = '6px';
    el.style.pointerEvents = 'none';
    el.textContent = 'Debug overlay';
    document.body.appendChild(el);
    this.el = el;
    return el;
  }
  update(state: OverlayState) {
    const el = this.ensure();
    const lines = [
      `useSkinning: ${state.useSkinning}`,
      `joints: ${state.joints}`,
      `animations: ${state.animations}`,
      `channels: ${state.channels}`,
      `time: ${state.time}`,
    ];
    if (state.fps !== undefined) lines.unshift(`fps: ${state.fps.toFixed(0)}`);
    
    // Add texture debug info
    if (state.textures) {
      lines.push('--- Textures ---');
      lines.push(`Base: ${state.textures.hasBaseTexture ? '✓' : '✗'}`);
      lines.push(`MR: ${state.textures.hasMRTexture ? '✓' : '✗'}`);
      lines.push(`Normal: ${state.textures.hasNormalTexture ? '✓' : '✗'}`);
      lines.push(`AO: ${state.textures.hasAOTexture ? '✓' : '✗'}`);
      lines.push(`Emissive: ${state.textures.hasEmissiveTexture ? '✓' : '✗'}`);
    }
    
    el.innerHTML = lines.join('<br/>');
  }
}

export const debugOverlay = new DebugOverlay();
