#!/usr/bin/env bash
# Tahap 1 (varian Ubuntu 26.04 "resolute") — setup dasar VPS.
# Repo resmi Docker belum punya dist "resolute", jadi pakai paket Ubuntu:
# docker.io + docker-compose-v2 (tetap Docker CE + Compose v2).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo '== Update index paket =='
apt-get update -y

echo '== Timezone Asia/Jakarta =='
timedatectl set-timezone Asia/Jakarta || true

echo '== Swap 2 GB =='
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

echo '== Docker (docker.io + compose v2 dari repo Ubuntu) =='
if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io docker-compose-v2
  systemctl enable --now docker
fi

echo '== PostgreSQL client =='
apt-get install -y postgresql-client

echo '== Firewall: hanya SSH(22), HTTP(80), HTTPS(443) =='
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo '== Node.js (paket Ubuntu) =='
if ! command -v node >/dev/null 2>&1; then
  apt-get install -y nodejs npm
fi

echo
echo '== Versi terpasang =='
docker --version
docker compose version
psql --version
node --version
echo 'SETUP_SERVER_OK'
