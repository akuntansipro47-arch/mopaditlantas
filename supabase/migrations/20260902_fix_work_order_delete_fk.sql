-- Fix: Work Order tidak bisa dihapus karena FK constraint (terutama dari purchase_orders).
-- Target:
-- - purchase_orders.work_order_id  -> ON DELETE SET NULL (link opsional)
-- - purchase_requests.work_order_id -> ON DELETE CASCADE (PR tidak bisa berdiri tanpa WO)
-- - sales_invoices.work_order_id   -> ON DELETE SET NULL (link opsional)

-- 1) PO -> WO (opsional): ketika WO dihapus, relasi pada PO jadi NULL
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_work_order_id_fkey;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_work_order_id_fkey
  FOREIGN KEY (work_order_id)
  REFERENCES public.work_orders(id)
  ON DELETE SET NULL;

-- 2) PR -> WO (wajib): ketika WO dihapus, PR ikut terhapus
ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_work_order_id_fkey;

ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_work_order_id_fkey
  FOREIGN KEY (work_order_id)
  REFERENCES public.work_orders(id)
  ON DELETE CASCADE;

-- 3) Sales Invoice -> WO (opsional): ketika WO dihapus, relasi pada invoice jadi NULL
ALTER TABLE public.sales_invoices
  DROP CONSTRAINT IF EXISTS sales_invoices_work_order_id_fkey;

ALTER TABLE public.sales_invoices
  ADD CONSTRAINT sales_invoices_work_order_id_fkey
  FOREIGN KEY (work_order_id)
  REFERENCES public.work_orders(id)
  ON DELETE SET NULL;

