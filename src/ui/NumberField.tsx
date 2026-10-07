import { useEffect, useState } from 'react';
export function NumberField({ label, value, onChange, min = 0, max = 1e6, step = 1, unit = 'mm' }:
  { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const n = Number(draft.replace(',', '.'));
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n);
    else setDraft(String(value));
  }
  return <label className="field"><span>{label}</span><div className="input-unit">
    <input aria-label={label} type="number" min={min} max={max} step={step} value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    <small>{unit}</small></div></label>;
}
