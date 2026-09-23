-- =====================================================================
-- MERGE WO GENERIK — untuk case "1 estimasi/entry salah, tapi WO salah
--                      itu sudah punya history PO + pembayaran pembelian"
--
-- HASIL AKHIR: WO sumber dihapus, semua anaknya pindah ke WO tujuan,
--              salinan teks nomor WO diganti, nopol/estimasi kembali
--              hanya punya 1 WO.
--
-- >>> GANTI HANYA 2 TEMPAT YANG DITANDAI "GANTI NOMOR DI SINI" <<<
--
-- SEBELUM JALAN: backup + jalankan pre-check di bagian bawah file ini.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  ------------------------------------------------------------------
  -- GANTI NOMOR DI SINI (1/2)
  ------------------------------------------------------------------
  c_old_no   constant text := 'WO-20260629-5068';   -- WO YANG SALAH (akan dihapus)
  c_new_no   constant text := 'WO-20260623-4190';  -- WO YANG BENAR (akan menampung)

  v_old        uuid;
  v_new        uuid;
  v_old_entry  uuid;
  v_new_entry  uuid;
  v_n          integer;
  v_rem        boolean;
  r            record;
BEGIN
  ------------------------------------------------------------------
  -- 0) Cari ID kedua WO + guard
  ------------------------------------------------------------------
  SELECT id, vehicle_entry_id INTO v_old, v_old_entry
    FROM work_orders WHERE wo_number = c_old_no;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'WO % tidak ditemukan. Cek lagi nomornya.', c_old_no;
  END IF;

  SELECT id, vehicle_entry_id INTO v_new, v_new_entry
    FROM work_orders WHERE wo_number = c_new_no;
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'WO % tidak ditemukan. Cek lagi nomornya.', c_new_no;
  END IF;

  IF v_old = v_new THEN
    RAISE EXCEPTION 'WO sumber dan tujuan ternyata ID yang sama.';
  END IF;

  RAISE NOTICE 'WO sumber (akan dihapus) : % (id %, entry %)', c_old_no, v_old, v_old_entry;
  RAISE NOTICE 'WO tujuan (dipertahankan) : % (id %, entry %)', c_new_no, v_new, v_new_entry;
  IF v_old_entry IS NOT NULL AND v_old_entry = v_new_entry THEN
    RAISE NOTICE 'Kedua WO berasal dari ESTIMASI/ENTRY YANG SAMA -> memang kasus duplikat.';
  ELSE
    RAISE NOTICE 'Kedua WO berasal dari entry BERBEDA -> pastikan memang ini yang dimaksud (bukan WO sah dari estimasi lain).';
  END IF;

  -- Guard: kalau kedua WO sudah punya sales invoice, nomor INV- akan bentrok (UNIQUE)
  IF to_regclass('public.sales_invoices') IS NOT NULL
     AND EXISTS (SELECT 1 FROM sales_invoices WHERE invoice_number = 'INV-' || c_old_no)
     AND EXISTS (SELECT 1 FROM sales_invoices WHERE invoice_number = 'INV-' || c_new_no) THEN
    RAISE EXCEPTION 'Bentrok: kedua WO sudah punya sales invoice (INV-% dan INV-%). Void/kosongkan salah satu dulu, lalu jalankan ulang.', c_old_no, c_new_no;
  END IF;

  ------------------------------------------------------------------
  -- 1) Pindahkan anak WO (relasi by UUID) — PO, PR, pembayaran ikut
  ------------------------------------------------------------------
  IF to_regclass('public.purchase_orders') IS NOT NULL THEN
    UPDATE purchase_orders SET work_order_id = v_new WHERE work_order_id = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'purchase_orders        : % baris dipindah', v_n;
  ELSE
    RAISE NOTICE 'purchase_orders        : tabel tidak ada, dilewati';
  END IF;

  IF to_regclass('public.purchase_requests') IS NOT NULL THEN
    UPDATE purchase_requests SET work_order_id = v_new WHERE work_order_id = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'purchase_requests      : % baris dipindah', v_n;
  ELSE
    RAISE NOTICE 'purchase_requests      : tabel tidak ada, dilewati';
  END IF;

  IF to_regclass('public.goods_issues') IS NOT NULL THEN
    UPDATE goods_issues SET work_order_id = v_new WHERE work_order_id = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'goods_issues           : % baris dipindah', v_n;
  ELSE
    RAISE NOTICE 'goods_issues           : tabel tidak ada, dilewati';
  END IF;

  IF to_regclass('public.sales_invoices') IS NOT NULL THEN
    UPDATE sales_invoices SET work_order_id = v_new WHERE work_order_id = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'sales_invoices         : % baris dipindah', v_n;
  ELSE
    RAISE NOTICE 'sales_invoices         : tabel tidak ada, dilewati';
  END IF;

  IF to_regclass('public.work_order_billings') IS NOT NULL THEN
    UPDATE work_order_billings SET work_order_id = v_new WHERE work_order_id = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'work_order_billings    : % baris dipindah', v_n;
  ELSE
    RAISE NOTICE 'work_order_billings    : tabel tidak ada, dilewati';
  END IF;

  IF to_regclass('public.work_order_images') IS NOT NULL THEN
    UPDATE work_order_images SET work_order_id = v_new WHERE work_order_id = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'work_order_images      : % baris dipindah', v_n;
  ELSE
    RAISE NOTICE 'work_order_images      : tabel tidak ada, dilewati';
  END IF;

  IF to_regclass('public.document_print_counters') IS NOT NULL THEN
    UPDATE document_print_counters SET doc_id = v_new WHERE doc_id = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'document_print_counters: % baris dipindah', v_n;
  ELSE
    RAISE NOTICE 'document_print_counters: tabel tidak ada, dilewati';
  END IF;

  ------------------------------------------------------------------
  -- 2) Ganti salinan teks nomor WO
  ------------------------------------------------------------------
  IF to_regclass('public.sales_invoices') IS NOT NULL THEN
    UPDATE sales_invoices
       SET invoice_number = 'INV-' || c_new_no
     WHERE invoice_number = 'INV-' || c_old_no;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'sales_invoices.invoice_number : % diperbarui', v_n;
  END IF;

  IF to_regclass('public.journal_entries') IS NOT NULL THEN
    UPDATE journal_entries
       SET voucher_no   = replace(coalesce(voucher_no,   ''), c_old_no, c_new_no),
           reference    = replace(coalesce(reference,    ''), c_old_no, c_new_no),
           description  = replace(coalesce(description,  ''), c_old_no, c_new_no)
     WHERE coalesce(voucher_no,  '') LIKE '%' || c_old_no || '%'
        OR coalesce(reference,   '') LIKE '%' || c_old_no || '%'
        OR coalesce(description, '') LIKE '%' || c_old_no || '%';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'journal_entries (voucher/reference/description) : % diperbarui', v_n;

    IF EXISTS (SELECT 1
                 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name   = 'journal_entries'
                  AND column_name  = 'reference_number') THEN
      EXECUTE $q$
                UPDATE journal_entries
                   SET reference_number = replace(coalesce(reference_number, ''), $1, $2)
                 WHERE coalesce(reference_number, '') LIKE '%' || $1 || '%'
             $q$
      USING c_old_no, c_new_no;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE NOTICE 'journal_entries.reference_number : % diperbarui', v_n;
    ELSE
      RAISE NOTICE 'journal_entries.reference_number : kolom tidak ada, dilewati';
    END IF;
  ELSE
    RAISE NOTICE 'journal_entries         : tabel tidak ada, dilewati';
  END IF;

  IF to_regclass('public.journal_entry_items') IS NOT NULL THEN
    UPDATE journal_entry_items
       SET description = replace(coalesce(description, ''), c_old_no, c_new_no)
     WHERE coalesce(description, '') LIKE '%' || c_old_no || '%';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'journal_entry_items.description  : % diperbarui', v_n;
  ELSE
    RAISE NOTICE 'journal_entry_items     : tabel tidak ada, dilewati';
  END IF;

  IF to_regclass('public.activity_logs') IS NOT NULL THEN
    UPDATE activity_logs
       SET details = replace(coalesce(details, ''), c_old_no, c_new_no),
           meta = CASE
                    WHEN meta ? 'wo_number' AND meta ->> 'wo_number' = c_old_no
                      THEN jsonb_set(meta, '{wo_number}', to_jsonb(c_new_no))
                    WHEN meta ? 'wo_id' AND meta ->> 'wo_id' = v_old::text
                      THEN jsonb_set(meta, '{wo_id}',      to_jsonb(v_new::text))
                    ELSE meta
                  END
     WHERE coalesce(details, '') LIKE '%' || c_old_no || '%'
        OR coalesce(meta ->> 'wo_number', '') = c_old_no
        OR coalesce(meta ->> 'wo_id', '')     = v_old::text;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'activity_logs                : % diperbarui', v_n;
  ELSE
    RAISE NOTICE 'activity_logs            : tabel tidak ada, dilewati';
  END IF;

  -- notes bebas yang memuat nomor WO
  IF to_regclass('public.purchase_orders') IS NOT NULL THEN
    UPDATE purchase_orders SET notes = replace(notes, c_old_no, c_new_no) WHERE notes LIKE '%' || c_old_no || '%';
  END IF;
  IF to_regclass('public.purchase_requests') IS NOT NULL THEN
    UPDATE purchase_requests SET notes = replace(notes, c_old_no, c_new_no) WHERE notes LIKE '%' || c_old_no || '%';
  END IF;
  IF to_regclass('public.goods_receipts') IS NOT NULL THEN
    UPDATE goods_receipts SET notes = replace(notes, c_old_no, c_new_no) WHERE notes LIKE '%' || c_old_no || '%';
  END IF;
  IF to_regclass('public.purchase_returns') IS NOT NULL THEN
    UPDATE purchase_returns SET notes = replace(notes, c_old_no, c_new_no) WHERE notes LIKE '%' || c_old_no || '%';
  END IF;
  IF to_regclass('public.purchase_payments') IS NOT NULL THEN
    UPDATE purchase_payments SET notes = replace(notes, c_old_no, c_new_no) WHERE notes LIKE '%' || c_old_no || '%';
  END IF;
  RAISE NOTICE 'notes (PO/PR/GR/Return/Payment) : selesai dicek';

  ------------------------------------------------------------------
  -- 3) Pastikan TIDAK ADA lagi anak yang menunjuk WO sumber,
  --    lalu hapus baris WO sumber
  ------------------------------------------------------------------
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl,
           a.attname                   AS col
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum   = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.work_orders'::regclass
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', r.tbl, r.col)
       USING v_old
       INTO v_rem;
    IF v_rem THEN
      RAISE EXCEPTION 'Masih ada sisa referensi di tabel % (%) ke WO sumber. Periksa dan pindahkan manual dulu.', r.tbl, r.col;
    END IF;
  END LOOP;

  DELETE FROM work_orders WHERE id = v_old;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'work_orders : % baris dihapus (%)', v_n, c_old_no;

  ------------------------------------------------------------------
  -- 4) Rapikan status entry kendaraan
  ------------------------------------------------------------------
  IF v_old_entry IS NOT NULL AND v_old_entry IS DISTINCT FROM v_new_entry THEN
    RAISE NOTICE 'PERHATIAN: WO sumber memakai entry TERPISAH (%) yang sekarang tidak punya WO. Kalau entry itu duplikat, jalankan: UPDATE vehicle_entries SET status = ''CLOSED'' WHERE id = ''%'';',
                 v_old_entry, v_old_entry;
  END IF;

  UPDATE vehicle_entries
     SET status = 'PROCESSED'
   WHERE id = v_new_entry
     AND status = 'OPEN';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE 'vehicle_entries : status entry tujuan jadi PROCESSED';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- VERIFICATION
