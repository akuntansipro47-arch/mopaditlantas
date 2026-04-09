ALTER TABLE public.vehicle_entry_spareparts
ADD COLUMN IF NOT EXISTS goods_id UUID REFERENCES public.goods(id);

ALTER TABLE public.vehicle_entry_spareparts
ADD COLUMN IF NOT EXISTS item_code TEXT;

CREATE INDEX IF NOT EXISTS vehicle_entry_spareparts_goods_id_idx
  ON public.vehicle_entry_spareparts(goods_id);

CREATE INDEX IF NOT EXISTS vehicle_entry_spareparts_item_code_idx
  ON public.vehicle_entry_spareparts(item_code);

