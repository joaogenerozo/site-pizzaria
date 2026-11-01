// Servidor de login FALSO, só para testes locais. Imita os endpoints do
// Supabase Auth usados pelo painel (/auth/v1/token, /user, /recover, /logout)
// e o Storage das fotos (/storage/v1/object/...).
// Em produção quem faz isso é o próprio Supabase.
import { createServer } from 'node:http';
import { signJwt } from './make-jwt.mjs';

export const USERS = {
  'admin@teste.local': { id: '11111111-1111-1111-1111-111111111111', password: 'senha-admin-local' },
  'cliente@teste.local': { id: '22222222-2222-2222-2222-222222222222', password: 'senha-cliente-local' },
};

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const userObj = (email, u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() });
const session = (email, u) => ({
  access_token: signJwt({ sub: u.id, role: 'authenticated', email, aud: 'authenticated' }),
  token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: `refresh-${email}`, user: userObj(email, u),
});

// Storage FALSO (bucket menu-images em memória): envio, leitura pública e exclusão das fotos do painel.
const files = new Map(); // caminho -> { type, data }
const adminFrom = (req) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try { return JSON.parse(Buffer.from(token.split('.')[1] || 'e30', 'base64url').toString()).sub === USERS['admin@teste.local'].id; } catch { return false; }
};
// O supabase-js manda o arquivo como multipart/form-data; pega a parte com o arquivo.
function fileFrom(req, buf) {
  const type = req.headers['content-type'] || '';
  const boundary = /boundary=(.+)$/.exec(type)?.[1];
  if (!boundary) return { type, data: buf };
  for (const part of buf.toString('latin1').split(`--${boundary}`)) {
    const [head, ...rest] = part.split('\r\n\r\n');
    const ct = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1];
    if (ct && /^image\//.test(ct)) return { type: ct, data: Buffer.from(rest.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1') };
  }
  return null;
}
function storage(req, res, buf, url) {
  const m = /^\/storage\/v1\/object\/(public\/)?menu-images\/?(.*)$/.exec(url.pathname);
  if (!m) return false;
  const path = decodeURIComponent(m[2]);
  if (req.method === 'GET' && m[1]) {
    const f = files.get(path);
    if (!f) send(res, 404, { message: 'Object not found' });
    else { res.writeHead(200, { 'Content-Type': f.type }); res.end(f.data); }
  } else if (!adminFrom(req)) {
    send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
  } else if (req.method === 'POST' && path) {
    const f = fileFrom(req, buf);
    if (!f || !f.data.length) send(res, 400, { statusCode: '400', error: 'Bad request', message: 'Empty file' });
    else if (f.data.length > 2097152) send(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    else { files.set(path, f); send(res, 200, { Key: `menu-images/${path}`, Id: path }); }
  } else if (req.method === 'DELETE') {
    const gone = (JSON.parse(buf.toString() || '{}').prefixes || []).filter((p) => files.delete(p));
    send(res, 200, gone.map((name) => ({ name })));
  } else send(res, 404, { msg: 'not found (mock storage)' });
  return true;
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://x');
  if (storage(req, res, buf, url)) return;
  const raw = buf.toString();
  const body = raw ? JSON.parse(raw) : {};

  if (req.method === 'POST' && url.pathname === '/auth/v1/token') {
    if (url.searchParams.get('grant_type') === 'password') {
      const u = USERS[body.email];
      if (!u || u.password !== body.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return send(res, 200, session(body.email, u));
    }
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const email = String(body.refresh_token || '').replace(/^refresh-/, '');
      const u = USERS[email];
      return u ? send(res, 200, session(email, u)) : send(res, 400, { error: 'invalid_grant' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || 'e30', 'base64url').toString());
    const entry = Object.entries(USERS).find(([, u]) => u.id === payload.sub);
    return entry ? send(res, 200, userObj(entry[0], entry[1])) : send(res, 401, { msg: 'invalid token' });
  }
  // "Esqueci minha senha": o Supabase mandaria o e-mail; aqui só responde OK
  if (req.method === 'POST' && url.pathname === '/auth/v1/recover') return send(res, 200, {});
  // Troca de senha pelo link do e-mail (não altera USERS, para não afetar os outros testes)
  if (req.method === 'PUT' && url.pathname === '/auth/v1/user') {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || 'e30', 'base64url').toString());
    const entry = Object.entries(USERS).find(([, u]) => u.id === payload.sub);
    if (!entry) return send(res, 401, { msg: 'invalid token' });
    if (String(body.password || '').length < 8) return send(res, 422, { code: 'weak_password', msg: 'Password should be at least 8 characters.' });
    return send(res, 200, userObj(entry[0], entry[1]));
  }
  if (req.method === 'POST' && url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
  send(res, 404, { msg: 'not found (mock)' });
}).listen(54331, () => console.log('mock auth em http://localhost:54331'));
