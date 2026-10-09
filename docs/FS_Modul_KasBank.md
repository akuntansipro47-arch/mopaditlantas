# DOKUMEN SPESIFIKASI FUNGSIONAL (FSD)
# Modul Kas/Bank

| | |
|---|---|
| **Versi** | 1.0 — Draft untuk Review |
| **Tanggal** | 9 Oktober 2026 |
| **Sistem** | OTOSmart Workshop Management (React + Supabase) |
| **Peran Penulis** | System Analyst / Software Architect |

---

## 1. Ringkasan Eksekutif

Modul Kas/Bank menyediakan (1) pencatatan **penerimaan kas/bank non-usaha**, (2) pencatatan **pembayaran kas/bank untuk biaya operasional**, dan (3) **Buku Bank/Kas** yang merekapitulasi otomatis seluruh mutasi debet/kredit akun kas & bank dari semua modul.

Modul ini **berevolusi dari** halaman `CashBankV2` (`/finance/cash-bank`) dan menumpang pada jurnal umum yang sudah ada (`journal_entries` + `journal_entry_items`) — tidak ada buku besar paralel.

## 2. Ruang Lingkup

### 2.1 Dalam Lingkup

| No | Komponen | Keterangan |
|----|----------|------------|
| 1 | **Sub-Modul Penerimaan Kas/Bank** | Penerimaan **non-usaha**: pendapatan lain-lain, bunga bank, refund, denda, jasa giro, penerimaan non-operasional lainnya. **Bukan** pelunasan piutang/penjualan. |
| 2 | **Sub-Modul Pembayaran Kas/Bank** | Pengeluaran kas/bank untuk **biaya/beban operasional** (gaji, listrik, air, sewa, ATK, perawatan, honor, dll.). **Bukan** pelunasan hutang dagang (AP). |
| 3 | **Buku Bank (Bank Book / Cash Ledger)** | Rekapitulasi/jurnal harian otomatis seluruh mutasi (debet/kredit) akun kas & bank dari **semua modul**. Read-only. |

### 2.2 Di Luar Lingkup (Eksplisit)

| No | Transaksi | Modul Pemilik |
|----|-----------|---------------|
| 1 | Pelunasan piutang usaha (AR) | Penjualan (`sales_receipts`) |
| 2 | Pelunasan hutang dagang (AP) | Pembelian (`purchase_payments`) |
| 3 | Jurnal bebas multi-akun | Jurnal Umum (`ManualJournalEntry`) |
| 4 | Transfer antar rekening kas/bank | Fase 2 (sementara via Jurnal Umum) |
| 5 | Kasbon/imprest petty cash, rekonsiliasi bank | Fase lanjutan (lihat §8) |

> **Prinsip desain:** setiap transaksi keuangan hanya punya **satu pintu pencatatan** — menghindari dobel pencatatan kas.

### 2.3 Fondasi Sistem Existing yang Digunakan

| Komponen | Kondisi | Pemanfaatan |
|----------|---------|-------------|
| `journal_entries` + `journal_entry_items` | ✅ Ada, dipakai GR, GoodsIssue, AP, AR, Jurnal Umum | GL tunggal — modul ini hanya menulis ke sini |
| `chart_of_accounts` | ✅ Ada | Sumber akun kas/bank & akun lawan |
| `purchase_payments` / `sales_receipts` | ✅ Ada | Pembanding pola sub-ledger → jurnal |
| `activity_logs` | ✅ Ada | Audit trail modul ini |
| Registry akun kas/bank | ❌ Tidak ada (deteksi via nama "kas"/"bank") | Diperkuat dengan flag `is_cash_bank` (§3.3) |
| Tabel `cash_bank_transactions` | ⚠️ Tabel mati, 0 referensi | **Tidak dipakai**; kandidat drop di fase berikutnya |

---

## 3. Struktur Basis Data

### 3.1 Tabel Baru: `cash_receipts` (Sub-Ledger Penerimaan)

