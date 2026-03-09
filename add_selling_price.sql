
-- Add selling_price to goods
ALTER TABLE goods 
ADD COLUMN selling_price NUMERIC DEFAULT 0;

-- Add selling_price to job_types
ALTER TABLE job_types 
ADD COLUMN selling_price NUMERIC DEFAULT 0;
