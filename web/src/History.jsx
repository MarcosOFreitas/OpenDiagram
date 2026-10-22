import { useCallback, useEffect, useState } from 'react';
import { api, ago, errMsg } from './api.js';
import { parseDbml } from './dbmlParse.js';
import { schemaDiff, diffLines, summaryLine } from '../../server/src/schemaDiff.js'; // shared with the server (item 9, an ALTER script)

const MAX_LINES = 300;
// the structural diff of two DBML texts, or why it cannot be made (a side that does not parse: the text diff is still shown)
export function structure(oldText, nowText, name) {
  const parsed = (t) => { try { return parseDbml(t); } catch { return null; } };
  const a = parsed(oldText), b = parsed(nowText);
  if (!a || !b) return { error: `The structure is not compared: ${!a ? name : 'the current text'} has DBML errors.` };
  const changes = schemaDiff(a, b);
  return { summary: summaryLine(changes), lines: diffLines(changes) };
}

// line diff between two texts (LCS between the common prefix and suffix); null when it would be too heavy
export function lineDiff(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  let s = 0;
  while (s < x.length && s < y.length && x[s] === y[s]) s++;
  let e = 0;
  while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e++;
  const A = x.slice(s, x.length - e), B = y.slice(s, y.length - e);
  if (A.length * B.length > 4_000_000) return null;
  const w = B.length + 1, dp = new Uint32Array((A.length + 1) * w);
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const out = x.slice(0, s).map((t) => ({ t, k: ' ' }));
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { out.push({ t: A[i], k: ' ' }); i++; j++; } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) out.push({ t: A[i++], k: '-' }); else out.push({ t: B[j++], k: '+' });
  }
  while (i < A.length) out.push({ t: A[i++], k: '-' });
  while (j < B.length) out.push({ t: B[j++], k: '+' });
  return out.concat(x.slice(x.length - e).map((t) => ({ t, k: ' ' })));
}

// keeps the changed lines and 2 lines of context around them
const withContext = (lines) => {
  const keep = new Set();
  lines.forEach((l, i) => { if (l.k !== ' ') for (let d = -2; d <= 2; d++) keep.add(i + d); });
  const out = [];
  lines.forEach((l, i) => { if (keep.has(i)) out.push(l); else if (out.length && out[out.length - 1].k !== '…') out.push({ t: '…', k: '…' }); });
  return out;
};

// "History" tab: every saved version of the diagram (people who can edit); name one, compare it with now, or restore it
export default function History({ diagramId, version, dbml, notify, onRestored }) {
  const [list, setList] = useState(null), [name, setName] = useState(''), [busy, setBusy] = useState(false), [diff, setDiff] = useState(null);
  const load = useCallback(() => api(`diagrams/${diagramId}/versions`).then(setList).catch((e) => notify('err', errMsg(e))), [diagramId, notify]);
  useEffect(() => { load(); }, [load, version]);

  const act = async (fn) => { setBusy(true); try { await fn(); } catch (e) { notify('err', errMsg(e)); } finally { setBusy(false); } };
  const saveName = () => act(async () => { await api(`diagrams/${diagramId}/versions`, { label: name }); setName(''); await load(); notify('ok', 'Version named'); });
  const restore = (v) => { if (window.confirm(`Restore "${v.label || `version ${v.version}`}"? The current content is kept in History.`)) act(async () => { await api(`diagrams/${diagramId}/versions/${v.id}/restore`, {}); await onRestored(); notify('ok', 'Version restored'); }); };
  const compare = (v) => act(async () => { const full = await api(`diagrams/${diagramId}/versions/${v.id}`); setDiff({ v, lines: lineDiff(full.dbml, dbml), structure: structure(full.dbml, dbml, v.label || `version ${v.version}`) }); });

  return (
    <div className="dbody">
      <form className="hist-name" onSubmit={(e) => { e.preventDefault(); if (name.trim()) saveName(); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name this version (e.g. Release 1)" aria-label="Version name" />
        <button className="primary" disabled={busy || !name.trim()}>Save</button>
      </form>
      <small className="hint">Every change is kept automatically; edits by the same person within 10 minutes share one entry. Named versions are never removed, the others keep the latest 60.</small>
      {!list && <small className="hint">Loading…</small>}
      {list && list.length === 0 && <small className="hint">No history yet: it starts with the next change.</small>}
      {list?.map((v) => (
        <div key={v.id} className={`card hist static ${v.current ? 'sel' : ''}`}>
          <div className="grow">
            <b>{v.label || `Version ${v.version}`}{v.current && <span className="chip">current</span>}</b>
            <small>{v.author || 'Original'} · {ago(v.savedAt * 1000)}</small>
            <small className="hist-sum">{v.summary}</small>
          </div>
          {!v.current && <>
            <button disabled={busy} onClick={() => compare(v)} title="Show what changed since this version">Compare</button>
            <button disabled={busy} onClick={() => restore(v)} title="Make this version the current one">Restore</button>
          </>}
        </div>
      ))}
      {diff && (
        <div className="admin" onMouseDown={(e) => { if (e.target === e.currentTarget) setDiff(null); }}>
          <div className="admin-card conflict wide" role="dialog" aria-label="Compare versions">
            <div className="admin-head"><h2>{diff.v.label || `Version ${diff.v.version}`} → now</h2><span className="grow" /><button className="x" onClick={() => setDiff(null)} title="Close" aria-label="Close">✕</button></div>
            <div className="diff">
              <div className="sdiff">
                <h4>Structure</h4>
                {diff.structure.error ? <p className="hint">{diff.structure.error}</p> : <>
                  <p className="sdiff-sum">{diff.structure.summary}</p>
                  {diff.structure.lines.slice(0, MAX_LINES).map((l, i) => <div key={i} className={`dl ${l.op === '+' ? 'add' : l.op === '-' ? 'del' : ''} ${l.depth ? 'in' : ''}`}><span>{l.op}</span><code>{l.text}</code></div>)}
                  {diff.structure.lines.length > MAX_LINES && <p className="hint">…and {diff.structure.lines.length - MAX_LINES} more</p>}
                </>}
              </div>
              <h4>Text</h4>
              {diff.lines === null && <p className="hint">Too many differences to show here. Restore the version or export it to compare elsewhere.</p>}
              {diff.lines && !diff.lines.some((l) => l.k !== ' ') && <p className="hint">The DBML is identical (only the layout or title differ).</p>}
              {diff.lines && withContext(diff.lines).map((l, i) => <div key={i} className={`dl ${l.k === '+' ? 'add' : l.k === '-' ? 'del' : ''}`}><span>{l.k === '+' || l.k === '-' ? l.k : ''}</span><code>{l.t}</code></div>)}
            </div>
            <div className="hist-legend"><span className="dl del">- only in that version</span><span className="dl add">+ added since</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
