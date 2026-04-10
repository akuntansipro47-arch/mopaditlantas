ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS line_type TEXT NOT NULL DEFAULT 'PART';

ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS job_type_id UUID REFERENCES public.job_types(id);

ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS service_name TEXT;

CREATE INDEX IF NOT EXISTS purchase_order_items_line_type_idx
  ON public.purchase_order_items(line_type);

CREATE INDEX IF NOT EXISTS purchase_order_items_job_type_id_idx
  ON public.purchase_order_items(job_type_id);

