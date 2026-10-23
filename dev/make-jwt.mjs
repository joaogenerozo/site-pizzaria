// Gera JWTs HS256 para o ambiente LOCAL de desenvolvimento (nunca use em produção).
import { createHmac } from 'node:crypto';
export const LOCAL_JWT_SECRET = 'local-dev-secret-only-for-tests-0123456789abcdef';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function signJwt(payload, secret = LOCAL_JWT_SECRET) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, ...payload });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
if (process.argv[1] && process.argv[1].endsWith('make-jwt.mjs')) {
  console.log(signJwt({ role: process.argv[2] || 'anon', ...(process.argv[3] ? { sub: process.argv[3] } : {}) }));
}
