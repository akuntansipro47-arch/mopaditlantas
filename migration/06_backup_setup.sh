#!/usr/bin/env bash
# Tahap 9 — Backup harian otomatis (pg_dump custom format, retensi 14 hari).
# Jalankan sebagai root:  bash 06_backup_setup.sh
set -euo pipefail

BACKUP_DIR=/var/backups/otosmart
DOCKER_DIR=/opt/supabase/supabase/docker
mkdir -p "$BACKUP_DIR"

POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$DOCKER_DIR/.env" | cut -d= -f2-)

cat > /usr/local/bin/otosmart-backup.sh <<EOF
#!/usr/bin/env bash
set -euo pipefail
FILE="$BACKUP_DIR/otosmart_\$(date +%Y%m%d_%H%M%S).dump"
pg_dump "postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:5432/postgres" \
  --format=custom --no-owner --no-privileges --schema=public --file="\$FILE"
find "$BACKUP_DIR" -name 'otosmart_*.dump' -mtime +14 -delete
echo "\$(date -Is) backup OK: \$FILE" >> $BACKUP_DIR/backup.log
EOF
chmod +x /usr/local/bin/otosmart-backup.sh

# Cron harian jam 02:00
( crontab -l 2>/dev/null | grep -v 'otosmart-backup.sh' ; echo '0 2 * * * /usr/local/bin/otosmart-backup.sh' ) | crontab -

echo 'Backup otomatis terpasang. Uji coba:'
/usr/local/bin/otosmart-backup.sh
ls -lh "$BACKUP_DIR"
