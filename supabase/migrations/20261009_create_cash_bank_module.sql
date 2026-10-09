-- ============================================================
-- MODUL KAS/BANK — Lihat docs/FS_Modul_KasBank.md (FSD v1.0)
-- Tanggal: 2026-10-09
--
-- Isi:
--   1. Sub-ledger  : cash_receipts (penerimaan), cash_payments (pembayaran)
--   2. Penunjang    : journal_entries.source_table, chart_of_accounts.is_cash_bank
--   3. Nomor bukti  : voucher_sequences + next_voucher_no()
--   4. RPC posting  : post_cash_receipt / post_cash_payment (atomik)
--   5. RPC void     : void_cash_receipt / void_cash_payment
--   6. View         : v_cash_bank_book (Buku Bank otomatis)
--   7. RLS + GRANT + NOTIFY pgrst
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABEL SUB-LEDGER
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no      TEXT NOT NULL UNIQUE,
  receipt_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  cash_account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  account_id      UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  description     TEXT NOT NULL CHECK (char_length(btrim(description)) >= 3),
  reference_no    TEXT,
  status          TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOID')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT
);

CREATE TABLE IF NOT EXISTS public.cash_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no      TEXT NOT NULL UNIQUE,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  cash_account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  account_id      UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  description     TEXT NOT NULL CHECK (char_length(btrim(description)) >= 3),
  reference_no    TEXT,
  status          TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOID')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_receipts_date    ON public.cash_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_cash_receipts_account ON public.cash_receipts(cash_account_id);
CREATE INDEX IF NOT EXISTS idx_cash_payments_date    ON public.cash_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_cash_payments_account ON public.cash_payments(cash_account_id);

-- ------------------------------------------------------------
-- 2. PENUNJANG: kolom baru di tabel existing
-- ------------------------------------------------------------
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS source_table TEXT;
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON public.journal_entries(reference);

ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS is_cash_bank BOOLEAN NOT NULL DEFAULT false;
UPDATE public.chart_of_accounts
   SET is_cash_bank = true
 WHERE account_type = 'DETAIL'
   AND sub_category = 'AKTIVA_LANCAR'
   AND (account_name ILIKE '%kas%' OR account_name ILIKE '%bank%');
CREATE INDEX IF NOT EXISTS idx_coa_is_cash_bank ON public.chart_of_accounts(is_cash_bank) WHERE is_cash_bank;

-- ------------------------------------------------------------
-- 3. SEKUENS NOMOR BUKTI (atomik, per hari per prefix)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voucher_sequences (
  prefix   TEXT   NOT NULL,
  seq_date DATE   NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, seq_date)
);