| Kolom | Tipe | Constraint / Keterangan |
|-------|------|------------------------|
| `id` | UUID | PK, `gen_random_uuid()` |
| `receipt_no` | TEXT | **UNIQUE NOT NULL** — nomor bukti, dibangkit sistem: `KBM/{yyyymmdd}/{urut}` |
| `receipt_date` | DATE | NOT NULL, DEFAULT `CURRENT_DATE` — tanggal transaksi |
| `cash_account_id` | UUID | NOT NULL, FK → `chart_of_accounts(id)` — akun kas/bank penerima (**DEBIT**) |
| `account_id` | UUID | NOT NULL, FK → `chart_of_accounts(id)` — akun pendapatan non-operasional (**KREDIT**) |
| `amount` | NUMERIC(15,2) | NOT NULL, `CHECK (amount > 0)` |
| `description` | TEXT | NOT NULL — uraian transaksi |
| `reference_no` | TEXT | OPSIONAL — nomor dokumen/bukti pendukung |
| `status` | TEXT | NOT NULL DEFAULT `'POSTED'`, `CHECK (status IN ('POSTED','VOID'))` |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` |
| `created_by` | TEXT | username pelaku (dari session aplikasi) |

### 3.2 Tabel Baru: `cash_payments` (Sub-Ledger Pembayaran)

| Kolom | Tipe | Constraint / Keterangan |
|-------|------|-------------------------|
| `id` | UUID | PK, `gen_random_uuid()` |
| `payment_no` | TEXT | **UNIQUE NOT NULL** — `KBU/{yyyymmdd}/{urut}` |
| `payment_date` | DATE | NOT NULL, DEFAULT `CURRENT_DATE` |
| `cash_account_id` | UUID | NOT NULL, FK → `chart_of_accounts(id)` — akun kas/bank sumber (**KREDIT**) |
| `account_id` | UUID | NOT NULL, FK → `chart_of_accounts(id)` — akun beban operasional (**DEBIT**) |
| `amount` | NUMERIC(15,2) | NOT NULL, `CHECK (amount > 0)` |
| `description` | TEXT | NOT NULL |
| `reference_no` | TEXT | OPSIONAL — no. invoice/kwitansi/PO sebagai referensi internal (bukan link AP) |
| `status` | TEXT | NOT NULL DEFAULT `'POSTED'`, `CHECK (status IN ('POSTED','VOID'))` |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` |
| `created_by` | TEXT | username pelaku |

> **Catatan desain:** satu voucher = **satu akun lawan** (contra). Transaksi dengan beberapa biaya berbeda dicatat dengan dua voucher — agar rekap beban per akun bersih. Multi-baris (detail lines) adalah opsi Fase 2.

### 3.3 Perubahan Tabel Existing

| Tabel | Perubahan | Alasan |
|-------|-----------|--------|
| `journal_entries` | `entry_type` bertambah nilai **`'CASH_RECEIPT'`** dan **`'CASH_PAYMENT'`** | Pembeda sumber transaksi (penanda) |
| `journal_entries` | `voucher_no` diisi `receipt_no`/`payment_no`; `reference` = UUID sub-ledger; `total_amount` = `amount` | Konvensi sama dengan modul AP/AR; memperbaiki masalah "jurnal orphan" (`reference = NULL`) pada CashBankV2 lama |
| `journal_entries` | **(Rekomendasi)** tambah kolom `source_table TEXT` | Menjadikan referensi polimorfik eksplisit: `'cash_receipts'` / `'cash_payments'` / `'purchase_payments'` / … |
| `chart_of_accounts` | **(Rekomendasi)** tambah kolom `is_cash_bank BOOLEAN DEFAULT false` + index parsial | Menggantikan deteksi rapuh `account_name ILIKE '%kas%' OR '%bank%'`; dropdown & Buku Bank memakai flag ini; data lama di-backfill satu kali |

### 3.4 View: `v_cash_bank_book`

Sumber tunggal Buku Bank — **tanpa tabel simpanan tambahan** (mutasi terjadi otomatis begitu jurnal ditulis):

