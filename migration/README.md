# Migrasi Database OTOSmart: Supabase Cloud → VPS (Supabase Self-Hosted)

Panduan lengkap memindahkan database aplikasi OTOSmart dari Supabase Cloud ke VPS
sendiri menggunakan **Supabase Self-Hosted (Docker Compose)**. Kode aplikasi tidak
perlu diubah — hanya nilai `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.

## Arsitektur Target

```
Browser (React SPA)  ──HTTPS──▶  api.domainanda.com (Caddy, TLS otomatis)
                                      │
                                      ▼
                              Kong (port 8000)
                    ┌─────────┬─────────┼─────────┐
                    ▼         ▼         ▼         ▼
                 PostgREST  GoTrue   Realtime   Storage
                    └─────────┴─────────┴─────────┘
                                      │
                                      ▼
                              PostgreSQL 15 (Docker volume)
```

## Prasyarat

1. **VPS** — rekomendasi minimal **2 vCPU / 4 GB RAM / 60 GB SSD**, Ubuntu 24.04 LTS.
   Pilihan provider (region Singapore/Indonesia untuk latency rendah):
   - DigitalOcean Singapore — ± $24/bln (4 GB)
   - Vultr Singapore — ± $24/bln (4 GB)
   - AWS Lightsail Singapore — ± $20/bln (4 GB)
   - IDCloudHost / BiznetGio / Dewaweb (lokal, bayar Rupiah)
2. **Domain** untuk endpoint API, mis. `api.domainanda.com` (A-record → IP VPS).
3. **Akses SSH** ke VPS (root atau sudo).
4. **Connection string database Supabase Cloud** (Dashboard → Settings → Database →
   Connection string → *Direct connection*), berisi host `db.<project-ref>.supabase.co`,
   port `5432`, user `postgres`, dan password database Anda.

## Perkiraan Waktu & Downtime

- Setup VPS + stack: ± 45 menit (tanpa downtime, bisa dilakukan kapan saja)
- Export + import + migrasi storage + switch DNS/env: ± 30–60 menit (**aplikasi
  sebaiknya tidak dipakai menulis data selama tahap ini** agar tidak ada selisih data)

---

## Tahap 1 — Setup Server

Salin `01_server_setup.sh` ke VPS lalu jalankan sebagai root:

```bash
bash 01_server_setup.sh
```

Script ini: update sistem, membuat swap 2 GB, menginstall Docker + plugin Compose,
mengaktifkan firewall (UFW: hanya port 22/80/443), dan mengatur timezone Asia/Jakarta.

## Tahap 2 — Deploy Supabase Self-Hosted

```bash
bash 02_supabase_setup.sh
```

Script ini: clone repo resmi `supabase/supabase`, membuat konfigurasi `.env` dengan
secret acak (password Postgres, JWT secret), dan **mengenerate ANON_KEY +
SERVICE_ROLE_KEY baru** via `gen_jwt_keys.mjs`, lalu menjalankan seluruh stack.

Setelah selesai, catat outputnya (terutama **ANON_KEY** — dipakai aplikasi).
Stack berjalan di: Kong `http://IP_VPS:8000` (API), Studio `http://IP_VPS:3000`.

## Tahap 3 — Export dari Supabase Cloud

Jalankan **di VPS** (menghindari kebutuhan install Postgres client di komputer lokal):

```bash
export CLOUD_DB_URL='postgresql://postgres:PASSWORD_CLOUD@db.xxxx.supabase.co:5432/postgres'
bash 03_export_cloud.sh
```

Hasil: file `otosmart_public.dump` (schema `public` lengkap: tabel, fungsi/RPC
`login_user`, RLS policy, trigger, index, dan seluruh data).

## Tahap 4 — Import ke Database VPS

```bash
bash 04_import_vps.sh
```

Script ini: `pg_restore` ke Postgres self-hosted, mengaktifkan publikasi Realtime
untuk seluruh tabel `public`, dan menampilkan ringkasan jumlah baris per tabel
untuk dibandingkan dengan data sumber.

## Tahap 5 — Migrasi File Storage (lampiran)

```bash
cd migration
npm install                 # menginstall @supabase/supabase-js untuk script ini
export SRC_URL='https://xxxx.supabase.co'
export SRC_SERVICE_KEY='service_role_key_dari_dashboard_supabase_cloud'
export DST_URL='http://127.0.0.1:8000'      # atau https://api.domainanda.com
export DST_SERVICE_KEY='SERVICE_ROLE_KEY_hasil_tahap_2'
node 05_storage_migrate.mjs
```

Script ini menyalin seluruh bucket + file dari Storage cloud ke Storage self-hosted
(termasuk bucket lampiran kendaraan).

## Tahap 6 — Domain + HTTPS

1. Buat A-record: `api.domainanda.com → IP_VPS` (tunggu propagasi DNS).
2. Install Caddy: `apt install -y caddy`
3. Salin `Caddyfile` ke `/etc/caddy/Caddyfile`, ganti `api.domainanda.com` dengan
   domain Anda, lalu `systemctl reload caddy`.
4. TLS diterbitkan otomatis oleh Caddy (Let's Encrypt).

## Tahap 7 — Arahkan Aplikasi ke VPS

- **Lokal**: ubah `.env.local`:
  ```
  VITE_SUPABASE_URL=https://api.domainanda.com
  VITE_SUPABASE_ANON_KEY=ANON_KEY_hasil_tahap_2
  ```
- **Produksi (Vercel)**: Project → Settings → Environment Variables → ubah dua
  variabel yang sama → **Redeploy**.

## Tahap 8 — Verifikasi

- [ ] Login dengan user asli (bukan demo) berhasil
- [ ] Dashboard menampilkan data (WO, kendaraan, kas)
- [ ] Buat/ubah satu transaksi kecil lalu hapus lagi (uji tulis)
- [ ] Laporan memuat data; realtime update berjalan (buka 2 tab, ubah data di satu tab)
- [ ] Lampiran kendaraan lama bisa dibuka/download
- [ ] Login demo (demo/demo123) tetap berfungsi (mode dummy, tidak tergantung DB)

## Tahap 9 — Backup Otomatis

```bash
bash 06_backup_setup.sh
```

Membuat backup harian `pg_dump` ke `/var/backups/otosmart/` (retensi 14 hari)
via cron jam 02:00.

## Rollback

Selama masa transisi, **jangan hapus project Supabase Cloud**. Bila ada masalah,
kembalikan `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY` di Vercel ke nilai lama —
aplikasi langsung kembali ke Supabase Cloud (data yang ditulis di VPS setelah cutover
perlu diekspor ulang bila ingin dibawa balik).
