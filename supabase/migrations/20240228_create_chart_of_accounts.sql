-- Create Chart of Accounts Table
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_code VARCHAR(50) NOT NULL UNIQUE,
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('HEADER', 'DETAIL')),
    parent_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('AKTIVA', 'PASSIVA')),
    sub_category VARCHAR(50) CHECK (sub_category IN ('AKTIVA_LANCAR', 'AKTIVA_TETAP', 'HUTANG', 'MODAL')),
    balance_type VARCHAR(10) NOT NULL CHECK (balance_type IN ('DEBIT', 'CREDIT')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent_id ON public.chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_category ON public.chart_of_accounts(category);

-- Enable RLS
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- Create Policy (Allow all for now, adjust as needed)
CREATE POLICY "Enable all access for authenticated users" ON public.chart_of_accounts
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
