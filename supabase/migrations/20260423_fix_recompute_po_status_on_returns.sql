CREATE OR REPLACE FUNCTION public.recompute_purchase_order_status(po_uuid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  remaining_count integer;
  fully_received boolean;
BEGIN
  IF po_uuid IS NULL THEN
    RETURN;
  END IF;

  WITH ordered_by_goods AS (
    SELECT
      poi.goods_id,
      SUM(COALESCE(poi.quantity, 0))::numeric AS ordered_qty
    FROM purchase_order_items poi
    WHERE poi.po_id = po_uuid
      AND poi.goods_id IS NOT NULL
    GROUP BY poi.goods_id
  ),
  received_by_goods AS (
    SELECT
      gri.goods_id,
      SUM(COALESCE(gri.quantity_received, 0))::numeric AS received_qty
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gri.receipt_id = gr.id
    WHERE gr.po_id = po_uuid
      AND gri.goods_id IS NOT NULL
    GROUP BY gri.goods_id
  ),
  returned_by_goods AS (
    SELECT
      pri.goods_id,
      SUM(COALESCE(pri.quantity_returned, 0))::numeric AS returned_qty
    FROM purchase_returns pr
    JOIN purchase_return_items pri ON pri.return_id = pr.id
    WHERE pr.po_id = po_uuid
      AND pri.goods_id IS NOT NULL
    GROUP BY pri.goods_id
  ),
  remaining AS (
    SELECT
      r.goods_id,
      GREATEST(0, r.received_qty - COALESCE(x.returned_qty, 0))::numeric AS remaining_qty
    FROM received_by_goods r
    LEFT JOIN returned_by_goods x ON x.goods_id = r.goods_id
  ),
  receive_comparison AS (
    SELECT
      o.goods_id,
      o.ordered_qty,
      COALESCE(r.received_qty, 0)::numeric AS received_qty
    FROM ordered_by_goods o
    LEFT JOIN received_by_goods r ON r.goods_id = o.goods_id
  )
  SELECT
    (SELECT COUNT(*) FROM remaining WHERE remaining_qty > 0),
    (SELECT COALESCE(BOOL_AND(received_qty >= ordered_qty), false) FROM receive_comparison)
  INTO remaining_count, fully_received;

  IF COALESCE(remaining_count, 0) = 0 AND EXISTS (SELECT 1 FROM purchase_returns pr WHERE pr.po_id = po_uuid) THEN
    UPDATE purchase_orders
    SET status = 'RETURNED_FULL'
    WHERE id = po_uuid;
    RETURN;
  END IF;

  IF fully_received THEN
    UPDATE purchase_orders
    SET status = 'RECEIVED_FULL'
    WHERE id = po_uuid;
  ELSE
    UPDATE purchase_orders
    SET status = 'RECEIVED_PART'
    WHERE id = po_uuid;
  END IF;
END;
$$;
