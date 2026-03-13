-- Fix RLS for goods_issues and related tables
-- Often triggered when Work Order tries to auto-create goods issue

ALTER TABLE goods_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_issue_items ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Enable all access" ON goods_issues;
DROP POLICY IF EXISTS "Enable all access" ON goods_issue_items;
DROP POLICY IF EXISTS "Enable full access for authenticated users" ON goods_issues;
DROP POLICY IF EXISTS "Enable full access for authenticated users" ON goods_issue_items;

-- Create permissive policies for authenticated users
CREATE POLICY "Enable full access for authenticated users" 
ON goods_issues 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Enable full access for authenticated users" 
ON goods_issue_items 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
