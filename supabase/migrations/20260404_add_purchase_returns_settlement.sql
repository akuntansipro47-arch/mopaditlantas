ALTER TABLE public.purchase_returns
ADD COLUMN IF NOT EXISTS settlement_type TEXT,
ADD COLUMN IF NOT EXISTS settlement_account_id UUID REFERENCES public.chart_of_accounts(id),
ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS purchase_returns_settlement_account_id_idx
  ON public.purchase_returns(settlement_account_id);
