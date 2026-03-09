# Spesifikasi Pembaruan Aplikasi (Rebuild V3)

## 1. Ikhtisar
Aplikasi akan diperbarui antarmukanya dengan konsep PWA (Progressive Web App) yang lebih modern dan responsif, namun tetap menggunakan basis data Supabase yang sudah ada. Struktur menu dan logika bisnis disesuaikan dengan permintaan spesifik pengguna.

## 2. Struktur Menu & Navigasi
Aplikasi akan memiliki struktur sidebar baru sebagai berikut:

1.  **Dashboard** (Tetap ada sebagai landing page)
2.  **Data Base** (Master Data)
    *   **Data Kendaraan**: CRUD Kendaraan (R4, R2, R2 Kecil).
    *   **Nama Mekanik**: CRUD Mekanik lengkap dengan NIK, Alamat, Kategori.
    *   **Supplier**: CRUD Supplier.
    *   **Barang / Jasa**: CRUD Barang dengan Kategori & Group Sparepart.
    *   **Pekerjaan / Jasa Service**: CRUD Jasa dengan Kode Service & Kategori Kendaraan.
    *   **Profile Perusahaan**: Halaman baru untuk edit data bengkel/perusahaan.
3.  **Transaksi**
    *   **Entry Kendaraan Masuk**: Input kendaraan masuk + Estimasi Biaya (Sparepart & Jasa).
    *   **Menu WO (Work Order)**: Pembuatan WO dari Entry Kendaraan, Realisasi Biaya, Status WO.
    *   **Menu Purchasing**: PO Baru dengan opsi Group (Project WO vs Gudang).
4.  **Laporan** (Opsional/Tetap ada dari versi lama)

## 3. Perubahan Database (Schema Update)
Untuk mendukung fitur baru, diperlukan penambahan kolom pada tabel yang sudah ada (tanpa menghapus data lama).

*   **Tabel `mechanics`**:
    *   Tambah kolom `nik` (text/numeric)
    *   Tambah kolom `address` (text)
*   **Tabel `goods`**:
    *   Tambah kolom `group_sparepart` (text/enum: R4, R2, R2 Kecil)
*   **Tabel `job_types`**:
    *   Tambah kolom `job_code` (text) - *Jika belum ada*
    *   Tambah kolom `vehicle_type` (text/enum: R4, R2, R2 Kecil)
*   **Tabel `company_profile`** (Baru):
    *   Kolom: `id`, `name`, `address`, `npwp`, `is_pkp` (boolean), `phone`, `email`, `social_media` (json/text).

## 4. Detail Fungsionalitas Modul

### A. Master Data
*   **Data Kendaraan**: Form input mencakup Jenis, Nama, Nopol, No Rangka, No Mesin, No Lambung.
*   **Mekanik**: Tambahan field NIK dan Alamat. Kategori Mekanik (R4/R2).
*   **Barang/Jasa**:
    *   Kode Barang (Manual/Auto).
    *   Kategori: Persediaan, Non Persediaan, Peralatan Workshop, Inventaris Kantor.
    *   Group Sparepart: R4, R2, R2 Kecil.
*   **Pekerjaan/Jasa**:
    *   Kode Service (Auto Generate).
    *   Harga Jual & HPP.

### B. Transaksi - Entry Kendaraan Masuk
*   **Input**: Tanggal, Pilih Kendaraan (dari DB), No Surat Jalan/Nota Dinas.
*   **Estimasi**:
    *   User bisa menambah item estimasi (Sparepart atau Jasa).
    *   *Popup Search*: Cari barang/jasa dari master data.
    *   Simpan ke tabel `vehicle_entry_spareparts` dan `vehicle_entry_jobs` sebagai data estimasi awal.
*   **Cetak**: Form Estimasi Biaya.

### C. Transaksi - Work Order (WO)
*   **Input**: No WO (Auto), Tanggal.
*   **Referensi**: Pilih dari Entry Kendaraan Masuk (Filter: yang belum ada WO).
*   **Tampilan**:
    *   Header: Info Kendaraan.
    *   Tabel Biaya:
        *   Kolom Estimasi (dari Entry Masuk).
        *   Kolom Realisasi (Input aktual mekanik/part yang dipakai).
*   **Status**: In Progress -> Closed (Selesai).

### D. Transaksi - Purchasing (PO)
*   **Group PO**:
    *   *Berdasarkan WO (Project)*: Wajib pilih Referensi WO/Nopol. Barang yang dibeli terhubung ke WO tersebut.
    *   *Berdasarkan Gudang (Umum)*: Pembelian stok biasa.
*   **Item PO**: Pilih Barang -> Input Harga Beli & Qty -> Total.

## 5. Rencana Implementasi (PWA Interface)
*   Menggunakan komponen UI yang sudah ada (`shadcn/ui`) namun disederhanakan untuk tampilan *mobile-friendly*.
*   Navigasi Sidebar akan diperbarui sesuai struktur menu baru.
*   Formulir akan menggunakan *Dialog/Modal* untuk input cepat (Popup Search).

## 6. Integrasi
*   Menggunakan Supabase Client yang sudah ada.
*   Environment Variable tetap sama.
