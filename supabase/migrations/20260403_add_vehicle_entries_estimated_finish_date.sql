ALTER TABLE public.vehicle_entries
ADD COLUMN IF NOT EXISTS estimated_finish_date DATE;
