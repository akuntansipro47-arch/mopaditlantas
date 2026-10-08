#!/usr/bin/env bash
# Tahap 1 — Setup dasar VPS Ubuntu 24.04 untuk Supabase self-hosted.
# Jalankan sebagai root:  bash 01_server_setup.sh
set -euo pipefail

echo '== Update sistem =='
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo '== Timezone Asia/Jakarta =='
timedatectl set-timezone Asia/Jakarta || true

echo '== Swap 2 GB (penting untuk VPS RAM kecil) =='
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

echo '== Install Docker =='
if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

echo '== PostgreSQL client (untuk export/import) =='
apt-get install -y postgresql-client

echo '== Firewall: hanya SSH(22), HTTP(80), HTTPS(443) =='
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo '== Node.js 20 (untuk script migrasi storage & generate key) =='
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo
echo 'Selesai. Versi terpasang:'
docker --version
docker compose version
psql --version
node --version
