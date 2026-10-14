// Outbound policy for database hosts users can type (SSRF guard).
//   DB_HOST_POLICY=open        (default, local use) any host
//   DB_HOST_POLICY=public-only reject hosts that resolve to loopback / private / link-local / CGNAT addresses
//   DB_HOST_POLICY=allowlist   only hosts listed in DB_HOST_ALLOWLIST (comma separated, exact names)
import dns from 'node:dns/promises';
import net from 'node:net';

const forbidden = (msg) => Object.assign(new Error(msg), { statusCode: 403 });

export function isPrivateIp(ip) {
  if (ip.startsWith('::ffff:')) return isPrivateIp(ip.slice(7));
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('fc') || v.startsWith('fd');
}

export async function assertHostAllowed(host, env = process.env) {
  const mode = env.DB_HOST_POLICY || 'open';
  if (mode === 'open') return;
  const h = String(host).toLowerCase();
  if (mode === 'allowlist') {
    const allow = (env.DB_HOST_ALLOWLIST || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!allow.includes(h)) throw forbidden(`host "${host}" is not in this server's allowlist`);
    return;
  }
  const addrs = net.isIP(h) ? [{ address: h }] : await dns.lookup(h, { all: true }).catch(() => { throw forbidden(`cannot resolve host "${host}"`); });
  if (addrs.some((a) => isPrivateIp(a.address))) throw forbidden('this server only connects to public database hosts');
}
