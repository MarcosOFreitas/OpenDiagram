// small stroke icons (24x24 grid, drawn by CSS size) shared by the top bar and the canvas dock
const P = {
  zoomOut: <path d="M5 12h14" />,
  zoomIn: <path d="M5 12h14M12 5v14" />,
  fit: <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />,
  collapse: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 12h8" /></>,
  expand: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 12h8M12 8v8" /></>,
  arrange: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  caret: <path d="m6 9 6 6 6-6" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.2-8.2M16 7l3 3" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M1 1l22 22" /></>,
  funnel: <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  flow: <><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="12" r="2" /><path d="M7 6c5 0 5 6 10 6M7 18c5 0 5-6 10-6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />,
  refs: <><circle cx="5" cy="6" r="2.4" /><circle cx="19" cy="18" r="2.4" /><path d="M7.2 7c7 0 3.6 10 9.6 10" /></>,
  note: <><path d="M4 4h16v10l-6 6H4z" /><path d="M14 20v-6h6" /></>,
  lineage: <><circle cx="5" cy="6" r="2.2" /><circle cx="5" cy="18" r="2.2" /><circle cx="19" cy="12" r="2.2" /><path d="M7 6.5c5 0 5 5.5 10 5.5M7 17.5c5 0 5-5.5 10-5.5" strokeDasharray="3 2.5" /></>,
  db: <><ellipse cx="12" cy="5.5" rx="7.5" ry="3" /><path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></>,
};
export const Ic = ({ n, s = 16 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>;
export const Logo = () => <span className="logo"><Ic n="db" /></span>;
