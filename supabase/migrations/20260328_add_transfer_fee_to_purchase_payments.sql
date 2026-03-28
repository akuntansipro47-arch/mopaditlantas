ALTER TABLE public.purchase_payments
ADD COLUMN IF NOT EXISTS transfer_fee NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_payments
ADD COLUMN IF NOT EXISTS fee_account_id UUID REFERENCES public.chart_of_accounts(id);
