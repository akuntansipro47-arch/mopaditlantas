-- Reset Agency Profile to generic data
UPDATE public.agency_profile
SET 
    name = 'PT. CONTOH INSTANSI',
    address = 'Jl. Contoh No. 123, Jakarta',
    phone = '(021) 12345678',
    email = 'admin@contoh.com',
    website = 'www.contoh.com',
    logo_url = NULL,
    updated_at = now();
