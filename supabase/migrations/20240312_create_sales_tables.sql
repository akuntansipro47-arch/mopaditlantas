-- 1. Create Sales Invoices Table (Piutang Usaha)
CREATE TABLE IF NOT EXISTS sales_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    work_order_id UUID REFERENCES work_orders(id),
    customer_name VARCHAR(200), -- Snapshot from Vehicle/Manual
    vehicle_id UUID REFERENCES vehicles(id), -- Link to vehicle
    invoice_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'UNPAID', -- UNPAID, PARTIAL, PAID
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Sales Receipts Table (Penerimaan Piutang)
CREATE TABLE IF NOT EXISTS sales_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES sales_invoices(id) ON DELETE CASCADE,
    receipt_number VARCHAR(50),
    payment_date DATE DEFAULT CURRENT_DATE,
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50), -- CASH, TRANSFER
    payment_account_id UUID REFERENCES chart_of_accounts(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_receipts ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Enable all access for authenticated users" ON sales_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON sales_receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);
