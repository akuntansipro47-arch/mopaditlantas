-- Add HPP column to job_types table
ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS hpp NUMERIC DEFAULT 0;

-- Update existing job_types with dummy HPP (optional, just to have non-zero)
-- UPDATE public.job_types SET hpp = selling_price * 0.7 WHERE hpp IS NULL OR hpp = 0;
