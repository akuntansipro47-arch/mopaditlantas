-- Script to FIX "Row Level Security" errors
-- Since we are using a custom login system (not Supabase Auth), 
-- we need to allow the application (which runs as 'anon') to modify data.

-- Option 1: Disable RLS completely (Simplest for this use case)
ALTER TABLE vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE goods DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE mechanics DISABLE ROW LEVEL SECURITY;
ALTER TABLE job_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE budget_periods DISABLE ROW LEVEL SECURITY;
ALTER TABLE budget_allocations DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_entry_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts DISABLE ROW LEVEL SECURITY;
ALTER TABLE goods_issues DISABLE ROW LEVEL SECURITY;
ALTER TABLE goods_issue_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;

-- Option 2: If you prefer to keep RLS enabled, uncomment below and run these instead of above
/*
CREATE POLICY "Public Access Vehicles" ON vehicles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Goods" ON goods FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Suppliers" ON suppliers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Mechanics" ON mechanics FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access JobTypes" ON job_types FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access BudgetPeriods" ON budget_periods FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access BudgetAllocations" ON budget_allocations FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access VehicleEntries" ON vehicle_entries FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access VehicleEntryJobs" ON vehicle_entry_jobs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access WorkOrders" ON work_orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access PurchaseOrders" ON purchase_orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access POItems" ON purchase_order_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access GoodsReceipts" ON goods_receipts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access GoodsIssues" ON goods_issues FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access GoodsIssueItems" ON goods_issue_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Access AppUsers" ON app_users FOR ALL TO anon USING (true) WITH CHECK (true);
*/
