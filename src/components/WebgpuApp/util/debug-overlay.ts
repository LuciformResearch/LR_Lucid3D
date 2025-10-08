type OverlayState = {
  useSkinning: boolean;
  joints: number;
  animations: number;
  channels: number;
  time: string;
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
    el.innerHTML = lines.join('<br/>');
  }
}

export const debugOverlay = new DebugOverlay();

