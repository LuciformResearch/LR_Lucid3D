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
  dirIntensity: number;
  lightColor: [number, number, number];
  dirEnabled: boolean;
  iblDiffuse: number;
  iblSpecular: number;
  iblEnabled: boolean;
  matcapFactor: number;
  matcapEnabled: boolean;
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
  private iblMaxMip = new WeakMap<ForwardPBRMaterial, number>();
  private hasMatcap = false;
  private state: PanelState = {
    lightDir: [0.3, 0.8, 0.5],
    dirIntensity: 1.0,
    lightColor: [1, 1, 1],
    dirEnabled: true,
    iblDiffuse: 1.0,
    iblSpecular: 1.0,
    iblEnabled: true,
    matcapFactor: 1.0,
    matcapEnabled: true,
    debugMode: 0,
  };

  private dirInputs: { x: HTMLInputElement; y: HTMLInputElement; z: HTMLInputElement; };
  private intensityInput: HTMLInputElement;
  private dirToggle: HTMLInputElement;
  private colorInput: HTMLInputElement;
  private iblDiffuseInput: HTMLInputElement;
  private iblSpecInput: HTMLInputElement;
  private iblToggle: HTMLInputElement;
  private matcapToggle: HTMLInputElement | null = null;
  private matcapInput: HTMLInputElement | null = null;
  private matcapSection: HTMLDivElement | null = null;
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
    this.container.style.minWidth = '240px';
    this.container.style.padding = '12px';
    this.container.style.background = 'rgba(14, 18, 27, 0.82)';
    this.container.style.borderRadius = '10px';
    this.container.style.boxShadow = '0 12px 24px rgba(0,0,0,0.45)';
    this.container.style.color = '#fff';
    this.container.style.fontFamily = 'Inter, system-ui, sans-serif';
    this.container.style.fontSize = '13px';
    this.container.style.display = 'none';
    this.container.style.zIndex = '10000';
    this.container.style.pointerEvents = 'auto';
    this.container.style.userSelect = 'none';

    const title = document.createElement('div');
    title.textContent = 'PBR Controls';
    title.style.fontWeight = '600';
    title.style.marginBottom = '10px';
    this.container.appendChild(title);

    const lightSection = this.createSection('Directional light');
    const dirToggleRow = document.createElement('label');
    dirToggleRow.style.display = 'flex';
    dirToggleRow.style.alignItems = 'center';
    dirToggleRow.style.marginBottom = '6px';
    this.dirToggle = document.createElement('input');
    this.dirToggle.type = 'checkbox';
    this.dirToggle.checked = this.state.dirEnabled;
    this.dirToggle.style.marginRight = '8px';
    this.dirToggle.addEventListener('change', () => {
      this.state.dirEnabled = this.dirToggle.checked;
      this.applyLighting();
    });
    const dirToggleLabel = document.createElement('span');
    dirToggleLabel.textContent = 'Activer';
    dirToggleRow.appendChild(this.dirToggle);
    dirToggleRow.appendChild(dirToggleLabel);
    lightSection.appendChild(dirToggleRow);

    const dirWrapper = document.createElement('div');
    dirWrapper.style.display = 'grid';
    dirWrapper.style.gridTemplateColumns = '60px 1fr';
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

    const intensitySlider = this.createSlider('intensity', 0, 5, 0.01, this.state.dirIntensity, (value) => {
      this.state.dirIntensity = value;
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

    const iblSection = this.createSection('Image Based Lighting');
    const iblToggleRow = document.createElement('label');
    iblToggleRow.style.display = 'flex';
    iblToggleRow.style.alignItems = 'center';
    iblToggleRow.style.marginBottom = '6px';
    this.iblToggle = document.createElement('input');
    this.iblToggle.type = 'checkbox';
    this.iblToggle.checked = this.state.iblEnabled;
    this.iblToggle.style.marginRight = '8px';
    this.iblToggle.addEventListener('change', () => {
      this.state.iblEnabled = this.iblToggle.checked;
      this.applyIBL();
    });
    const iblToggleLabel = document.createElement('span');
    iblToggleLabel.textContent = 'Activer';
    iblToggleRow.appendChild(this.iblToggle);
    iblToggleRow.appendChild(iblToggleLabel);
    iblSection.appendChild(iblToggleRow);

    const iblDiffuse = this.createSlider('diffuse', 0, 5, 0.01, this.state.iblDiffuse, (value) => {
      this.state.iblDiffuse = value;
      this.applyIBL();
    });
    iblSection.appendChild(iblDiffuse.wrapper);
    const iblSpec = this.createSlider('specular', 0, 5, 0.01, this.state.iblSpecular, (value) => {
      this.state.iblSpecular = value;
      this.applyIBL();
    });
    iblSection.appendChild(iblSpec.wrapper);
    this.iblDiffuseInput = iblDiffuse.input;
    this.iblSpecInput = iblSpec.input;

    this.matcapSection = this.createSection('Matcap');
    this.matcapSection.style.display = 'none';
    const matcapToggleRow = document.createElement('label');
    matcapToggleRow.style.display = 'flex';
    matcapToggleRow.style.alignItems = 'center';
    matcapToggleRow.style.marginBottom = '6px';
    this.matcapToggle = document.createElement('input');
    this.matcapToggle.type = 'checkbox';
    this.matcapToggle.checked = this.state.matcapEnabled;
    this.matcapToggle.style.marginRight = '8px';
    this.matcapToggle.addEventListener('change', () => {
      this.state.matcapEnabled = this.matcapToggle!.checked;
      this.applyMatcap();
    });
    const matcapToggleLabel = document.createElement('span');
    matcapToggleLabel.textContent = 'Activer';
    matcapToggleRow.appendChild(this.matcapToggle);
    matcapToggleRow.appendChild(matcapToggleLabel);
    this.matcapSection.appendChild(matcapToggleRow);

    const matcapSlider = this.createSlider('blend', 0, 1, 0.01, this.state.matcapFactor, (value) => {
      this.state.matcapFactor = value;
      this.applyMatcap();
    });
    this.matcapSection.appendChild(matcapSlider.wrapper);
    this.matcapInput = matcapSlider.input;

    const debugSection = this.createSection('Debug view');
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
    resetBtn.style.marginTop = '6px';
    resetBtn.style.width = '100%';
    resetBtn.style.padding = '6px 0';
    resetBtn.style.border = 'none';
    resetBtn.style.borderRadius = '4px';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.background = 'rgba(255, 255, 255, 0.12)';
    resetBtn.style.color = '#fff';
    resetBtn.addEventListener('click', () => this.reset());
    debugSection.appendChild(resetBtn);

    document.body.appendChild(this.container);
  }

  attachMaterials(materials: ForwardPBRMaterial[]) {
    let added = false;
    let hasMatcap = this.hasMatcap;
    for (const mat of materials) {
      if (!this.materials.has(mat)) {
        this.materials.add(mat);
        const uniform: any = mat.uniforms?.IBL_PARAMS;
        const maxMip = Array.isArray(uniform?.value) ? uniform.value[2] : 0;
        this.iblMaxMip.set(mat, maxMip);
        added = true;
      }
      const matcapUniform: any = mat.uniforms?.MATCAP_FACTOR;
      if (matcapUniform !== undefined) {
        hasMatcap = true;
        if (!this.hasMatcap) {
          const factor = typeof matcapUniform.value === 'number'
            ? matcapUniform.value
            : (Array.isArray(matcapUniform.value) ? matcapUniform.value[0] : 1);
          this.state.matcapFactor = factor ?? 1;
          this.state.matcapEnabled = (this.state.matcapFactor ?? 0) > 0.001;
        }
      }
    }
    this.hasMatcap = hasMatcap;
    if (this.matcapSection) {
      this.matcapSection.style.display = this.hasMatcap ? 'block' : 'none';
      if (this.hasMatcap) {
        if (this.matcapInput) this.matcapInput.value = this.state.matcapFactor.toString();
        if (this.matcapToggle) this.matcapToggle.checked = this.state.matcapEnabled;
      }
    }
    if (this.materials.size > 0) {
      this.container.style.display = 'block';
      if (added) {
        this.applyLighting(materials);
        this.applyIBL(materials);
        this.applyMatcap(materials);
        this.applyDebugMode(materials);
      } else {
        this.applyLighting();
        this.applyIBL();
        this.applyMatcap();
        this.applyDebugMode();
      }
    }
  }

  private reset() {
    this.state = {
      lightDir: [0.3, 0.8, 0.5],
      dirIntensity: 1.0,
      lightColor: [1, 1, 1],
      dirEnabled: true,
      iblDiffuse: 1.0,
      iblSpecular: 1.0,
      iblEnabled: true,
      matcapFactor: 1.0,
      matcapEnabled: true,
      debugMode: 0,
    };
    this.dirInputs.x.value = this.state.lightDir[0].toString();
    this.dirInputs.y.value = this.state.lightDir[1].toString();
    this.dirInputs.z.value = this.state.lightDir[2].toString();
    this.intensityInput.value = this.state.dirIntensity.toString();
    this.dirToggle.checked = true;
    this.colorInput.value = '#ffffff';
    this.iblDiffuseInput.value = this.state.iblDiffuse.toString();
    this.iblSpecInput.value = this.state.iblSpecular.toString();
    this.iblToggle.checked = true;
    if (this.matcapInput) this.matcapInput.value = this.state.matcapFactor.toString();
    if (this.matcapToggle) this.matcapToggle.checked = this.state.matcapEnabled;
    this.debugChecks.forEach((c) => { c.checked = false; });
    this.applyLighting();
    this.applyIBL();
    this.applyMatcap();
    this.applyDebugMode();
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
    label.style.width = '60px';
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
    const intensity = this.state.dirEnabled ? this.state.dirIntensity : 0;
    const lightVec: [number, number, number, number] = [dir[0], dir[1], dir[2], intensity];
    const colorVec: [number, number, number, number] = [
      this.state.lightColor[0],
      this.state.lightColor[1],
      this.state.lightColor[2],
      0,
    ];
    const mats = targetMaterials ?? Array.from(this.materials);
    for (const mat of mats) {
      mat.setLightDirectionIntensity(lightVec);
      mat.setLightColor(colorVec);
    }
    this.flush(mats);
  }

  private applyIBL(targetMaterials?: ForwardPBRMaterial[]) {
    const diffuse = this.state.iblEnabled ? this.state.iblDiffuse : 0;
    const spec = this.state.iblEnabled ? this.state.iblSpecular : 0;
    const mats = targetMaterials ?? Array.from(this.materials);
    for (const mat of mats) {
      const maxMip = this.iblMaxMip.get(mat) ?? 0;
      mat.setIBLParams(diffuse, spec, maxMip);
    }
    this.flush(mats);
  }

  private applyMatcap(targetMaterials?: ForwardPBRMaterial[]) {
    if (!this.hasMatcap) return;
    const factor = this.state.matcapEnabled ? this.state.matcapFactor : 0;
    const mats = targetMaterials ?? Array.from(this.materials);
    for (const mat of mats) {
      if ((mat.uniforms as any)?.MATCAP_FACTOR !== undefined) {
        mat.setMatcapFactor(factor);
      }
    }
    this.flush(mats);
  }

  private applyDebugMode(targetMaterials?: ForwardPBRMaterial[]) {
    const mats = targetMaterials ?? Array.from(this.materials);
    for (const mat of mats) {
      mat.setDebugMode(this.state.debugMode);
    }
    this.flush(mats);
  }

  private flush(materials: ForwardPBRMaterial[]) {
    for (const mat of materials) mat.updateUniforms();
  }
}
