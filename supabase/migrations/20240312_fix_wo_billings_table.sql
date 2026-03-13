-- Ensure work_order_billings table exists and has correct permissions
-- This fixes the "relation does not exist" error if migration was missed

CREATE TABLE IF NOT EXISTS work_order_billings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
    item_type VARCHAR(20) CHECK (item_type IN ('JOB', 'PART')),
    job_type_id UUID REFERENCES job_types(id),
    goods_id UUID REFERENCES goods(id),
    item_name VARCHAR(200) NOT NULL,
    qty INTEGER DEFAULT 1,
    unit_price DECIMAL(15,2) DEFAULT 0,
    total_price DECIMAL(15,2) DEFAULT 0,
    job_group VARCHAR(50),
    is_info_only BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fix Permissions
ALTER TABLE work_order_billings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access" ON work_order_billings;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON work_order_billings;
DROP POLICY IF EXISTS "Enable full access for authenticated users" ON work_order_billings;

CREATE POLICY "Enable full access for authenticated users" 
ON work_order_billings 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
