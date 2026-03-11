-- Enable RLS and Add Permissive Read Policy for Inventory Tables

-- 1. Goods
ALTER TABLE public.goods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.goods;
CREATE POLICY "Enable read access for all users" ON public.goods FOR SELECT USING (true);

-- 2. Goods Receipts
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.goods_receipts;
CREATE POLICY "Enable read access for all users" ON public.goods_receipts FOR SELECT USING (true);

-- 3. Goods Receipt Items
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.goods_receipt_items;
CREATE POLICY "Enable read access for all users" ON public.goods_receipt_items FOR SELECT USING (true);

-- 4. Goods Issues
ALTER TABLE public.goods_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.goods_issues;
CREATE POLICY "Enable read access for all users" ON public.goods_issues FOR SELECT USING (true);

-- 5. Goods Issue Items
ALTER TABLE public.goods_issue_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.goods_issue_items;
CREATE POLICY "Enable read access for all users" ON public.goods_issue_items FOR SELECT USING (true);

-- Also fix Work Orders and Purchase Orders just in case
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.work_orders;
CREATE POLICY "Enable read access for all users" ON public.work_orders FOR SELECT USING (true);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.purchase_orders;
CREATE POLICY "Enable read access for all users" ON public.purchase_orders FOR SELECT USING (true);
