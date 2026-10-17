// Generated database documentation (dbdocs-style): used live in the app and as a standalone HTML export.
import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { slug, display, constraints, ordered, linkCols, commentMap } from './docsModel.js';
import { press } from './a11y.js';

export const docsCss = `
.dx{--bg:#fff;--fg:#1f2937;--muted:#5b6472;--line:#e5e7eb;--side:#f8fafc;--accent:#2563eb;--chip:#eef2f9;--code:#f3f4f6;--cmt:#fffbeb;--cmtline:#fcd34d;--cmtfg:#78350f;display:flex;height:100%;background:var(--bg);color:var(--fg);font:14px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif}
.dx[data-theme=dark]{--link:#8ab4ff;--bg:#0e1420;--fg:#dbe3f1;--muted:#8b9ab5;--line:#263248;--side:#111826;--chip:#1a2438;--code:#151d2e;--cmt:#2b2410;--cmtline:#6b5314;--cmtfg:#fcd34d}
@media (prefers-color-scheme:dark){.dx:not([data-theme]){--link:#8ab4ff;--bg:#0e1420;--fg:#dbe3f1;--muted:#8b9ab5;--line:#263248;--side:#111826;--chip:#1a2438;--code:#151d2e;--cmt:#2b2410;--cmtline:#6b5314;--cmtfg:#fcd34d}}
.dx *{box-sizing:border-box}
.dx-nav{width:var(--navw,270px);flex:none;overflow:auto;background:var(--side);border-right:1px solid var(--line);padding:16px 12px}
.dx{position:relative}
.dx.nav-closed .dx-nav{width:0;padding:0;border-right:0;overflow:hidden}
.dx-toggle{position:absolute;top:12px;z-index:5;width:24px;height:40px;border:1px solid var(--line);border-left:0;border-radius:0 6px 6px 0;background:var(--side);color:var(--muted);padding:0;cursor:pointer;font:inherit;line-height:1}
.dx-grip{position:absolute;top:0;bottom:0;width:9px;margin-left:-4px;cursor:col-resize;z-index:4}
.dx-grip:hover{background:rgba(79,140,255,.45)}
.dx-nav h1{font-size:15px;margin:0 0 10px;padding:0 6px}
.dx-search{width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);margin-bottom:8px;font:inherit}
.dx-tools{display:flex;gap:6px;margin-bottom:6px}
.dx-tools button{flex:1;padding:5px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);font:12px inherit;cursor:pointer}
.dx-tools button:hover{background:var(--chip)}
.dx-nav h4{margin:14px 6px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.dx-nav ul{list-style:none;margin:0;padding:0}
.dx-nav a{display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:5px;color:var(--fg);text-decoration:none;font-size:13px}
.dx-nav a:hover{background:var(--chip)}
.dot{width:9px;height:9px;border-radius:50%;flex:none;background:var(--muted)}
.dx-main{flex:1;min-width:0;overflow:auto;padding:28px 40px 80px}
.dx-main>div{max-width:960px;margin:0 auto}
.dx h2{font-size:22px;margin:0}.dx h3{font-size:15px;margin:22px 0 6px}
.dx-table{margin-top:22px;border:1px solid var(--line);border-radius:10px;background:var(--bg)}
.dx-table>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:10px;user-select:none}
.dx-table>summary::-webkit-details-marker{display:none}
.dx-table>summary:hover{background:var(--chip)}
.dx-table>summary::after{content:"";margin-left:auto;flex:none;width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg) translate(-2px,-2px)}
.dx-table[open]>summary::after{transform:rotate(-135deg) translate(-2px,-2px)}
.dx-table[open]>summary{border-bottom:1px solid var(--line);border-radius:10px 10px 0 0}
.count{font-size:12px;color:var(--muted)}
.dx-body{padding:6px 16px 16px}
.dx-schema,.chip{display:inline-block;font-size:11px;font-weight:600;padding:1px 7px;border-radius:10px;background:var(--chip);color:var(--muted);margin-left:6px;vertical-align:middle}
.note{color:var(--muted);margin:4px 0 12px;white-space:pre-wrap}
.dx table{border-collapse:collapse;width:100%;font-size:13px}
.dx th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);padding:6px 10px;border-bottom:1px solid var(--line)}
.dx td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.dx code{background:var(--code);padding:1px 5px;border-radius:4px;font:12px ui-monospace,Consolas,monospace}
.dx a{color:var(--link,var(--accent))}
.b{display:inline-block;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;margin-right:3px;background:var(--chip);color:var(--muted)}
.b.PK{background:#fef3c7;color:#92400e}
.dx-sub{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin:16px 0 6px}
.dx ul.plain{margin:0;padding-left:18px}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 4px}
.stat{border:1px solid var(--line);border-radius:8px;padding:8px 14px}.stat b{display:block;font-size:20px}
.cmt{background:var(--cmt);border:1px solid var(--cmtline);color:var(--cmtfg);border-radius:6px;padding:4px 8px;font-size:12.5px;white-space:pre-wrap;margin:6px 0}
.cmt.none{background:transparent;border-style:dashed;opacity:.65;cursor:pointer}
.cmt.none:hover{opacity:1}
td .cmt{margin:0}
.cmt-in{width:100%;border:1px solid var(--cmtline);background:var(--cmt);color:var(--cmtfg);border-radius:6px;padding:5px 8px;font:12.5px inherit;resize:vertical}
.cmt-lbl{font-size:11px;color:var(--muted);margin-top:10px}
.cmt-meta{display:flex;align-items:center;gap:8px;font-size:11px;opacity:.85;margin-bottom:1px}
.cmt-meta b{font-weight:600}
.cmt-x{margin-left:auto;border:0;background:transparent;color:inherit;cursor:pointer;opacity:.6;padding:0 2px}
.cmt-x:hover{opacity:1}
.cmt-actions{display:flex;gap:6px;margin:4px 0}
.cmt-actions button{border:1px solid var(--line);background:var(--chip);color:var(--fg);border-radius:6px;padding:3px 10px;font:12px inherit;cursor:pointer}
.cmt-actions button:disabled{opacity:.5;cursor:default}
.dx-body{overflow-x:auto}
.dx-table:not([open])>.dx-body{display:none}
.dx td:last-child .cmt,.dx td:last-child .cmt-in{min-width:120px}.dx td{overflow-wrap:anywhere}
.cmt-in{min-height:52px;display:block}
@media (max-width:760px){.dx{flex-direction:column}.dx-nav,.dx.nav-closed .dx-nav{width:100%;max-height:40%;padding:16px 12px;border-right:1px solid var(--line);overflow:auto}.dx-toggle,.dx-grip{display:none!important}.dx-main{padding:20px}}
@media print{.dx{display:block;height:auto}.dx-nav,.dx-toggle,.dx-grip{display:none}.dx-main{overflow:visible}}
`;