-- >>> GANTI NOMOR DI SINI (2/2) — dua literal di bawah ini saja <<<
-- =====================================================================
WITH p AS (
  SELECT 'WO-20260629-5068'::text  AS old_no,   -- WO yang dihapus
         'WO-20260623-4190'::text AS new_no    -- WO yang dipertahankan
)
-- A) WO sumber sudah tidak ada
SELECT (SELECT count(*) FROM work_orders wo, p WHERE wo.wo_number = p.old_no) AS sisa_wo_sumber,
       (SELECT count(*) FROM work_orders wo, p WHERE wo.wo_number = p.new_no) AS wo_tujuan_ada;

-- B) Nopol & estimasi keduanya: pastikan hanya tersisa WO tujuan
SELECT wo.wo_number, wo.status, ve.entry_number, ve.entry_date,
       v.license_plate AS nopol
FROM work_orders wo
JOIN vehicle_entries ve ON ve.id = wo.vehicle_entry_id
JOIN vehicles v          ON v.id  = ve.vehicle_id
WHERE v.license_plate = (
        SELECT upper(btrim(v2.license_plate))
          FROM work_orders wo2
          JOIN vehicle_entries ve2 ON ve2.id = wo2.vehicle_entry_id
          JOIN vehicles v2          ON v2.id  = ve2.vehicle_id
         WHERE wo2.wo_number = 'WO-20260623-4190'
       )
