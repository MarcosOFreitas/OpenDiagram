import { useState } from 'react';
import { highlightCode, classHighlighter } from '@lezer/highlight';
import { dbml } from '../Editor.jsx';

// Tiny Markdown renderer for the documentation pages (no dependency): headings, paragraphs, lists, tables,
// fenced code (with a Copy button), blockquote callouts (> **Note** ...), rules and inline code / bold / italic / links.
const slugify = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*_]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// screenshots: ![alt](file.png) on its own line, files live in ./img (bundled by Vite)
const IMGS = import.meta.glob('./img/*.{png,jpg,webp}', { query: '?url', import: 'default', eager: true });
const imgUrl = (n) => IMGS[`./img/${n}`];

const href = (u) => (/^(https?:|mailto:|#|\/)/.test(u) ? u : `/docs/${u}`);

function inline(text, key = 'i') {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0, m, n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0], k = `${key}${n++}`;
    if (t[0] === '`') out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (t[0] === '*') out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    else { const [, label, url] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t); const ext = /^https?:/.test(url); out.push(<a key={k} href={href(url)} {...(ext ? { target: '_blank', rel: 'noreferrer' } : {})}>{inline(label, k)}</a>); }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// DBML blocks reuse the editor's tokenizer; the .tok-* classes are coloured in docsite.css
function colored(code) {
  const out = [];
  highlightCode(code, dbml.parser.parse(code), classHighlighter, (t, cls) => out.push(cls ? <span key={out.length} className={cls}>{t}</span> : t), () => out.push('\n'));
  return out;
}

function Code({ code, lang }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }, () => {});
  return (
    <div className="ds-code">
      {lang && <span className="ds-lang">{lang}</span>}
      <button type="button" className="ds-copy" onClick={copy}>{done ? 'Copied' : 'Copy'}</button>
      <pre><code>{lang === 'dbml' ? colored(code) : code}</code></pre>
    </div>
  );
}

const CALLOUT = /^\*\*(Note|Tip|Warning|Info|Important)\*\*\s*/i;

// returns { blocks: [React nodes], toc: [{ id, text, level }] }
export function render(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [], toc = [];
  let i = 0, k = 0;
  const isSpecial = (l) => /^(!\[|#{1,3} |```|> |\s*[-*] |\s*\d+\. |\|.*\||---+$)/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^```(\w*)/.exec(l))) { // fenced code
      const body = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++; blocks.push(<Code key={k++} code={body.join('\n')} lang={m[1]} />); continue;
    }
    if ((m = /^(#{1,3}) (.*)$/.exec(l))) {
      const level = m[1].length, text = m[2], id = slugify(text), Tag = `h${level}`;
      if (level > 1) toc.push({ id, text: text.replace(/[`*]/g, ''), level });
      blocks.push(<Tag key={k++} id={id}>{level > 1 && <a className="ds-anchor" href={`#${id}`} aria-hidden="true">#</a>}{inline(text, `h${k}`)}</Tag>); i++; continue;
    }
    if ((m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(l.trim()))) { // screenshot
      const src = imgUrl(m[2]);
      if (src) blocks.push(<figure key={k++} className="ds-fig"><img src={src} alt={m[1]} loading="lazy" /><figcaption>{m[1]}</figcaption></figure>);
      i++; continue;
    }
    if (/^---+$/.test(l)) { blocks.push(<hr key={k++} />); i++; continue; }
    if (l.startsWith('> ')) { // callout / quote
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      let text = body.join(' ').trim(), kind = 'note';
      const c = CALLOUT.exec(text);
      if (c) { kind = c[1].toLowerCase(); text = text.replace(CALLOUT, ''); }
      blocks.push(<div key={k++} className={`ds-callout ${kind}`}><b>{kind.toUpperCase()}</b><p>{inline(text, `c${k}`)}</p></div>); continue;
    }
    if (/^\|.*\|/.test(l) && /^\|[\s:|-]+\|?$/.test(lines[i + 1] || '')) { // table
      const row = (s) => s.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = row(l); i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|/.test(lines[i])) rows.push(row(lines[i++]));
      blocks.push(<div key={k++} className="ds-tablewrap"><table><thead><tr>{head.map((h, x) => <th key={x}>{inline(h, `th${x}`)}</th>)}</tr></thead><tbody>{rows.map((r, y) => <tr key={y}>{r.map((c, x) => <td key={x}>{inline(c, `td${y}${x}`)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l)) { // list (single level; wrapped lines continue the item)
      const ordered = /^\s*\d+\. /.test(l), items = [];
      while (i < lines.length && (/^\s*[-*] /.test(lines[i]) || /^\s*\d+\. /.test(lines[i]) || (lines[i].startsWith('  ') && lines[i].trim() && items.length))) {
        if (/^\s*([-*]|\d+\.) /.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.) /, '')); else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag key={k++}>{items.map((t, x) => <li key={x}>{inline(t, `li${k}${x}`)}</li>)}</Tag>); continue;
    }
    const para = [l]; i++;
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++}>{inline(para.join(' '), `p${k}`)}</p>);
  }
  return { blocks, toc };
}
