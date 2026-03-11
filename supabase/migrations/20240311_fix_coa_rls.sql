-- Enable RLS on chart_of_accounts if not already enabled
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.chart_of_accounts;

-- Create comprehensive policies

-- 1. Read: Everyone can read COA (needed for dropdowns etc)
CREATE POLICY "Enable read access for all users"
ON public.chart_of_accounts FOR SELECT
USING (true);

-- 2. Insert: Only authenticated users can add accounts
CREATE POLICY "Enable insert for authenticated users only"
ON public.chart_of_accounts FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Update: Only authenticated users can update accounts
CREATE POLICY "Enable update for authenticated users only"
ON public.chart_of_accounts FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Delete: Only authenticated users can delete accounts
CREATE POLICY "Enable delete for authenticated users only"
ON public.chart_of_accounts FOR DELETE
TO authenticated
USING (true);
