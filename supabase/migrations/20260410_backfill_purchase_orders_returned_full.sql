-- Backfill PO status to RETURNED_FULL when all received quantities have been fully returned.

WITH received_by_po_goods AS (
  SELECT
    gr.po_id,
    gri.goods_id,
    SUM(COALESCE(gri.quantity_received, 0))::numeric AS received_qty
  FROM goods_receipts gr
  JOIN goods_receipt_items gri ON gri.receipt_id = gr.id
  WHERE gr.po_id IS NOT NULL
    AND gri.goods_id IS NOT NULL
  GROUP BY gr.po_id, gri.goods_id
),
returned_by_po_goods AS (
  SELECT
    pr.po_id,
    pri.goods_id,
    SUM(COALESCE(pri.quantity_returned, 0))::numeric AS returned_qty
  FROM purchase_returns pr
  JOIN purchase_return_items pri ON pri.return_id = pr.id
  WHERE pr.po_id IS NOT NULL
    AND pri.goods_id IS NOT NULL
  GROUP BY pr.po_id, pri.goods_id
),
po_goods_remaining AS (
  SELECT
    r.po_id,
    r.goods_id,
    r.received_qty,
    COALESCE(x.returned_qty, 0)::numeric AS returned_qty,
    GREATEST(0, r.received_qty - COALESCE(x.returned_qty, 0))::numeric AS remaining_qty
  FROM received_by_po_goods r
  LEFT JOIN returned_by_po_goods x
    ON x.po_id = r.po_id AND x.goods_id = r.goods_id
),
fully_returned_po AS (
  SELECT
    po_id
  FROM po_goods_remaining
  GROUP BY po_id
  HAVING SUM(received_qty) > 0
     AND SUM(remaining_qty) = 0
)
UPDATE purchase_orders p
SET status = 'RETURNED_FULL'
WHERE p.id IN (SELECT po_id FROM fully_returned_po)
  AND COALESCE(p.status, '') <> 'RETURNED_FULL';

