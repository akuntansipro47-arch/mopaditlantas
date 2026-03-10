-- 1. Add 'is_info_only' column to work_order_billings
ALTER TABLE public.work_order_billings 
ADD COLUMN IF NOT EXISTS is_info_only BOOLEAN DEFAULT false;

-- 2. Add 'is_info_only' column to goods_issue_items
ALTER TABLE public.goods_issue_items
ADD COLUMN IF NOT EXISTS is_info_only BOOLEAN DEFAULT false;

-- 3. Function to deduct stock (goods_issue) - Updated to SKIP if is_info_only is TRUE
CREATE OR REPLACE FUNCTION public.handle_goods_issue_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Only deduct stock if item is NOT info only
    IF NEW.is_info_only = false THEN
        UPDATE public.goods
        SET stock = stock - NEW.qty
        WHERE id = NEW.goods_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to restore stock (on delete goods_issue) - Updated to SKIP if is_info_only is TRUE
CREATE OR REPLACE FUNCTION public.handle_goods_issue_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Only restore stock if item was NOT info only
    IF OLD.is_info_only = false THEN
        UPDATE public.goods
        SET stock = stock + OLD.qty
        WHERE id = OLD.goods_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 5. Function to deduct stock (work_order) - Updated to SKIP if is_info_only is TRUE
-- Note: Assuming you have a similar trigger for work_order_billings. If not, logic is handled in application code.
-- But if there is a trigger, it should look like this:

CREATE OR REPLACE FUNCTION public.handle_wo_stock_deduction()
RETURNS TRIGGER AS $$
BEGIN
    -- Only deduct stock for PARTS (not JOB) and if NOT info only
    IF NEW.item_type = 'PART' AND NEW.is_info_only = false THEN
        UPDATE public.goods
        SET stock = stock - NEW.qty
        WHERE id = NEW.goods_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
