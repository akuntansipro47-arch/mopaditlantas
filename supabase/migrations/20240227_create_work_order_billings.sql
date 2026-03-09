-- Create table for storing detailed work order billing items
CREATE TABLE IF NOT EXISTS work_order_billings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
    
    -- Item Type: 'JOB' (Jasa) or 'PART' (Sparepart)
    item_type VARCHAR(20) CHECK (item_type IN ('JOB', 'PART')),
    
    -- References (optional, depending on type)
    job_type_id UUID REFERENCES job_types(id),
    goods_id UUID REFERENCES goods(id),
    
    -- Description (Snapshot of name)
    item_name VARCHAR(200) NOT NULL,
    
    -- Pricing
    qty INTEGER DEFAULT 1,
    unit_price DECIMAL(15,2) DEFAULT 0,
    total_price DECIMAL(15,2) DEFAULT 0,
    
    -- Grouping (Snapshot)
    job_group VARCHAR(50), -- 'PERBAIKAN' or 'SERVICE_RINGAN'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE work_order_billings ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Enable all access for authenticated users" ON work_order_billings FOR ALL TO authenticated USING (true) WITH CHECK (true);
