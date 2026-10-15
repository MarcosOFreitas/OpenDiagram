// small stroke icons (24x24 grid, drawn by CSS size) shared by the top bar and the canvas dock
const P = {
  zoomOut: <path d="M5 12h14" />,
  zoomIn: <path d="M5 12h14M12 5v14" />,
  fit: <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />,
  collapse: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 12h8" /></>,
  expand: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 12h8M12 8v8" /></>,
  arrange: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  caret: <path d="m6 9 6 6 6-6" />,
  db: <><ellipse cx="12" cy="5.5" rx="7.5" ry="3" /><path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></>,
};
export const Ic = ({ n }) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>;
export const Logo = () => <span className="logo"><Ic n="db" /></span>;
