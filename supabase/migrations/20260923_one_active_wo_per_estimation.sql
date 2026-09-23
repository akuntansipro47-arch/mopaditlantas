-- =====================================================================
-- ATURAN: 1 ESTIMASI (vehicle_entry) = maksimal 1 WO AKTIF
-- =====================================================================
-- Rule bisnis:
--   * Satu nopol BOLEH punya banyak WO, asalkan berasal dari estimasi /
--     entry kendaraan yang BERBEDA (entry_number ENT-... berbeda).
--   * Satu estimasi (1 vehicle_entry) TIDAK BOLEH menerbitkan lebih dari
--     1 WO berstatus OPEN/IN_PROGRESS.
--   * Revisi estimasi (estimation_revision naik, berapapun kali revisi)
--     adalah EDIT dari estimasi yang sama -> TIDAK dihitung estimasi baru,
--     jadi tidak membuat aturan ini melar.
--   * WO lama berstatus COMPLETED/CLOSED tidak menghalangi estimasi itu
--     menerbitkan WO baru.
--
-- Kunci unik: work_orders.vehicle_entry_id (satu-satunya link WO->estimasi).
-- Tidak perlu kolom license_plate / trigger nopol.
--
-- Urutan: jalankan SETELAH data duplikat per-estimasi beres (pre-check di
-- bawah akan menolak dan menyebut estimasi yang masih bermasalah).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Bersihkan aturan lama berbasis NOPOL (kalau sempat terpasang)
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.work_orders_one_active_wo_per_plate;
DROP TRIGGER IF EXISTS trg_work_orders_set_license_plate ON public.work_orders;
DROP FUNCTION IF EXISTS public.fn_work_orders_set_license_plate();
ALTER TABLE public.work_orders DROP COLUMN IF EXISTS license_plate;

-- ---------------------------------------------------------------------
-- 1) Pre-check: estimasi yang masih punya > 1 WO aktif -> tolak + daftar
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r      record;
  v_list text := '';
BEGIN
  FOR r IN
    SELECT ve.entry_number,
           ve.nota_dinas_number,
           v.license_plate,
           count(*)                                        AS jml,
           string_agg(wo.wo_number || ' (' || wo.status || ')', ', '
                      ORDER BY wo.created_at)              AS daftar_wo
      FROM public.work_orders wo
      JOIN public.vehicle_entries ve ON ve.id = wo.vehicle_entry_id
      JOIN public.vehicles v          ON v.id  = ve.vehicle_id
     WHERE wo.status IN ('OPEN', 'IN_PROGRESS')
     GROUP BY ve.id, ve.entry_number, ve.nota_dinas_number, v.license_plate
    HAVING count(*) > 1
  LOOP
    v_list := v_list || format('  - estimasi %s (nopol %s, nota %s): %s%s',
                               r.entry_number, r.license_plate,
                               coalesce(r.nota_dinas_number, '-'),
                               r.daftar_wo, e'\n');
  END LOOP;

  IF v_list <> '' THEN
    RAISE EXCEPTION E'Masih ada ESTIMASI (entry) dengan lebih dari 1 WO aktif. Selesaikan dulu (merge/hapus WO salah), lalu jalankan ulang:\n%', v_list;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 2) Unique index: 1 estimasi = 1 WO aktif
--    (nopol TIDAK ikut di kunci -> nopol boleh banyak WO)
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_one_active_wo_per_entry
  ON public.work_orders (vehicle_entry_id)
  WHERE vehicle_entry_id IS NOT NULL
    AND status IN ('OPEN', 'IN_PROGRESS');

-- Sejak ini:
--   * INSERT WO ke-2 dari entry/estimasi yang sama (masih aktif) -> 23505
--     constraint "work_orders_one_active_wo_per_entry".
--   * WO dari entry BERBEDA untuk nopol yang sama -> diperbolehkan.
--   * UPDATE status WO lama kembali OPEN/IN_PROGRESS juga ditolak kalau
--     estimasinya sudah punya WO aktif lain.
