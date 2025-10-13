import { ForwardPBRMaterial } from '../Abstractions/MaterialFactory';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVec3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-4) {
    return [0, 1, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
}

type DebugModeOption = {
  label: string;
  mode: number;
};

type PanelState = {
  lightDir: [number, number, number];
  intensity: number;
  lightColor: [number, number, number];
  debugMode: number;
};

export class PBRDebugPanel {
  private static instance: PBRDebugPanel | null = null;
  static getInstance(): PBRDebugPanel {
    if (!this.instance) {
      this.instance = new PBRDebugPanel();
    }
    return this.instance;
  }

  private container: HTMLDivElement;
  private materials = new Set<ForwardPBRMaterial>();
  private state: PanelState = {
    lightDir: [0.3, 0.8, 0.5],
    intensity: 1.0,
    lightColor: [1, 1, 1],
    debugMode: 0,
  };

  private dirInputs: { x: HTMLInputElement; y: HTMLInputElement; z: HTMLInputElement; };
  private intensityInput: HTMLInputElement;
  private colorInput: HTMLInputElement;
  private debugChecks: HTMLInputElement[] = [];
  private debugOptions: DebugModeOption[] = [
    { label: 'Normals', mode: 1 },
    { label: 'Metallic/Roughness', mode: 2 },
    { label: 'Roughness only', mode: 3 },
    { label: 'Occlusion', mode: 4 },
    { label: 'Emissive', mode: 5 },
    { label: 'Base color', mode: 6 },
  ];

  private constructor() {
    this.container = document.createElement('div');
    this.container.id = 'pbr-debug-panel';
    this.container.style.position = 'fixed';
    this.container.style.top = '12px';
    this.container.style.right = '12px';
    this.container.style.minWidth = '220px';
    this.container.style.padding = '12px';
    this.container.style.background = 'rgba(14, 18, 27, 0.8)';
    this.container.style.borderRadius = '8px';
    this.container.style.boxShadow = '0 8px 18px rgba(0,0,0,0.45)';
    this.container.style.color = '#fff';
    this.container.style.fontFamily = 'Inter, system-ui, sans-serif';
    this.container.style.fontSize = '13px';
    this.container.style.display = 'none';
    this.container.style.zIndex = '10000';
    this.container.style.pointerEvents = 'auto';
    this.container.style.userSelect = 'none';

    const title = document.createElement('div');
    title.textContent = 'PBR Debug';
    title.style.fontWeight = '600';
    title.style.marginBottom = '8px';
    this.container.appendChild(title);

    const lightSection = this.createSection('Directional light');
    const dirWrapper = document.createElement('div');
    dirWrapper.style.display = 'grid';
    dirWrapper.style.gridTemplateColumns = '56px 1fr';
    dirWrapper.style.rowGap = '4px';
    dirWrapper.style.columnGap = '8px';

    const dirX = this.createSlider('dir X', -1, 1, 0.01, this.state.lightDir[0], (value) => {
      this.state.lightDir[0] = value;
      this.applyLighting();
    });
    const dirY = this.createSlider('dir Y', -1, 1, 0.01, this.state.lightDir[1], (value) => {
      this.state.lightDir[1] = value;
      this.applyLighting();
    });
    const dirZ = this.createSlider('dir Z', -1, 1, 0.01, this.state.lightDir[2], (value) => {
      this.state.lightDir[2] = value;
      this.applyLighting();
    });
    dirWrapper.appendChild(dirX.label); dirWrapper.appendChild(dirX.input);
    dirWrapper.appendChild(dirY.label); dirWrapper.appendChild(dirY.input);
    dirWrapper.appendChild(dirZ.label); dirWrapper.appendChild(dirZ.input);
    lightSection.appendChild(dirWrapper);

    const intensitySlider = this.createSlider('intensity', 0, 5, 0.01, this.state.intensity, (value) => {
      this.state.intensity = value;
      this.applyLighting();
    });
    intensitySlider.input.style.marginTop = '6px';
    lightSection.appendChild(intensitySlider.wrapper);

    const colorWrapper = document.createElement('div');
    colorWrapper.style.display = 'flex';
    colorWrapper.style.alignItems = 'center';
    colorWrapper.style.marginTop = '6px';
    const colorLabel = document.createElement('span');
    colorLabel.textContent = 'color';
    colorLabel.style.marginRight = '12px';
    colorLabel.style.width = '56px';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#ffffff';
    colorInput.addEventListener('input', () => {
      const hex = colorInput.value.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        this.state.lightColor = [r, g, b];
        this.applyLighting();
      }
    });
    colorWrapper.appendChild(colorLabel);
    colorWrapper.appendChild(colorInput);
    lightSection.appendChild(colorWrapper);

    this.dirInputs = { x: dirX.input, y: dirY.input, z: dirZ.input };
    this.intensityInput = intensitySlider.input;
    this.colorInput = colorInput;

    const debugSection = this.createSection('Debug view');
    debugSection.style.marginTop = '12px';
    const infoLine = document.createElement('div');
    infoLine.textContent = 'Afficher :';
    infoLine.style.marginBottom = '4px';
    debugSection.appendChild(infoLine);

    this.debugOptions.forEach((opt) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.marginBottom = '4px';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.marginRight = '8px';
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.debugChecks.forEach((c) => {
            if (c !== checkbox) c.checked = false;
          });
          this.state.debugMode = opt.mode;
        } else {
          this.state.debugMode = 0;
        }
        this.applyDebugMode();
      });
      const label = document.createElement('span');
      label.textContent = opt.label;
      row.appendChild(checkbox);
      row.appendChild(label);
      debugSection.appendChild(row);
      this.debugChecks.push(checkbox);
    });

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Réinitialiser';
    resetBtn.style.marginTop = '4px';
    resetBtn.style.width = '100%';
    resetBtn.style.padding = '6px 0';
    resetBtn.style.border = 'none';
    resetBtn.style.borderRadius = '4px';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.background = 'rgba(255, 255, 255, 0.12)';
    resetBtn.style.color = '#fff';
    resetBtn.addEventListener('click', () => {
      this.state = {
        lightDir: [0.3, 0.8, 0.5],
        intensity: 1.0,
        lightColor: [1, 1, 1],
        debugMode: 0,
      };
      this.dirInputs.x.value = this.state.lightDir[0].toString();
      this.dirInputs.y.value = this.state.lightDir[1].toString();
      this.dirInputs.z.value = this.state.lightDir[2].toString();
      this.intensityInput.value = this.state.intensity.toString();
      this.colorInput.value = '#ffffff';
      this.debugChecks.forEach((c) => { c.checked = false; });
      this.applyLighting();
      this.applyDebugMode();
    });
    debugSection.appendChild(resetBtn);

    document.body.appendChild(this.container);
  }

  attachMaterials(materials: ForwardPBRMaterial[]) {
    let added = false;
    for (const mat of materials) {
      if (!this.materials.has(mat)) {
        this.materials.add(mat);
        added = true;
      }
    }
    if (this.materials.size > 0) {
      this.container.style.display = 'block';
      if (added) {
        this.applyLighting(materials);
        this.applyDebugMode(materials);
      } else {
        this.applyLighting();
        this.applyDebugMode();
      }
    }
  }

  private createSection(title: string): HTMLDivElement {
    const section = document.createElement('div');
    section.style.marginBottom = '12px';
    const header = document.createElement('div');
    header.textContent = title;
    header.style.fontWeight = '600';
    header.style.marginBottom = '6px';
    section.appendChild(header);
    this.container.appendChild(section);
    return section;
  }

  private createSlider(
    labelText: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onInput: (value: number) => void,
  ): { label: HTMLSpanElement; input: HTMLInputElement; wrapper: HTMLDivElement } {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.marginBottom = '4px';

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.width = '56px';
    label.style.display = 'inline-block';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(clamp(value, min, max));
    input.style.flex = '1';
    input.addEventListener('input', () => {
      onInput(parseFloat(input.value));
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return { label, input, wrapper };
  }

  private applyLighting(targetMaterials?: ForwardPBRMaterial[]) {
    const dir = normalizeVec3(this.state.lightDir);
    const lightVector: [number, number, number, number] = [dir[0], dir[1], dir[2], this.state.intensity];
    const colorVector: [number, number, number, number] = [
      this.state.lightColor[0],
      this.state.lightColor[1],
      this.state.lightColor[2],
      0,
    ];
    const mats = targetMaterials ?? Array.from(this.materials);
    for (const mat of mats) {
      mat.setLightDirectionIntensity(lightVector);
      mat.setLightColor(colorVector);
    }
  }

  private applyDebugMode(targetMaterials?: ForwardPBRMaterial[]) {
    const mats = targetMaterials ?? Array.from(this.materials);
    for (const mat of mats) {
      mat.setDebugMode(this.state.debugMode);
    }
  }
}
