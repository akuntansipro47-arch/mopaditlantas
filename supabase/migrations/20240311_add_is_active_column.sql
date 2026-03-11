-- Add is_active column to goods table
ALTER TABLE public.goods 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add is_active column to job_types table (optional, but good for consistency)
ALTER TABLE public.job_types 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
