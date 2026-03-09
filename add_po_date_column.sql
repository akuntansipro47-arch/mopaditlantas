
ALTER TABLE purchase_orders 
ADD COLUMN po_date DATE DEFAULT CURRENT_DATE;

-- Update existing records to have po_date as their created_at date
UPDATE purchase_orders 
SET po_date = created_at::DATE 
WHERE po_date IS NULL;
