// password of a protected share link: kept for this browser tab only
export const sharePassword = (token, v) => { try { if (v === undefined) return sessionStorage.getItem(`sp:${token}`); sessionStorage.setItem(`sp:${token}`, v); } catch { return null; } };
export const api = async (path, body, method = body !== undefined ? 'POST' : 'GET') => {
  const sp = path.startsWith('shared/') ? sharePassword(path.split('/')[1]) : null;
  const r = await fetch(`/api/${path}`, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(sp ? { 'x-share-password': encodeURIComponent(sp) } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status, code: j.code, version: j.version });
  return j;
};

export const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } };
export const errMsg = (e) => e?.diags?.map((d) => `line ${d.location?.start?.line ?? '?'}: ${d.message ?? 'syntax error'}`).join('\n') || e?.message || String(e);
export const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
// copies text and tells the person (notify(type, text)); one message for a blocked clipboard
export const copyText = (text, okMsg, notify) => navigator.clipboard.writeText(text).then(() => notify('ok', okMsg), () => notify('err', 'Clipboard blocked'));
