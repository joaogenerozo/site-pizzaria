// Substituto MÍNIMO do PostgREST, só para testes locais quando o binário do
// PostgREST não está instalado. Cobre o que o site e o painel usam: select com
// colunas, filtros eq/neq/in/is, order, limit, count, insert/upsert, update,
// delete, objeto único (.single) e /rpc/. Cada requisição roda como o papel do
// JWT (anon ou authenticated), então o RLS do banco vale igual à produção.
//
//   PGPASSWORD=... node dev/mini-postgrest.mjs     (porta 54330, banco "dev")
//
// Requer o pacote "pg" (npm install --no-save pg). Nunca use em produção.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { LOCAL_JWT_SECRET } from './make-jwt.mjs';

const pool = new pg.Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'dev',
  max: 4,
});
// dev/reset-db.sh recria o banco e derruba as conexões abertas: o pool só descarta a conexão
pool.on('error', () => {});
// Tipos devolvidos como texto, igual ao PostgREST (numeric "35.00", time "18:00:00")
pg.types.setTypeParser(1700, (v) => Number(v));

const IDENT = /^[a-z_][a-z0-9_]*$/;
const q = (id) => {
  if (!IDENT.test(id)) throw httpError(400, 'PGRST100', `identificador inválido: ${id}`);
  return `"${id}"`;
};
function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function roleFrom(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  if (!token) return { role: 'anon', claims: {} };
  const [h, b, s] = token.split('.');
  const sig = createHmac('sha256', LOCAL_JWT_SECRET).update(`${h}.${b}`).digest();
  const given = Buffer.from(s || '', 'base64url');
  if (given.length !== sig.length || !timingSafeEqual(given, sig)) throw httpError(401, 'PGRST301', 'JWT inválido');
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (!['anon', 'authenticated'].includes(claims.role)) throw httpError(401, 'PGRST301', 'papel não permitido');
  return { role: claims.role, claims };
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function where(params, values) {
  const parts = [];
  for (const [col, raw] of params) {
    if (RESERVED.has(col)) continue;
    const [, neg, op, val] = /^(not\.)?([a-z]+)\.(.*)$/s.exec(raw) || [];
    if (!op) throw httpError(400, 'PGRST100', `filtro inválido: ${col}=${raw}`);
    let sql;
    if (op === 'eq' || op === 'neq' || op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
      values.push(val);
      sql = `${q(col)} ${{ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op]} $${values.length}`;
    } else if (op === 'in') {
      const list = val.replace(/^\(|\)$/g, '').split(',').filter(Boolean).map((v) => v.replace(/^"|"$/g, ''));
      values.push(list);
      sql = `${q(col)} = any($${values.length})`;
    } else if (op === 'is') {
      sql = `${q(col)} is ${{ null: 'null', true: 'true', false: 'false' }[val] ?? 'null'}`;
    } else if (op === 'ilike' || op === 'like') {
      values.push(val.replace(/\*/g, '%'));
      sql = `${q(col)} ${op} $${values.length}`;
    } else throw httpError(400, 'PGRST100', `operador não suportado: ${op}`);
    parts.push(neg ? `not (${sql})` : sql);
  }
  return parts.length ? ` where ${parts.join(' and ')}` : '';
}
const columns = (sel) => (!sel || sel === '*' ? '*' : sel.split(',').map((c) => q(c.trim())).join(', '));
function orderBy(order) {
  if (!order) return '';
  return ` order by ${order.split(',').map((o) => {
    const [col, ...mods] = o.split('.');
    return [q(col), ...mods.map((m) => ({ asc: 'asc', desc: 'desc', nullsfirst: 'nulls first', nullslast: 'nulls last' }[m] || ''))].join(' ');
  }).join(', ')}`;
}

async function asRole(role, claims, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function handle(req, url, body) {
  const { role, claims } = roleFrom(req);
  const path = url.pathname.replace(/^\/+/, '');
  const prefer = req.headers.prefer || '';
  const p = url.searchParams;

  if (path.startsWith('rpc/')) {
    const fn = path.slice(4);
    return asRole(role, claims, async (c) => {
      const meta = await c.query('select proretset from pg_proc where proname = $1 and pronamespace = \'public\'::regnamespace', [q(fn) && fn]);
      if (!meta.rowCount) throw httpError(404, 'PGRST202', `função ${fn} não encontrada`);
      const args = body && typeof body === 'object' ? Object.entries(body) : [];
      const list = args.map(([k], i) => `${q(k)} => $${i + 1}`).join(', ');
      const vals = args.map(([, v]) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
      if (meta.rows[0].proretset) return { status: 200, json: (await c.query(`select * from public.${q(fn)}(${list})`, vals)).rows };
      const r = await c.query(`select public.${q(fn)}(${list}) as r`, vals);
      return { status: 200, json: r.rows[0].r };
    });
  }

  const table = q(path);
  const values = [];
  const filter = where(p.entries(), values);
  const wantsCount = /count=exact/.test(prefer);
  const returning = /return=representation/.test(prefer) ? ` returning ${columns(p.get('select'))}` : '';

  return asRole(role, claims, async (c) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const lim = p.get('limit') ? ` limit ${Number(p.get('limit'))}` : '';
      const off = p.get('offset') ? ` offset ${Number(p.get('offset'))}` : '';
      const rows = req.method === 'HEAD' ? [] : (await c.query(`select ${columns(p.get('select'))} from public.${table}${filter}${orderBy(p.get('order'))}${lim}${off}`, values)).rows;
      let total = null;
      if (wantsCount) total = Number((await c.query(`select count(*) from public.${table}${filter}`, values)).rows[0].count);
      return { status: 200, json: rows, total };
    }
    if (req.method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const vals = [];
      const tuples = rows.map((r) => `(${cols.map((k) => {
        if (!(k in r)) return 'default';
        vals.push(r[k] !== null && typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]);
        return `$${vals.length}`;
      }).join(', ')})`);
      let conflict = '';
      if (/resolution=(merge|ignore)-duplicates/.test(prefer)) {
        const target = p.get('on_conflict') || (await c.query(`select string_agg(a.attname, ',') k from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = ('public.' || $1)::regclass and i.indisprimary`, [path])).rows[0].k;
        const ignore = /ignore-duplicates/.test(prefer);
        const keys = target.split(',');
        const upd = cols.filter((k) => !keys.includes(k)).map((k) => `${q(k)} = excluded.${q(k)}`).join(', ');
        conflict = ` on conflict (${keys.map(q).join(', ')}) do ${ignore || !upd ? 'nothing' : `update set ${upd}`}`;
      }
      const r = await c.query(`insert into public.${table} (${cols.map(q).join(', ')}) values ${tuples.join(', ')}${conflict}${returning}`, vals);
      return { status: 201, json: returning ? r.rows : null };
    }
    if (req.method === 'PATCH') {
      const sets = Object.entries(body).map(([k, v]) => {
        values.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
        return `${q(k)} = $${values.length}`;
      });
      // os filtros já ocupam $1..$n; os valores do SET entram depois deles
      const r = await c.query(`update public.${table} set ${sets.join(', ')}${filter}${returning}`, values);
      return { status: returning ? 200 : 204, json: returning ? r.rows : null };
    }
    if (req.method === 'DELETE') {
      const r = await c.query(`delete from public.${table}${filter}${returning}`, values);
      return { status: returning ? 200 : 204, json: returning ? r.rows : null };
    }
    throw httpError(405, 'PGRST117', 'método não suportado');
  });
}

const PG_STATUS = { 42501: 403, 23505: 409, 23503: 409, 23514: 400, 23502: 400, '22P02': 400, P0001: 400, 42883: 404 };

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  const url = new URL(req.url, 'http://x');
  const send = (status, json, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(json === null || json === undefined ? '' : JSON.stringify(json));
  };
  if (url.pathname === '/') return send(200, { ok: true });
  let role = 'anon';
  try {
    role = roleFrom(req).role;
    const out = await handle(req, url, raw ? JSON.parse(raw) : null);
    const headers = {};
    if (out.total !== undefined && out.total !== null) headers['Content-Range'] = `${out.json.length ? `0-${out.json.length - 1}` : '*'}/${out.total}`;
    if (/vnd\.pgrst\.object/.test(req.headers.accept || '') && Array.isArray(out.json)) {
      if (out.json.length !== 1) return send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${out.json.length} rows`, hint: null });
      return send(out.status === 201 ? 201 : 200, out.json[0], headers);
    }
    if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }
    send(out.status, out.json, headers);
  } catch (e) {
    const status = e.status || PG_STATUS[e.code] || 400;
    // PostgREST devolve 401 para o visitante sem permissão e 403 para o usuário logado
    const fixed = status === 403 && role === 'anon' ? 401 : status;
    if (process.env.DEBUG) console.error(req.method, req.url, fixed, e.message);
    send(fixed, { code: e.code || 'PGRST000', message: e.message, details: e.detail || null, hint: e.hint || null });
  }
}).listen(54330, () => console.log('mini-postgrest em http://localhost:54330'));
