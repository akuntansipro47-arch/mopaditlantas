#!/usr/bin/env bash
# Tahap 3 — Export schema public (struktur + data + fungsi + RLS) dari Supabase Cloud.
# Jalankan di VPS:  export CLOUD_DB_URL='postgresql://postgres:PASS@db.xxxx.supabase.co:5432/postgres'
#                   bash 03_export_cloud.sh
set -euo pipefail

: "${CLOUD_DB_URL:?Set dulu: export CLOUD_DB_URL='postgresql://postgres:PASS@db.xxxx.supabase.co:5432/postgres'}"

OUT=otosmart_public.dump

echo '== Mengambil dump schema public dari Supabase Cloud =='
pg_dump "$CLOUD_DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file="$OUT"

echo '== Ringkasan objek di dalam dump =='
pg_restore --list "$OUT" | grep -c 'TABLE DATA' | xargs echo 'Jumlah tabel (data):'
pg_restore --list "$OUT" | grep -c 'FUNCTION' | xargs echo 'Jumlah fungsi/RPC:'
pg_restore --list "$OUT" | grep -c 'POLICY' | xargs echo 'Jumlah RLS policy:'

echo
echo "Selesai: $OUT ($(du -h "$OUT" | cut -f1))"
echo 'Lanjutkan ke Tahap 4: bash 04_import_vps.sh'
