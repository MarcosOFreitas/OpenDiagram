// Outbound policy for database hosts users can type (SSRF guard).
//   DB_HOST_POLICY=open        (default, local use) any host
//   DB_HOST_POLICY=public-only reject hosts that resolve to loopback / private / link-local / CGNAT addresses
//   DB_HOST_POLICY=allowlist   only hosts listed in DB_HOST_ALLOWLIST (comma separated, exact names)
import dns from 'node:dns/promises';
import net from 'node:net';

const forbidden = (msg) => Object.assign(new Error(msg), { statusCode: 403 });

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  // IPv6 in one spelling first: the URL parser compresses it and writes an embedded IPv4 in hex (0:0:0:0:0:0:0:1 and 0::1 -> ::1,
  // ::ffff:127.0.0.1 -> ::ffff:7f00:1); a typed address in another spelling slipped past the check below. Unparsable (a zone id): refused.
  let v;
  try { v = new URL(`http://[${ip}]/`).hostname.slice(1, -1); } catch { return true; }
  const mapped = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) { const [h, l] = mapped.slice(1).map((x) => parseInt(x, 16)); return isPrivateIp(`${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`); }
  return v === '::1' || v === '::' || /^(fe[89a-f]|fc|fd|ff)/.test(v); // loopback, unspecified, link- and site-local, unique local, multicast
}

// With public-only it returns the address it checked: the drivers connect to that address, so a second lookup by the driver cannot
// answer a private one (DNS rebinding). Otherwise nothing: open and allowlist connect by name.
export async function assertHostAllowed(host, env = process.env, lookup = (h) => dns.lookup(h, { all: true })) {
  const mode = env.DB_HOST_POLICY || 'open';
  if (mode === 'open') return;
  const h = String(host).toLowerCase();
  if (mode === 'allowlist') {
    const allow = (env.DB_HOST_ALLOWLIST || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!allow.includes(h)) throw forbidden(`host "${host}" is not in this server's allowlist`);
    return;
  }
  const addrs = net.isIP(h) ? [{ address: h }] : await lookup(h).catch(() => { throw forbidden(`cannot resolve host "${host}"`); });
  if (addrs.some((a) => isPrivateIp(a.address))) throw forbidden('this server only connects to public database hosts');
  return addrs[0].address;
}
