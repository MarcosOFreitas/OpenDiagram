import { createRoot } from 'react-dom/client';

// /docs is the public documentation site (no login, its own styles); everything else is the app
const root = createRoot(document.getElementById('root'));
if (/^\/docs(\/|$)/.test(window.location.pathname)) {
  import('./docsite/DocsSite.jsx').then(({ default: DocsSite }) => root.render(<DocsSite />));
} else {
  Promise.all([import('@xyflow/react/dist/style.css'), import('./styles.css'), import('./App.jsx')]).then(([, , { default: App }]) => root.render(<App />));
}
