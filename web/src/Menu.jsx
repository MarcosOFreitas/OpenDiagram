import { useEffect, useRef, useState } from 'react';

// small dropdown used in the top bar: items = [{ key, label, hint?, on?, onClick } | { sep: true } | { header: 'text' }]
export default function Menu({ trigger, items, active, title, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`tbtn ${active || open ? 'on' : ''}`} title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{trigger}<span className="caret">▾</span></button>
      {open && (
        <div className={`menu-pop ${align}`} role="menu">
          {items.map((it, i) => it.sep ? <hr key={i} />
            : it.header ? <div key={i} className="menu-head">{it.header}</div>
              : <button key={it.key} role="menuitem" className={`${it.on ? 'on' : ''} ${it.danger ? 'danger' : ''}`} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}{it.hint && <small>{it.hint}</small>}</button>)}
        </div>
      )}
    </div>
  );
}
