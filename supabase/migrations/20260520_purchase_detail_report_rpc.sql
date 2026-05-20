CREATE OR REPLACE FUNCTION public.purchase_detail_report_rows(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  total_count bigint,
  po_id uuid,
  po_number text,
  po_date date,
  po_created_at timestamptz,
  po_status text,
  supplier_id uuid,
  supplier_name text,
  work_order_id uuid,
  wo_number text,
  license_plate text,
  vehicle_brand_type text,
  vehicle_type text,
  service_group text,
  line_type text,
  item_type text,
  item_code text,
  item_name text,
  item_brand text,
  unit text,
  qty numeric,
  unit_price numeric,
  total_price numeric,
  received_qty numeric,
  returned_qty numeric,
  payment_status_label text
)
LANGUAGE sql
STABLE
AS $$
WITH
po_base AS (
  SELECT
    po.id,
    po.po_number,
    po.po_date,
    po.created_at,
    po.status,
    po.supplier_id,
    po.work_order_id
  FROM purchase_orders po
  WHERE po.status IS DISTINCT FROM 'CANCELLED'
    AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
    AND (
      p_start_date IS NULL OR COALESCE(po.po_date, (po.created_at AT TIME ZONE 'UTC')::date) >= p_start_date
    )
    AND (
      p_end_date IS NULL OR COALESCE(po.po_date, (po.created_at AT TIME ZONE 'UTC')::date) <= p_end_date
    )
),
po_join AS (
  SELECT
    po.*,
    s.name AS supplier_name,
    wo.wo_number,
    v.license_plate,
    v.brand_type AS vehicle_brand_type,
    v.vehicle_type,
    ve.service_group
  FROM po_base po
  LEFT JOIN suppliers s ON s.id = po.supplier_id
  LEFT JOIN work_orders wo ON wo.id = po.work_order_id
  LEFT JOIN vehicle_entries ve ON ve.id = wo.vehicle_entry_id
  LEFT JOIN vehicles v ON v.id = ve.vehicle_id
),
po_item AS (
  SELECT
    pj.*,
    poi.line_type,
    poi.job_type_id,
    poi.service_name,
    poi.goods_id,
    poi.brand AS item_brand,
    COALESCE(poi.quantity, 0) AS qty,
    COALESCE(poi.unit_price, 0) AS unit_price,
    COALESCE(poi.total_price, 0) AS total_price
  FROM po_join pj
  LEFT JOIN purchase_order_items poi ON poi.po_id = pj.id
),
received_by_po_goods AS (
  SELECT
    gr.po_id,
    gri.goods_id,
    SUM(COALESCE(gri.quantity_received, 0)) AS received_qty
  FROM goods_receipts gr
  JOIN goods_receipt_items gri ON gri.receipt_id = gr.id
  GROUP BY gr.po_id, gri.goods_id
),
returned_by_po_goods AS (
  SELECT
    pr.po_id,
    pri.goods_id,
    SUM(COALESCE(pri.quantity_returned, 0)) AS returned_qty
  FROM purchase_returns pr
  JOIN purchase_return_items pri ON pri.return_id = pr.id
  GROUP BY pr.po_id, pri.goods_id
),
invoice_status_by_po AS (
  SELECT
    pi.po_id,
    BOOL_OR(UPPER(COALESCE(pi.status, '')) = 'PAID') AS has_paid,
    BOOL_OR(UPPER(COALESCE(pi.status, '')) = 'PARTIAL') AS has_partial,
    COUNT(*) AS invoice_count
  FROM purchase_invoices pi
  GROUP BY pi.po_id
),
final_rows AS (
  SELECT
    pi.*,
    g.item_type AS goods_item_type,
    g.item_code AS goods_item_code,
    g.name AS goods_name,
    g.unit AS goods_unit,
    jt.job_name,
    COALESCE(rbg.received_qty, 0) AS received_qty_raw,
    COALESCE(retbg.returned_qty, 0) AS returned_qty_raw,
    COALESCE(inv.invoice_count, 0) AS invoice_count,
    COALESCE(inv.has_paid, false) AS has_paid,
    COALESCE(inv.has_partial, false) AS has_partial
  FROM po_item pi
  LEFT JOIN goods g ON g.id = pi.goods_id
  LEFT JOIN job_types jt ON jt.id = pi.job_type_id
  LEFT JOIN received_by_po_goods rbg ON rbg.po_id = pi.id AND rbg.goods_id = pi.goods_id
  LEFT JOIN returned_by_po_goods retbg ON retbg.po_id = pi.id AND retbg.goods_id = pi.goods_id
  LEFT JOIN invoice_status_by_po inv ON inv.po_id = pi.id
)
SELECT
  COUNT(*) OVER() AS total_count,
  fr.id AS po_id,
  fr.po_number,
  fr.po_date,
  fr.created_at AS po_created_at,
  fr.status AS po_status,
  fr.supplier_id,
  fr.supplier_name,
  fr.work_order_id,
  fr.wo_number,
  fr.license_plate,
  fr.vehicle_brand_type,
  fr.vehicle_type,
  fr.service_group,
  fr.line_type,
  CASE
    WHEN UPPER(COALESCE(fr.line_type, '')) = 'JASA' OR fr.job_type_id IS NOT NULL OR COALESCE(fr.service_name, '') <> '' THEN 'JASA'
    ELSE COALESCE(fr.goods_item_type, 'PART')
  END AS item_type,
  CASE
    WHEN UPPER(COALESCE(fr.line_type, '')) = 'JASA' OR fr.job_type_id IS NOT NULL OR COALESCE(fr.service_name, '') <> '' THEN '-'
    ELSE COALESCE(fr.goods_item_code, '-')
  END AS item_code,
  CASE
    WHEN fr.line_type IS NULL AND fr.goods_id IS NULL AND fr.job_type_id IS NULL AND COALESCE(fr.service_name, '') = '' THEN '(Tidak ada item)'
    WHEN UPPER(COALESCE(fr.line_type, '')) = 'JASA' OR fr.job_type_id IS NOT NULL OR COALESCE(fr.service_name, '') <> '' THEN COALESCE(fr.job_name, NULLIF(TRIM(fr.service_name), ''), 'Jasa')
    ELSE COALESCE(fr.goods_name, '-')
  END AS item_name,
  COALESCE(TRIM(fr.item_brand), '') AS item_brand,
  CASE
    WHEN UPPER(COALESCE(fr.line_type, '')) = 'JASA' OR fr.job_type_id IS NOT NULL OR COALESCE(fr.service_name, '') <> '' THEN ''
    ELSE COALESCE(fr.goods_unit, '')
  END AS unit,
  COALESCE(fr.qty, 0) AS qty,
  COALESCE(fr.unit_price, 0) AS unit_price,
  CASE
    WHEN COALESCE(fr.total_price, 0) <> 0 THEN COALESCE(fr.total_price, 0)
    ELSE COALESCE(fr.qty, 0) * COALESCE(fr.unit_price, 0)
  END AS total_price,
  CASE
    WHEN UPPER(COALESCE(fr.line_type, '')) = 'JASA' OR fr.job_type_id IS NOT NULL OR COALESCE(fr.service_name, '') <> '' THEN COALESCE(fr.qty, 0)
    ELSE COALESCE(fr.received_qty_raw, 0)
  END AS received_qty,
  CASE
    WHEN UPPER(COALESCE(fr.line_type, '')) = 'JASA' OR fr.job_type_id IS NOT NULL OR COALESCE(fr.service_name, '') <> '' THEN 0
    ELSE COALESCE(fr.returned_qty_raw, 0)
  END AS returned_qty,
  CASE
    WHEN fr.invoice_count = 0 THEN 'Belum Ditagih'
    WHEN fr.has_paid THEN 'Lunas'
    WHEN fr.has_partial THEN 'Bayar Sebagian'
    ELSE 'Belum Lunas'
  END AS payment_status_label
FROM final_rows fr
WHERE
  (
    p_query IS NULL
    OR TRIM(p_query) = ''
    OR (
      COALESCE(fr.po_number, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.supplier_name, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.wo_number, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.license_plate, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.vehicle_brand_type, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.vehicle_type, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.goods_name, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.goods_item_code, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.job_name, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.service_name, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.item_brand, '') ILIKE ('%' || p_query || '%')
      OR COALESCE(fr.status, '') ILIKE ('%' || p_query || '%')
    )
  )
ORDER BY COALESCE(fr.po_date, (fr.created_at AT TIME ZONE 'UTC')::date) DESC, fr.created_at DESC, fr.po_number DESC
LIMIT GREATEST(COALESCE(p_limit, 200), 1)
OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.purchase_detail_report_rows(date, date, uuid, text, int, int) TO anon, authenticated;