CREATE OR REPLACE FUNCTION public.next_voucher_no(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO public.voucher_sequences (prefix, seq_date, last_seq)
  VALUES (p_prefix, CURRENT_DATE, 1)
  ON CONFLICT (prefix, seq_date)
  DO UPDATE SET last_seq = public.voucher_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN p_prefix || '/' || to_char(CURRENT_DATE, 'YYYYMMDD')
         || '/' || lpad(v_seq::text, 3, '0');
END;
$$;

-- ------------------------------------------------------------
-- 4. RPC POSTING ATOMIK
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.post_cash_receipt(date,uuid,uuid,numeric,text,text,text);
DROP FUNCTION IF EXISTS public.post_cash_payment(date,uuid,uuid,numeric,text,text,text);

CREATE OR REPLACE FUNCTION public.post_cash_receipt(
  p_receipt_date    date,
  p_cash_account_id uuid,
  p_account_id      uuid,
  p_amount          numeric,
  p_description     text,
  p_reference_no    text DEFAULT NULL,
  p_receipt_no      text DEFAULT NULL,
  p_created_by      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_no     TEXT;
  v_id     UUID;
  v_entry  UUID;
  v_cash   RECORD;
  v_contra RECORD;
BEGIN
  -- Validasi dasar (FSD §4.4)
  IF p_receipt_date IS NULL OR p_receipt_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal penerimaan tidak boleh di masa depan.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Jumlah harus lebih dari Rp 0.';
  END IF;
  IF p_description IS NULL OR char_length(btrim(p_description)) < 3 THEN
    RAISE EXCEPTION 'Uraian wajib diisi (min. 3 karakter).';
  END IF;

  -- Akun kas/bank sumber
  SELECT * INTO v_cash FROM public.chart_of_accounts WHERE id = p_cash_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pilih akun kas/bank yang valid.';
  END IF;
  IF v_cash.account_type <> 'DETAIL'
     OR v_cash.sub_category <> 'AKTIVA_LANCAR'
     OR NOT (v_cash.is_cash_bank
             OR v_cash.account_name ILIKE '%kas%'
             OR v_cash.account_name ILIKE '%bank%') THEN
    RAISE EXCEPTION 'Pilih akun kas/bank yang valid.';
  END IF;

  -- Akun lawan (kredit): pendapatan non-operasional
  SELECT * INTO v_contra FROM public.chart_of_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pilih akun pendapatan yang valid.';
  END IF;
  IF v_contra.account_type <> 'DETAIL' OR v_contra.balance_type <> 'CREDIT' THEN
    RAISE EXCEPTION 'Akun kredit harus akun detail bertipe kredit (Pendapatan Non-Operasional).';
  END IF;
  IF v_contra.id = v_cash.id OR v_contra.is_cash_bank THEN
    RAISE EXCEPTION 'Akun lawan tidak boleh sama dengan akun kas/bank.';
  END IF;
  IF v_contra.account_name ILIKE '%piutang%' THEN
    RAISE EXCEPTION 'Pelunasan piutang dicatat di modul Penjualan — pilih akun pendapatan non-operasional.';
  END IF;
  IF v_contra.category IN ('AKTIVA','PASSIVA','MODAL') THEN
    RAISE EXCEPTION 'Akun kredit harus kategori Pendapatan, bukan aset/hutang/modal.';
  END IF;

  -- Nomor bukti (custom dari impor, atau bangkit sistem)
  v_no := COALESCE(NULLIF(btrim(COALESCE(p_receipt_no, '')), ''),
                   public.next_voucher_no('KBM'));

  INSERT INTO public.cash_receipts
    (receipt_no, receipt_date, cash_account_id, account_id, amount, description, reference_no, status, created_by)
  VALUES
    (v_no, p_receipt_date, p_cash_account_id, p_account_id, p_amount, btrim(p_description),
     NULLIF(btrim(COALESCE(p_reference_no, '')), ''), 'POSTED', NULLIF(btrim(COALESCE(p_created_by, '')), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.journal_entries
    (entry_date, voucher_no, description, entry_type, total_amount, reference, source_table)
  VALUES
    (p_receipt_date, v_no, btrim(p_description), 'CASH_RECEIPT', p_amount, v_id::text, 'cash_receipts')
  RETURNING id INTO v_entry;

  INSERT INTO public.journal_entry_items (journal_entry_id, account_id, debit, credit, description) VALUES
    (v_entry, p_cash_account_id, p_amount, 0, btrim(p_description)),
    (v_entry, p_account_id,      0, p_amount, btrim(p_description));

  RETURN jsonb_build_object('id', v_id, 'receipt_no', v_no);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Nomor bukti sudah dipakai. Coba lagi.';
END;
$$;

CREATE OR REPLACE FUNCTION public.post_cash_payment(
  p_payment_date    date,
  p_cash_account_id uuid,
  p_account_id      uuid,
  p_amount          numeric,
  p_description     text,
  p_reference_no    text DEFAULT NULL,
  p_payment_no      text DEFAULT NULL,
  p_created_by      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_no     TEXT;
  v_id     UUID;
  v_entry  UUID;
  v_cash   RECORD;
  v_contra RECORD;
BEGIN
  -- Validasi dasar (FSD §5.4)
  IF p_payment_date IS NULL OR p_payment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal pembayaran tidak boleh di masa depan.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Jumlah harus lebih dari Rp 0.';
  END IF;
  IF p_description IS NULL OR char_length(btrim(p_description)) < 3 THEN
    RAISE EXCEPTION 'Uraian wajib diisi (min. 3 karakter).';
  END IF;

  -- Akun kas/bank sumber
  SELECT * INTO v_cash FROM public.chart_of_accounts WHERE id = p_cash_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pilih akun kas/bank yang valid.';
  END IF;
  IF v_cash.account_type <> 'DETAIL'
     OR v_cash.sub_category <> 'AKTIVA_LANCAR'
     OR NOT (v_cash.is_cash_bank
             OR v_cash.account_name ILIKE '%kas%'
             OR v_cash.account_name ILIKE '%bank%') THEN
    RAISE EXCEPTION 'Pilih akun kas/bank yang valid.';
  END IF;

  -- Akun lawan (debit): beban operasional — pengecualian AP struktural (FSD §5.3)
  SELECT * INTO v_contra FROM public.chart_of_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pilih akun beban yang valid.';
  END IF;
  IF v_contra.account_type <> 'DETAIL' OR v_contra.balance_type <> 'DEBIT' THEN
    RAISE EXCEPTION 'Akun debit harus akun beban operasional (detail bertipe debet).';
  END IF;
  IF v_contra.id = v_cash.id OR v_contra.is_cash_bank THEN
    RAISE EXCEPTION 'Akun lawan tidak boleh sama dengan akun kas/bank.';
  END IF;
  IF v_contra.account_name ILIKE '%hutang%' THEN
    RAISE EXCEPTION 'Pelunasan hutang dagang diproses di modul Pembelian — pilih akun beban operasional.';
  END IF;
  IF v_contra.category = 'AKTIVA' THEN
    RAISE EXCEPTION 'Akun debit harus kategori Beban, bukan aset (persediaan/piutang).';
  END IF;

  v_no := COALESCE(NULLIF(btrim(COALESCE(p_payment_no, '')), ''),
                   public.next_voucher_no('KBU'));

  INSERT INTO public.cash_payments
    (payment_no, payment_date, cash_account_id, account_id, amount, description, reference_no, status, created_by)
  VALUES
    (v_no, p_payment_date, p_cash_account_id, p_account_id, p_amount, btrim(p_description),
     NULLIF(btrim(COALESCE(p_reference_no, '')), ''), 'POSTED', NULLIF(btrim(COALESCE(p_created_by, '')), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.journal_entries
    (entry_date, voucher_no, description, entry_type, total_amount, reference, source_table)
  VALUES
    (p_payment_date, v_no, btrim(p_description), 'CASH_PAYMENT', p_amount, v_id::text, 'cash_payments')
  RETURNING id INTO v_entry;

  INSERT INTO public.journal_entry_items (journal_entry_id, account_id, debit, credit, description) VALUES
    (v_entry, p_account_id,      p_amount, 0, btrim(p_description)),
    (v_entry, p_cash_account_id, 0, p_amount, btrim(p_description));

  RETURN jsonb_build_object('id', v_id, 'payment_no', v_no);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Nomor bukti sudah dipakai. Coba lagi.';
END;
$$;

-- ------------------------------------------------------------
-- 5. RPC VOID (status VOID + jurnal ditarik dari GL)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_cash_receipt(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.cash_receipts SET status = 'VOID' WHERE id = p_id AND status = 'POSTED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan atau sudah dibatalkan.';
  END IF;
  DELETE FROM public.journal_entries
   WHERE entry_type = 'CASH_RECEIPT' AND reference = p_id::text;
  RETURN jsonb_build_object('id', p_id, 'status', 'VOID');
END;
$$;

CREATE OR REPLACE FUNCTION public.void_cash_payment(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.cash_payments SET status = 'VOID' WHERE id = p_id AND status = 'POSTED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan atau sudah dibatalkan.';
  END IF;
  DELETE FROM public.journal_entries
   WHERE entry_type = 'CASH_PAYMENT' AND reference = p_id::text;
  RETURN jsonb_build_object('id', p_id, 'status', 'VOID');
END;
$$;

-- ------------------------------------------------------------
-- 6. VIEW BUKU BANK (rekapitulasi otomatis seluruh mutasi kas/bank)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cash_bank_book AS
SELECT
  jei.id             AS line_id,
  je.entry_date      AS entry_date,
  je.voucher_no      AS voucher_no,
  je.entry_type      AS entry_type,
  je.source_table    AS source_table,
  je.reference       AS reference,
  je.description     AS entry_description,
  jei.account_id     AS account_id,
  coa.account_code   AS account_code,
  coa.account_name   AS account_name,
  coa.balance_type   AS balance_type,
  jei.debit          AS debit,
  jei.credit         AS credit,
  jei.description    AS line_description,
  jei.created_at     AS line_created_at
FROM public.journal_entry_items jei
JOIN public.journal_entries je    ON je.id  = jei.journal_entry_id
JOIN public.chart_of_accounts coa ON coa.id = jei.account_id
WHERE coa.account_type = 'DETAIL'
  AND coa.sub_category = 'AKTIVA_LANCAR'
  AND (coa.is_cash_bank
       OR coa.account_name ILIKE '%kas%'
       OR coa.account_name ILIKE '%bank%');

-- ------------------------------------------------------------
-- 7. RLS + GRANT + NOTIFIKASI POSTGREST
-- ------------------------------------------------------------
ALTER TABLE public.cash_receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_sequences  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for public" ON public.cash_receipts;
CREATE POLICY "Enable all access for public" ON public.cash_receipts
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for public" ON public.cash_payments;
CREATE POLICY "Enable all access for public" ON public.cash_payments
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for public" ON public.voucher_sequences;
CREATE POLICY "Enable all access for public" ON public.voucher_sequences
  FOR ALL TO public USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.cash_receipts     TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.cash_payments     TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.voucher_sequences TO anon, authenticated, service_role;
GRANT SELECT ON public.v_cash_bank_book     TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.next_voucher_no(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_cash_receipt(date,uuid,uuid,numeric,text,text,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_cash_payment(date,uuid,uuid,numeric,text,text,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_cash_receipt(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_cash_payment(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
