#!/usr/bin/env bash
# Tahap 4 — Import dump ke Postgres self-hosted + aktifkan Realtime.
# Jalankan di VPS:  bash 04_import_vps.sh
set -euo pipefail

DUMP=otosmart_public.dump
DOCKER_DIR=/opt/supabase/supabase/docker

[ -f "$DUMP" ] || { echo "File $DUMP tidak ditemukan. Jalankan Tahap 3 dulu."; exit 1; }

POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$DOCKER_DIR/.env" | cut -d= -f2-)
DB_URL="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:5432/postgres"

echo '== Restore dump ke Postgres self-hosted =='
pg_restore \
  --clean --if-exists \
  --no-owner --no-privileges \
  --exit-on-error \
  -d "$DB_URL" \
  "$DUMP" || {
    echo
    echo 'CATATAN: pg_restore melaporkan error. Jika hanya soal objek bawaan'
    echo '(extension/schema internal Supabase), umumnya aman. Periksa pesan di atas.'
  }

echo
echo '== Aktifkan publikasi Realtime untuk seluruh tabel schema public =='
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
  LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', t.schemaname, t.tablename);
  END LOOP;
  ALTER PUBLICATION supabase_realtime ADD TABLES IN SCHEMA public;
END $$;
SQL

echo
echo '== Ringkasan jumlah baris per tabel (bandingkan dengan Supabase Cloud) =='
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT relname AS tabel, n_live_tup AS perkiraan_baris
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 25;
SQL

echo
echo 'Selesai. Lanjutkan ke Tahap 5 (migrasi file Storage) bila memakai lampiran.'
