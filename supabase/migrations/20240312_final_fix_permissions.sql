-- Enable RLS for goods_issues and goods_issue_items (Standard practice, even if public)
ALTER TABLE goods_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_issue_items ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to ensure a clean slate
-- We use a broad set of DROP statements to catch any potential existing policy names
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON goods_issues;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON goods_issue_items;
DROP POLICY IF EXISTS "Public access" ON goods_issues;
DROP POLICY IF EXISTS "Public access" ON goods_issue_items;
DROP POLICY IF EXISTS "Allow all for authenticated" ON goods_issues;
DROP POLICY IF EXISTS "Allow all for authenticated" ON goods_issue_items;
DROP POLICY IF EXISTS "Enable all access for anon" ON goods_issues;
DROP POLICY IF EXISTS "Enable all access for anon" ON goods_issue_items;

-- Create permissive policies for goods_issues (TO public = allows anon/unauthenticated access)
-- CRITICAL: Since the app uses custom auth (not Supabase Auth), the client is technically 'anon'.
CREATE POLICY "Enable all access for public" ON goods_issues
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

-- Create permissive policies for goods_issue_items
CREATE POLICY "Enable all access for public" ON goods_issue_items
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

-- Grant permissions to anon and authenticated roles
GRANT ALL ON goods_issues TO anon, authenticated, service_role;
GRANT ALL ON goods_issue_items TO anon, authenticated, service_role;

-- Also fix work_order_billings just in case
ALTER TABLE work_order_billings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON work_order_billings;
DROP POLICY IF EXISTS "Enable all access for public" ON work_order_billings;

CREATE POLICY "Enable all access for public" ON work_order_billings
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

GRANT ALL ON work_order_billings TO anon, authenticated, service_role;

-- Also fix work_orders
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON work_orders;
DROP POLICY IF EXISTS "Enable all access for public" ON work_orders;

CREATE POLICY "Enable all access for public" ON work_orders
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

GRANT ALL ON work_orders TO anon, authenticated, service_role;

-- Fix GOODS table (for stock updates)
ALTER TABLE goods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON goods;
DROP POLICY IF EXISTS "Enable all access for public" ON goods;

CREATE POLICY "Enable all access for public" ON goods
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

GRANT ALL ON goods TO anon, authenticated, service_role;
