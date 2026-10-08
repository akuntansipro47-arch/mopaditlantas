#!/usr/bin/env bash
# Tahap 2 (fix) — Deploy Supabase self-hosted. Aman dijalankan ulang (idempotent).
set -euo pipefail

DOCKER_DIR=/opt/supabase/supabase/docker
GEN_KEYS=/root/mopaditlantas/migration/gen_jwt_keys.mjs

cd "$DOCKER_DIR"

echo '== Regenerasi .env dari contoh =='
cp .env .env.bak.$(date +%s) 2>/dev/null || true
cp .env.example .env

POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$(openssl rand -hex 12)
SECRET_KEY_BASE=$(openssl rand -base64 48 | tr -d '\n')
VAULT_ENC_KEY=$(openssl rand -hex 24)
PG_META_CRYPTO_KEY=$(openssl rand -hex 24)
LOGFLARE_API_KEY=$(openssl rand -hex 24)

echo '== Generate JWT keys =='
KEYS=$(node "$GEN_KEYS" "$JWT_SECRET")
ANON_KEY=$(echo "$KEYS" | grep '^ANON_KEY=' | cut -d= -f2-)
SERVICE_ROLE_KEY=$(echo "$KEYS" | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2-)

if [ -z "$ANON_KEY" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo 'GAGAL generate JWT keys'; exit 1
fi

set_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

set_kv POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
set_kv JWT_SECRET "$JWT_SECRET"
set_kv ANON_KEY "$ANON_KEY"
set_kv SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
set_kv DASHBOARD_USERNAME "$DASHBOARD_USERNAME"
set_kv DASHBOARD_PASSWORD "$DASHBOARD_PASSWORD"
set_kv SECRET_KEY_BASE "$SECRET_KEY_BASE"
set_kv VAULT_ENC_KEY "$VAULT_ENC_KEY"
set_kv PG_META_CRYPTO_KEY "$PG_META_CRYPTO_KEY"
set_kv LOGFLARE_API_KEY "$LOGFLARE_API_KEY"
set_kv API_EXTERNAL_URL "http://localhost:8000"
set_kv SITE_URL "http://localhost:3000"
set_kv SUPABASE_PUBLIC_URL "http://localhost:8000"

echo '== Verifikasi key penting di .env =='
grep -E '^(POSTGRES_PASSWORD|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY)=' .env | cut -c1-45

echo '== Pull images (bisa beberapa menit) =='
docker compose pull

echo '== Jalankan stack =='
docker compose up -d

echo
echo '== Status =='
docker compose ps --format 'table {{.Name}}\t{{.Status}}' | head -20

echo
echo '================ SIMPAN INFORMASI INI ================='
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo "ANON_KEY=$ANON_KEY"
echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
echo "DASHBOARD: http://IP_VPS:3000 (user: admin, pass: $DASHBOARD_PASSWORD)"
echo '========================================================'
echo 'SETUP_SUPABASE_OK'