// plain DOM behaviour: sidebar search, hide/resize, expand/collapse all, open a collapsed table when its link is used.
// Must stay self-contained: it is inlined into the standalone export via toString().
export function initDocs(root) {
  const input = root.querySelector('.dx-search');
  const items = Array.prototype.slice.call(root.querySelectorAll('.dx-nav li[data-s]'));
  if (input) {
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      items.forEach((li) => { li.style.display = !q || li.getAttribute('data-s').indexOf(q) >= 0 ? '' : 'none'; });
    });
  }
  const setAll = (open) => Array.prototype.forEach.call(root.querySelectorAll('details.dx-table'), (d) => { d.open = open; });
  const ex = root.querySelector('.dx-expand'), co = root.querySelector('.dx-collapse');
  if (ex) ex.addEventListener('click', () => setAll(true));
  if (co) co.addEventListener('click', () => setAll(false));
  // sidebar: hide/show (edge button) and resize (drag the edge, double-click resets); remembered in this browser
  const dx = root.querySelector('.dx'), nav = root.querySelector('.dx-nav');
  if (dx && nav && !dx.querySelector('.dx-toggle')) {
    const st = { w: 270, c: false };
    try { const v = JSON.parse(localStorage.getItem('opendiagram.docsNav') || '{}'); if (v.w >= 200 && v.w <= 900) st.w = v.w; st.c = !!v.c; } catch (e) { /* private mode */ }
    const toggle = document.createElement('button'), grip = document.createElement('div');
    toggle.type = 'button'; toggle.className = 'dx-toggle'; grip.className = 'dx-grip';
    const apply = () => {
      dx.style.setProperty('--navw', st.w + 'px'); dx.classList.toggle('nav-closed', st.c);
      toggle.textContent = st.c ? '›' : '‹'; toggle.title = st.c ? 'Show the list' : 'Hide the list'; toggle.setAttribute('aria-label', toggle.title);
      toggle.style.left = (st.c ? 0 : st.w) + 'px'; grip.style.left = (st.c ? 0 : st.w) + 'px'; grip.style.display = st.c ? 'none' : '';
    };
    const save = () => { try { localStorage.setItem('opendiagram.docsNav', JSON.stringify(st)); } catch (e) { /* private mode */ } };
    toggle.addEventListener('click', () => { st.c = !st.c; apply(); save(); });
    grip.addEventListener('dblclick', () => { st.w = 270; apply(); save(); });
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault(); document.body.style.userSelect = 'none';
      const move = (ev) => { st.w = Math.max(200, Math.min(Math.floor(window.innerWidth * 0.6), ev.clientX - dx.getBoundingClientRect().left)); apply(); };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.userSelect = ''; save(); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
    dx.appendChild(grip); dx.appendChild(toggle); apply();
  }
  // in-page links: open a collapsed table and scroll only the content pane (default anchor jumps also scroll the app shell)
  root.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    const el = root.querySelector(`#${a.getAttribute('href').slice(1)}`);
    if (!el) return;
    e.preventDefault();
    if (el.tagName === 'DETAILS') el.open = true;
    const main = root.querySelector('.dx-main');
    if (main) main.scrollTo({ top: el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 16, behavior: 'smooth' });
  });
}

