-- =====================================================================
-- PRE-CHECK (HANYA BACA) — Duplikat WO nopol 12012-VIII
--   WO-20260706-1283  (WO yang salah, punya history PO + pembayaran)
--   WO-20260708-1764  (WO yang benar)
--
-- Jalankan dulu di Supabase SQL Editor SEBELUM script merge.
-- Script ini tidak mengubah apapun.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Cek dulu tabel mana yang ADA di DB Anda.
--    Kalau ada yang false, lompati saja bagian pre-check yang memakai
--    tabel itu (dan script merge otomatis akan melewatinya juga).
-- ---------------------------------------------------------------------
SELECT t AS tabel,
       to_regclass('public.' || t) IS NOT NULL AS ada
FROM (VALUES ('work_orders'),
             ('vehicle_entries'),
             ('vehicles'),
             ('purchase_orders'),
             ('purchase_requests'),
             ('goods_issues'),
             ('sales_invoices'),
             ('work_order_billings'),
             ('work_order_images'),
             ('document_print_counters'),
             ('journal_entries'),
             ('journal_entry_items'),
             ('activity_logs'),
             ('purchase_invoices'),
             ('purchase_payments'),
             ('goods_receipts'),
             ('purchase_returns')) AS t(t);

-- ---------------------------------------------------------------------
-- 1) Kedua WO + nopol & entry kendaraan masing-masing
--    (cek: apakah keduanya entry yang sama atau entry berbeda)
-- ---------------------------------------------------------------------
SELECT wo.id,
       wo.wo_number,
       wo.status,
       wo.work_date,
       wo.created_at,
       wo.completed_at,
       ve.id                 AS vehicle_entry_id,
       ve.entry_number,
       ve.status             AS entry_status,
       v.license_plate       AS nopol,
       v.owner_name
FROM work_orders wo
LEFT JOIN vehicle_entries ve ON ve.id = wo.vehicle_entry_id
LEFT JOIN vehicles v          ON v.id  = ve.vehicle_id
WHERE wo.wo_number IN ('WO-20260706-1283', 'WO-20260708-1764')
ORDER BY wo.created_at;

