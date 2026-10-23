// Servidor de login FALSO, só para testes locais. Imita os endpoints do
// Supabase Auth usados pelo painel (/auth/v1/token, /user, /logout).
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

createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, 'http://x');

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
  if (req.method === 'POST' && url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
  send(res, 404, { msg: 'not found (mock)' });
}).listen(54331, () => console.log('mock auth em http://localhost:54331'));
