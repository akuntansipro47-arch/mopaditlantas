-- =====================================================================
-- MERGE WO — nopol 12012-VIII
--   DARI : WO-20260706-1283  (WO yang salah, punya history PO + pembayaran)
--   KE   : WO-20260708-1764  (WO yang benar)
--
-- Versi ini tahan terhadap tabel yang belum ada di DB (mis.
-- document_print_counters): setiap tabel dicek dulu dengan to_regclass,
-- kalau tidak ada maka langkahnya dilewati + NOTICE.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  c_old_no   constant text := 'WO-20260706-1283';
  c_new_no   constant text := 'WO-20260708-1764';
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

  RAISE NOTICE 'WO sumber  : % (id %, entry %)', c_old_no, v_old, v_old_entry;
  RAISE NOTICE 'WO tujuan  : % (id %, entry %)', c_new_no, v_new, v_new_entry;

  -- Guard: kalau kedua WO sudah punya sales invoice, nomor INV- akan bentrok (UNIQUE)
  IF to_regclass('public.sales_invoices') IS NOT NULL
     AND EXISTS (SELECT 1 FROM sales_invoices WHERE invoice_number = 'INV-' || c_old_no)
     AND EXISTS (SELECT 1 FROM sales_invoices WHERE invoice_number = 'INV-' || c_new_no) THEN
    RAISE EXCEPTION 'Bentrok: kedua WO sudah punya sales invoice (INV-% dan INV-%). Void/kosongkan salah satu dulu, lalu jalankan ulang.', c_old_no, c_new_no;
  END IF;

  ------------------------------------------------------------------
  -- 1) Pindahkan anak WO (relasi by UUID)
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
    -- invoice jasa: INV-WO-20260706-1283 -> INV-WO-20260708-1764
    UPDATE sales_invoices
       SET invoice_number = 'INV-' || c_new_no
     WHERE invoice_number = 'INV-' || c_old_no;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'sales_invoices.invoice_number : % diperbarui', v_n;
  END IF;

  IF to_regclass('public.journal_entries') IS NOT NULL THEN
    -- jurnal: voucher_no / reference / description
    UPDATE journal_entries
       SET voucher_no   = replace(coalesce(voucher_no,   ''), c_old_no, c_new_no),
           reference    = replace(coalesce(reference,    ''), c_old_no, c_new_no),
           description  = replace(coalesce(description,  ''), c_old_no, c_new_no)
     WHERE coalesce(voucher_no,  '') LIKE '%' || c_old_no || '%'
        OR coalesce(reference,   '') LIKE '%' || c_old_no || '%'
        OR coalesce(description, '') LIKE '%' || c_old_no || '%';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'journal_entries (voucher/reference/description) : % diperbarui', v_n;

    -- jurnal: kolom reference_number (hanya ada di DB live)
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
    -- item jurnal: Piutang/Pendapatan WO ...
    UPDATE journal_entry_items
       SET description = replace(coalesce(description, ''), c_old_no, c_new_no)
     WHERE coalesce(description, '') LIKE '%' || c_old_no || '%';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'journal_entry_items.description  : % diperbarui', v_n;
  ELSE
    RAISE NOTICE 'journal_entry_items     : tabel tidak ada, dilewati';
  END IF;

  IF to_regclass('public.activity_logs') IS NOT NULL THEN
    -- activity log: teks details + meta JSONB (wo_number & wo_id)
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

  -- notes bebas yang kebetulan memuat nomor WO
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
  -- 3) Pastikan TIDAK ADA lagi anak yang menunjuk WO lama,
  --    lalu hapus baris WO-1283
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
      RAISE EXCEPTION 'Masih ada sisa referensi di tabel % (%) ke WO lama. Periksa dan pindahkan manual dulu.', r.tbl, r.col;
    END IF;
  END LOOP;

  DELETE FROM work_orders WHERE id = v_old;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'work_orders : % baris dihapus (%)', v_n, c_old_no;

  ------------------------------------------------------------------
  -- 4) Rapikan status entry kendaraan
  ------------------------------------------------------------------
  IF v_old_entry IS NOT NULL AND v_old_entry IS DISTINCT FROM v_new_entry THEN
    RAISE NOTICE 'PERHATIAN: WO lama memakai entry TERPISAH (%) yang sekarang tidak punya WO. Kalau entry itu duplikat, jalankan: UPDATE vehicle_entries SET status = ''CLOSED'' WHERE id = ''%'';',
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
-- VERIFICATION (setelah COMMIT)
-- =====================================================================

-- 0) Cek dulu tabel mana yang ada di DB Anda (yang "false" -> skip query
--    verifikasi terkait, karena tabelnya memang belum dibuat)
SELECT t AS tabel,
       to_regclass('public.' || t) IS NOT NULL AS ada
FROM (VALUES ('work_orders'),
             ('vehicle_entries'),
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

-- A) Nopol 12012-VIII sekarang harus hanya punya 1 WO
SELECT wo.wo_number, wo.status, ve.entry_number, ve.status AS entry_status,
       v.license_plate AS nopol
FROM work_orders wo
JOIN vehicle_entries ve ON ve.id = wo.vehicle_entry_id
JOIN vehicles v          ON v.id  = ve.vehicle_id
WHERE upper(btrim(v.license_plate)) = '12012-VIII'
ORDER BY wo.created_at;

-- B) WO-1283 sudah tidak ada
SELECT count(*) AS sisa_wo_lama
FROM work_orders
WHERE wo_number = 'WO-20260706-1283';

-- C) History PO + pembayaran pembelian sekarang menempel di WO-1764
--    (jalankan hanya kalau purchase_orders & purchase_invoices ada)
SELECT po.po_number,
       wo.wo_number,
       pi.invoice_number,
       pi.status       AS invoice_status,
       pi.paid_amount,
       (SELECT count(*) FROM purchase_payments pp WHERE pp.invoice_id = pi.id) AS jml_bayar,
       (SELECT sum(pp.amount) FROM purchase_payments pp WHERE pp.invoice_id = pi.id) AS total_bayar
FROM purchase_orders po
JOIN work_orders wo          ON wo.id = po.work_order_id
LEFT JOIN purchase_invoices pi ON pi.po_id = po.id
WHERE wo.wo_number = 'WO-20260708-1764'
ORDER BY po.po_number;

-- D) Sisa teks nomor WO lama (jalankan per-QUERY; kalau ada tabel yang
--    "false" di cek nomor 0, lewati query UNION itu saja)
SELECT 'sales_invoices.invoice_number' AS kolom, count(*) AS sisa
  FROM sales_invoices WHERE invoice_number = 'INV-WO-20260706-1283';

SELECT 'journal_entries' AS kolom, count(*) AS sisa
  FROM journal_entries
 WHERE coalesce(voucher_no, '') LIKE '%WO-20260706-1283%'
    OR coalesce(reference, '') LIKE '%WO-20260706-1283%'
    OR coalesce(description, '') LIKE '%WO-20260706-1283%';

SELECT 'journal_entry_items' AS kolom, count(*) AS sisa
  FROM journal_entry_items WHERE description LIKE '%WO-20260706-1283%';

SELECT 'activity_logs' AS kolom, count(*) AS sisa
  FROM activity_logs
 WHERE details LIKE '%WO-20260706-1283%'
    OR meta ->> 'wo_number' = 'WO-20260706-1283';