-- ---------------------------------------------------------------------
-- 2) Jumlah anak di masing-masing WO (yang akan ikut dipindah)
-- ---------------------------------------------------------------------
SELECT 'purchase_orders'       AS tabel,
       (SELECT count(*) FROM purchase_orders p
         WHERE p.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260706-1283')) AS di_wo_1283,
       (SELECT count(*) FROM purchase_orders p
         WHERE p.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260708-1764')) AS di_wo_1764
UNION ALL
SELECT 'purchase_requests',
       (SELECT count(*) FROM purchase_requests p
         WHERE p.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260706-1283')),
       (SELECT count(*) FROM purchase_requests p
         WHERE p.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260708-1764'))
UNION ALL
SELECT 'goods_issues',
       (SELECT count(*) FROM goods_issues g
         WHERE g.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260706-1283')),
       (SELECT count(*) FROM goods_issues g
         WHERE g.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260708-1764'))
UNION ALL
SELECT 'sales_invoices',
       (SELECT count(*) FROM sales_invoices s
         WHERE s.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260706-1283')),
       (SELECT count(*) FROM sales_invoices s
         WHERE s.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260708-1764'))
UNION ALL
SELECT 'work_order_billings',
       (SELECT count(*) FROM work_order_billings b
         WHERE b.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260706-1283')),
       (SELECT count(*) FROM work_order_billings b
         WHERE b.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260708-1764'))
UNION ALL
SELECT 'work_order_images',
       (SELECT count(*) FROM work_order_images i
         WHERE i.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260706-1283')),
       (SELECT count(*) FROM work_order_images i
         WHERE i.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260708-1764'))
UNION ALL
SELECT 'document_print_counters',
       (SELECT count(*) FROM document_print_counters d
         WHERE d.doc_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260706-1283')),
       (SELECT count(*) FROM document_print_counters d
         WHERE d.doc_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260708-1764'));

-- ---------------------------------------------------------------------
-- 3) Detail PO + invoice + pembayaran pembelian di WO-1283
--    (ini history yang harus selamat dan pindah ke WO-1764)
-- ---------------------------------------------------------------------
SELECT po.po_number,
       po.status                      AS po_status,
       po.total_amount,
       po.po_date,
       pi.invoice_number,
       pi.status                      AS invoice_status,
       pi.total_amount                AS invoice_total,
       pi.paid_amount,
       (SELECT count(*)
          FROM purchase_payments pp
         WHERE pp.invoice_id = pi.id) AS jml_pembayaran,
       (SELECT coalesce(sum(pp.amount), 0)
          FROM purchase_payments pp
         WHERE pp.invoice_id = pi.id) AS total_terbayar
FROM purchase_orders po
LEFT JOIN purchase_invoices pi ON pi.po_id = po.id
WHERE po.work_order_id = (SELECT id FROM work_orders WHERE wo_number = 'WO-20260706-1283')
ORDER BY po.po_number;

-- ---------------------------------------------------------------------
-- 4) Daftar semua tabel yang punya FK ke work_orders (sumber kebenaran,
--    supaya tidak ada anak yang terlewat saat merge)
--    aksi_hapus: c=CASCADE, n=SET NULL, r=RESTRICT, a=NO ACTION
-- ---------------------------------------------------------------------
SELECT c.conrelid::regclass::text AS tabel,
       a.attname                   AS kolom,
       c.confdeltype               AS aksi_hapus
FROM pg_constraint c
JOIN pg_attribute a
  ON a.attrelid = c.conrelid
 AND a.attnum   = ANY (c.conkey)
WHERE c.contype = 'f'
  AND c.confrelid = 'public.work_orders'::regclass
ORDER BY 1;

-- ---------------------------------------------------------------------
-- 5) Salinan teks nomor WO yang harus ikut diganti
--    (journal_entries.reference_number ada di DB live; kalau error
--     "column does not exist", hapus baris itu dan jalankan ulang)
-- ---------------------------------------------------------------------
SELECT 'journal_entries.voucher_no'     AS kolom, count(*) AS jumlah
  FROM journal_entries   WHERE voucher_no   LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'journal_entries.reference',        count(*)
  FROM journal_entries   WHERE reference    LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'journal_entries.description',      count(*)
  FROM journal_entries   WHERE description  LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'journal_entries.reference_number', count(*)
  FROM journal_entries   WHERE reference_number LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'journal_entry_items.description',  count(*)
  FROM journal_entry_items WHERE description LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'sales_invoices.invoice_number',    count(*)
  FROM sales_invoices    WHERE invoice_number = 'INV-WO-20260706-1283'
UNION ALL
SELECT 'activity_logs.details',            count(*)
  FROM activity_logs     WHERE details LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'activity_logs.meta.wo_number',     count(*)
  FROM activity_logs     WHERE meta ->> 'wo_number' = 'WO-20260706-1283'
UNION ALL
SELECT 'purchase_orders.notes',            count(*)
  FROM purchase_orders   WHERE notes LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'purchase_requests.notes',          count(*)
  FROM purchase_requests WHERE notes LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'goods_receipts.notes',             count(*)
  FROM goods_receipts    WHERE notes LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'purchase_returns.notes',           count(*)
  FROM purchase_returns  WHERE notes LIKE '%WO-20260706-1283%'
UNION ALL
SELECT 'purchase_payments.notes',          count(*)
  FROM purchase_payments WHERE notes LIKE '%WO-20260706-1283%';

-- ---------------------------------------------------------------------
-- 6) Cek bentrok nomor invoice jasa
--    inv_lama=true & inv_baru=true  ->  script merge akan BERHENTI,
--    karena invoice_number UNIQUE. Kosongkan/void salah satu dulu.
-- ---------------------------------------------------------------------
SELECT EXISTS (SELECT 1 FROM sales_invoices WHERE invoice_number = 'INV-WO-20260706-1283') AS punya_inv_lama,
       EXISTS (SELECT 1 FROM sales_invoices WHERE invoice_number = 'INV-WO-20260708-1764') AS punya_inv_baru;

-- ---------------------------------------------------------------------
-- 7) Cek kolom live opsional di work_orders
--    (grand_total / work_started_at / work_completed_at tidak ada di
--     migrasi repo, tapi kemungkinan ada di DB produksi)
-- ---------------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'work_orders'
  AND column_name IN ('grand_total', 'work_started_at', 'work_completed_at', 'is_locked')
ORDER BY column_name;
