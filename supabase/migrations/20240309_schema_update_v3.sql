-- Migration V3: PWA Update & New Columns
-- Author: Trae Assistant
-- Date: 2026-03-09

-- 1. Mechanics Table Update
ALTER TABLE mechanics ADD COLUMN IF NOT EXISTS nik TEXT;
ALTER TABLE mechanics ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE mechanics ADD COLUMN IF NOT EXISTS category TEXT; -- 'R4', 'R2', 'R2_KECIL' (Previously 'specialization', reusing or creating new if needed)
-- Note: 'specialization' already exists, we might want to sync them or just use specialization as category.
-- Let's stick to using 'specialization' as the category enum in frontend code to avoid redundancy, 
-- but ensuring it supports 'R2_KECIL'.
ALTER TABLE mechanics DROP CONSTRAINT IF EXISTS mechanics_specialization_check;
ALTER TABLE mechanics ADD CONSTRAINT mechanics_specialization_check CHECK (specialization IN ('R4', 'R2', 'R2_KECIL', 'R4_R2', 'ALL'));

-- 2. Goods Table Update (Barang)
ALTER TABLE goods ADD COLUMN IF NOT EXISTS group_sparepart TEXT;
ALTER TABLE goods ADD CONSTRAINT goods_group_sparepart_check CHECK (group_sparepart IN ('R4', 'R2', 'R2_KECIL') OR group_sparepart IS NULL);
-- item_type already exists: 'PERSEDIAAN' | 'NON_PERSEDIAAN' | 'ASET_AKTIVA_TETAP' | 'PERALATAN_WORKSHOP' | 'INVENTARIS_KANTOR' | 'FURNITURE' | 'PERLENGKAPAN'

-- 3. Job Types Table Update (Jasa)
ALTER TABLE job_types ADD COLUMN IF NOT EXISTS job_code TEXT;
ALTER TABLE job_types ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
ALTER TABLE job_types ADD CONSTRAINT job_types_vehicle_type_check CHECK (vehicle_type IN ('R4', 'R2', 'R2_KECIL') OR vehicle_type IS NULL);

-- 4. Company Profile Table (New)
CREATE TABLE IF NOT EXISTS company_profile (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    npwp TEXT,
    is_pkp BOOLEAN DEFAULT false,
    phone TEXT,
    email TEXT,
    social_media JSONB, -- { "ig": "...", "fb": "...", "twitter": "..." }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for company_profile
ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON company_profile FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON company_profile FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON company_profile FOR UPDATE USING (auth.role() = 'authenticated');

-- 5. Vehicle Entry Update (Estimasi)
-- vehicle_entry_spareparts & vehicle_entry_jobs already exist.
-- We might need to ensure they have price columns for estimation.
-- vehicle_entry_spareparts has 'estimated_price'.
-- vehicle_entry_jobs needs 'estimated_price' if not exists (currently uses job_types price, but custom price might be needed).
ALTER TABLE vehicle_entry_jobs ADD COLUMN IF NOT EXISTS estimated_price NUMERIC DEFAULT 0;

-- 6. Purchase Order Items (Group PO Logic support)
-- purchase_order_items already has 'goods_id'.
-- If PO is based on WO, we need to link PO to WO. 
-- purchase_orders table already has 'work_order_id'.
-- We might need a flag 'po_type' in purchase_orders: 'PROJECT' (Based on WO) or 'GENERAL' (Gudang).
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_type TEXT DEFAULT 'GENERAL'; -- 'PROJECT' or 'GENERAL'
