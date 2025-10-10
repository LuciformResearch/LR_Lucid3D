export class Defines {
  private _defs: Record<string, boolean | number | string> = {};
  private _key: string | null = null;
  set(name: string, value: boolean | number | string) {
    if (value === undefined || value === null) { delete this._defs[name]; this._key = null; return; }
    this._defs[name] = value;
    this._key = null;
  }
  remove(name: string) { delete this._defs[name]; this._key = null; }
  get key(): string {
    if (this._key) return this._key;
    const entries = Object.entries(this._defs).sort(([a],[b]) => a.localeCompare(b));
    this._key = entries.map(([k,v]) => `${k}=${v}`).join('|');
    return this._key;
  }
  toWgslConsts(): string {
    const lines: string[] = [];
    const entries = Object.entries(this._defs).sort(([a],[b]) => a.localeCompare(b));
    for (const [k,v] of entries) {
      if (typeof v === 'boolean') lines.push(`const ${k}: bool = ${v ? 'true' : 'false'};`);
      else if (typeof v === 'number') lines.push(`const ${k}: f32 = ${v.toFixed(6)};`);
      else lines.push(`// ${k} = ${v}`);
    }
    return lines.join('\n') + '\n';
  }
}
