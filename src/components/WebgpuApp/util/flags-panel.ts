import { QueryArgs } from './query-args';

type Option = { key: string; label: string; type: 'bool'|'select'|'number'; values?: {label:string,value:any}[]; min?: number; max?: number; step?: number; };

function getParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function setParam(params: URLSearchParams, key: string, value: any) {
  if (value === null || value === undefined || value === '' || value === false) {
    params.delete(key);
  } else {
    params.set(key, String(value));
  }
}

function reloadWith(params: URLSearchParams) {
  const url = `${window.location.pathname}?${params.toString()}`;
  window.location.assign(url);
}

export function installFlagsPanel() {
  const el = document.createElement('div');
  el.id = 'flags-panel';
  el.style.position = 'fixed';
  el.style.top = '8px';
  el.style.right = '8px';
  el.style.zIndex = '10000';
  el.style.fontFamily = 'system-ui, sans-serif';
  el.style.fontSize = '12px';
  el.style.color = '#eee';
  el.style.background = 'rgba(20,20,24,0.8)';
  el.style.padding = '8px 10px';
  el.style.borderRadius = '6px';
  el.style.minWidth = '220px';
  el.style.backdropFilter = 'blur(4px)';
  el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';

  const title = document.createElement('div');
  title.textContent = 'Lucid3D Flags';
  title.style.fontWeight = '600';
  title.style.marginBottom = '6px';
  el.appendChild(title);

  const params = getParams();

  const options: Option[] = [
    { key: 'absDemo', label: 'Abstractions Demo', type: 'bool' },
    { key: 'model', label: 'Model', type: 'select', values: [
      {label:'Fox', value:'fox'},
      {label:'Dragon', value:'dragon'},
      {label:'Sponza', value:'sponza'},
    ]},
    { key: 'deferred', label: 'Deferred', type: 'bool' },
    { key: 'gbufTargets', label: 'G-Buffer RTs', type: 'select', values: [
      {label:'3', value:3},{label:'2', value:2}
    ]},
    { key: 'oct', label: 'Octa Normals (2-RT)', type: 'bool' },
    { key: 'albedo', label: 'Albedo Only', type: 'bool' },
    { key: 'gbuf', label: 'GBuffer Debug', type: 'select', values: [
      {label:'Off', value:''},
      {label:'G0', value:'G0'},
      {label:'G1', value:'G1'},
      {label:'G2', value:'G2'},
    ]},
    { key: 'metrics', label: 'Metrics Overlay', type: 'bool' },
    { key: 'noanim', label: 'Disable Anim', type: 'bool' },
    { key: 'samples', label: 'MSAA Samples', type: 'select', values: [
      {label:'1', value:1},{label:'4', value:4}
    ]},
    { key: 'lights', label: 'Point Lights', type: 'number', min: 0, max: 1024, step: 1 },
  ];

  const row = (labelText: string) => {
    const r = document.createElement('div');
    r.style.display = 'flex';
    r.style.alignItems = 'center';
    r.style.justifyContent = 'space-between';
    r.style.gap = '8px';
    r.style.margin = '6px 0';
    const lab = document.createElement('label');
    lab.textContent = labelText;
    lab.style.flex = '1 1 auto';
    r.appendChild(lab);
    return { r, lab };
  };

  options.forEach(opt => {
    const { r } = row(opt.label);
    let input: HTMLElement;
    const cur = params.get(opt.key);
    if (opt.type === 'bool') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = QueryArgs.getBool(opt.key, false);
      cb.onchange = () => {
        const p = getParams();
        setParam(p, opt.key, cb.checked ? 1 : null);
        if (opt.key === 'deferred' && !cb.checked) {
          // turning off deferred clears gbuf debug
          setParam(p, 'gbuf', '');
        }
        // If enabling lights, enforce deferred + samples=1
        if (opt.key === 'deferred' && cb.checked && Number(params.get('lights')||'0')>0) {
          setParam(p, 'samples', 1);
        }
        reloadWith(p);
      };
      input = cb;
    } else if (opt.type === 'select') {
      const sel = document.createElement('select');
      sel.style.flex = '0 0 auto';
      (opt.values || []).forEach(v => {
        const o = document.createElement('option');
        o.value = String(v.value);
        o.text = v.label;
        sel.appendChild(o);
      });
      if (cur != null) sel.value = cur;
      sel.onchange = () => {
        const p = getParams();
        setParam(p, opt.key, sel.value);
        // Changing samples or gbufTargets requires rebuild; reload
        reloadWith(p);
      };
      input = sel;
    } else {
      const num = document.createElement('input');
      num.type = 'number';
      if (opt.min != null) num.min = String(opt.min);
      if (opt.max != null) num.max = String(opt.max);
      if (opt.step != null) num.step = String(opt.step);
      num.value = String(cur ?? 0);
      num.onchange = () => {
        const p = getParams();
        const v = Number(num.value) || 0;
        // If lights > 0, enforce deferred and samples=1
        if (opt.key === 'lights') {
          setParam(p, 'lights', v>0? v : null);
          if (v>0) {
            setParam(p, 'deferred', 1);
            setParam(p, 'samples', 1);
          }
        } else {
          setParam(p, opt.key, v);
        }
        reloadWith(p);
      };
      input = num;
    }
    input.style.flex = '0 0 auto';
    r.appendChild(input);
    el.appendChild(r);
  });

  // Hint text
  const hint = document.createElement('div');
  hint.style.opacity = '0.8';
  hint.style.fontSize = '11px';
  hint.style.marginTop = '6px';
  hint.textContent = 'Note: Lights require deferred + samples=1';
  el.appendChild(hint);

  document.body.appendChild(el);
}
