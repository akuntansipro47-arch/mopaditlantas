CREATE OR REPLACE FUNCTION public.purchase_detail_report_summary(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS TABLE (
  total_count bigint,
  total_amount numeric,
  total_received_value numeric,
  item_rows bigint
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
final_rows AS (
  SELECT
    pi.*,
    g.item_type AS goods_item_type,
    g.item_code AS goods_item_code,
    g.name AS goods_name,
    g.unit AS goods_unit,
    jt.job_name,
    COALESCE(rbg.received_qty, 0) AS received_qty_raw
  FROM po_item pi
  LEFT JOIN goods g ON g.id = pi.goods_id
  LEFT JOIN job_types jt ON jt.id = pi.job_type_id
  LEFT JOIN received_by_po_goods rbg ON rbg.po_id = pi.id AND rbg.goods_id = pi.goods_id
),
filtered AS (
  SELECT
    fr.*,
    CASE
      WHEN UPPER(COALESCE(fr.line_type, '')) = 'JASA' OR fr.job_type_id IS NOT NULL OR COALESCE(fr.service_name, '') <> '' THEN true
      ELSE false
    END AS is_jasa,
    CASE
      WHEN COALESCE(fr.total_price, 0) <> 0 THEN COALESCE(fr.total_price, 0)
      ELSE COALESCE(fr.qty, 0) * COALESCE(fr.unit_price, 0)
    END AS calc_total_price,
    CASE
      WHEN UPPER(COALESCE(fr.line_type, '')) = 'JASA' OR fr.job_type_id IS NOT NULL OR COALESCE(fr.service_name, '') <> '' THEN COALESCE(fr.qty, 0)
      ELSE COALESCE(fr.received_qty_raw, 0)
    END AS calc_received_qty
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
)
SELECT
  COUNT(*) AS total_count,
  COALESCE(SUM(calc_total_price), 0) AS total_amount,
  COALESCE(SUM(LEAST(COALESCE(qty, 0), COALESCE(calc_received_qty, 0)) * COALESCE(unit_price, 0)), 0) AS total_received_value,
  COUNT(*) AS item_rows
FROM filtered;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_detail_report_summary(date, date, uuid, text) TO anon, authenticated;
