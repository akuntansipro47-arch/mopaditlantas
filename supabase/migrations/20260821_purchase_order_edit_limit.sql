ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS edit_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.enforce_purchase_order_edit_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.edit_count IS NULL OR NEW.edit_count < OLD.edit_count THEN
    NEW.edit_count := OLD.edit_count;
  ELSIF NEW.edit_count > OLD.edit_count + 1 THEN
    NEW.edit_count := OLD.edit_count + 1;
  END IF;

  IF NEW.edit_count > 2 THEN
    NEW.status := 'CANCELLED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_order_edit_count ON public.purchase_orders;
CREATE TRIGGER trg_purchase_order_edit_count
BEFORE UPDATE OF edit_count ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_purchase_order_edit_count();