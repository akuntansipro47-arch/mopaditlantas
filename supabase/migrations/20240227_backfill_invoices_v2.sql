-- Create a function to backfill purchase_invoices for existing RECEIVED_FULL POs
CREATE OR REPLACE FUNCTION backfill_missing_invoices() 
RETURNS void AS $$
DECLARE
    po_record RECORD;
    invoice_exists BOOLEAN;
BEGIN
    FOR po_record IN 
        SELECT * FROM purchase_orders 
        WHERE status = 'RECEIVED_FULL'
    LOOP
        -- Check if invoice already exists for this PO
        SELECT EXISTS (
            SELECT 1 FROM purchase_invoices WHERE po_id = po_record.id
        ) INTO invoice_exists;

        -- If not exists, create one
        IF NOT invoice_exists THEN
            INSERT INTO purchase_invoices (
                invoice_number,
                po_id,
                supplier_id,
                invoice_date,
                due_date,
                total_amount,
                status
            ) VALUES (
                'INV-AUTO-' || substring(po_record.id::text, 1, 8), -- Generate a dummy invoice number
                po_record.id,
                po_record.supplier_id,
                po_record.created_at::date, -- Use PO date as invoice date approximation
                (po_record.created_at + INTERVAL '30 days')::date, -- Default due date
                po_record.total_amount,
                'UNPAID'
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the backfill function
SELECT backfill_missing_invoices();

-- Drop the function after use (optional, but cleaner)
DROP FUNCTION backfill_missing_invoices();