const Ref = ({ model, id, col }) => {
  const t = model.byId.get(id);
  return t ? <a href={`#${slug(id)}`}>{display(t)}.{col}</a> : <code>{id}.{col}</code>;
};

const when = (t) => new Date(t * 1000).toISOString().slice(0, 10);

// comments live in the app (never in the database); `ctx` = { cmap, canComment, canDelete(c), onAdd(key, text), onDelete(id) }
function Thread({ k, ctx, compact }) {
  const list = ctx.cmap.get(k) || [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const post = () => { const t = draft.trim(); if (t) ctx.onAdd(k, t); setDraft(''); setOpen(false); };
  return (
    <>
      {list.map((c) => (
        <div key={c.id} className="cmt">
          <div className="cmt-meta"><b>{c.author}</b><span>{when(c.createdAt)}</span>{ctx.canDelete && ctx.canDelete(c) && <button type="button" className="cmt-x" title="Delete comment" aria-label="Delete comment" onClick={() => ctx.onDelete(c.id)}>✕</button>}</div>
          {c.text}
        </div>
      ))}
      {ctx.canComment && (open
        ? (
          <div className="cmt-new">
            <textarea className="cmt-in" autoFocus rows={compact ? 2 : 3} value={draft} placeholder="Comment — visible to everyone who can open this diagram. Ctrl+Enter to post."
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(''); setOpen(false); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post(); }} />
            <div className="cmt-actions"><button type="button" onClick={post} disabled={!draft.trim()}>Post</button><button type="button" onClick={() => { setDraft(''); setOpen(false); }}>Cancel</button></div>
          </div>
        )
        : <div className="cmt none" title="Add a comment (kept in this app, not in the database)" {...press(null, () => setOpen(true))}>{list.length ? '+ reply' : compact ? '+ comment' : '+ Add comment'}</div>)}
    </>
  );
}