```sql
CREATE VIEW v_cash_bank_book AS
SELECT
  je.entry_date, je.voucher_no, je.entry_type, je.source_table, je.reference,
  je.description                          AS entry_description,
  jei.account_id, coa.account_code, coa.account_name,
  jei.debit, jei.credit, jei.description  AS line_description
FROM journal_entry_items jei
JOIN journal_entries je     ON je.id = jei.journal_entry_id
JOIN chart_of_accounts coa  ON coa.id = jei.account_id
WHERE coa.account_type = 'DETAIL'
  AND coa.sub_category = 'AKTIVA_LANCAR'
  AND (coa.is_cash_bank = true
       OR coa.account_name ILIKE '%kas%'
       OR coa.account_name ILIKE '%bank%');
```

### 3.5 Diagram Relasi (Ringkas)

```
chart_of_accounts ──< cash_receipts.cash_account_id   (akun kas/bank)
chart_of_accounts ──< cash_receipts.account_id        (akun pendapatan non-operasional)
chart_of_accounts ──< cash_payments.cash_account_id   (akun kas/bank)
chart_of_accounts ──< cash_payments.account_id        (akun beban operasional)

cash_receipts  ──1:1── journal_entries (entry_type='CASH_RECEIPT', reference = cash_receipts.id)
cash_payments  ──1:1── journal_entries (entry_type='CASH_PAYMENT', reference = cash_payments.id)
journal_entries ──1:n── journal_entry_items ──> chart_of_accounts
```

### 3.6 Constraint, Index & Integritas

| Objek | Spesifikasi |
|-------|-------------|
| UNIQUE | `cash_receipts.receipt_no`, `cash_payments.payment_no` |
| CHECK | `amount > 0`; `status IN ('POSTED','VOID')` |
| INDEX | `cash_receipts(receipt_date)`, `cash_payments(payment_date)`, `cash_receipts(cash_account_id)`, `cash_payments(cash_account_id)` |
| INDEX | `journal_entries(reference)` — mempercepat void & telusur sumber |
| Invariant GL | Σ debit = Σ kredit per `journal_entry` (divalidasi di RPC, diperiksa sebagai warning di Buku Bank) |

---

## 4. Sub-Modul Penerimaan Kas/Bank

### 4.1 Spesifikasi Fungsional

| ID | Fungsi | Keterangan |
|----|--------|------------|
| PR-01 | Daftar penerimaan | Tabel: Tanggal, No. Bukti (KBM/…), Akun Kas/Bank, Akun Pendapatan, Jumlah, Uraian, Status, Dibuat oleh. Filter: rentang tanggal (**default: tgl 1 bulan berjalan → hari ini**), akun kas/bank, status, pencarian teks |
| PR-02 | Tambah penerimaan | Form (lihat §4.2 langkah 3) |
| PR-03 | Detail penerimaan | Modal/panel: data header + 2 baris jurnal hasil posting |
| PR-04 | Void penerimaan | Hanya status POSTED; konfirmasi wajib; tercatat di `activity_logs` |
| PR-05 | Cetak/Export | Cetak bukti sederhana + Excel daftar |

> **Edit pasca-posting tidak diizinkan** (prinsip audit): perbaikan = Void → buat transaksi baru. *(Perlu konfirmasi — lihat §8, no. 2)*

### 4.2 Alur Kerja (Workflow)

```
[Daftar] → (+) Tambah → [Form] → Validasi Klien (§4.4)
                                   │ gagal → pesan per-field, batal
                                   ▼ lulus
                        RPC post_cash_receipt (satu transaksi atomik):
                          1. insert cash_receipts (status POSTED, no. dibangkit)
                          2. insert journal_entries (CASH_RECEIPT, reference=id)
                          3. insert 2 baris journal_entry_items (Dr kas / Cr pendapatan)
                          4. insert activity_logs
                                   │ gagal → rollback penuh, toast error
                                   ▼ sukses
                        Toast + refresh daftar + langsung tampil di Buku Bank
```

**Pembatalan (Void):** konfirmasi → set `status = 'VOID'` → hapus jurnal terkait dari GL (`DELETE … WHERE entry_type='CASH_RECEIPT' AND reference = id`) → `activity_logs` menyimpan salinan data transaksi sebelum dihapus. Baris VOID tetap tampil di daftar (strikethrough, read-only), tetapi **hilang dari GL & Buku Bank**. *(Konsisten dengan pola cancel di `PurchasePayment`. Alternatif reversal-jurnal: §8 no. 3.)*

