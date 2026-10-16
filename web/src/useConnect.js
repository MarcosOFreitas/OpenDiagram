import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from './api.js';

export const EMPTY = { type: 'postgres', host: '', port: 5432, database: '', user: '', password: '', name: '', tls: 'off', caPem: '', clearCa: false, serverDn: '', blockWritable: false, refreshMinutes: 0 };

// State and actions of the Database drawer: saved + shared connections, the form, schemas, the table picker and the import.
// The workspace owns what an import changes in the diagram: `onImported(result, source, groups)` is called after a successful import
// (`groups` = the TableGroups defined in the picker, null = keep the diagram's own). `reloadOn` = values that reload the list when they change.
export function useConnect({ shared, notify, docId, source, setSource, setBusy, onImported, reloadOn }) {
  const [conns, setConns] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [schemas, setSchemas] = useState([]);
  const [picked, setPicked] = useState([]);
  const [tableSel, setTableSel] = useState([]); // 'schema.table' entries; empty = all tables
  const [tableList, setTableList] = useState(null); // null = not loaded
  const [picker, setPicker] = useState(false); // table picker dialog
  const [tableGroups, setTableGroups] = useState(null); // TableGroups defined in the picker; null = keep the diagram's current ones
  const [warnings, setWarnings] = useState([]);
  const [fullDdl, setFullDdl] = useState(false); // import views with their full CREATE statement, not only their structure
  useEffect(() => { setTableGroups(null); }, [docId]); // groups belong to the diagram they were edited for
  useEffect(() => { setFullDdl(!!source?.ddl); }, [source?.connId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadConns = useCallback(() => (shared ? Promise.resolve() : api('connections').then(setConns).catch((e) => notify('err', e.message))), [notify, shared]);
  useEffect(() => { loadConns(); }, [loadConns, ...reloadOn]); // eslint-disable-line react-hooks/exhaustive-deps -- also when the Database drawer opens and when Administration closes: a connection registered or shared there appears without a reload

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const run = (label, fn) => async () => { setBusy(label); try { await fn(); } catch (e) { notify('err', errMsg(e)); } finally { setBusy(''); } };

  // form -> API body: secrets left empty keep the stored value, clearCa removes the saved CA
  const body = (extra = {}) => ({ ...form, name: form.name || `${form.type}@${form.host}`, caPem: form.clearCa ? null : form.caPem, ...extra });
  const test = run('test', async () => {
    const r = await api('schemas', body());
    setSchemas(r.schemas); setPicked(r.schemas.length === 1 ? r.schemas : []); setWarnings(r.warnings || []);
    notify(r.warnings?.length ? 'err' : 'ok', `Connected (read-only session) — ${r.schemas.length} schema(s)${r.warnings?.length ? ' · credential has extra privileges!' : ''}`);
  });
  const loadTables = run('tables', async () => {
    const r = await api('tables', { ...body(), schemas: picked });
    setTableList(r.tables.map((t) => ({ name: `${t.schema}.${t.name}`, view: t.view }))); setPicker(true);
  });
  const persist = async (extra = {}) => {
    const { id } = await api('connections', body(extra));
    setForm((f) => ({ ...f, id, password: '', hasCa: f.clearCa ? false : !!f.caPem || !!f.hasCa, caPem: '', clearCa: false }));
    await loadConns();
    return id;
  };
  const save = run('save', async () => { await persist(); notify('ok', 'Connection saved'); });
  const importNow = run('import', async () => {
    const tables = tableSel;
    const id = form.shared ? form.id : await persist({ schemas: picked, tables }); // a shared connection is used as registered: it is never saved (or changed) from here
    const r = await api('import', { id, schemas: picked, tables, ddl: fullDdl });
    setWarnings(r.warnings || []);
    onImported(r, { connId: id, schemas: picked, tables, ddl: fullDdl, at: r.at, gen: r.gen }, tableGroups);
  });
  const listSchemas = async (id) => { // a saved connection that was never imported has no schemas to offer yet: list them, as the Test connection button would
    setBusy('test');
    try { const r = await api('schemas', { id }); setSchemas(r.schemas); setPicked(r.schemas.length === 1 ? r.schemas : []); setWarnings(r.warnings || []); } catch (e) { notify('err', errMsg(e)); } finally { setBusy(''); }
  };
  // the diagram's own import (schemas and tables) wins over what the connection last saved: the same connection can feed several diagrams
  const pick = (c) => { const mine = source?.connId === c.id ? source : null; if (!c.schemas?.length) listSchemas(c.id); setForm({ ...EMPTY, ...c, password: '', caPem: '', clearCa: false }); setSchemas(c.schemas || mine?.schemas || []); setPicked(mine?.schemas?.length ? mine.schemas : c.schemas || []); setTableSel(mine ? mine.tables || [] : c.tables || []); setFullDdl(source?.connId === c.id && !!source.ddl); setTableList(null); setTableGroups(null); setWarnings([]); };
  const del = async (c) => { await api(`connections/${c.id}`, undefined, 'DELETE'); if (form.id === c.id) setForm(EMPTY); if (source?.connId === c.id) setSource(null); loadConns(); };
  const loadPem = async (f) => { if (f) { const t = await f.text(); setForm((x) => ({ ...x, caPem: t, clearCa: false })); } };
  const reset = () => { setForm(EMPTY); setSchemas([]); setPicked([]); setTableSel([]); setTableList(null); setTableGroups(null); setWarnings([]); }; // "+ new"

  return { conns, form, setForm, schemas, picked, setPicked, tableSel, setTableSel, tableList, picker, setPicker, tableGroups, setTableGroups, warnings, setWarnings, fullDdl, setFullDdl, set, test, loadTables, save, importNow, pick, del, loadPem, reset };
}
