import Fastify from 'fastify';
import fstatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';
import { listSchemas, importModel, privilegeWarnings } from './introspect.js';
import { toDbml } from './dbml.js';

const app = Fastify({ logger: true });
const bad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });

// saved connection (if `id`) overlaid with the draft fields from the form; empty values keep the stored ones
function resolve(b) {
  const saved = b.id ? store.get(b.id) : {};
  if (b.id && !saved) throw bad('connection not found', 404);
  const draft = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const c = { ...saved, ...draft };
  if (!['postgres', 'oracle'].includes(c.type)) throw bad('type must be postgres or oracle');
  if (!c.host || !c.database || !c.user) throw bad('host, database and user are required');
  c.tls = ['off', 'verify', 'noverify'].includes(c.tls) ? c.tls : c.ssl ? 'noverify' : 'off';
  return c;
}

// a failed check is itself a warning: never silently treat "could not verify" as "safe"
const checkPrivileges = (c, schemas) => privilegeWarnings(c, schemas).catch((e) => [`could not verify privileges (${String(e.message).split('\n')[0]})`]);

app.get('/api/health', () => ({ ok: true }));
app.get('/api/connections', () => store.list());
app.post('/api/connections', (req) => ({ id: store.upsert(req.body) }));
app.get('/api/comments', () => store.getComments());
app.put('/api/comments', (req) => store.setComments(req.body));
app.delete('/api/connections/:id', (req) => (store.remove(req.params.id), { ok: true }));

// test + list schemas; also reports credentials that can do more than read metadata
app.post('/api/schemas', async (req) => {
  const c = resolve(req.body);
  const schemas = await listSchemas(c);
  return { schemas, warnings: await checkPrivileges(c, schemas), readOnly: true };
});

app.post('/api/import', async (req) => {
  const { schemas, tables } = req.body;
  if (!schemas?.length) throw bad('select at least one schema');
  const c = resolve(req.body);
  const warnings = await checkPrivileges(c, schemas);
  if (warnings.length && c.blockWritable) throw bad(`Blocked by guardrail: this credential ${warnings.join('; ')}. Use a read-only user, or turn off "Block credentials with write privileges".`, 403);
  const model = await importModel(c, schemas, tables);
  return { dbml: toDbml(model), tables: model.tables.length, refs: model.refs.length, warnings, at: Date.now() };
});

app.setErrorHandler((e, _req, reply) => reply.status(e.statusCode || 500).send({ error: e.message }));
app.register(fstatic, { root: fileURLToPath(new URL('../public', import.meta.url)) });

await app.listen({ port: +process.env.PORT || 3000, host: '0.0.0.0' });
