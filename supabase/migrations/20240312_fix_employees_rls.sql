-- Fix RLS for employees table
-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable all access" ON employees;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow all for authenticated" ON employees;

-- Re-enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Create a fresh, permissive policy for authenticated users
CREATE POLICY "Enable full access for authenticated users" 
ON employees 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Ensure the same for payrolls if it exists
DROP POLICY IF EXISTS "Enable all access" ON payrolls;
DROP POLICY IF EXISTS "Enable full access for authenticated users" ON payrolls;

CREATE TABLE IF NOT EXISTS payrolls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_month VARCHAR(7),
    employee_id UUID REFERENCES employees(id),
    base_salary DECIMAL(15,2) DEFAULT 0,
    allowance DECIMAL(15,2) DEFAULT 0,
    deduction DECIMAL(15,2) DEFAULT 0,
    net_salary DECIMAL(15,2) GENERATED ALWAYS AS (base_salary + allowance - deduction) STORED,
    payment_date DATE,
    status VARCHAR(20) DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable full access for authenticated users" 
ON payrolls 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
