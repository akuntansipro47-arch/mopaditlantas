ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

DROP FUNCTION IF EXISTS login_user(TEXT, TEXT);

CREATE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS TABLE (
    id UUID,
    username VARCHAR,
    full_name VARCHAR,
    role VARCHAR,
    allowed_menus JSONB,
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    found_user app_users%ROWTYPE;
BEGIN
    SELECT * INTO found_user
    FROM app_users
    WHERE app_users.username = p_username
      AND COALESCE(app_users.is_active, true) = true;

    IF found_user.id IS NULL THEN
        RETURN QUERY SELECT
            NULL::UUID,
            NULL::VARCHAR,
            NULL::VARCHAR,
            NULL::VARCHAR,
            '[]'::jsonb,
            false,
            'User tidak ditemukan / nonaktif';
        RETURN;
    END IF;

    IF found_user.password = crypt(p_password, found_user.password) THEN
        RETURN QUERY SELECT
            found_user.id,
            found_user.username,
            found_user.full_name,
            found_user.role,
            COALESCE(found_user.allowed_menus, '[]'::jsonb) as allowed_menus,
            true,
            'Login berhasil';
    ELSE
        RETURN QUERY SELECT
            NULL::UUID,
            NULL::VARCHAR,
            NULL::VARCHAR,
            NULL::VARCHAR,
            '[]'::jsonb,
            false,
            'Password salah';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
