-- Fix: entry kendaraan (estimasi) status 'OPEN' padahal sudah punya WO
-- Jalankan di Supabase SQL Editor.

-- 1) Pre-check (opsional): daftar entry yang tidak konsisten
SELECT ve.id,
       ve.entry_number,
       v.license_plate,
       ve.status,
       wo.wo_number,
       wo.status AS wo_status
FROM vehicle_entries ve
JOIN vehicles v ON v.id = ve.vehicle_id
JOIN work_orders wo ON wo.vehicle_entry_id = ve.id
WHERE ve.status = 'OPEN'
  AND UPPER(COALESCE(wo.status, '')) <> 'CANCELLED'
ORDER BY ve.entry_date DESC;

-- 2) Backfill: tandai entry yang sudah punya WO menjadi PROCESSED
UPDATE vehicle_entries ve
SET status = 'PROCESSED'
WHERE ve.status = 'OPEN'
  AND EXISTS (
    SELECT 1
    FROM work_orders wo
    WHERE wo.vehicle_entry_id = ve.id
      AND UPPER(COALESCE(wo.status, '')) <> 'CANCELLED'
  );
