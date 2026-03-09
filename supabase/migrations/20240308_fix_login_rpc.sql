-- Fix login_user to ensure allowed_menus is never null
CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS TABLE (
    id UUID,
    username VARCHAR,
    full_name VARCHAR,
    role VARCHAR,
    allowed_menus JSONB,
    success BOOLEAN
) AS $$
DECLARE
    found_user app_users%ROWTYPE;
BEGIN
    SELECT * INTO found_user FROM app_users WHERE app_users.username = p_username;
    
    -- Check password (using crypt)
    IF found_user.id IS NOT NULL AND found_user.password = crypt(p_password, found_user.password) THEN
        RETURN QUERY SELECT 
            found_user.id, 
            found_user.username, 
            found_user.full_name, 
            found_user.role, 
            COALESCE(found_user.allowed_menus, '[]'::jsonb) as allowed_menus,
            true;
    ELSE
        RETURN QUERY SELECT 
            NULL::UUID, 
            NULL::VARCHAR, 
            NULL::VARCHAR, 
            NULL::VARCHAR, 
            '[]'::jsonb,
            false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure admin26 has full access
UPDATE app_users 
SET allowed_menus = '["*"]', role = 'SUPER_ADMIN' 
WHERE username = 'admin26';
