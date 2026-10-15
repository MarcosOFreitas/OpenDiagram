import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, NodeResizer, BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, Background, MiniMap, Handle, Position, useNodesState, useEdgesState, useReactFlow, useViewport, getNodesBounds, MarkerType, getViewportForBounds } from '@xyflow/react';
import { exporter, importer } from '@dbml/core';
import { toPng, toSvg } from 'html-to-image';
import Editor from './Editor.jsx';
import { DocsView, standaloneHtml } from './DocsPage.jsx';
import { buildModel, toMarkdown } from './docsModel.js';

import { api, store, errMsg, ago, sharePassword, copyText } from './api.js';
import AuthScreen, { PasswordForm } from './Auth.jsx';
import Admin from './Admin.jsx';
import Menu, { useDismiss } from './Menu.jsx';
import Library from './Library.jsx';
import SharePanel from './SharePanel.jsx';
import TablePicker, { tableMatcher } from './TablePicker.jsx';
import History from './History.jsx';
import { closure } from './lineage.js';
import { readable, cid, pid, viewKindOf, parse, qid, withGroups, keepGroups, diffSummary } from './diagramModel.js';
import TablesPanel from './TablesPanel.jsx';
import { useConnect } from './useConnect.js';
import { PAD, HEAD, tableWidth, tableHeight, lessDetail, shownFields, ROW, layout } from './layout.js';
import { Ic, Logo } from './Icons.jsx';

import { BLANK, TEMPLATES } from './templates.js';

const VIEW0 = { edgeType: 'default', hiRefs: false, algo: 'auto', detail: 'full', hideIndexes: false, hideTypes: false, snap: false, grid: true, theme: 'light' }; // display options of a new browser


