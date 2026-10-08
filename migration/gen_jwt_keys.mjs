// Generate ANON_KEY & SERVICE_ROLE_KEY (JWT HS256) untuk Supabase self-hosted.
// Pemakaian:  node gen_jwt_keys.mjs <JWT_SECRET>
// Tidak butuh dependency eksternal (hanya crypto bawaan Node).
import crypto from 'node:crypto';

const secret = process.argv[2];
if (!secret || secret.length < 16) {
  console.error('Pemakaian: node gen_jwt_keys.mjs <JWT_SECRET_min_16_karakter>');
  process.exit(1);
}

const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function sign(payload, key) {
  const header = b64u({ alg: 'HS256', typ: 'JWT' });
  const body = b64u(payload);
  const sig = crypto.createHmac('sha256', key).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 3600; // 10 tahun

console.log('ANON_KEY=' + sign({ role: 'anon', iss: 'supabase', iat, exp }, secret));
console.log('SERVICE_ROLE_KEY=' + sign({ role: 'service_role', iss: 'supabase', iat, exp }, secret));
