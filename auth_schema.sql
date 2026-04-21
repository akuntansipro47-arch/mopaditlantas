-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create App Users Table
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password TEXT NOT NULL, -- Will store hashed password
    full_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'USER' CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'USER')),
    allowed_menus JSONB DEFAULT '[]', -- Array of allowed paths/menu keys
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Policies
-- Allow reading users (for login verification and management)
CREATE POLICY "Enable read access for all users" ON app_users FOR SELECT USING (true);
-- Allow all for authenticated (or managing users) - simplified for this use case
CREATE POLICY "Enable all access for authenticated" ON app_users FOR ALL USING (true);


-- Insert Super Admin (admin26 / 4dmin26*)
-- We use pgcrypto's crypt function to hash the password
INSERT INTO app_users (username, password, full_name, role, allowed_menus)
VALUES (
    'admin26',
    crypt('4dmin26*', gen_salt('bf')),
    'Super Administrator',
    'SUPER_ADMIN',
    '["*"]' -- * means access to everything
) ON CONFLICT (username) DO NOTHING;

-- Function to verify password (helper for frontend RPC if needed, or we can just query)
-- Actually, frontend can't call crypt directly easily in a select without exposing hash.
-- Better approach: Create a Database Function (RPC) for login.

CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
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
    SELECT * INTO found_user FROM app_users WHERE app_users.username = p_username AND is_active = true;
    
    IF found_user.id IS NULL THEN
        RETURN QUERY SELECT 
            NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR, NULL::JSONB, false, 'User not found or not active';
        RETURN;
    END IF;

    IF found_user.password = crypt(p_password, found_user.password) THEN
        RETURN QUERY SELECT 
            found_user.id, 
            found_user.username, 
            found_user.full_name, 
            found_user.role, 
            found_user.allowed_menus,
            true,
            'Login successful';
    ELSE
        RETURN QUERY SELECT 
            NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR, NULL::JSONB, false, 'Invalid password';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION upsert_user(
    p_id UUID,
    p_username TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_allowed_menus JSONB
)
RETURNS VOID AS $$
BEGIN
    IF p_id IS NULL THEN
        -- Insert new user
        INSERT INTO app_users (username, password, full_name, role, allowed_menus)
        VALUES (
            p_username,
            crypt(p_password, gen_salt('bf')),
            p_full_name,
            p_role,
            p_allowed_menus
        );
    ELSE
        -- Update existing user
        UPDATE app_users
        SET
            username = p_username,
            full_name = p_full_name,
            role = p_role,
            allowed_menus = p_allowed_menus,
            password = CASE 
                WHEN p_password IS NOT NULL AND p_password <> '' THEN crypt(p_password, gen_salt('bf'))
                ELSE password
            END
        WHERE id = p_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;