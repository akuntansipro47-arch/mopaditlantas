-- Create Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    nickname VARCHAR(50),
    position VARCHAR(100), -- Jabatan
    department VARCHAR(50), -- Divisi
    join_date DATE DEFAULT CURRENT_DATE,
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    base_salary DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, RESIGNED
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Payroll Table
CREATE TABLE IF NOT EXISTS payrolls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_month VARCHAR(7), -- YYYY-MM
    employee_id UUID REFERENCES employees(id),
    base_salary DECIMAL(15,2) DEFAULT 0,
    allowance DECIMAL(15,2) DEFAULT 0, -- Tunjangan
    deduction DECIMAL(15,2) DEFAULT 0, -- Potongan
    net_salary DECIMAL(15,2) GENERATED ALWAYS AS (base_salary + allowance - deduction) STORED,
    payment_date DATE,
    status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, PAID
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for authenticated users" ON employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON payrolls FOR ALL TO authenticated USING (true) WITH CHECK (true);