function Table({ model, t, collapsed, ctx }) {
  const hasCol = ctx.canComment || t.fields.some((f) => ctx.cmap.has(`${t.id}.${f.name}`));
  return (
    <details className="dx-table" id={slug(t.id)} open={!collapsed.has(slug(t.id))}>
      <summary>
        <h2>{t.name}</h2>
        {t.schema && t.schema !== 'public' && <span className="dx-schema">{t.schema}</span>}
        {t.groups.map((g) => <span key={g} className="chip">{g}</span>)}
        <span className="count">{t.fields.length} columns</span>
      </summary>
      <div className="dx-body">
        {t.note && <p className="note">{t.note}</p>}
        <Thread k={t.id} ctx={ctx} />
        <table>
          <thead><tr><th>Column</th><th>Type</th><th>Constraints</th><th>Default</th><th>References</th><th>Note</th>{hasCol && <th>Comment</th>}</tr></thead>
          <tbody>
            {t.fields.map((f) => (
              <tr key={f.name}>
                <td><code>{f.name}</code></td>
                <td>{f.type}</td>
                <td>{constraints(f).map((c) => <span key={c} className={`b ${c}`}>{c}</span>)}</td>
                <td>{f.default && <code>{f.default}</code>}</td>
                <td>{f.refs.map((r, i) => <div key={i}>→ <Ref model={model} id={r.id} col={r.col} /> <small className="note">{r.card}</small></div>)}</td>
                <td className="note">{f.note}</td>
                {hasCol && <td><Thread k={`${t.id}.${f.name}`} ctx={ctx} compact /></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {t.indexes.length > 0 && (<>
          <div className="dx-sub">Indexes</div>
          <ul className="plain">{t.indexes.map((i, n) => <li key={n}>{i.pk ? 'PRIMARY KEY' : i.unique ? 'UNIQUE' : 'INDEX'} <code>({i.cols.join(', ')})</code>{i.name && <> — {i.name}</>}</li>)}</ul>
        </>)}
        {t.builtFrom.length > 0 && (<>
          <div className="dx-sub">Built from <small className="note">data lineage</small></div>
          <ul className="plain">{t.builtFrom.map((l, n) => <li key={n}>{model.byId.get(l.id) ? <a href={`#${slug(l.id)}`}>{display(model.byId.get(l.id))}</a> : <code>{l.id}</code>}<small className="note">{linkCols(l)}</small></li>)}</ul>
        </>)}
        {t.feeds.length > 0 && (<>
          <div className="dx-sub">Feeds <small className="note">data lineage</small></div>
          <ul className="plain">{t.feeds.map((l, n) => <li key={n}>{model.byId.get(l.id) ? <a href={`#${slug(l.id)}`}>{display(model.byId.get(l.id))}</a> : <code>{l.id}</code>}</li>)}</ul>
        </>)}
        {t.incoming.length > 0 && (<>
          <div className="dx-sub">Referenced by</div>
          <ul className="plain">{t.incoming.map((r, n) => (
            <li key={n}><Ref model={model} id={r.from.id} col={r.from.cols.join(', ')} /> <small className="note">{r.card}{r.onDelete && ` · on delete ${r.onDelete}`}{r.onUpdate && ` · on update ${r.onUpdate}`}</small></li>
          ))}</ul>
        </>)}
      </div>
    </details>
  );
}

// changelog: history entries [{ version, label, author, summary, savedAt, current }], newest first (editors only in the app; the exports keep the named ones)
function Changelog({ items }) {
  return (
    <section id="dx-changelog">
      <div className="dx-sub">Changelog</div>
      <ul className="plain">{items.map((v) => (
        <li key={`${v.id}-${v.version}`}>
          <b>{v.label || `Version ${v.version}`}</b>{v.current && <span className="chip">current</span>} <small className="note">{v.author || 'Original'} · {when(v.savedAt)}</small>
          <div className="note">{v.summary}</div>
        </li>
      ))}</ul>
    </section>
  );
}

export function DocsPage({ model, title, theme, ctx, collapsed = new Set(), changelog = [] }) {
  const sections = ordered(model);
  const heading = title || model.name || 'Database documentation';
  return (
    <div className="dx" data-theme={theme}>
      <nav className="dx-nav">
        <h1>{heading}</h1>
        <input className="dx-search" placeholder="Search tables…" aria-label="Search tables" />
        <div className="dx-tools"><button type="button" className="dx-expand">Expand all</button><button type="button" className="dx-collapse">Collapse all</button></div>
        <ul><li data-s="overview"><a href="#dx-overview">Overview</a></li>{changelog.length > 0 && <li data-s="changelog"><a href="#dx-changelog">Changelog</a></li>}</ul>
        {sections.map((s) => (
          <div key={s.title}>
            <h4>{s.title}</h4>
            <ul>{s.tables.map((t) => <li key={t.id} data-s={`${t.name} ${t.schema} ${t.fields.map((f) => f.name).join(' ')}`.toLowerCase()}><a href={`#${slug(t.id)}`}><i className="dot" style={s.color ? { background: s.color } : undefined} />{display(t)}</a></li>)}</ul>
          </div>
        ))}
        {model.enums.length > 0 && <><h4>Enums</h4><ul>{model.enums.map((e) => <li key={e.name} data-s={`${e.name} enum`.toLowerCase()}><a href={`#${slug(`enum_${e.name}`)}`}>{e.name}</a></li>)}</ul></>}
      </nav>
      <main className="dx-main">
        <div>
          <section id="dx-overview">
            <h2>{heading}</h2>
            {model.databaseType && <span className="chip" style={{ marginLeft: 0 }}>{model.databaseType}</span>}
            {model.note && <p className="note">{model.note}</p>}
            <Thread k="__project" ctx={ctx} />
            <div className="stats">
              <div className="stat"><b>{model.tables.length}</b>tables</div>
              <div className="stat"><b>{model.refs.length}</b>relationships</div>
              <div className="stat"><b>{model.enums.length}</b>enums</div>
              <div className="stat"><b>{model.groups.length}</b>groups</div>
              {model.lineage.length > 0 && <div className="stat"><b>{model.lineage.length}</b>lineage links</div>}
            </div>
            {model.refs.length > 0 && (<>
              <div className="dx-sub">Relationships</div>
              <table>
                <thead><tr><th>From</th><th></th><th>To</th><th>On delete</th><th>On update</th></tr></thead>
                <tbody>{model.refs.map((r, i) => (
                  <tr key={i}>
                    <td><Ref model={model} id={r.from.id} col={r.from.cols.join(', ')} /></td><td>{r.card}</td>
                    <td><Ref model={model} id={r.to.id} col={r.to.cols.join(', ')} /></td><td>{r.onDelete}</td><td>{r.onUpdate}</td>
                  </tr>
                ))}</tbody>
              </table>
            </>)}
            {model.lineage.length > 0 && (<>
              <div className="dx-sub">Data lineage</div>
              <table>
                <thead><tr><th>Source</th><th></th><th>Built table</th><th>Columns used</th></tr></thead>
                <tbody>{model.lineage.map((l, i) => (
                  <tr key={i}>
                    <td>{model.byId.get(l.source) ? <a href={`#${slug(l.source)}`}>{display(model.byId.get(l.source))}</a> : l.source}</td><td>→</td>
                    <td>{model.byId.get(l.target) ? <a href={`#${slug(l.target)}`}>{display(model.byId.get(l.target))}</a> : l.target}</td><td>{l.maps.length ? l.maps.map((m) => `${m.s} → ${m.t}`).join(', ') : <>{l.sCols.join(', ')}{l.tCols.length > 0 && ` → ${l.tCols.join(', ')}`}</>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </>)}
          </section>
          {changelog.length > 0 && <Changelog items={changelog} />}
          {sections.map((s) => s.tables.map((t) => <Table key={`${s.title}.${t.id}`} model={model} t={t} collapsed={collapsed} ctx={ctx} />))}
          {model.enums.map((e) => (
            <details key={e.name} className="dx-table" id={slug(`enum_${e.name}`)} open={!collapsed.has(slug(`enum_${e.name}`))}>
              <summary><h2>{e.name}</h2><span className="dx-schema">enum</span><span className="count">{e.values.length} values</span></summary>
              <div className="dx-body">
                {e.note && <p className="note">{e.note}</p>}
                <ul className="plain">{e.values.map((v) => <li key={v.name}><code>{v.name}</code>{v.note && <span className="note"> — {v.note}</span>}</li>)}</ul>
              </div>
            </details>
          ))}
        </div>
      </main>
    </div>
  );
}


const STORE_KEY = 'docsCollapsed';
const readCollapsed = () => { try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]')); } catch { return new Set(); } };

// in-app view: remembers which tables are collapsed (per browser); comments are saved through onComment
export function DocsView({ model, title, theme, comments, me, canComment, isOwner, onAdd, onDelete, changelog = [] }) {
  const host = useRef(null);
  const collapsed = useRef(readCollapsed()); // initial state only: afterwards <details> keeps its own open state
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    initDocs(el);
    const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(Array.from(el.querySelectorAll('details.dx-table:not([open])')).map((d) => d.id))); } catch { /* private mode */ } };
    el.addEventListener('toggle', save, true); // `toggle` does not bubble
    return () => el.removeEventListener('toggle', save, true);
  }, [model]);
  return <div className="dx-host" ref={host}><style>{docsCss}</style><DocsPage model={model} title={title} theme={theme} changelog={changelog} ctx={{ cmap: commentMap(comments), canComment, canDelete: (c) => !!me && (isOwner || c.userId === me.id), onAdd, onDelete }} collapsed={collapsed.current} /></div>;
}

// self-contained .html file: inline CSS + the small script, no external requests; comments are included read-only
export function standaloneHtml(model, title, comments = [], changelog = []) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const body = renderToStaticMarkup(<DocsPage model={model} title={title} changelog={changelog} ctx={{ cmap: commentMap(comments), canComment: false }} />);
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title || model.name || 'Database documentation')}</title><style>html,body{margin:0;height:100%}.dx-host{height:100%}${docsCss}</style></head><body><div class="dx-host" id="dx-root">${body}</div><script>(${initDocs.toString()})(document.getElementById('dx-root'))</script></body></html>\n`;
}
