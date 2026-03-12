-- 1. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Everyone can read agency profile" ON public.agency_profile;
DROP POLICY IF EXISTS "Admins can update agency profile" ON public.agency_profile;
DROP POLICY IF EXISTS "Admins can insert agency profile" ON public.agency_profile;

-- 2. Re-create policies with corrected logic

-- Allow everyone (including public/anon for printing if needed, or just authenticated) to READ
CREATE POLICY "Everyone can read agency profile" ON public.agency_profile
    FOR SELECT USING (true);

-- Allow ANY authenticated user to UPDATE the profile (since it's a single shared record)
CREATE POLICY "Authenticated users can update agency profile" ON public.agency_profile
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow ANY authenticated user to INSERT (only if empty)
CREATE POLICY "Authenticated users can insert agency profile" ON public.agency_profile
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 3. Force RLS to be enabled (just in case)
ALTER TABLE public.agency_profile ENABLE ROW LEVEL SECURITY;
