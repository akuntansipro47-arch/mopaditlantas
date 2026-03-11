-- Create Journal Entries Table (Header)
CREATE TABLE public.journal_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    voucher_no TEXT,
    reference TEXT, -- e.g. External Ref
    description TEXT,
    entry_type TEXT NOT NULL, -- 'DEPOSIT', 'PAYMENT', 'JOURNAL'
    total_amount NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Journal Entry Items Table (Detail / Ledger Lines)
CREATE TABLE public.journal_entry_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.chart_of_accounts(id),
    debit NUMERIC(15, 2) DEFAULT 0,
    credit NUMERIC(15, 2) DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_items ENABLE ROW LEVEL SECURITY;

-- Create Policies (Open Access for Authenticated Users)
CREATE POLICY "Authenticated Users Full Access Journal" ON public.journal_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Users Full Access Journal Items" ON public.journal_entry_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add Indexes for Performance
CREATE INDEX idx_journal_entries_date ON public.journal_entries(entry_date);
CREATE INDEX idx_journal_items_entry_id ON public.journal_entry_items(journal_entry_id);
CREATE INDEX idx_journal_items_account_id ON public.journal_entry_items(account_id);