ORDER BY wo.created_at;

-- C) PO + pembayaran pembelian sekarang menempel di WO tujuan
SELECT po.po_number, wo.wo_number, pi.invoice_number,
       pi.status AS invoice_status, pi.paid_amount,
       (SELECT count(*) FROM purchase_payments pp WHERE pp.invoice_id = pi.id) AS jml_bayar,
       (SELECT sum(pp.amount) FROM purchase_payments pp WHERE pp.invoice_id = pi.id) AS total_bayar
FROM purchase_orders po
JOIN work_orders wo ON wo.id = po.work_order_id
LEFT JOIN purchase_invoices pi ON pi.po_id = po.id
WHERE wo.wo_number = 'WO-20260623-4190'
ORDER BY po.po_number;

-- D) Sisa teks nomor WO sumber (harus 0 semua)
SELECT 'journal_entries' AS kolom, count(*) AS sisa
  FROM journal_entries
 WHERE coalesce(voucher_no,'')   LIKE '%WO-20260629-5068%'
    OR coalesce(reference,'')    LIKE '%WO-20260629-5068%'
    OR coalesce(description,'')  LIKE '%WO-20260629-5068%'
UNION ALL
SELECT 'sales_invoices.invoice_number', count(*)
  FROM sales_invoices WHERE invoice_number = 'INV-WO-20260629-5068'
