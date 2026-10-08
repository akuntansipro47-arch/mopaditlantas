#!/usr/bin/env bash
# Tahap 2 — Deploy Supabase self-hosted (Docker Compose) di VPS.
# Jalankan sebagai root:  bash 02_supabase_setup.sh
set -euo pipefail

INSTALL_DIR=/opt/supabase

echo '== Clone repo resmi Supabase =='
if [ ! -d "$INSTALL_DIR/supabase" ]; then
  mkdir -p "$INSTALL_DIR"
  git clone --depth 1 https://github.com/supabase/supabase "$INSTALL_DIR/supabase"
fi
cd "$INSTALL_DIR/supabase/docker"

echo '== Siapkan .env =='
if [ ! -f .env ]; then
  cp .env.example .env

  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 32)
  DASHBOARD_USERNAME=admin
  DASHBOARD_PASSWORD=$(openssl rand -hex 12)
  SECRET_KEY_BASE=$(openssl rand -base64 48 | tr -d '\n')
  VAULT_ENC_KEY=$(openssl rand -hex 24)
  PG_META_CRYPTO_KEY=$(openssl rand -hex 24)
  LOGFLARE_API_KEY=$(openssl rand -hex 24)

  KEYS=$(node /dev/stdin <<'NODE' "$JWT_SECRET"
const crypto = require('crypto');
const secret = process.argv[2];
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (p, k) => {
  const h = b64u({ alg: 'HS256', typ: 'JWT' });
  const b = b64u(p);
  return h + '.' + b + '.' + crypto.createHmac('sha256', k).update(h + '.' + b).digest('base64url');
};
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 3600;
console.log('ANON_KEY=' + sign({ role: 'anon', iss: 'supabase', iat, exp }, secret));
console.log('SERVICE_ROLE_KEY=' + sign({ role: 'service_role', iss: 'supabase', iat, exp }, secret));
NODE
)
  ANON_KEY=$(echo "$KEYS" | grep '^ANON_KEY=' | cut -d= -f2-)
  SERVICE_ROLE_KEY=$(echo "$KEYS" | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2-)

  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
  sed -i "s|^ANON_KEY=.*|ANON_KEY=$ANON_KEY|" .env
  sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|" .env
  sed -i "s|^DASHBOARD_USERNAME=.*|DASHBOARD_USERNAME=$DASHBOARD_USERNAME|" .env
  sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD|" .env
  sed -i "s|^SECRET_KEY_BASE=.*|SECRET_KEY_BASE=$SECRET_KEY_BASE|" .env
  sed -i "s|^VAULT_ENC_KEY=.*|VAULT_ENC_KEY=$VAULT_ENC_KEY|" .env
  sed -i "s|^PG_META_CRYPTO_KEY=.*|PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY|" .env
  sed -i "s|^LOGFLARE_API_KEY=.*|LOGFLARE_API_KEY=$LOGFLARE_API_KEY|" .env
  # API publik akan dilewatkan lewat Caddy di port 443; Kong tetap di 8000 lokal.
  sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=http://localhost:8000|" .env
  sed -i "s|^SITE_URL=.*|SITE_URL=http://localhost:3000|" .env
  sed -i "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=http://localhost:8000|" .env
else
  echo '.env sudah ada, memakai konfigurasi yang ada.'
fi

echo '== Pull images (bisa beberapa menit) =='
docker compose pull

echo '== Jalankan stack =='
docker compose up -d

echo
echo '== Status =='
docker compose ps

POSTGRES_PASSWORD_SHOW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
ANON_KEY_SHOW=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
SERVICE_ROLE_SHOW=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-)
DASH_PASS_SHOW=$(grep '^DASHBOARD_PASSWORD=' .env | cut -d= -f2-)

echo
echo '================ SIMPAN INFORMASI INI ================='
echo "Postgres password : $POSTGRES_PASSWORD_SHOW"
echo "ANON_KEY          : $ANON_KEY_SHOW"
echo "SERVICE_ROLE_KEY  : $SERVICE_ROLE_SHOW"
echo "Studio dashboard  : http://<IP_VPS>:3000  (user: admin, pass: $DASH_PASS_SHOW)"
echo '========================================================'
