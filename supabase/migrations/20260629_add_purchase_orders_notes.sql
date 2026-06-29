-- Tambahkan kolom keterangan/notes pada purchase_orders untuk kebutuhan form dan cetak.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS notes TEXT;