UNION ALL
SELECT 'activity_logs.details', count(*)
  FROM activity_logs WHERE details LIKE '%WO-20260629-5068%'
UNION ALL
SELECT 'activity_logs.meta.wo_number', count(*)
  FROM activity_logs WHERE meta ->> 'wo_number' = 'WO-20260629-5068';

-- =====================================================================
-- PRE-CHECK (jalankan dulu sebelum script di atas)
-- Ganti kedua nomor di bawah ini juga.
-- =====================================================================
-- 1) Kedua WO + estimasi/entry masing-masing + nopol
-- SELECT wo.id, wo.wo_number, wo.status, wo.work_date, wo.created_at,
--        ve.id AS entry_id, ve.entry_number, ve.entry_date, ve.status AS entry_status,
--        v.license_plate AS nopol,
--        (SELECT count(*) FROM vehicle_entry_jobs j WHERE j.vehicle_entry_id = ve.id) AS jml_baris_estimasi
-- FROM work_orders wo
-- LEFT JOIN vehicle_entries ve ON ve.id = wo.vehicle_entry_id
-- LEFT JOIN vehicles v ON v.id = ve.vehicle_id
-- WHERE wo.wo_number IN ('WO-20260629-5068', 'WO-20260623-4190')
-- ORDER BY wo.created_at;
--
-- 2) Jumlah anak tiap WO (siapa yang membawa PO/pembayaran)
-- SELECT wo.wo_number,
--        (SELECT count(*) FROM purchase_orders p WHERE p.work_order_id = wo.id)      AS jml_po,
--        (SELECT count(*) FROM purchase_requests p WHERE p.work_order_id = wo.id)    AS jml_pr,
--        (SELECT count(*) FROM sales_invoices s WHERE s.work_order_id = wo.id)       AS jml_sales_inv,
--        (SELECT count(*) FROM goods_issues g WHERE g.work_order_id = wo.id)         AS jml_gi,
--        (SELECT count(*) FROM work_order_billings b WHERE b.work_order_id = wo.id)  AS jml_billing,
--        (SELECT count(*) FROM work_order_images i WHERE i.work_order_id = wo.id)    AS jml_gambar
-- FROM work_orders wo
-- WHERE wo.wo_number IN ('WO-20260629-5068', 'WO-20260623-4190');
--
-- 3) Bentrok invoice jasa (keduanya true -> harus void salah satu dulu)
-- SELECT EXISTS (SELECT 1 FROM sales_invoices WHERE invoice_number = 'INV-WO-20260629-5068')  AS punya_inv_sumber,
--        EXISTS (SELECT 1 FROM sales_invoices WHERE invoice_number = 'INV-WO-20260623-4190') AS punya_inv_tujuan;
