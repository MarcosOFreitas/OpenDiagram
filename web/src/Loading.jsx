// "Loading" mark for panels that wait for the server: two tables joined by a line with a dot running between them (the app's own idea: diagrams that connect).
// Motion is opacity/transform only and stops under prefers-reduced-motion (styles.css, .loading).
export default function Loading({ label = 'Loading' }) {
  return (
    <div className="loading" role="status">
      <svg viewBox="0 0 72 40" width="72" height="40" aria-hidden="true">
        <line className="ld-line" x1="22" y1="20" x2="50" y2="20" />
        <rect className="ld-box ld-a" x="3" y="9" width="19" height="22" rx="4" />
        <rect className="ld-box ld-b" x="50" y="9" width="19" height="22" rx="4" />
        <circle className="ld-dot" cx="22" cy="20" r="3.2" />
      </svg>
      <span>{label}…</span>
    </div>
  );
}