### 4.3 Entri Jurnal

| Akun | Debet | Kredit |
|------|-------|--------|
| Kas/Bank (`cash_account_id`) | `amount` | |
| Pendapatan Non-Operasional (`account_id`) | | `amount` |

*Contoh: bunga bank Rp500.000 → Dr Bank BCA 500.000 / Cr Pendapatan Bunga Bank 500.000.*

### 4.4 Skema Validasi

| # | Field | Aturan Validasi | Level | Pesan Error (ID) |
|---|-------|-----------------|-------|------------------|
| 1 | `receipt_date` | Wajib; tidak boleh > tanggal hari ini | Hard | "Tanggal penerimaan tidak boleh di masa depan." |
| 2 | `cash_account_id` | Wajib; akun DETAIL; `sub_category='AKTIVA_LANCAR'`; flag `is_cash_bank` (atau nama mengandung kas/bank); aktif | Hard | "Pilih akun kas/bank yang valid." |
| 3 | `account_id` | Wajib; akun DETAIL; `balance_type='CREDIT'`; kategori **PENDAPATAN non-usaha**; **DITOLAK**: akun Piutang Usaha & Pendapatan Usaha (Jasa/Part) — daftar hitam berbasis kode/ID akun | Hard | "Akun kredit harus Pendapatan Non-Operasional — pelunasan piutang dicatat di modul Penjualan." |
| 4 | `amount` | Wajib; numerik; > 0; maks. 2 desimal; (opsional: batas maks per transaksi, konfigurasi) | Hard | "Jumlah harus lebih dari Rp 0." |
| 5 | `description` | Wajib; 3–255 karakter | Hard | "Uraian wajib diisi (min. 3 karakter)." |
| 6 | `reference_no` | Opsional; maks. 100 karakter | — | — |
| 7 | Saldo kas | `amount` ≤ saldo terakhir akun kas/bank | **Soft (warning)** | "Saldo akun tidak mencukupi (saldo Rp X). Transaksi tetap dapat disimpan — konfirmasi untuk melanjutkan." |
| 8 | `receipt_no` | Unik (bangkitkan via RPC sekuens harian) | Hard | "Gagal membangkitkan nomor bukti. Coba lagi." |
| 9 | Hak akses | User memiliki menu `finance_cash` | Hard | "Anda tidak memiliki akses modul Kas/Bank." |

---

## 5. Sub-Modul Pembayaran Kas/Bank

### 5.1 Spesifikasi Fungsional

| ID | Fungsi | Keterangan |
|----|--------|------------|
| PB-01 | Daftar pembayaran | Tabel sama seperti PR-01 dengan No. Bukti `KBU/…`; filter identik (default tgl 1 bulan berjalan → hari ini) |
| PB-02 | Tambah pembayaran | Form (lihat §5.2 langkah 3) |
| PB-03 | Detail pembayaran | Header + baris jurnal |
| PB-04 | Void pembayaran | Hanya POSTED; konfirmasi; audit log |
| PB-05 | Cetak/Export | Cetak bukti + Excel |

### 5.2 Alur Kerja (Workflow)

```
[Daftar] → (+) Tambah → [Form] → Validasi Klien (§5.4)
                                   │ gagal → pesan per-field
                                   ▼ lulus
                        RPC post_cash_payment (atomik):
                          1. insert cash_payments (status POSTED, no. dibangkit)
                          2. insert journal_entries (CASH_PAYMENT, reference=id)
                          3. insert 2 baris journal_entry_items (Dr beban / Cr kas)
                          4. insert activity_logs
                                   ▼ sukses
                        Toast + refresh + langsung tampil di Buku Bank
```

**Void:** identik dengan alur void penerimaan (§4.2).

### 5.3 Entri Jurnal

| Akun | Debet | Kredit |
|------|-------|--------|
| Beban Operasional (`account_id`) | `amount` | |
| Kas/Bank (`cash_account_id`) | | `amount` |

