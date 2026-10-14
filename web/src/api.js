export const api = async (path, body, method = body !== undefined ? 'POST' : 'GET') => {
  const r = await fetch(`/api/${path}`, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
};

export const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } };
export const errMsg = (e) => e?.diags?.map((d) => `line ${d.location?.start?.line ?? '?'}: ${d.message ?? 'syntax error'}`).join('\n') || e?.message || String(e);
export const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
