-- Ensure foreign key relationship exists between purchase_orders and work_orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'purchase_orders_work_order_id_fkey'
    ) THEN
        ALTER TABLE public.purchase_orders
        ADD CONSTRAINT purchase_orders_work_order_id_fkey
        FOREIGN KEY (work_order_id)
        REFERENCES public.work_orders(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- Ensure foreign key relationship exists between work_orders and vehicle_entries
-- (This usually exists, but just to be sure for the nested query)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'work_orders_vehicle_entry_id_fkey'
    ) THEN
        ALTER TABLE public.work_orders
        ADD CONSTRAINT work_orders_vehicle_entry_id_fkey
        FOREIGN KEY (vehicle_entry_id)
        REFERENCES public.vehicle_entries(id)
        ON DELETE CASCADE;
    END IF;
END $$;