*Contoh: bayar listrik Rp1.200.000 → Dr Beban Listrik 1.200.000 / Cr Kas 1.200.000.*

> **Pengecualian AP secara struktural:** form tidak punya relasi apa pun ke `purchase_invoices`/`purchase_orders`, dan akun lawan **dipaksa akun BEBAN** — sehingga jalan "Dr Hutang Dagang / Cr Kas" (pelunasan AP) **mustahil terbentuk** dari modul ini. Pelunasan AP tetap eksklusif di modul Pembelian.

### 5.4 Skema Validasi

| # | Field | Aturan Validasi | Level | Pesan Error (ID) |
|---|-------|-----------------|-------|------------------|
| 1 | `payment_date` | Wajib; tidak boleh > tanggal hari ini | Hard | "Tanggal pembayaran tidak boleh di masa depan." |
| 2 | `cash_account_id` | Wajib; akun DETAIL; AKTIVA_LANCAR; flag `is_cash_bank`; aktif | Hard | "Pilih akun kas/bank yang valid." |
| 3 | `account_id` | Wajib; akun DETAIL; `balance_type='DEBIT'`; kategori **`BEBAN`** (biaya operasional); **DITOLAK (daftar hitam)**: akun Hutang Usaha/Dagang (AP), akun kas/bank lain (transfer), akun Persediaan, akun Piutang | Hard | "Akun debit harus akun Beban Operasional. Pelunasan hutang dagang diproses di modul Pembelian." |
| 4 | `amount` | Wajib; numerik; > 0; maks. 2 desimal | Hard | "Jumlah harus lebih dari Rp 0." |
| 5 | `description` | Wajib; 3–255 karakter | Hard | "Uraian wajib diisi (min. 3 karakter)." |
| 6 | `reference_no` | Opsional; maks. 100 karakter (no. kwitansi/invoice — **bukan** FK ke AP) | — | — |
| 7 | Saldo kas | `amount` ≤ saldo terakhir akun kas/bank | **Soft (warning)** | "Saldo akun tidak mencukupi (saldo Rp X). Konfirmasi untuk melanjutkan." |
| 8 | `payment_no` | Unik (RPC sekuens harian) | Hard | "Gagal membangkitkan nomor bukti. Coba lagi." |
| 9 | Hak akses | Menu `finance_cash` | Hard | "Anda tidak memiliki akses modul Kas/Bank." |

---

## 6. Buku Bank (Bank Book / Cash Ledger)

### 6.1 Fungsi & Sumber Data

- **Otomatis 100%** — tanpa input pengguna. Membaca view `v_cash_bank_book` (§3.4) yang menyorot setiap baris `journal_entry_items` pada akun kas/bank.
- Semua modul otomatis tercakup: Penerimaan/Pembayaran Kas/Bank (baru), Jurnal Umum, Pelunasan AP, Penerimaan AR, Goods Receipt, Goods Issue, Return, dst.
- **Read-only**: tidak ada tombol edit/hapus. Koreksi dilakukan di modul sumber (void voucher sumber → baris hilang otomatis).

### 6.2 Tampilan & Kolom

**Filter:** rentang tanggal (**default tgl 1 bulan berjalan → hari ini**), akun kas/bank (default: semua), jenis mutasi (Semua / Masuk / Keluar), pencarian (no. voucher/uraian).

**Kolom:** `Tanggal` · `No. Voucher` · `Uraian` · `Sumber Transaksi` (modul/tabel asal) · `Debet` · `Kredit` · `Saldo` (berjalan).

**Ringkasan atas:** Saldo Awal · Total Masuk · Total Keluar · Saldo Akhir (per akun terpilih).

**Aksi:** Cetak, Export Excel.

### 6.3 Logika Saldo

```
Saldo Awal(periode) = Σ(debit) − Σ(kredit) pada akun tsb, entry_date < tanggalMulai
Saldo baris ke-n    = Saldo Awal + Σ(debit s/d n) − Σ(kredit s/d n)
```
(Pola dua-kueri yang sudah dipakai `GeneralLedger` & `CashBankBookReport`: kueri saldo sebelum periode + kueri baris periode berjalan.)

