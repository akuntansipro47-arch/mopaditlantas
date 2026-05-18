CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.budget_forecast_sheets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project text NOT NULL,
    year integer NOT NULL,
    title text NOT NULL DEFAULT 'Forecasting Anggaran',
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS budget_forecast_sheets_project_year_idx
    ON public.budget_forecast_sheets (project, year);

CREATE TABLE IF NOT EXISTS public.budget_forecast_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sheet_id uuid NOT NULL REFERENCES public.budget_forecast_sheets(id) ON DELETE CASCADE,
    group_key text NOT NULL,
    section text NOT NULL,
    label text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    values numeric(18,2)[] NOT NULL DEFAULT array_fill(0::numeric, ARRAY[12]),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT budget_forecast_lines_group_key_chk CHECK (group_key IN ('R2','R4')),
    CONSTRAINT budget_forecast_lines_section_chk CHECK (section IN ('BASE','DEDUCTION','ADDITION','SUBTRACTION')),
    CONSTRAINT budget_forecast_lines_values_len_chk CHECK (array_length(values, 1) = 12)
);

CREATE INDEX IF NOT EXISTS budget_forecast_lines_sheet_idx
    ON public.budget_forecast_lines (sheet_id);

CREATE OR REPLACE FUNCTION public.budget_forecast_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS budget_forecast_sheets_touch_updated_at ON public.budget_forecast_sheets;
CREATE TRIGGER budget_forecast_sheets_touch_updated_at
BEFORE UPDATE ON public.budget_forecast_sheets
FOR EACH ROW
EXECUTE FUNCTION public.budget_forecast_touch_updated_at();

DROP TRIGGER IF EXISTS budget_forecast_lines_touch_updated_at ON public.budget_forecast_lines;
CREATE TRIGGER budget_forecast_lines_touch_updated_at
BEFORE UPDATE ON public.budget_forecast_lines
FOR EACH ROW
EXECUTE FUNCTION public.budget_forecast_touch_updated_at();

ALTER TABLE public.budget_forecast_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_forecast_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for public" ON public.budget_forecast_sheets;
CREATE POLICY "Enable all access for public" ON public.budget_forecast_sheets
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for public" ON public.budget_forecast_lines;
CREATE POLICY "Enable all access for public" ON public.budget_forecast_lines
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.budget_forecast_sheets TO anon, authenticated, service_role;
GRANT ALL ON public.budget_forecast_lines TO anon, authenticated, service_role;
