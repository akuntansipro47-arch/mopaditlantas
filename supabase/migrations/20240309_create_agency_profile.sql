-- Create agency_profile table for global settings (Kop Surat)
CREATE TABLE IF NOT EXISTS public.agency_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    website TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insert default data if empty
INSERT INTO public.agency_profile (name, address, phone, email)
SELECT 'DITLANTAS POLDA JATIM', 'Jl. Ahmad Yani No.266, Surabaya', '(031) 8292264', 'info@ditlantas-jatim.go.id'
WHERE NOT EXISTS (SELECT 1 FROM public.agency_profile);

-- Enable RLS
ALTER TABLE public.agency_profile ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read (for printing)
CREATE POLICY "Everyone can read agency profile" ON public.agency_profile
    FOR SELECT USING (true);

-- Policy: Only authenticated users (admins) can update
CREATE POLICY "Admins can update agency profile" ON public.agency_profile
    FOR UPDATE USING (auth.role() = 'authenticated');
