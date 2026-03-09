-- Ensure RLS is enabled (idempotent)
ALTER TABLE work_order_billings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON work_order_billings;
DROP POLICY IF EXISTS "Enable all access for anon users" ON work_order_billings;

-- Create comprehensive policies
CREATE POLICY "Enable all access for authenticated users" 
ON work_order_billings FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Enable all access for anon users" 
ON work_order_billings FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

-- Also ensure service_role has access (implicit, but good to be aware)
