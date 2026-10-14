import { useEffect, useMemo, useRef, useState } from 'react';
import './docsite.css';
import { PAGES, NAV, ORDER } from './nav.js';
import { render } from './md.jsx';

const base = '/docs';
const slugOf = (path) => path.replace(/^\/docs\/?/, '').replace(/\/$/, '') || 'introduction';
const strip = (t) => t.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`|]/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ');

function themeOnLoad() {
  try {
    const own = localStorage.getItem('ds-theme');
    if (own) return own;
    const v = JSON.parse(localStorage.getItem('view') || '{}').theme; // follow the app when it is set
    if (v === 'dark' || v === 'light') return v;
  } catch { /* private mode */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function DocsSite() {
  const [path, setPath] = useState(window.location.pathname);
  const [theme, setTheme] = useState(themeOnLoad);
  const [menu, setMenu] = useState(false); // sidebar on narrow screens
  const [find, setFind] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const [spy, setSpy] = useState('');
  const slug = slugOf(path), page = PAGES[slug];
  const main = useRef(null);

  const go = (to, hash = '') => {
    const url = `${base}/${to === 'introduction' ? '' : to}${hash}`.replace(/\/$/, '') || base;
    window.history.pushState({}, '', url); setPath(window.location.pathname); setMenu(false); setFind(false); setQ('');
    if (!hash) window.scrollTo(0, 0);
  };
  useEffect(() => {
    const pop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', pop);
    const key = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setFind(true); } else if (e.key === 'Escape') { setFind(false); setMenu(false); } };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => { try { localStorage.setItem('ds-theme', theme); } catch { /* private mode */ } }, [theme]);
  useEffect(() => { document.title = `${page?.title || 'Not found'} | OpenDiagram Docs`; }, [page]);

  const { blocks, toc } = useMemo(() => (page ? render(page.text.replace(/^# .*\n?/, '')) : { blocks: [], toc: [] }), [page]);

  // in-page links keep the SPA (internal /docs links) and jump to the hash
  const onClick = (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.metaKey || e.ctrlKey || a.target === '_blank') return;
    const h = a.getAttribute('href');
    if (h.startsWith('/docs')) { e.preventDefault(); const [p, hash] = h.split('#'); go(slugOf(p), hash ? `#${hash}` : ''); if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView(), 30); }
    else if (h.startsWith('#')) { e.preventDefault(); window.history.replaceState({}, '', h); document.getElementById(h.slice(1))?.scrollIntoView(); }
  };
  useEffect(() => { if (window.location.hash) setTimeout(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView(), 50); }, [slug]);

  // "On this page": highlight the heading being read
  useEffect(() => {
    if (!toc.length) return undefined;
    const els = toc.map((t) => document.getElementById(t.id)).filter(Boolean);
    const io = new IntersectionObserver((entries) => { const v = entries.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setSpy(v.target.id); }, { rootMargin: '-70px 0px -70% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [toc, slug]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return Object.values(PAGES).map((p) => {
      const body = strip(p.text), low = body.toLowerCase(), i = low.indexOf(s), t = p.title.toLowerCase().includes(s);
      if (!t && i < 0) return null;
      const hits = low.split(s).length - 1; // more mentions rank higher, a title match first
      return { p, score: (t ? 1000 : 0) + hits, snip: i >= 0 ? `${i > 40 ? '… ' : ''}${body.slice(Math.max(0, i - 40), i + 100)}` : '' };
    }).filter(Boolean).sort((x, y) => y.score - x.score).slice(0, 8);
  }, [q]);

  const idx = ORDER.indexOf(slug), prev = ORDER[idx - 1], next = ORDER[idx + 1];
  const sectionOpen = (n) => open[n.title] ?? n.items.includes(slug);

  return (
    <div className="ds" data-theme={theme} onClick={onClick}>
      <header className="ds-top">
        <button className="ds-burger" aria-label="Menu" onClick={() => setMenu(!menu)}>☰</button>
        <a className="ds-brand" href={base} onClick={(e) => { e.preventDefault(); go('introduction'); }}><span>◆</span> OpenDiagram</a>
        <nav className="ds-tabs"><a className="on" href={base} onClick={(e) => { e.preventDefault(); go('introduction'); }}>Docs</a><a href="/" >Go to the app</a></nav>
        <span className="ds-grow" />
        <button className="ds-search" onClick={() => setFind(true)}>Search <kbd>Ctrl+K</kbd></button>
        <button className="ds-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Light / dark">{theme === 'dark' ? '☀' : '☾'}</button>
        <a className="ds-app" href="/">Open app →</a>
      </header>

      <div className="ds-body">
        <aside className={`ds-side ${menu ? 'open' : ''}`}>
          {NAV.map((n) => typeof n === 'string'
            ? (PAGES[n] && <a key={n} className={`ds-link ${slug === n ? 'on' : ''}`} href={`${base}/${n === 'introduction' ? '' : n}`} onClick={(e) => { e.preventDefault(); go(n); }}>{PAGES[n].title}</a>)
            : (
              <div key={n.title} className="ds-sec">
                <button className="ds-sh" onClick={() => setOpen({ ...open, [n.title]: !sectionOpen(n) })}><span>{n.title}</span><i className={sectionOpen(n) ? 'o' : ''}>›</i></button>
                {sectionOpen(n) && n.items.filter((s) => PAGES[s]).map((s) => <a key={s} className={`ds-link sub ${slug === s ? 'on' : ''}`} href={`${base}/${s}`} onClick={(e) => { e.preventDefault(); go(s); }}>{PAGES[s].title}</a>)}
              </div>
            ))}
        </aside>

        <main className="ds-main" ref={main}>
          {page ? (
            <article>
              <h1>{page.title}</h1>
              {blocks}
              <nav className="ds-pager">
                {prev ? <a href={`${base}/${prev}`} onClick={(e) => { e.preventDefault(); go(prev); }}><small>Previous</small><b>« {PAGES[prev].title}</b></a> : <span />}
                {next ? <a className="r" href={`${base}/${next}`} onClick={(e) => { e.preventDefault(); go(next); }}><small>Next</small><b>{PAGES[next].title} »</b></a> : <span />}
              </nav>
            </article>
          ) : <article><h1>Page not found</h1><p>This page does not exist. <a href={base}>Back to the introduction</a>.</p></article>}
        </main>

        <aside className="ds-toc">
          {toc.length > 0 && <><b>On this page</b>{toc.map((t) => <a key={t.id} href={`#${t.id}`} className={`${t.level === 3 ? 'sub' : ''} ${spy === t.id ? 'on' : ''}`}>{t.text}</a>)}</>}
        </aside>
      </div>

      {find && (
        <div className="ds-find" onMouseDown={(e) => { if (e.target === e.currentTarget) setFind(false); }}>
          <div className="ds-findcard" role="dialog" aria-label="Search the documentation">
            <input autoFocus placeholder="Search the documentation…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].p.slug); }} />
            {results.map(({ p, snip }) => <a key={p.slug} href={`${base}/${p.slug}`} onClick={(e) => { e.preventDefault(); go(p.slug); }}><b>{p.title}</b>{snip && <small>{snip}</small>}</a>)}
            {q.trim() && !results.length && <p className="ds-none">Nothing found for “{q}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
