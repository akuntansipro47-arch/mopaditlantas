-- 1. Create Goods Receipt Items Table
CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID REFERENCES goods_receipts(id) ON DELETE CASCADE,
    goods_id UUID REFERENCES goods(id),
    quantity_received INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Purchase Invoices Table (Hutang Dagang)
CREATE TABLE IF NOT EXISTS purchase_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) NOT NULL,
    po_id UUID REFERENCES purchase_orders(id),
    supplier_id UUID REFERENCES suppliers(id),
    invoice_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'UNPAID', -- UNPAID, PARTIAL, PAID
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Purchase Payments Table (Pembayaran Hutang)
CREATE TABLE IF NOT EXISTS purchase_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    payment_date DATE DEFAULT CURRENT_DATE,
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50), -- CASH, TRANSFER
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Cash/Bank Transactions Table
CREATE TABLE IF NOT EXISTS cash_bank_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_date DATE DEFAULT CURRENT_DATE,
    type VARCHAR(10) CHECK (type IN ('IN', 'OUT')),
    category VARCHAR(50), -- BIAYA_OPERASIONAL, GAJI, LAIN_LAIN, PEMBAYARAN_HUTANG
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    ref_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_bank_transactions ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON goods_receipt_items;
CREATE POLICY "Enable all access for authenticated users" ON goods_receipt_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON purchase_invoices;
CREATE POLICY "Enable all access for authenticated users" ON purchase_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON purchase_payments;
CREATE POLICY "Enable all access for authenticated users" ON purchase_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON cash_bank_transactions;
CREATE POLICY "Enable all access for authenticated users" ON cash_bank_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon for dev (optional, but safer to stick to authenticated)
CREATE POLICY "Enable all access for anon users" ON goods_receipt_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for anon users" ON purchase_invoices FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for anon users" ON purchase_payments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for anon users" ON cash_bank_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
