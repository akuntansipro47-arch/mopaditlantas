CREATE OR REPLACE FUNCTION public.generate_wo_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  attempt int := 0;
BEGIN
  IF NEW.wo_number IS NOT NULL AND btrim(NEW.wo_number) <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    candidate := 'WO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || substring(md5(random()::text) from 1 for 4);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.work_orders WHERE wo_number = candidate);

    attempt := attempt + 1;
    IF attempt >= 50 THEN
      candidate := 'WO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || substring(md5(clock_timestamp()::text || random()::text) from 1 for 6);
      EXIT;
    END IF;
  END LOOP;

  NEW.wo_number := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_wo_number ON public.work_orders;
CREATE TRIGGER set_wo_number
BEFORE INSERT ON public.work_orders
FOR EACH ROW
WHEN (NEW.wo_number IS NULL OR btrim(NEW.wo_number) = '')
EXECUTE FUNCTION public.generate_wo_number();
