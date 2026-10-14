// Presence: who has a diagram open right now. Kept in memory only (a restart empties it; clients beat every few seconds and it fills up again).
// Each open tab sends a heartbeat; an entry that stays silent for TTL is gone. One person with several tabs is shown once.
const TTL = 15_000, MAX_PER_DIAGRAM = 200;
const rooms = new Map(); // diagram id -> Map(tab id -> entry)

const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa5a8', '#d2338f', '#7a9a01', '#9a6324', '#5b6dc8'];
const colorOf = (key) => { let h = 0; for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

// who: { key, name } (key = account id, or the tab for anonymous visitors); state: { sel, editing }. Returns the other people on the diagram.
export function beat(diagramId, tab, who, state = {}, leave = false, now = Date.now()) {
  let room = rooms.get(diagramId);
  if (leave) { room?.delete(tab); if (room && !room.size) rooms.delete(diagramId); return others(diagramId, who.key, now); }
  if (!room) rooms.set(diagramId, (room = new Map()));
  for (const [t, e] of room) if (now - e.at > TTL) room.delete(t);
  if (room.size < MAX_PER_DIAGRAM || room.has(tab)) {
    room.set(tab, { key: who.key, name: who.name, sel: typeof state.sel === 'string' ? state.sel.slice(0, 200) : null, editing: state.editing === true, at: now });
  }
  return others(diagramId, who.key, now);
}

export function others(diagramId, selfKey, now = Date.now()) {
  const byPerson = new Map();
  for (const e of rooms.get(diagramId)?.values() ?? []) {
    if (now - e.at > TTL || e.key === selfKey) continue;
    const prev = byPerson.get(e.key);
    if (!prev || e.at > prev.at) byPerson.set(e.key, e); // several tabs: the most recent one speaks for the person
  }
  return [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name)).map((e) => ({ id: String(e.key), name: e.name, color: colorOf(e.key), sel: e.sel, editing: e.editing }));
}

// housekeeping: drop rooms nobody beats in any more
setInterval(() => { const now = Date.now(); for (const [id, room] of rooms) { for (const [t, e] of room) if (now - e.at > TTL) room.delete(t); if (!room.size) rooms.delete(id); } }, 60_000).unref();