### 6.4 Validasi / Pemeriksaan Buku Bank

| # | Pemeriksaan | Level | Tindakan |
|---|-------------|-------|----------|
| 1 | Filter akun hanya boleh akun kas/bank | Hard | Dropdown terfilter by `is_cash_bank` |
| 2 | `tanggalMulai ≤ tanggalAkhir` | Hard | "Rentang tanggal tidak valid." |
| 3 | Σ Debet = Σ Kredit setiap jurnal terlibat | Soft | Banner warning "Ditemukan jurnal tidak seimbang" + daftar (deteksi korupsi data) |
| 4 | Jurnal tanpa `reference` (produk CashBankV2 lama) | Info | Tetap ditampilkan (mutasi sah) — penanda "data lama" |

---

## 7. Keputusan Desain & Kebutuhan Non-Fungsional

| No | Aspek | Keputusan |
|----|-------|-----------|
| 1 | **Atomicitas posting** | Wajib via RPC DB (`post_cash_receipt`, `post_cash_payment`) — header sub-ledger + jurnal + log dalam **satu transaksi**. Mencegah jurnal yatim/parsial yang terjadi pada pola insert berlapis saat ini |
| 2 | **Bangkit nomor** | Fungsi `next_voucher_no(prefix)` berbasis sequence harian → `KBM/20261009/001`, `KBU/20261009/001` (unik, urut, tanpa tabrakan) |
| 3 | **Hak akses** | Menu key lama **`finance_cash`** dipakai ulang untuk ketiga tab (Penerimaan / Pembayaran / Buku Bank). Opsi Fase 2: pemisahan `finance_cash_receipt` & `finance_cash_payment` |
| 4 | **Audit** | Setiap create/void menulis `activity_logs` (module=`cash_bank`, entity=id, meta berisi snapshot transaksi) |
| 5 | **Bahasa UI** | Indonesia; format `formatCurrency` / `formatDate` dari `src/lib/utils.ts` |
| 6 | **Mode Demo** | Data dummy untuk ketiga sub-modul (konsisten dengan kebijakan akun `demo`); tanpa fetch online |
| 7 | **Kompatibilitas** | `CashBankBookReport` & `GeneralLedger` tetap valid (satu sumber GL yang sama); tab DEPOSIT/PAYMENT lama di CashBankV2 diubah menjadi **riwayat read-only** |
| 8 | **Performa** | Index §3.6; query Buku Bank batasi per akun + rentang; view tidak menyimpan data |
| 9 | **RLS** | Ikut pola jurnal existing (`TO public USING(true)`) — otorisasi via guard menu di sisi klien |

---

## 8. Open Questions (Perlu Konfirmasi Stakeholder)

| No | Pertanyaan | Rekomendasi Analyst |
|----|-----------|---------------------|
| 1 | Struktur **satu akun lawan per voucher** vs. multi-baris (beberapa biaya dalam 1 bukti)? | Satu lawan per voucher (rekap beban bersih); multi-baris Fase 2 |
| 2 | Transaksi POSTED boleh **edit langsung** atau wajib **void → buat baru**? | Void → buat baru (integritas audit) |
| 3 | Void: **hapus jurnal** (pola app saat ini) atau **jurnal reversal** (standar akuntansi)? | Hapus + salinan di `activity_logs` (konsisten dgn modul AP/AR); reversal di Fase 2 bila perlu jejak mutasi tercatat |
| 4 | Validasi saldo kas: **soft warning** atau **hard block**? | Soft warning (transaksi manual lain masih bisa menggerakkan kas) |
| 5 | Perlu flag `is_cash_bank` di COA sekarang, atau cukup heuristik nama dulu? | Buat flag + backfill sekali — investasi kecil, menghapus deteksi rapuh |
| 6 | Transfer antar kas/bank: pakai Jurnal Umum dulu atau masuk Fase 2 modul ini? | Jurnal Umum dulu; Fase 2 punya menu Transfer sendiri |
