# Daftar Tugas (Tasks)

## Persiapan & Database
- [ ] Buat file migrasi SQL `supabase/migrations/20240309_schema_update_v3.sql` untuk kolom tambahan. <!-- id: 1 -->
- [ ] Update definisi tipe TypeScript `src/types/supabase.ts` secara manual (mocking) agar sesuai dengan perubahan DB. <!-- id: 2 -->

## Master Data (UI & Logic)
- [ ] Update Sidebar (`src/components/layout/Sidebar.tsx`) dengan menu baru. <!-- id: 3 -->
- [ ] Refactor Page: `src/pages/master/Vehicles.tsx` (Sesuaikan kolom). <!-- id: 4 -->
- [ ] Refactor Page: `src/pages/master/Mechanics.tsx` (Tambah NIK, Alamat, Kategori). <!-- id: 5 -->
- [ ] Refactor Page: `src/pages/master/Suppliers.tsx` (Sesuaikan kolom). <!-- id: 6 -->
- [ ] Refactor Page: `src/pages/master/Goods.tsx` (Tambah Kategori & Group Sparepart). <!-- id: 7 -->
- [ ] Refactor Page: `src/pages/master/Jobs.tsx` (Tambah Kode Service & Kategori Kendaraan). <!-- id: 8 -->
- [ ] Create Page: `src/pages/master/CompanyProfile.tsx` (Form Profile Perusahaan). <!-- id: 9 -->

## Transaksi (UI & Logic)
- [ ] Refactor Page: `src/pages/transactions/VehicleEntry.tsx` <!-- id: 10 -->
    - [ ] Tambah logika input Estimasi (Sparepart & Jasa).
    - [ ] Tambah Popup Search Barang/Jasa.
    - [ ] Fitur Simpan & Cetak Estimasi.
- [ ] Refactor Page: `src/pages/transactions/WorkOrderV2.tsx` <!-- id: 11 -->
    - [ ] Ubah flow untuk ambil data dari Entry Kendaraan Masuk.
    - [ ] Tampilkan Tabel Perbandingan (Estimasi vs Realisasi).
    - [ ] Update status flow (Open -> Progress -> Closed).
- [ ] Refactor Page: `src/pages/transactions/PurchaseOrderV2.tsx` <!-- id: 12 -->
    - [ ] Tambah Checkbox Group PO (WO vs Gudang).
    - [ ] Logika filter/popup berdasarkan Group PO.

## Finalisasi
- [ ] Verifikasi build PWA (`npm run build`). <!-- id: 13 -->
- [ ] Testing flow data dari Entry -> WO -> PO. <!-- id: 14 -->
