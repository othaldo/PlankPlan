import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/** Portaled so sidebar scrolling never clips the explanation. */
export function HelpInfo({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  function show(target: HTMLElement) {
    const box = target.getBoundingClientRect(), above = window.innerHeight - box.bottom < 280;
    setPosition({ left: Math.max(8, Math.min(box.right - 260, window.innerWidth - 268)), top: above ? box.top - 8 : box.bottom + 8, above });
  }
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', onKey); };
  }, [position]);
  return <span className="help-info"><button type="button" aria-label={`Info: ${label}`} aria-describedby={position ? id : undefined}
    onMouseEnter={e => show(e.currentTarget)} onMouseLeave={() => setPosition(null)}
    onFocus={e => show(e.currentTarget)} onBlur={() => setPosition(null)} onClick={e => show(e.currentTarget)}><Info size={14} /></button>
    {position && createPortal(<div id={id} role="tooltip" className="info-tooltip" style={{ left: position.left, top: position.top, transform: position.above ? 'translateY(-100%)' : undefined }}>{children}</div>, document.body)}
  </span>;
}