function TableNode({ data: t, selected }) {
  const fk = new Set(t.fkCols);
  const rows = shownFields(t), natural = 32 + rows.length * ROW + (t.hideIndexes ? 0 : t.indexes.length * 20); // height without a manual size
  const onResize = (_, p) => t.onSize(t.id, { w: Math.round(p.width), h: t.h || Math.abs(p.height - natural) > 4 ? Math.round(p.height) : undefined }); // a width-only drag keeps the height automatic
  return (
    <>
    <NodeResizer isVisible={!!selected && !t.collapsed} minWidth={160} maxWidth={900} minHeight={80} onResize={onResize} />
    <div className={`tbl ${t.dim ? 'dim' : ''} ${t.active ? 'active' : ''} ${t.linRole ? `lin-${t.linRole}` : ''} ${t.peers?.length ? 'peered' : ''} ${t.h && !t.collapsed ? 'fixed' : ''}`} style={{ width: t.w || tableWidth(t), ...(t.h && !t.collapsed ? { height: t.h } : {}), ...(t.peers?.length ? { boxShadow: `0 0 0 2.5px ${t.peers[0].color}` } : {}) }} title={t.note || ''}>
      {t.peers?.length > 0 && <div className="peer-tag" style={{ background: t.peers[0].color }} title={t.peers.map((p) => p.name).join(', ')}>{t.peers[0].name}{t.peers.length > 1 ? ` +${t.peers.length - 1}` : ''}</div>}
      <div className="tbl-h" style={t.headerColor && !(t.viewKind && /^#94a3b8$/i.test(t.headerColor)) ? { background: t.headerColor, color: readable(t.headerColor) } : undefined} onDoubleClick={() => t.onToggle(t.id)}>
        <Handle type="source" position={Position.Right} id="ls" className="hdl" /><Handle type="source" position={Position.Left} id="lsl" className="hdl" />
        <Handle type="target" position={Position.Left} id="lt" className="hdl" /><Handle type="target" position={Position.Right} id="ltr" className="hdl" />{/* table-level data lineage */}
        {t.detail !== 'tables' && <button className="tbl-t nodrag" title={t.collapsed ? 'Expand' : 'Collapse'} onClick={(e) => { e.stopPropagation(); t.onToggle(t.id); }}>{t.collapsed ? '▸' : '▾'}</button>}
        <span className="tbl-n">{t.name}{t.viewKind && <em className="tbl-kind"> · {t.viewKind}</em>}</span>{t.schema !== 'public' && <small>{t.schema}</small>}
        {(t.collapsed ? t.fields : t.fields.filter((f) => !rows.includes(f))).map((f) => ( // columns that are not drawn (collapsed table, keys-only level) keep their relationship lines: connect them to the header
          <span key={f.name} style={{ display: 'contents' }}>
            <Handle type="target" position={Position.Left} id={`t:${f.name}`} className="hdl" />
            <Handle type="source" position={Position.Right} id={`s:${f.name}`} className="hdl" />
            <Handle type="source" position={Position.Left} id={`sl:${f.name}`} className="hdl" />
            <Handle type="target" position={Position.Right} id={`tr:${f.name}`} className="hdl" />
          </span>
        ))}
      </div>
      {!t.collapsed && <div className="tbl-body">
      {rows.map((f) => (
        <div key={f.name} className="tbl-c" title={`${f.name}: ${f.type}${f.note ? ` — ${f.note}` : ''}`}>
          <Handle type="target" position={Position.Left} id={`t:${f.name}`} className="hdl" />
          <span className="nm">
            {f.pk ? <i className="ic pk" title="primary key"><Ic n="key" s={11} /></i> : fk.has(f.name) ? <i className="ic fk" title="foreign key"><Ic n="link" s={11} /></i> : <i className="ic" />}
            <span className="nmt">{f.name}</span>{f.note && <i className="ic note" title={f.note}><Ic n="edit" s={10} /></i>}
          </span>
          <span className="ty"><span className="tyt">{!t.hideTypes && f.type}</span>{(f.notNull || f.pk) && <b className="nn">NN</b>}</span>
          <Handle type="source" position={Position.Right} id={`s:${f.name}`} className="hdl" />
          <Handle type="source" position={Position.Left} id={`sl:${f.name}`} className="hdl" />
          <Handle type="target" position={Position.Right} id={`tr:${f.name}`} className="hdl" />
        </div>
      ))}
      {!t.hideIndexes && t.indexes.map((i, n) => <div key={n} className="tbl-i">{i.pk ? 'PK' : i.unique ? 'UQ' : 'IX'} ({i.cols.join(', ')}){i.name ? ` · ${i.name}` : ''}</div>)}
      </div>}
    </div>
    </>
  );
}

function GroupNode({ data: g }) {
  const c = g.color || '#6b7280';
  return (
    <div style={{ width: g.w, height: g.h, border: g.active ? `2.5px solid ${c}` : `1.5px dashed ${c}`, background: g.active ? `${c}2a` : `${c}12`, boxShadow: g.active ? `0 0 0 4px ${c}33` : undefined, borderRadius: 10, pointerEvents: 'none', transition: 'background .12s, box-shadow .12s' }}>
      <div className="grp-handle" title={g.canMove ? 'Drag to move the whole group' : undefined} style={{ '--gc': c, fontWeight: 700, fontSize: 12, padding: '4px 10px', pointerEvents: g.canMove ? 'all' : 'none', cursor: g.canMove ? 'grab' : 'default', width: 'fit-content', maxWidth: '100%' }}>{g.name}</div>
    </div>
  );
}
// Relationship line with a draggable label: dragging it bends the line through the new point (saved in layout['@labels']);
// double-click puts it back. Without an offset the line is the normal curve/step/straight path.
function RefEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, style, markerEnd, interactionWidth, data }) {
  const { zoom } = useViewport();
  const args = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
  const [base, bx, by] = data.edgeType === 'straight' ? getStraightPath(args) : data.edgeType === 'step' ? getSmoothStepPath({ ...args, borderRadius: 0 }) : data.edgeType === 'smoothstep' ? getSmoothStepPath(args) : getBezierPath(args);
  const off = data.off, px = bx + (off?.dx || 0), py = by + (off?.dy || 0);
  const d = off ? `M${sourceX},${sourceY} Q${2 * px - (sourceX + targetX) / 2},${2 * py - (sourceY + targetY) / 2} ${targetX},${targetY}` : base; // quadratic curve that passes through the label
  const start = (e) => {
    e.stopPropagation(); e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, o = off || { dx: 0, dy: 0 };
    let moved = false;
    const move = (ev) => { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 3) moved = true; if (moved) data.onMove(id, { dx: Math.round(o.dx + (ev.clientX - x0) / zoom), dy: Math.round(o.dy + (ev.clientY - y0) / zoom) }); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved) data.onPick(id); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return (
    <>
      <BaseEdge id={id} path={d} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      {data.text && (
        <EdgeLabelRenderer>
          <div className="ref-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${px}px, ${py}px)`, ...data.css }} onPointerDown={start} onDoubleClick={() => data.onMove(id, null)} title="Drag to move the line (double-click to reset)">{data.text}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
// Sticky note: a top-level DBML `Note name { '''text''' }` drawn on the canvas. Double-click edits the text (written back into the DBML), the corner handles resize it.
function NoteNode({ data: n, selected }) {
  const [edit, setEdit] = useState(!!n.autoEdit), [text, setText] = useState(n.text);
  useEffect(() => { if (!edit) setText(n.text); }, [n.text, edit]);
  const done = (save) => { setEdit(false); if (save && text !== n.text) n.onEdit(n.name, text); else setText(n.text); };
  return (
    <>
      <NodeResizer isVisible={!!selected && n.canEdit} minWidth={140} minHeight={70} onResize={(_, p) => n.onSize(n.id, { w: Math.round(p.width), h: Math.round(p.height) })} />
      <div className={`sticky ${n.dark ? 'dark' : ''}`} style={{ width: n.w || 220, ...(n.h ? { height: n.h } : {}), minHeight: 70 }} onDoubleClick={() => n.canEdit && setEdit(true)} title={n.canEdit ? 'Double-click to edit' : ''}>
        <div className="sticky-h"><span>{n.name.replace(/_/g, ' ')}</span>{n.canEdit && <button className="nodrag sticky-x" onClick={() => n.onRemove(n.name)} title="Delete note" aria-label="Delete note">✕</button>}</div>
        {edit
          ? <textarea className="nodrag nowheel sticky-t" autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => done(true)} onKeyDown={(e) => { if (e.key === 'Escape') done(false); }} />
          : <div className="sticky-b">{n.text || <i>Empty note (double-click to write)</i>}</div>}
      </div>
    </>
  );
}
const nodeTypes = { table: TableNode, grp: GroupNode, note: NoteNode };
// DBML text of a sticky note (triple quotes: any text, several lines)
const noteBlock = (name, text) => `Note ${qid(name)} {\n  '''\n${String(text).replaceAll("'''", "'' '").split('\n').map((l) => `  ${l}`).join('\n')}\n  '''\n}`;
const isSticky = (n) => !/^SEQUENCE /.test(n.text); // the importer records database sequences as Notes: those are documentation, not stickies
const edgeTypes = { ref: RefEdge };

const ALGOS = [
  { k: 'auto', name: 'Auto', desc: 'Packs each group and each cluster connected by relationships or data lineage on its own. Best default, especially with many tables.' },
  { k: 'lr', name: 'Left to right', desc: 'Layered layout following the relationships and data lineage. Best for long chains.' },
  { k: 'pipeline', name: 'Pipeline', desc: 'Groups become stages from left to right by dependency, tables stacked vertically.' },
  { k: 'snowflake', name: 'Snowflake', desc: 'The most connected table in the center, related tables in rings around it.' },
  { k: 'compact', name: 'Compact', desc: 'Tables in a compact rectangle, ignoring relationships and data lineage.' },
];
const REFRESH = [[0, 'Off (manual refresh only)'], [1, 'Every 1 minute'], [5, 'Every 5 minutes'], [15, 'Every 15 minutes'], [30, 'Every 30 minutes'], [60, 'Every hour']];

const EXPORTS = [ // key, label, extension, group of the Export menu
  ['dbml', 'DBML', '.dbml', 'Other'], ['postgres', 'PostgreSQL', '.sql', 'SQL'], ['mysql', 'MySQL', '.sql', 'SQL'], ['mssql', 'SQL Server', '.sql', 'SQL'],
  ['oracle', 'Oracle', '.sql', 'SQL'], ['json', 'JSON', '.json', 'Other'], ['png', 'PNG image', '.png', 'Image'], ['svg', 'SVG image', '.svg', 'Image'],
  ['docs-html', 'Documentation (HTML)', '.html', 'Other'], ['docs-md', 'Documentation (Markdown)', '.md', 'Other'],
];

function Workspace({ user, groups, org, shareToken, onLogin, onLogout, onUser, onOrg }) {
  const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();
  const { zoom } = useViewport();
  const shared = !!shareToken;
  const [doc, setDoc] = useState(null); // loaded diagram: { id, access, ownerName, isOwner }
  const [loadErr, setLoadErr] = useState('');
  const [needPass, setNeedPass] = useState(null); // protected share link: message shown above the password field
  const [unlockTick, setUnlockTick] = useState(0);
  const entryRef = useRef(''); // 'refresh' while the next save follows a metadata refresh: it gets its own History entry
  const overwriteRef = useRef(false); // set by "Keep my changes": the next save is flagged so the server keeps the overwritten version in History
  const verRef = useRef(null); // the server version this editor last loaded or saved: sent as baseVersion so a save over someone else's work is refused (409)
  const [docVersion, setDocVersion] = useState(null);
  const tabId = useRef(`${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`).current; // this browser tab, for presence
  const [changelog, setChangelog] = useState([]); // history of this diagram for the Docs view (people who can edit)
  const [peers, setPeers] = useState([]); // other people who have this diagram open: { id, name, color, sel, editing }
  const [serverVersion, setServerVersion] = useState(null); // the version on the server as of the last presence beat
  const beatRef = useRef(null);
  const [conflict, setConflict] = useState(null); // { version, by, at } while a newer version exists on the server
  const [diagrams, setDiagrams] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [editorW, setEditorW] = useState(() => Math.max(260, Math.min(1100, +store('editorW') || 380)));
  const [resizing, setResizing] = useState(false);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const [layoutTick, setLayoutTick] = useState(0);
  // per-table width / collapsed state lives in the saved layout under '@sizes' ({ id: { w, c } })
  const setSize = useCallback((patch) => {
    const cur = layoutRef.current['@sizes'] || {}, next = { ...cur };
    for (const [id, v] of Object.entries(patch)) { const o = { ...cur[id], ...v }; if (!o.w) delete o.w; if (!o.h) delete o.h; if (!o.c) delete o.c; if (Object.keys(o).length) next[id] = o; else delete next[id]; }
    layoutRef.current = { ...layoutRef.current, '@sizes': next };
    setLayoutTick((k) => k + 1);
  }, []);
  const onSize = useCallback((id, v) => setSize({ [id]: v }), [setSize]);
  const onToggle = useCallback((id) => setSize({ [id]: { c: !(layoutRef.current['@sizes']?.[id]?.c) } }), [setSize]);
  const layoutRef = useRef({});
  // tables hidden from the canvas live in the saved layout under '@hidden' (a list of ids)
  const hidden = useMemo(() => new Set(layoutRef.current['@hidden'] || []), [layoutTick, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const setHidden = (ids, hide) => {
    const cur = new Set(layoutRef.current['@hidden'] || []);
    ids.forEach((id) => (hide ? cur.add(id) : cur.delete(id)));
    const next = { ...layoutRef.current };
    if (cur.size) next['@hidden'] = [...cur]; else delete next['@hidden'];
    layoutRef.current = next; setLayoutTick((k) => k + 1);
  };
  const setLabel = useCallback((id, off) => { // label offsets of the relationship lines live in the saved layout under '@labels'
    const cur = { ...(layoutRef.current['@labels'] || {}) };
    if (off) cur[id] = off; else delete cur[id];
    const next = { ...layoutRef.current };
    if (Object.keys(cur).length) next['@labels'] = cur; else delete next['@labels'];
    layoutRef.current = next; setLayoutTick((k) => k + 1);
  }, []);
  // A named view = which tables are visible, where they are, sizes, line labels, detail level and relationship highlight.
  // The live state always sits at the root of the layout; leaving a view stores it back (so switching never loses changes).
  const snapView = () => ({
    pos: Object.fromEntries(nodes.filter((n) => n.type === 'table' || n.type === 'note').map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }])),
    sizes: layoutRef.current['@sizes'], hidden: layoutRef.current['@hidden'], labels: layoutRef.current['@labels'], detail: view.detail || 'full', hiRefs: !!view.hiRefs, lineage: view.lineage !== false,
  });
  const applySnap = (sn, views, base, active) => {
    const keep = Object.keys(views).length ? { '@views': views } : {};
    layoutRef.current = { ...sn.pos, ...(sn.sizes ? { '@sizes': sn.sizes } : {}), ...(sn.hidden ? { '@hidden': sn.hidden } : {}), ...(sn.labels ? { '@labels': sn.labels } : {}), ...keep, ...(base ? { '@base': base } : {}), ...(active ? { '@view': active } : {}) };
    setNodes((old) => old.map((n) => (sn.pos[n.id] ? { ...n, position: sn.pos[n.id] } : n)));
    setView((v) => ({ ...v, detail: sn.detail || 'full', hiRefs: !!sn.hiRefs, lineage: sn.lineage !== false }));
    setLayoutTick((k) => k + 1);
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1, duration: 250 }), 200);
  };
  const viewNames = Object.keys(layoutRef.current['@views'] || {}), activeView = layoutRef.current['@view'] || '';
  const switchView = (name) => {
    const lr = layoutRef.current, views = { ...(lr['@views'] || {}) }, cur = lr['@view'] || '';
    if (name === cur) return;
    const now = snapView(); let base = lr['@base'];
    if (cur) views[cur] = now; else base = now;
    const target = name ? views[name] : base;
    if (target) applySnap(target, views, base, name);
  };
  const createView = (raw) => {
    const name = String(raw || '').trim().slice(0, 60), lr = layoutRef.current, views = { ...(lr['@views'] || {}) };
    if (!name || views[name]) return notify('err', name ? 'A view with this name already exists' : 'Give the view a name');
    const now = snapView(), cur = lr['@view'] || '';
    views[name] = now;
    layoutRef.current = { ...lr, '@views': views, ...(cur ? {} : { '@base': now }), '@view': name }; // what is on screen is the new view now
    setLayoutTick((k) => k + 1); notify('ok', `View "${name}" saved`);
  };
  const deleteView = (name) => {
    const lr = layoutRef.current, views = { ...(lr['@views'] || {}) };
    delete views[name];
    if ((lr['@view'] || '') === name) { const base = lr['@base']; if (base) applySnap(base, views, base, ''); else { layoutRef.current = { ...lr, '@views': views, '@view': undefined }; delete layoutRef.current['@view']; setLayoutTick((k) => k + 1); } return; }
    layoutRef.current = { ...lr, ...(Object.keys(views).length ? { '@views': views } : {}) }; if (!Object.keys(views).length) delete layoutRef.current['@views'];
    setLayoutTick((k) => k + 1);
  };
  const renameView = (old, raw) => {
    const name = String(raw || '').trim().slice(0, 60), lr = layoutRef.current, views = { ...(lr['@views'] || {}) };
    if (!name || name === old) return;
    if (views[name]) return notify('err', 'A view with this name already exists');
    views[name] = views[old]; delete views[old];
    layoutRef.current = { ...lr, '@views': views, ...(lr['@view'] === old ? { '@view': name } : {}) };
    setLayoutTick((k) => k + 1);
  };
  const showOnly = (ids) => { const keep = new Set(ids); setHidden(parsed.tables.map((t) => t.id).filter((id) => !keep.has(id)), true); setHidden(ids, false); };
  const savedRef = useRef('');
  const [dbml, setDbml] = useState('');
  const [title, setTitle] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const [source, setSource] = useState(null);
  const [, setTick] = useState(0);
  const lastGen = useRef('');
  const refreshing = useRef(false);
  const dbmlRef = useRef('');
  const [editorOpen, setEditorOpen] = useState(() => window.innerWidth > 720); // phones start on the diagram
  const [drawer, setDrawer] = useState(null); // null | 'connect' | 'import' | 'export' | 'view'
  const [search, setSearch] = useState('');
  const grpDrag = useRef(null); // start positions while a group box is dragged
  const [panelOpen, setPanelOpen] = useState(() => store('tablesPanel') === '1'); // right-hand Tables panel
  const panelSearch = useRef(null);
  useEffect(() => { store('tablesPanel', panelOpen ? '1' : '0'); }, [panelOpen]);
  const [sqlFmt, setSqlFmt] = useState('postgres');
  const [paste, setPaste] = useState('');
  const [view, setView] = useState(() => { try { return { ...VIEW0, ...JSON.parse(store('view') || '{}') }; } catch { return VIEW0; } });
  useEffect(() => { // while a named view is active, its detail level and highlight travel with the diagram (not only with this browser)
    const lr = layoutRef.current;
    if (!doc || !lr['@view'] || (lr['@detail'] === (view.detail || 'full') && lr['@hiRefs'] === !!view.hiRefs && lr['@lineage'] === (view.lineage !== false))) return;
    layoutRef.current = { ...lr, '@detail': view.detail || 'full', '@hiRefs': !!view.hiRefs, '@lineage': view.lineage !== false }; setLayoutTick((k) => k + 1);
  }, [view.detail, view.hiRefs, view.lineage, doc, layoutTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { store('view', JSON.stringify(view)); }, [view]);
  const canvasBg = view.theme === 'dark' ? '#0e1420' : '#f4f5f7';
  const [activeId, setActiveId] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null); // clicked TableGroup (by name): its box is emphasised, the rest dims
  const [activeEdge, setActiveEdge] = useState(null); // clicked relationship: focus it and its two tables
  const [drag, setDrag] = useState(false);
  const [mode, setMode] = useState('diagram'); // 'diagram' | 'docs'
  const modeBox = useRef(null); // the blue pill of the Diagram | Docs switch slides to the selected tab
  const [pill, setPill] = useState(null), [pillReady, setPillReady] = useState(false);
  const placePill = useCallback(() => {
    const b = modeBox.current?.querySelector('[aria-selected="true"]');
    if (b) setPill((o) => (o && o.x === b.offsetLeft && o.w === b.offsetWidth ? o : { x: b.offsetLeft, w: b.offsetWidth }));
  }, []);
  useLayoutEffect(() => { placePill(); }); // every render: the bar appears after the diagram has loaded, and the tab labels change with the width
  useEffect(() => { window.addEventListener('resize', placePill); return () => window.removeEventListener('resize', placePill); }, [placePill]);
  useEffect(() => { if (!pill || pillReady) return undefined; const t = setTimeout(() => setPillReady(true), 80); return () => clearTimeout(t); }, [pill, pillReady]); // no slide on the first paint
  const edW = Math.min(editorW, Math.max(240, window.innerWidth - 56)); // never wider than the screen
  const editorShown = editorOpen && mode !== 'docs'; // the Docs view takes the whole width; the editor comes back with the Diagram view
  const [comments, setComments] = useState([]);
  const toastTimer = useRef(null);
  const idsKey = useRef('');

  const notify = useCallback((type, text) => {
    setToast({ type, text });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), type === 'err' ? 7000 : 3000);
  }, []);
  const connectOpen = drawer === 'connect';

  // what the current role may do
  const access = doc?.access; // owner | edit | comment | view
  const owner = !shared && !!doc?.isOwner;
  const manage = !shared && (!!doc?.isOwner || access === 'admin'); // owner, or an administrator on someone else's diagram
  const canEdit = !!doc && (access === 'owner' || access === 'admin' || (access === 'edit' && !!user));
  const canComment = !!doc && !!user && (access === 'owner' || access === 'admin' || access === 'comment' || access === 'edit');
  const readOnly = !canEdit;
  // only the owner saves title and connection link; editors (granted or by link) save DBML + layout
  const payloadOf = (d) => (shared ? { dbml: d.dbml, layout: d.layout ?? {} }
    : d.isOwner ? { title: d.title, dbml: d.dbml, source: d.source ?? null, layout: d.layout ?? {} }
      : d.access === 'admin' ? { title: d.title, dbml: d.dbml, layout: d.layout ?? {} } // administrators never touch the owner's connection link
        : { dbml: d.dbml, layout: d.layout ?? {} });

  const startDoc = useCallback((d, list) => {
    lastGen.current = (d.id && store(`gen:${d.id}`)) || '';
    layoutRef.current = d.layout ?? {};
    const lr0 = layoutRef.current, sn0 = lr0['@views']?.[lr0['@view']];
    if (lr0['@view']) setView((v) => ({ ...v, detail: lr0['@detail'] ?? sn0?.detail ?? v.detail, hiRefs: lr0['@hiRefs'] ?? sn0?.hiRefs ?? v.hiRefs, lineage: lr0['@lineage'] ?? sn0?.lineage ?? v.lineage })); // a named view carries its detail level / highlight
    idsKey.current = '';
    savedRef.current = JSON.stringify(payloadOf(d));
    setNodes([]); setEdges([]);
    verRef.current = d.version ?? null; setDocVersion(d.version ?? null); setConflict(null);
    setDoc(d); setDbml(d.dbml); setTitle(d.title); setSource(d.source ?? null); setComments(list ?? []); setSaveState('saved');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const openDiagram = useCallback(async (id) => {
    const [d, list] = await Promise.all([api(`diagrams/${id}`), api(`diagrams/${id}/comments`)]);
    store('lastDiagram', id);
    startDoc({ ...d, access: d.role, isOwner: d.role === 'owner' }, list);
  }, [startDoc]);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        if (shared) {
          const d = await api(`shared/${shareToken}`);
          if (!off) startDoc({ id: null, title: d.title, dbml: d.dbml, layout: d.layout, source: null, access: d.access, ownerName: d.owner, isOwner: d.isOwner }, d.comments);
          return;
        }
        let list = await api('diagrams');
        let id = store('lastDiagram');
        if (!list.some((x) => x.id === id)) id = list[0]?.id;
        if (!id) { // first sign-in: the sample shop model
          const first = TEMPLATES[0];
          id = (await api('diagrams', { title: first.title, dbml: first.dbml })).id;
          list = await api('diagrams');
        }
        if (off) return;
        setDiagrams(list);
        try { await openDiagram(id); } catch (e) { // e.g. access to the last diagram was revoked
          const alt = list.find((x) => x.id !== id);
          if (!alt) throw e;
          await openDiagram(alt.id);
        }
      } catch (e) { if (!off) { if (shared && e.code === 'share_password') setNeedPass(e.message); else setLoadErr(e.message); } }
    })();
    return () => { off = true; };
  }, [shareToken, unlockTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave (owner: everything; edit link: DBML + layout)
  useEffect(() => {
    if (!doc || !canEdit || conflict) return undefined;
    const payload = payloadOf({ title, dbml, source, layout: layoutRef.current, isOwner: doc.isOwner, access: doc.access });
    const sig = JSON.stringify(payload);
    if (sig === savedRef.current) return undefined;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        const r = await api(shared ? `shared/${shareToken}` : `diagrams/${doc.id}`, verRef.current != null ? { ...payload, baseVersion: verRef.current, ...(overwriteRef.current ? { overwrite: true } : {}), ...(entryRef.current ? { entry: entryRef.current } : {}) } : payload, 'PUT');
        overwriteRef.current = false; entryRef.current = '';
        if (r.version != null) { verRef.current = r.version; setDocVersion(r.version); }
        savedRef.current = sig; setSaveState('saved');
        if (!shared) setDiagrams((l) => l.map((x) => (x.id === doc.id ? { ...x, title, updatedAt: Math.floor(Date.now() / 1000) } : x)));
      } catch (e) {
        if (e.code === 'conflict') { // someone else saved first: stop autosaving and let the person choose
          setSaveState('conflict');
          const by = shared ? null : await api(`diagrams/${doc.id}/versions`).then((l) => l[0]).catch(() => null);
          setConflict({ version: e.version, by: by?.author, at: by?.savedAt });
        } else { setSaveState('error'); notify('err', `Not saved: ${errMsg(e)}`); }
      }
    }, 800);
    return () => clearTimeout(t);
  }, [doc, canEdit, conflict, title, dbml, source, layoutTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // presence: a heartbeat says this tab has the diagram open (and what is selected / being edited); the answer lists the others and the server version
  const selRef = useRef(null), editingRef = useRef(false);
  selRef.current = activeId; editingRef.current = canEdit && saveState !== 'saved';
  useEffect(() => {
    if (!doc || (!doc.id && !shared)) return undefined;
    const path = shared ? `shared/${shareToken}/presence` : `diagrams/${doc.id}/presence`;
    let stop = false;
    const send = async (leave = false) => {
      try { const r = await api(path, { tab: tabId, sel: selRef.current, editing: editingRef.current, ...(leave ? { leave: true } : {}) }); if (!stop && !leave) { setPeers(r.viewers); setServerVersion(r.version); } } catch { /* offline or no access any more: try again at the next beat */ }
    };
    beatRef.current = send; send();
    const t = setInterval(() => { if (!document.hidden) send(); }, 4000);
    const bye = () => { try { fetch(`/api/${path}`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab: tabId, leave: true }) }); } catch { /* closing */ } };
    window.addEventListener('pagehide', bye);
    return () => { stop = true; clearInterval(t); beatRef.current = null; window.removeEventListener('pagehide', bye); setPeers([]); send(true); };
  }, [doc, shareToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => beatRef.current?.(), 350); return () => clearTimeout(t); }, [activeId, saveState]); // tell the others at once what changed
  useEffect(() => { // the Docs view lists the history; refreshed when the diagram is saved
    if (mode !== 'docs' || !canEdit || shared || !doc?.id) { setChangelog([]); return undefined; }
    let off = false;
    api(`diagrams/${doc.id}/versions`).then((l) => { if (!off) setChangelog(l.slice(0, 50)); }).catch(() => { if (!off) setChangelog([]); });
    return () => { off = true; };
  }, [mode, canEdit, shared, doc?.id, docVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const newer = serverVersion != null && docVersion != null && serverVersion > docVersion && saveState === 'saved' && !conflict; // someone saved while we have no unsaved changes

  // comments (stored by the app, never in the database); refetched when the Docs view opens so other people's show up
  const cbase = shared ? `shared/${shareToken}` : `diagrams/${doc?.id}`;
  const addComment = async (key, text) => { try { const c = await api(`${cbase}/comments`, { key, text }); setComments((l) => [...l, c]); } catch (e) { notify('err', errMsg(e)); } };
  const deleteComment = async (id) => { try { await api(`${cbase}/comments/${id}`, undefined, 'DELETE'); setComments((l) => l.filter((c) => c.id !== id)); } catch (e) { notify('err', errMsg(e)); } };
  useEffect(() => {
    if (mode !== 'docs' || !doc) return;
    (shared ? api(`shared/${shareToken}`).then((d) => d.comments) : api(`diagrams/${doc.id}/comments`)).then(setComments).catch(() => {});
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const newDiagram = async (templateId) => { try { const t = TEMPLATES.find((x) => x.id === templateId); const { id } = await api('diagrams', t ? { title: t.title, dbml: t.dbml } : { title: 'Untitled diagram', dbml: BLANK }); setDiagrams(await api('diagrams')); await openDiagram(id); } catch (e) { notify('err', errMsg(e)); } };
  const deleteDiagram = async (d) => {
    if (!window.confirm(`Delete "${d.title}"? Its share links and comments are removed too.`)) return;
    try {
      await api(`diagrams/${d.id}`, undefined, 'DELETE');
      const list = await api('diagrams'); setDiagrams(list);
      if (d.id === doc?.id) { if (list[0]) await openDiagram(list[0].id); else await newDiagram(TEMPLATES[0].id); }
    } catch (e) { notify('err', errMsg(e)); }
  };
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawer(null);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPanelOpen(true); setTimeout(() => panelSearch.current?.focus(), 80); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  dbmlRef.current = dbml;
  const parsed = useMemo(() => parse(dbml), [dbml]);
  const error = parsed.error || '';
  const lastGood = useRef(null);
  if (!parsed.error) lastGood.current = parsed;
  const docModel = useMemo(() => (mode === 'docs' && lastGood.current?.db ? buildModel(lastGood.current.db, lastGood.current.lineage) : null), [mode, parsed]); // eslint-disable-line react-hooks/exhaustive-deps
  const editorDiags = useMemo(() => {
    const lines = dbml.split('\n');
    const off = (l, c) => { let o = 0; for (let i = 0; i < Math.min(l - 1, lines.length); i++) o += lines[i].length + 1; return o + Math.max(0, (c || 1) - 1); };
    return (parsed.diags ?? []).map((d) => ({ from: off(d.line, d.col), to: d.endLine ? off(d.endLine, d.endCol) : off(d.line, d.col) + 1, message: d.message }));
  }, [parsed, dbml]);
  const editorInfo = useMemo(() => (lastGood.current ? { tables: lastGood.current.tables.map((t) => ({ name: t.name, columns: t.fields.map((f) => f.name) })) } : null), [parsed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (parsed.error) return;
    const fkCols = {};
    parsed.refs.forEach((r) => (fkCols[cid(r)] ||= []).push(...r.child.fieldNames));
    const keyCols = {};
    parsed.refs.forEach((r) => { (keyCols[cid(r)] ||= []).push(...r.child.fieldNames); (keyCols[pid(r)] ||= []).push(...r.parent.fieldNames); });
    const tables = parsed.tables.map((t) => ({ ...t, fkCols: fkCols[t.id] || [], keyCols: keyCols[t.id] || [] }));
    setNodes((old) => {
      const pos = new Map([...Object.entries(layoutRef.current), ...old.map((n) => [n.id, n.position])]);
      const tn = layout(tables, parsed.refs, pos, parsed.groups, 'auto', view.lineage !== false ? parsed.lineage || [] : []);
      const x0 = tn.length ? Math.min(...tn.map((n) => n.position.x)) : 0, y0 = tn.length ? Math.max(...tn.map((n) => n.position.y)) + 300 : 0; // notes without a saved place go under the tables
      const notes = (parsed.notes || []).filter(isSticky).map((nt, i) => ({ id: `n:${nt.name}`, type: 'note', position: pos.get(`n:${nt.name}`) || { x: x0 + (i % 4) * 250, y: y0 + Math.floor(i / 4) * 170 }, data: { id: `n:${nt.name}`, name: nt.name, text: nt.text } }));
      return [...tn, ...notes];
    });
    setEdges(parsed.refs.map((r) => ({
      id: r.id, source: cid(r), sourceHandle: `s:${r.child.fieldNames[0]}`,
      target: pid(r), targetHandle: `t:${r.parent.fieldNames[0]}`,
      label: `${r.child.relation}:${r.parent.relation}`, data: { sf: r.child.fieldNames[0], tf: r.parent.fieldNames[0], name: r.name || '' },
    })).concat((parsed.lineage || []).flatMap((l) => (l.maps.length // column mappings: one arrow per column pair; otherwise one table-level arrow
      ? l.maps.map((m, i) => ({ id: `${l.id}#${i}`, source: l.source, target: l.target, label: '', data: { kind: 'lineage', sCols: [m.s], tCols: [m.t], manual: l.manual, name: '' } }))
      : [{ id: l.id, source: l.source, target: l.target, label: '', data: { kind: 'lineage', sCols: l.sCols, tCols: l.tCols, manual: l.manual, name: '' } }]))));
    const key = parsed.tables.map((t) => t.id).sort().join('|');
    if (key !== idsKey.current) { idsKey.current = key; const fit = () => fitView({ padding: 0.2, maxZoom: 1, duration: 250 }); setTimeout(fit, 80); setTimeout(fit, 600); } // 2nd pass: nodes are not measured yet right after a document switch
  }, [parsed, doc]); // eslint-disable-line react-hooks/exhaustive-deps -- `doc` too: two diagrams with identical DBML must still rebuild the canvas after a switch

  const notesOn = view.notes !== false; // sticky notes can be hidden (View)
  const newNote = useRef(null); // id of the note just created: it opens in edit mode
  const editNote = (name, text) => { // write the new text of a sticky note back into the DBML
    const nt = (parsed.notes || []).find((x) => x.name === name), cur = dbmlRef.current;
    if (nt && canEdit) setDbml(cur.slice(0, nt.start) + noteBlock(name, text) + cur.slice(nt.end));
  };
  const removeNote = (name) => {
    const nt = (parsed.notes || []).find((x) => x.name === name), cur = dbmlRef.current;
    if (nt && canEdit) setDbml((cur.slice(0, nt.start) + cur.slice(nt.end)).replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n'));
  };
  const addNote = () => {
    if (!canEdit) return notify('err', 'This diagram is read-only for you');
    const names = new Set((parsed.notes || []).map((x) => x.name));
    let i = 1; while (names.has(`note_${i}`)) i++;
    const name = `note_${i}`, box = document.querySelector('.canvas')?.getBoundingClientRect();
    const at = box ? screenToFlowPosition({ x: box.x + box.width / 2 - 110, y: box.y + box.height / 2 - 40 }) : { x: 0, y: 0 };
    layoutRef.current = { ...layoutRef.current, [`n:${name}`]: { x: Math.round(at.x), y: Math.round(at.y) } };
    newNote.current = `n:${name}`; setTimeout(() => { newNote.current = null; }, 800);
    const cur = dbmlRef.current;
    setNotesShown();
    setDbml(`${cur.replace(/\n*$/, '\n')}\n${noteBlock(name, '')}\n`);
  };
  const setNotesShown = () => { if (!notesOn) setView((v) => ({ ...v, notes: true })); };
  const lineageOn = view.lineage !== false; // dashed data-lineage arrows (from the `// lineage:` comments) can be switched off
  const shown = useMemo(() => {
    const q = search.trim(), match = tableMatcher(search), groupName = new Map((parsed.groups || []).flatMap((g) => g.tables.map((t) => [t, g.name])));
    const hit = (t) => match(t, groupName.get(t.id));
    const sz = layoutRef.current['@sizes'] || {};
    const ends = activeEdge ? (() => { const e = edges.find((x) => x.id === activeEdge); return e ? [e.source, e.target] : null; })() : null;
    const gMembers = activeGroup ? new Set((parsed.groups || []).find((g) => g.name === activeGroup)?.tables || []) : null;
    const visible = nodes.filter((n) => n.type === 'table' && !hidden.has(n.id));
    const linC = activeId && lineageOn ? closure(edges.filter((e) => e.data.kind === 'lineage'), activeId) : null; // what feeds the selected table (up) and what it feeds (down)
    const peerSel = new Map(); // table id -> the other people who have it selected
    peers.forEach((p) => { if (p.sel) peerSel.set(p.sel, [...(peerSel.get(p.sel) || []), p]); });
    const tables = visible.map((n) => ({
      ...n,
      data: { ...n.data, w: sz[n.id]?.w, h: sz[n.id]?.h, collapsed: !!sz[n.id]?.c || view.detail === 'tables', detail: view.detail || 'full', onSize, onToggle, hideIndexes: view.hideIndexes || lessDetail({ detail: view.detail }), hideTypes: view.hideTypes || lessDetail({ detail: view.detail }), linRole: linC ? (linC.up.has(n.id) ? 'up' : linC.down.has(n.id) ? 'down' : '') : '', peers: peerSel.get(n.id), active: n.id === activeId || !!ends?.includes(n.id), dim: (!!ends && !ends.includes(n.id)) || (!!gMembers && !gMembers.has(n.id)) || !!q && !hit(n.data) },
    }));
    const byId = new Map(visible.map((n) => [n.id, n]));
    const boxes = (parsed.groups || []).flatMap((gr) => {
      const m = gr.tables.map((id) => byId.get(id)).filter(Boolean);
      if (!m.length) return [];
      const b = getNodesBounds(m.map((n) => ({ ...n, measured: { width: n.measured?.width ?? 220, height: n.measured?.height ?? tableHeight(n.data) } })));
      const w = b.width + PAD * 2, h = b.height + PAD * 2 + HEAD;
      return [{ id: `g:${gr.name}`, type: 'grp', position: { x: b.x - PAD, y: b.y - PAD - HEAD }, data: { name: gr.name, color: gr.color, w, h, canMove: canEdit, active: activeGroup === gr.name }, width: w, height: h, draggable: canEdit, dragHandle: '.grp-handle', style: { pointerEvents: 'none' }, selectable: false, focusable: false, zIndex: -1 }];
    });
    const stickies = notesOn ? nodes.filter((n) => n.type === 'note').map((n) => ({ ...n, draggable: canEdit, data: { ...n.data, w: sz[n.id]?.w, h: sz[n.id]?.h, canEdit, dark: view.theme === 'dark', autoEdit: newNote.current === n.id, onEdit: editNote, onRemove: removeNote, onSize } })) : [];
    return [...boxes, ...tables, ...stickies];
  }, [nodes, edges, search, parsed, peers, lineageOn, notesOn, canEdit, view.theme, view.hideIndexes, view.hideTypes, view.detail, activeId, activeEdge, activeGroup, layoutTick, hidden, onSize, onToggle]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownEdges = useMemo(() => {
    const labels = layoutRef.current['@labels'] || {};
    const gSet = activeGroup ? new Set((parsed.groups || []).find((g) => g.name === activeGroup)?.tables || []) : null;
    const geo = new Map(nodes.filter((n) => n.type === 'table').map((n) => [n.id, { x: n.position.x, w: n.measured?.width ?? tableWidth(n.data) }]));
    const linAll = edges.filter((e) => e.data.kind === 'lineage'), linC = activeId && lineageOn ? closure(linAll, activeId) : null;
    return edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target) && (lineageOn || e.data.kind !== 'lineage')).map((e) => {
    // nearest path: leave through the side that faces the other table (both on the same side when they overlap horizontally)
    const a = geo.get(e.source), b = geo.get(e.target);
    let sp = 'right', tp = 'left';
    if (a && b) {
      if (b.x >= a.x + a.w) { sp = 'right'; tp = 'left'; }
      else if (b.x + b.w <= a.x) { sp = 'left'; tp = 'right'; }
      else sp = tp = b.x + b.w / 2 >= a.x + a.w / 2 ? 'right' : 'left';
    }
    if (e.data.kind === 'lineage') { // data flows source -> target: dashed arrow; a one-to-one column mapping connects the columns, otherwise the table headers
      const { sCols, tCols } = e.data, one = sCols.length === 1 && tCols.length === 1, dark = view.theme === 'dark';
      const lh = one ? { sourceHandle: `${sp === 'right' ? 's' : 'sl'}:${sCols[0]}`, targetHandle: `${tp === 'left' ? 't' : 'tr'}:${tCols[0]}` } : { sourceHandle: sp === 'right' ? 'ls' : 'lsl', targetHandle: tp === 'left' ? 'lt' : 'ltr' };
      const picked = e.id === activeEdge, a = activeId;
      const inUp = !!linC && (e.source === a || linC.up.has(e.source)) && (e.target === a || linC.up.has(e.target)), inDown = !!linC && (e.source === a || linC.down.has(e.source)) && (e.target === a || linC.down.has(e.target));
      const color = picked ? '#f59e0b' : inUp ? '#8b5cf6' : inDown ? '#0d9488' : dark ? '#a78bfa' : '#7c3aed';
      const faded = (!!linC && !inUp && !inDown) || (!!activeEdge && !picked) || (!!gSet && !gSet.has(e.source) && !gSet.has(e.target));
      const cols = sCols.join(', ') + (tCols.length ? ` → ${tCols.join(', ')}` : '');
      const shownCols = tCols.length ? cols : `uses ${cols}`; // a mapping `a -> b` reads as is; a plain list is what the view uses (joins and filters included), not what it outputs
      const text = picked ? (shownCols.length > 70 ? `${shownCols.slice(0, 67)}…` : shownCols) : sCols.length > 1 ? `uses ${sCols.length} cols` : one ? '' : sCols.length === 1 ? `uses ${sCols[0]}` : '';
      return { ...e, ...lh, type: 'ref', zIndex: picked ? 20 : inUp || inDown ? 10 : 0, interactionWidth: 20, markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        style: { stroke: color, strokeWidth: picked ? 3 : inUp || inDown ? 2.4 : 1.6, strokeDasharray: '7 5', ...(faded ? { opacity: 0.18 } : {}) },
        data: { ...e.data, edgeType: view.edgeType, off: labels[e.id], text, css: { background: dark ? '#1b1531' : '#f5f0ff', border: `1px solid ${dark ? '#4c3a8a' : '#d8c8ff'}`, color: dark ? '#c4b5fd' : '#6d28d9', fontSize: 10, fontWeight: picked ? 700 : 500, opacity: faded ? 0.3 : 1 }, onMove: setLabel, onPick: (id) => { setActiveId(null); setActiveEdge(id); } } };
    }
    const handles = { sourceHandle: `${sp === 'right' ? 's' : 'sl'}:${e.data.sf}`, targetHandle: `${tp === 'left' ? 't' : 'tr'}:${e.data.tf}` };
    const picked = e.id === activeEdge, on = activeId && (e.source === activeId || e.target === activeId);
    const style = picked ? { stroke: '#f59e0b', strokeWidth: 3 } : on || view.hiRefs ? { stroke: view.theme === 'dark' ? '#4f8cff' : '#2563eb', strokeWidth: view.hiRefs && !on ? 1.6 : 2 } : { stroke: '#94a3b8', strokeWidth: 1.3, ...(activeEdge || (gSet && !gSet.has(e.source) && !gSet.has(e.target)) ? { opacity: 0.15 } : {}) };
    const hi = view.hiRefs && !!e.data.name, text = hi ? e.data.name : e.label;
    const css = hi
      ? { background: view.theme === 'dark' ? '#111826' : '#fff', border: `1px solid ${view.theme === 'dark' ? '#2c3f66' : '#bfd3ff'}`, color: picked ? (view.theme === 'dark' ? '#fbbf24' : '#b45309') : view.theme === 'dark' ? '#9fc0ff' : '#1d4ed8', fontWeight: 600, fontSize: 10.5 }
      : { background: canvasBg, border: '1px solid transparent', color: picked ? (view.theme === 'dark' ? '#fbbf24' : '#b45309') : view.theme === 'dark' ? '#9aa6bd' : '#526071', fontWeight: picked ? 700 : 400, fontSize: 10 };
    return { ...e, ...handles, type: 'ref', zIndex: picked ? 20 : on ? 10 : 0, interactionWidth: 20, style, data: { ...e.data, edgeType: view.edgeType, off: labels[e.id], text, css, onMove: setLabel, onPick: (id) => { setActiveId(null); setActiveEdge(id); } } };
  }); }, [edges, nodes, lineageOn, view.edgeType, view.hiRefs, activeId, activeEdge, activeGroup, canvasBg, hidden, layoutTick, setLabel, parsed.groups]);

  const [algoOpen, setAlgoOpen] = useState(false);
  useDismiss(algoOpen, () => setAlgoOpen(false), (t) => t.closest?.('.algo-pop, .algo-toggle')); // (a fixed backdrop inside the transformed dock would only cover the dock)
  const focusTable = (id) => { // select it and bring it to the middle (showing it if it was hidden)
    if (hidden.has(id)) setHidden([id], false);
    setActiveEdge(null); setActiveId(id);
    setTimeout(() => fitView({ nodes: [{ id }], padding: 0.8, maxZoom: 1, duration: 300 }), 80);
  };
  const focusLineage = (id) => { // show only this table and everything it is built from or feeds, with the lineage lines on
    const c = closure(edges.filter((e) => e.data.kind === 'lineage'), id);
    if (!lineageOn) setView((v) => ({ ...v, lineage: true }));
    showOnly([id, ...c.up, ...c.down]); setActiveEdge(null); setActiveId(id);
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1, duration: 300 }), 120);
  };
  const relayout = (algo = view.algo) => { // two passes: estimated sizes, then the sizes the browser really measured (manual widths, wrapped text) so nothing overlaps
    const pass = (measured) => {
      setNodes((old) => {
        const sz = layoutRef.current['@sizes'], hid = new Set(layoutRef.current['@hidden'] || []);
        const vis = old.filter((n) => n.type === 'table' && !hid.has(n.id));
        const next = layout(vis.map((n) => ({ ...n.data, detail: view.detail || 'full', hideIndexes: view.hideIndexes, collapsed: !!sz?.[n.id]?.c || view.detail === 'tables', w: (measured && n.measured?.width) || sz?.[n.id]?.w, h: (measured && n.measured?.height) || sz?.[n.id]?.h })), parsed.refs, null, (parsed.groups || []).map((g) => ({ ...g, tables: g.tables.filter((id) => !hid.has(id)) })), algo, lineageOn ? parsed.lineage || [] : []);
        const fresh = new Map(next.map((n) => [n.id, n])), merged = old.map((n) => fresh.get(n.id) || n); // hidden tables keep their place
        layoutRef.current = { ...Object.fromEntries(merged.map((n) => [n.id, n.position])), ...(sz ? { '@sizes': sz } : {}), ...(hid.size ? { '@hidden': [...hid] } : {}), ...Object.fromEntries(['@views', '@base', '@view'].filter((k) => layoutRef.current[k]).map((k) => [k, layoutRef.current[k]])) };
        return merged;
      });
      setLayoutTick((n) => n + 1);
    };
    pass(false); setTimeout(() => pass(true), 350); setTimeout(() => fitView({ padding: 0.2, maxZoom: 1, duration: 250 }), 700);
  };
  const onImported = (r, src, groups) => { // what a finished import changes in the diagram
    lastGen.current = r.dbml; store(`gen:${doc.id}`, r.dbml);
    setDbml(withGroups(r.dbml, groups ?? parsed.groups)); // groups are re-applied: a new import must not lose them
    setSource(src);
    notify('ok', `Imported ${r.tables} tables, ${r.refs} relationships — linked for refresh`);
  };
  const { conns, form, setForm, schemas, picked, setPicked, tableSel, setTableSel, tableList, picker, setPicker, tableGroups, setTableGroups, warnings, setWarnings, fullDdl, setFullDdl, set, test, loadTables, save, importNow, pick, del, loadPem, reset } =
    useConnect({ shared, notify, docId: doc?.id, source, setSource, setBusy, onImported, reloadOn: [connectOpen, showAdmin] });
  const refresh = useCallback(async (silent = false) => {
    if (!source || refreshing.current) return;
    refreshing.current = true; setBusy('refresh');
    try {
      const r = await api('import', { id: source.connId, schemas: source.schemas, tables: source.tables, ddl: !!source.ddl, purpose: 'refresh', diagramId: doc.id });
      setSource((x) => ({ ...x, at: r.at })); setWarnings(r.warnings || []);
      if (r.dbml === lastGen.current) { if (!silent) notify('ok', 'Already up to date'); return; }
      const cur = dbmlRef.current, merged = keepGroups(cur, r.dbml);
      lastGen.current = r.dbml; store(`gen:${doc.id}`, r.dbml);
      if (merged !== cur) entryRef.current = 'refresh';
      setDbml(merged);
      notify('ok', `Metadata refreshed: ${diffSummary(cur, merged)}`);
    } catch (e) { notify('err', `Refresh failed: ${errMsg(e)}`); } finally { refreshing.current = false; setBusy(''); }
  }, [source, notify, doc]);
  const linked = conns.find((c) => c.id === source?.connId);
  const every = linked?.refreshMinutes || 0;
  useEffect(() => {
    if (!source || !every || !owner) return undefined; // the timer runs in the owner's page only (one refresh, not one per open browser)
    const t = setInterval(() => refresh(true), every * 60000);
    return () => clearInterval(t);
  }, [source?.connId, every, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const importText = (text, fmt = sqlFmt) => {
    if (readOnly) return notify('err', 'This diagram is read-only for you');
    try { setDbml(fmt === 'dbml' ? text : importer.import(text, fmt)); notify('ok', `Imported from ${fmt}`); }
    catch (e) { notify('err', `Import ${fmt} failed: ${errMsg(e)}`); }
  };
  const importFile = async (f) => { if (f) importText(await f.text()); };

  const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text])); a.download = name; a.click(); };
  const exportAs = async (fmt) => {
    const base = title.trim().replace(/[^\w.-]+/g, '_') || 'diagram';
    try {
      if (fmt === 'docs-html' || fmt === 'docs-md') {
        if (parsed.error) throw new Error('fix the DBML errors first');
        const m = buildModel(parsed.db, parsed.lineage);
        // an exported file can travel: it carries only the NAMED versions of the changelog (deliberate release markers), not every saved edit
        const named = canEdit && !shared && doc?.id ? await api(`diagrams/${doc.id}/versions`).then((l) => l.filter((v) => v.label)).catch(() => []) : [];
        if (fmt === 'docs-html') download(`${base}-docs.html`, standaloneHtml(m, title, comments, named));
        else download(`${base}-docs.md`, toMarkdown(m, title, comments, named));
      } else if (fmt === 'dbml') download(`${base}.dbml`, dbml);
      else if (fmt === 'json') download(`${base}.json`, exporter.export(dbml, 'json'));
      else if (fmt === 'png' || fmt === 'svg') {
        const b = getNodesBounds(nodes.filter((n) => n.type !== 'note' || notesOn).map((n) => ({ ...n, measured: n.measured ?? { width: 220, height: n.type === 'note' ? 120 : tableHeight(n.data) } })));
        const w = Math.ceil(b.width + 120), h = Math.ceil(b.height + 120);
        const vp = getViewportForBounds(b, w, h, 0.1, 2, 0.05);
        const url = await (fmt === 'png' ? toPng : toSvg)(document.querySelector('.react-flow__viewport'), { backgroundColor: canvasBg, width: w, height: h, style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } });
        const a = document.createElement('a'); a.href = url; a.download = `${base}.${fmt}`; a.click();
      } else download(`${base}.${fmt}.sql`, exporter.export(dbml, fmt));
      notify('ok', `Exported ${fmt}`);
    } catch (e) { notify('err', `Export ${fmt} failed: ${errMsg(e)}`); }
  };
  const copyDbml = () => copyText(dbml, 'DBML copied', notify);

  const tabs = shared
    ? [...(canEdit ? [['import', 'Import']] : []), ['view', 'View']]
    : owner
      ? [['diagrams', 'Diagrams'], ['connect', 'Database'], ['import', 'Import'], ['history', 'History'], ['view', 'View'], ['share', 'Share']]
      : [['diagrams', 'Diagrams'], ...(canEdit ? [['import', 'Import'], ['history', 'History']] : []), ['view', 'View'], ...(manage ? [['share', 'Share']] : [])];
  const tabName = Object.fromEntries(tabs);
  const TITLES = { diagrams: 'Diagrams', connect: 'Database', import: 'Import', export: 'Export', view: 'View', history: 'History', share: 'Share', account: 'Account' };
  const LABEL = { view: 'view only', comment: 'can comment', edit: 'can edit', admin: 'administrator access' };
  const open = (t) => setDrawer(drawer === t ? null : t);
  useEffect(() => { store('editorW', String(editorW)); }, [editorW]);
  useEffect(() => { document.title = doc ? `${title || 'Untitled'} — ${org || 'OpenDiagram'}` : (org || 'OpenDiagram'); }, [doc, title, org]);
  const startResize = (e) => {
    e.preventDefault();
    setResizing(true);
    const move = (ev) => setEditorW(Math.max(260, Math.min(Math.floor(window.innerWidth * 0.75), ev.clientX)));
    const up = () => { setResizing(false); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.userSelect = ''; };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  const stat = parsed.error ? 'syntax error' : `${parsed.tables.length} tables · ${parsed.refs.length} refs`;

  if (needPass !== null) return (
    <div className="auth-wrap"><form className="auth-card" onSubmit={(e) => { e.preventDefault(); const pw = new FormData(e.currentTarget).get('pw'); if (!pw) return; sharePassword(shareToken, String(pw)); setNeedPass(null); setUnlockTick((n) => n + 1); }}>
      <h2>Protected link</h2><div className="auth-err" style={{ display: needPass ? 'block' : 'none' }}>{needPass}</div>
      <input name="pw" type="password" autoFocus autoComplete="off" placeholder="Password" /><button className="primary" type="submit">Open</button>
    </form></div>
  );
  if (loadErr) return <div className="auth-wrap"><div className="auth-card"><h2>Could not open this diagram</h2><div className="auth-err">{loadErr}</div><a href="/">Go to the app</a></div></div>;
  if (!doc) return <div className="splash">Loading…</div>;

  return (
    <div className="shell" data-theme={view.theme}>
      <header className="top">
        <div className="brand"><Logo /> {org || 'OpenDiagram'}</div>
        <input className="title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="diagram title" readOnly={!manage} />
        {shared
          ? <span className="chip-access" title={`Shared by ${doc.ownerName}`}>{access === 'edit' ? (user ? 'can edit' : 'edit link — log in to edit') : access === 'comment' ? (user ? 'can comment' : 'comment link — log in to comment') : 'view only'}</span>
          : !manage || !owner ? <span className="chip-access" title={`Owned by ${doc.ownerName}`}>{doc.ownerName} · {LABEL[access]}</span> : null}
        {canEdit && <span className={`savestate ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : saveState === 'conflict' ? 'Conflict' : 'Saved'}</span>}
        {peers.length > 0 && (
          <div className="peers" aria-label="People who have this diagram open">
            {peers.slice(0, 4).map((p) => <span key={p.id} className={`peer ${p.editing ? 'editing' : ''}`} style={{ background: p.color }} title={`${p.name}${p.editing ? ' · editing' : p.sel ? ` · looking at ${p.sel.replace(/^public\./, '')}` : ''}`}>{(p.name || '?')[0].toUpperCase()}</span>)}
            {peers.length > 4 && <span className="peer more" title={peers.slice(4).map((p) => p.name).join(', ')}>+{peers.length - 4}</span>}
          </div>
        )}
        <div className="mode" role="tablist" aria-label="View mode" ref={modeBox}>
          <span className={`mode-pill ${pillReady ? 'ready' : ''}`} aria-hidden="true" style={pill ? { transform: `translateX(${pill.x}px)`, width: pill.w } : { opacity: 0 }} />
          <button role="tab" aria-selected={mode === 'diagram'} className={mode === 'diagram' ? 'on' : ''} onClick={() => setMode('diagram')}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="2" width="5" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="9.5" y="10" width="5" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M4 6v4h5.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>Diagram
          </button>
          <button role="tab" aria-selected={mode === 'docs'} className={mode === 'docs' ? 'on' : ''} onClick={() => setMode('docs')}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 2h7l3 3v9H3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>Docs
          </button>
        </div>
        <div className="grow" />
        {canEdit && source && linked && <button className="tbtn" disabled={busy === 'refresh'} onClick={() => refresh(false)} title={`Re-read metadata from ${linked?.name ?? 'the database'}${every ? ` · auto every ${every} min` : ''}`}>{busy === 'refresh' ? '↻ Refreshing…' : `↻ ${linked?.name ?? 'source'} · ${ago(source.at)}`}</button>}
        {tabName.share && <button className={`tbtn ${drawer === 'share' ? 'on' : ''}`} onClick={() => open('share')}>{tabName.share}</button>}
        <Menu trigger="Export" title="Download the diagram or its documentation"
          items={[...['Image', 'SQL', 'Other'].flatMap((g) => [{ header: g }, ...EXPORTS.filter((e) => e[3] === g).map(([k, l, ext]) => ({ key: k, label: l, hint: ext, onClick: () => exportAs(k) }))]),
            { sep: true }, { key: 'copy', label: 'Copy DBML to clipboard', onClick: copyDbml }]} />
        <Menu trigger="More" active={['diagrams', 'connect', 'import', 'history', 'view'].includes(drawer)} title="Diagrams, Database, Import, History, View, Documentation"
          items={[...['diagrams', 'connect', 'import', 'history', 'view'].filter((k) => tabName[k]).map((k) => ({ key: k, label: tabName[k], on: drawer === k, onClick: () => setDrawer(k) })),
            { sep: true }, { key: 'help', label: 'Documentation', hint: 'opens in a new tab', onClick: () => window.open('/docs', '_blank', 'noopener') }]} />
        {user
          ? <Menu title={`${user.name} · ${user.email}`} trigger={<span className="avatar">{(user.name || user.email)[0].toUpperCase()}</span>}
            items={[{ header: `${user.name} · ${user.role === 'admin' ? 'Administrator' : 'Member'}` }, { key: 'account', label: 'Account & password', onClick: () => setDrawer('account') },
              ...(user.role === 'admin' ? [{ key: 'admin', label: 'Administration', hint: 'users, groups, settings', onClick: () => setShowAdmin(true) }] : []),
              { sep: true }, { key: 'out', label: 'Sign out', danger: true, onClick: onLogout }]} />
          : <button className="tbtn on" onClick={onLogin}>Log in</button>}
      </header>

      {newer && (
        <div className="newer" role="status">
          Someone saved a newer version of this diagram.
          <button onClick={() => { setServerVersion(null); if (shared) setUnlockTick((n) => n + 1); else openDiagram(doc.id).catch((e) => notify('err', errMsg(e))); }}>Load it</button>
          <button className="ghost" onClick={() => setServerVersion(null)} title="Hide until the next change">Dismiss</button>
        </div>
      )}
      <div className="body">
        <section aria-label="DBML editor" className={`editor-pane ${editorShown ? '' : 'closed'} ${resizing ? 'resizing' : ''}`} style={{ width: editorShown ? edW : 0 }}>
          <Editor value={dbml} onChange={setDbml} diags={editorDiags} info={editorInfo} readOnly={readOnly} wrap={view.wrap} />
          <div className={`status ${error ? 'bad' : ''}`}>{error || stat}</div>
        </section>
        {editorShown && <div className={`resizer ${resizing ? 'active' : ''}`} style={{ left: edW }} title="Drag to resize the editor (double-click to reset)" onMouseDown={startResize} onDoubleClick={() => setEditorW(380)} />}
        {mode !== 'docs' && <button className="edge-toggle" style={{ left: editorOpen ? edW : 0 }} onClick={() => setEditorOpen(!editorOpen)} aria-expanded={editorOpen} title="Toggle editor">{editorOpen ? '‹' : '›'}</button>}

        <main className="canvas" data-mode={mode} aria-label="Diagram">
          <ReactFlow nodes={shown} edges={shownEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} edgeTypes={edgeTypes} colorMode={view.theme}
            snapToGrid={view.snap} snapGrid={[20, 20]} minZoom={0.05} maxZoom={2} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            onNodeClick={(_, n) => { setActiveEdge(null); setActiveId(n.type === 'table' ? n.id : null); setActiveGroup(n.type === 'grp' ? n.data.name : null); }} onEdgeClick={(_, e) => { setActiveId(null); setActiveGroup(null); setActiveEdge(e.id); }} onPaneClick={() => { setActiveId(null); setActiveEdge(null); setActiveGroup(null); }} nodesConnectable={false} nodesDraggable={canEdit}
            onNodeDragStart={(_, n) => { // a group box moves all its tables with it
              if (n.type !== 'grp') return;
              setActiveGroup(n.data.name); setActiveId(null); setActiveEdge(null);
              const gr = (parsed.groups || []).find((x) => `g:${x.name}` === n.id), ids = new Set((gr?.tables || []).filter((id) => !hidden.has(id)));
              grpDrag.current = { x0: n.position.x, y0: n.position.y, start: new Map(nodes.filter((m) => ids.has(m.id)).map((m) => [m.id, { ...m.position }])) };
            }}
            onNodeDrag={(_, n) => {
              const g = grpDrag.current;
              if (n.type !== 'grp' || !g) return;
              const dx = n.position.x - g.x0, dy = n.position.y - g.y0;
              setNodes((old) => old.map((m) => (g.start.has(m.id) ? { ...m, position: { x: g.start.get(m.id).x + dx, y: g.start.get(m.id).y + dy } } : m)));
            }}
            onNodeDragStop={(_, n) => {
              if (n.type === 'grp' && grpDrag.current) {
                const g = grpDrag.current, dx = n.position.x - g.x0, dy = n.position.y - g.y0; grpDrag.current = null;
                layoutRef.current = { ...layoutRef.current, ...Object.fromEntries([...g.start].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }])) };
                setLayoutTick((k) => k + 1);
                return;
              }
              if (n.type === 'table' || n.type === 'note') { layoutRef.current = { ...layoutRef.current, [n.id]: n.position }; setLayoutTick((k) => k + 1); } }}>
            {view.grid && <Background gap={22} size={1.2} color={view.theme === 'dark' ? '#27324a' : '#cfd4dc'} />}
            <MiniMap pannable zoomable className="mini" style={{ right: (drawer ? 350 : 0) + (panelOpen && mode === 'diagram' ? 320 : 0) }} nodeColor={view.theme === 'dark' ? '#4f8cff' : '#1e3a5f'} maskColor={view.theme === 'dark' ? 'rgba(14,20,32,.72)' : 'rgba(244,245,247,.7)'} />
          </ReactFlow>
          {mode === 'diagram' && (<>
            <button className="tpn-toggle" style={{ right: (drawer ? 350 : 0) + (panelOpen ? 320 : 0) }} onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen} title={`Tables panel (Ctrl+K)${hidden.size ? ` · ${hidden.size} hidden` : ''}`} aria-label="Tables panel">{panelOpen ? '›' : '‹'}{!panelOpen && hidden.size > 0 && <i className="tpn-badge">{hidden.size}</i>}</button>
            {panelOpen && !parsed.error && <TablesPanel right={drawer ? 350 : 0} tables={parsed.tables} groups={parsed.groups || []} refs={parsed.refs} lineage={parsed.lineage || []} onLineage={focusLineage} hidden={hidden} onHide={setHidden} onOnly={showOnly} onFocus={focusTable} views={viewNames} activeView={activeView} onView={switchView} onCreateView={createView} onDeleteView={deleteView} onRenameView={renameView} activeId={activeId} search={search} setSearch={setSearch} searchRef={panelSearch} onClose={() => setPanelOpen(false)} />}
          </>)}
          {!parsed.error && !parsed.tables.length && <div className="empty">No tables yet — write DBML on the left, or open <b>Database</b> / <b>Import</b>.</div>}
          {mode === 'docs' && (docModel ? <DocsView model={docModel} title={title} theme={view.theme} changelog={changelog} comments={comments} me={user} canComment={canComment} isOwner={!!doc?.isOwner || access === 'admin'} onAdd={addComment} onDelete={deleteComment} /> : <div className="empty">Fix the DBML errors to generate documentation.</div>)}
          <div className="dock" inert={drawer && window.innerWidth <= 720 ? '' : undefined} style={{ left: `calc(50% - ${((drawer ? 350 : 0) + (panelOpen && mode === 'diagram' ? 320 : 0)) / 2}px)` }}>
            <button onClick={() => zoomOut()} title="Zoom out" aria-label="Zoom out"><Ic n="zoomOut" /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomIn()} title="Zoom in" aria-label="Zoom in"><Ic n="zoomIn" /></button>
            <i className="sep" />
            <button onClick={() => fitView({ padding: 0.2, maxZoom: 1, duration: 250 })} title="Fit to screen" aria-label="Fit to screen"><Ic n="fit" /></button>
            <button onClick={() => setSize(Object.fromEntries(nodes.filter((n) => n.type === 'table').map((n) => [n.id, { c: true }])))} title="Collapse all tables" aria-label="Collapse all tables"><Ic n="collapse" /></button>
            <button onClick={() => setSize(Object.fromEntries(nodes.filter((n) => n.type === 'table').map((n) => [n.id, { c: false }])))} title="Expand all tables" aria-label="Expand all tables"><Ic n="expand" /></button>
            <button className={view.hiRefs ? 'on' : ''} onClick={() => setView({ ...view, hiRefs: !view.hiRefs })} title="Highlight relationships (show their names)" aria-label="Highlight relationships"><Ic n="refs" s={15} /></button>
            {canEdit && mode === 'diagram' && <button onClick={addNote} title="Add a sticky note (a Note block in the DBML)" aria-label="Add sticky note"><Ic n="note" s={15} /></button>}
            {(parsed.lineage || []).length > 0 && <button className={lineageOn ? 'on' : ''} onClick={() => setView({ ...view, lineage: !lineageOn })} title={lineageOn ? 'Hide data lineage' : 'Show data lineage (dashed arrows from the source to the table built from it)'} aria-label="Data lineage"><Ic n="lineage" s={15} /></button>}
            <button onClick={() => relayout()} title={`Auto arrange (${(ALGOS.find((a) => a.k === view.algo) || ALGOS[0]).name})`}><Ic n="arrange" />Arrange</button>
            <button className="algo-toggle" onClick={() => setAlgoOpen((o) => !o)} title="Choose the arrange algorithm" aria-label="Choose the arrange algorithm"><Ic n="caret" /></button>
            {algoOpen && (<>
              <div className="algo-pop" role="menu">
                <b>Auto-arrange algorithm</b>
                {ALGOS.map((a) => (
                  <button key={a.k} role="menuitem" className={view.algo === a.k ? 'on' : ''} onClick={() => { setView({ ...view, algo: a.k }); setAlgoOpen(false); relayout(a.k); }}>
                    <span>{a.name}</span><small>{a.desc}</small>
                  </button>
                ))}
              </div>
            </>)}
          </div>
        </main>

        <aside className={`drawer ${drawer ? 'open' : ''}`} aria-label="Side panel" inert={drawer ? undefined : ''}>
          <div className="dtabs">
            <b className="dtitle">{TITLES[drawer] ?? ''}</b>
            <button className="x" onClick={() => setDrawer(null)} title="Close (Esc)">✕</button>
          </div>

          {drawer === 'account' && user && (
            <div className="dbody">
              <div className="card static">
                <span className="avatar big">{(user.name || user.email)[0].toUpperCase()}</span>
                <div className="grow"><b>{user.name}</b><small>{user.email}</small></div>
                <span className="chip">{user.role === 'admin' ? 'Administrator' : 'Member'}</span>
              </div>
              {groups?.length > 0 && <><h4>My groups</h4><div>{groups.map((g) => <span key={g.id} className="chip">{g.name}</span>)}</div></>}
              <h4>Change password</h4>
              <PasswordForm onDone={onUser} />
              <button onClick={onLogout}>Sign out</button>
            </div>
          )}
          {drawer === 'diagrams' && <Library diagrams={diagrams} currentId={doc?.id} isAdmin={user?.role === 'admin'} onOpen={(id) => { openDiagram(id).then(() => setDrawer(null)).catch((e) => notify('err', errMsg(e))); }} templates={TEMPLATES} onCreate={newDiagram} onDelete={deleteDiagram} />}
          {drawer === 'share' && manage && doc?.id && <SharePanel diagramId={doc.id} notify={notify} />}
          {drawer === 'history' && canEdit && doc?.id && !shared && <History diagramId={doc.id} version={docVersion} dbml={dbml} notify={notify} onRestored={() => openDiagram(doc.id)} />}

          {drawer === 'connect' && (
            <div className="dbody">
              {source && (
                <div className="linked">
                  <span>Linked to <b>{linked?.name ?? 'connection'}</b> · {source.schemas.join(', ')}{every ? ` · auto ${every} min` : ''}</span>
                  <span><a onClick={() => refresh(false)}>Refresh now</a> · <a onClick={() => setSource(null)}>Unlink</a></span>
                </div>
              )}
              <h4>Saved connections <a onClick={reset}>+ new</a></h4>
              {conns.length === 0 && <small className="hint">None yet — fill the form below and Save.</small>}
              {conns.map((c) => (
                <div key={c.id} className={`card ${form.id === c.id ? 'sel' : ''}`} onClick={() => pick(c)}>
                  <span className={`badge ${c.type}`}>{c.type === 'oracle' ? 'ORA' : 'PG'}</span>
                  <div className="grow"><b>{c.name}</b><small>{`${c.host}:${c.port}/${c.database}`.replace(/([./_])/g, '$1​')}</small></div>
                  {c.shared ? <span className="chip" title="Registered by an administrator: you can use it, not change it">shared</span> : <button className="ghost" onClick={(e) => { e.stopPropagation(); del(c); }} title="Delete">✕</button>}
                </div>
              ))}
              <h4>{form.shared ? 'Shared connection' : form.id ? 'Edit connection' : 'New connection'}</h4>
              {form.shared && <small className="hint">Registered by an administrator. You can use it to import and refresh, but the database user and password are not visible to you and cannot be changed here. Every use is recorded.</small>}
              <fieldset className="conn-fs" disabled={!!form.shared}>
              <div className="seg">
                {[['postgres', 'PostgreSQL'], ['oracle', 'Oracle']].map(([v, l]) => (
                  <button key={v} className={form.type === v ? 'on' : ''} onClick={() => setForm({ ...form, type: v, port: v === 'oracle' ? 1521 : 5432 })}>{l}</button>
                ))}
              </div>
              <input placeholder="Connection name" value={form.name} onChange={set('name')} />
              <div className="row"><input placeholder="Host" value={form.host} onChange={set('host')} /><input className="port" placeholder="Port" value={form.port} onChange={set('port')} /></div>
              <input placeholder={form.type === 'oracle' ? 'Service name (e.g. FREEPDB1)' : 'Database'} value={form.database} onChange={set('database')} />
              <div className="row"><input placeholder="User" value={form.user} onChange={set('user')} /><input type="password" placeholder={form.id ? '(unchanged)' : 'Password'} value={form.password} onChange={set('password')} /></div>
              <h4>Security</h4>
              <div className="ro">🔒 Read-only: every session is opened read-only and only reads catalog metadata — never table data.</div>
              <select value={form.tls} onChange={set('tls')} title="Transport encryption">
                <option value="off">TLS: off</option>
                <option value="verify">TLS: on — verify certificate{form.type === 'oracle' ? ' (TCPS)' : ''}</option>
                <option value="noverify">TLS: on — {form.type === 'oracle' ? 'skip server name check (chain still validated)' : 'do not verify certificate (not recommended)'}</option>
              </select>
              {form.tls === 'verify' && form.type === 'oracle' && <small className="hint">The server certificate is checked against the certificate authorities the server trusts (a public CA such as OCI's works as is). Wallets are not supported.</small>}
              {form.tls === 'verify' && form.type === 'postgres' && (<>
                <textarea className="pem" placeholder={form.hasCa && !form.clearCa ? '(CA certificate saved — paste a new PEM to replace)' : 'CA certificate (PEM) — only needed for a private/self-signed CA'} value={form.caPem} onChange={set('caPem')} />
                <div className="hint"><label className="link">Load .pem file<input type="file" accept=".pem,.crt,.cer" hidden onChange={(e) => { loadPem(e.target.files[0]); e.target.value = ''; }} /></label>{form.hasCa && !form.clearCa && <> · <a onClick={() => setForm({ ...form, clearCa: true, caPem: '' })}>Remove saved CA</a></>}{form.clearCa && ' · saved CA will be removed on Save'}</div>
              </>)}
              {form.type === 'oracle' && form.tls === 'verify' && <input placeholder="Expected server certificate DN (optional)" value={form.serverDn} onChange={set('serverDn')} />}
              <label className="chk"><input type="checkbox" checked={!!form.blockWritable} onChange={set('blockWritable')} /> Block credentials with write privileges (strict)</label>
              <h4>Keep metadata fresh</h4>
              <select value={form.refreshMinutes} onChange={set('refreshMinutes')}>{REFRESH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <small className="hint">Runs while this page is open, for the connection linked after an import. Refresh keeps your TableGroups and table positions; other manual edits to imported tables are replaced.</small>
              </fieldset>
              <div className="row">
                <button onClick={test} disabled={!!busy}>{busy === 'test' ? 'Connecting…' : 'Test connection'}</button>
                {!form.shared && <button onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>}
              </div>
              {warnings.length > 0 && (
                <div className="warn"><b>⚠ This credential has more access than a diagram needs</b>
                  <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                  <small>Sessions stay read-only, but prefer a dedicated user with SELECT on the catalog only.</small></div>
              )}
              {schemas.length > 0 && (<>
                <h4>Schemas to import <a onClick={() => setPicked(schemas)}>all</a> · <a onClick={() => setPicked([])}>none</a></h4>
                <div className="schemas">
                  {schemas.map((s) => (
                    <label key={s} className="chk"><input type="checkbox" checked={picked.includes(s)} onChange={(e) => setPicked(e.target.checked ? [...picked, s] : picked.filter((x) => x !== s))} /> {s}</label>
                  ))}
                </div>
                <h4>Tables {tableSel.length > 0 && <a onClick={() => setTableSel([])}>clear</a>}</h4>
                <button disabled={!picked.length || !!busy} onClick={loadTables}>{busy === 'tables' ? 'Loading…' : tableSel.length ? `${tableSel.length} table(s) selected${tableGroups?.length ? ` · ${tableGroups.length} group(s)` : ''} — change…` : 'All tables — choose specific ones…'}</button>
                {fullDdl && <small className="hint">Views and materialized views are imported with their full CREATE statement.</small>}
                <button className="primary" disabled={!picked.length || !!busy} onClick={importNow}>{busy === 'import' ? 'Importing…' : `Import ${picked.length} schema(s) → diagram`}</button>
              </>)}
            </div>
          )}

          {drawer === 'import' && (
            <div className="dbody">
              <h4>Format</h4>
              <select value={sqlFmt} onChange={(e) => setSqlFmt(e.target.value)}>
                <option value="postgres">PostgreSQL SQL</option><option value="mysql">MySQL SQL</option><option value="mssql">SQL Server SQL</option>
                <option value="snowflake">Snowflake SQL</option><option value="dbml">DBML</option>
              </select>
              <label className={`drop ${drag ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); importFile(e.dataTransfer.files[0]); }}>
                Drop a .sql / .dbml file here<br /><small>or click to browse</small>
                <input type="file" accept=".sql,.txt,.dbml" hidden onChange={(e) => { importFile(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <h4>…or paste</h4>
              <textarea className="paste" placeholder="CREATE TABLE …" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <button className="primary" disabled={!paste.trim()} onClick={() => importText(paste)}>Convert to diagram</button>
              <small className="hint">Oracle SQL files are not supported by the parser — use Database → Oracle to import live.</small>
            </div>
          )}

          {drawer === 'view' && (
            <div className="dbody">
              <h4>Theme</h4>
              <div className="seg">
                {[['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => (
                  <button key={v} className={view.theme === v ? 'on' : ''} onClick={() => setView({ ...view, theme: v })}>{l}</button>
                ))}
              </div>
              <label className="chk"><input type="checkbox" checked={view.grid} onChange={(e) => setView({ ...view, grid: e.target.checked })} /> Show background grid</label>
              <h4>Editor</h4>
              <label className="chk"><input type="checkbox" checked={!!view.wrap} onChange={(e) => setView({ ...view, wrap: e.target.checked })} /> Wrap long lines (no horizontal scroll)</label>
              <small className="hint">Drag the edge between the editor and the diagram to resize it; double-click the edge to reset.</small>
              <h4>Relationship lines</h4>
              <div className="seg">
                {[['default', 'Curved'], ['smoothstep', 'Rounded'], ['step', 'Step'], ['straight', 'Straight']].map(([v, l]) => (
                  <button key={v} className={view.edgeType === v ? 'on' : ''} onClick={() => setView({ ...view, edgeType: v })}>{l}</button>
                ))}
              </div>
              <h4>Detail level</h4>
              <div className="seg">
                {[['full', 'Full'], ['names', 'Names'], ['keys', 'Keys'], ['tables', 'Tables']].map(([v, l]) => (
                  <button key={v} className={(view.detail || 'full') === v ? 'on' : ''} onClick={() => setView({ ...view, detail: v })} title={{ full: 'All columns, types and indexes', names: 'All columns, without types and indexes', keys: 'Only primary and foreign key columns', tables: 'Only table names' }[v]}>{l}</button>
                ))}
              </div>
              <h4>Tables</h4>
              <label className="chk"><input type="checkbox" checked={view.hideTypes} onChange={(e) => setView({ ...view, hideTypes: e.target.checked })} /> Hide column types</label>
              <label className="chk"><input type="checkbox" checked={view.hiRefs} onChange={(e) => setView({ ...view, hiRefs: e.target.checked })} /> Highlight relationships (show names)</label>
              <label className="chk"><input type="checkbox" checked={lineageOn} onChange={(e) => setView({ ...view, lineage: e.target.checked })} /> Show data lineage (dashed arrows)</label>
              <label className="chk"><input type="checkbox" checked={notesOn} onChange={(e) => setView({ ...view, notes: e.target.checked })} /> Show sticky notes</label>
              <label className="chk"><input type="checkbox" checked={view.hideIndexes} onChange={(e) => setView({ ...view, hideIndexes: e.target.checked })} /> Hide indexes</label>
              <label className="chk"><input type="checkbox" checked={view.snap} onChange={(e) => setView({ ...view, snap: e.target.checked })} /> Snap to grid</label>
              <small className="hint">Click a table to highlight its relationships. Header color: <code>Table t [headercolor: #3498DB]</code>.</small>
            </div>
          )}
        </aside>
      </div>

      {conflict && (
        <div className="admin">
          <div className="admin-card conflict" role="alertdialog" aria-label="Edit conflict">
            <div className="dbody">
              <h3>Someone else saved this diagram</h3>
              <p>{conflict.by ? `${conflict.by} saved version ${conflict.version} ${ago(conflict.at * 1000)}.` : `A newer version (${conflict.version}) was saved.`} Your changes since you opened it are not saved yet; they are still in the editor.</p>
              <button onClick={() => { setConflict(null); if (shared) setUnlockTick((n) => n + 1); else openDiagram(doc.id).catch((e) => notify('err', errMsg(e))); }}>Load the latest version (discard my changes)</button>
              <button className="primary" onClick={() => { verRef.current = conflict.version; overwriteRef.current = true; setConflict(null); }}>Keep my changes (overwrite theirs)</button>
              {!shared && <small className="hint">Their version stays in History, so nothing is lost.</small>}
            </div>
          </div>
        </div>
      )}
      {picker && tableList && <TablePicker items={tableList} selected={tableSel} groups={tableGroups ?? parsed.groups ?? []} ddl={fullDdl} onClose={() => setPicker(false)} onApply={({ tables, groups, ddl }) => { setTableSel(tables); setTableGroups(groups); setFullDdl(ddl); setPicker(false); }} />}
      {showAdmin && user?.role === 'admin' && <Admin me={user} notify={notify} onClose={() => setShowAdmin(false)} onSettings={onOrg} />}
      {toast && <div className={`toast ${toast.type}`} role={toast.type === 'err' ? 'alert' : 'status'} onClick={() => setToast(null)}>{toast.text}</div>}
    </div>
  );
}

export default function App() {
  const shareToken = (/^\/s\/([\w-]+)\/?$/.exec(window.location.pathname) || [])[1];
  const [me, setMe] = useState(undefined); // undefined = still checking the session
  const [info, setInfo] = useState({ signup: false, firstRun: false, org: '', groups: [] });
  const [askLogin, setAskLogin] = useState(false);
  const loadMe = useCallback(() => api('auth/me').then((r) => { setMe(r.user); setInfo({ signup: r.signup, firstRun: r.firstRun, org: r.org, groups: r.groups }); }).catch(() => setMe(null)), []);
  useEffect(() => { loadMe(); }, [loadMe]);

  if (me === undefined) return <div className="splash">Loading…</div>;
  if (me?.mustChangePassword) return <PasswordForm forced org={info.org} onDone={loadMe} />;
  if (!me && (!shareToken || askLogin)) {
    return <AuthScreen signup={info.signup} firstRun={info.firstRun} org={info.org} hint={shareToken ? 'Sign in to comment or edit shared diagrams.' : undefined}
      onDone={() => { setAskLogin(false); loadMe(); }} onCancel={shareToken ? () => setAskLogin(false) : undefined} />;
  }
  const logout = async () => { try { await api('auth/logout', {}); } catch { /* already signed out */ } setMe(null); loadMe(); };
  return (
    <ReactFlowProvider>
      <Workspace key={`${me?.id ?? 'anon'}:${shareToken ?? ''}`} user={me} groups={info.groups} org={info.org} shareToken={shareToken}
        onLogin={() => setAskLogin(true)} onLogout={logout} onUser={loadMe} onOrg={(org) => setInfo((i) => ({ ...i, org }))} />
    </ReactFlowProvider>
  );
}
