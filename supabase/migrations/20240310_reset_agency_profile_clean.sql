-- 1. Disable RLS temporarily to ensure we can clean up
ALTER TABLE public.agency_profile DISABLE ROW LEVEL SECURITY;

-- 2. Delete ALL existing rows to remove duplicates
DELETE FROM public.agency_profile;

-- 3. Insert exactly ONE fresh row
INSERT INTO public.agency_profile (name, address, phone, email, website, logo_url, updated_at)
VALUES (
    'PT. CONTOH INSTANSI', 
    'Jl. Contoh No. 123, Jakarta', 
    '(021) 12345678', 
    'admin@contoh.com', 
    'www.contoh.com', 
    NULL,
    now()
);

-- 4. Re-enable RLS
ALTER TABLE public.agency_profile ENABLE ROW LEVEL SECURITY;

-- 5. Re-apply policies (just to be safe)
DROP POLICY IF EXISTS "Everyone can read agency profile" ON public.agency_profile;
DROP POLICY IF EXISTS "Authenticated users can update agency profile" ON public.agency_profile;
DROP POLICY IF EXISTS "Authenticated users can insert agency profile" ON public.agency_profile;

CREATE POLICY "Everyone can read agency profile" ON public.agency_profile
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can update agency profile" ON public.agency_profile
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert agency profile" ON public.agency_profile
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
