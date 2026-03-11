-- Add is_info_only column to goods_issue_items if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'goods_issue_items' 
        AND column_name = 'is_info_only'
    ) THEN
        ALTER TABLE public.goods_issue_items
        ADD COLUMN is_info_only BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Also ensure work_order_billings has it (though code suggests it does)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'work_order_billings' 
        AND column_name = 'is_info_only'
    ) THEN
        ALTER TABLE public.work_order_billings
        ADD COLUMN is_info_only BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
