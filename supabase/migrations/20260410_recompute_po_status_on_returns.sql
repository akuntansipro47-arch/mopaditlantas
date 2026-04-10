-- Recompute purchase_orders.status when purchase return items change.

CREATE OR REPLACE FUNCTION public.recompute_purchase_order_status(po_uuid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  has_returns boolean;
  remaining_count integer;
BEGIN
  IF po_uuid IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM purchase_returns pr WHERE pr.po_id = po_uuid
  ) INTO has_returns;

  IF NOT has_returns THEN
    RETURN;
  END IF;

  WITH received_by_goods AS (
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
  )
  SELECT COUNT(*)
  INTO remaining_count
  FROM remaining
  WHERE remaining_qty > 0;

  IF COALESCE(remaining_count, 0) = 0 THEN
    UPDATE purchase_orders
    SET status = 'RETURNED_FULL'
    WHERE id = po_uuid;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_return_items_after_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  po_uuid uuid;
BEGIN
  SELECT pr.po_id
  INTO po_uuid
  FROM public.purchase_returns pr
  WHERE pr.id = COALESCE(NEW.return_id, OLD.return_id)
  LIMIT 1;

  PERFORM public.recompute_purchase_order_status(po_uuid);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_return_items_recompute_po_status ON public.purchase_return_items;

CREATE TRIGGER trg_purchase_return_items_recompute_po_status
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_return_items
FOR EACH ROW
EXECUTE FUNCTION public.purchase_return_items_after_change();
