-- Add payment_account_id to purchase_payments table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_payments' AND column_name = 'payment_account_id') THEN
        ALTER TABLE public.purchase_payments ADD COLUMN payment_account_id UUID REFERENCES public.chart_of_accounts(id);
    END IF;
END $$;
