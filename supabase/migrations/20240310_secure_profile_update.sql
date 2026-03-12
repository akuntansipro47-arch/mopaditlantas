-- Create a secure function to update agency profile
-- This bypasses RLS issues by running as the owner (SECURITY DEFINER)
-- Only accessible to authenticated users

CREATE OR REPLACE FUNCTION public.update_agency_profile_secure(
    p_name TEXT,
    p_address TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_website TEXT,
    p_logo_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_result JSONB;
BEGIN
    -- Get the single existing profile ID (or the latest one)
    SELECT id INTO v_profile_id FROM public.agency_profile ORDER BY updated_at DESC LIMIT 1;

    IF v_profile_id IS NULL THEN
        -- If no profile exists, insert one
        INSERT INTO public.agency_profile (name, address, phone, email, website, logo_url, updated_at)
        VALUES (p_name, p_address, p_phone, p_email, p_website, p_logo_url, now())
        RETURNING to_jsonb(agency_profile.*) INTO v_result;
    ELSE
        -- Update the existing profile
        UPDATE public.agency_profile
        SET 
            name = p_name,
            address = p_address,
            phone = p_phone,
            email = p_email,
            website = p_website,
            logo_url = p_logo_url,
            updated_at = now()
        WHERE id = v_profile_id
        RETURNING to_jsonb(agency_profile.*) INTO v_result;
    END IF;

    RETURN v_result;
END;
$$;
