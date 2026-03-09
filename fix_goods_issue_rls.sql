-- Fix RLS error for Goods Issue transaction
-- Corrected version: Removed sequence grants as ID is UUID

-- 1. Disable RLS for Goods Issues table
ALTER TABLE goods_issues DISABLE ROW LEVEL SECURITY;

-- 2. Disable RLS for Goods Issue Items table (details)
ALTER TABLE goods_issue_items DISABLE ROW LEVEL SECURITY;

-- 3. Grant permissions to public/anon role
GRANT ALL ON goods_issues TO anon;
GRANT ALL ON goods_issues TO authenticated;
GRANT ALL ON goods_issue_items TO anon;
GRANT ALL ON goods_issue_items TO authenticated;
