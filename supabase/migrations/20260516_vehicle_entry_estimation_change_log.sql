CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.vehicle_entries
  ADD COLUMN IF NOT EXISTS estimation_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_estimation_changed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_estimation_change_summary text NULL,
  ADD COLUMN IF NOT EXISTS last_estimation_changed_by_username text NULL,
  ADD COLUMN IF NOT EXISTS last_estimation_changed_by_role text NULL;

CREATE TABLE IF NOT EXISTS public.vehicle_entry_estimation_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_entry_id uuid NOT NULL REFERENCES public.vehicle_entries(id) ON DELETE CASCADE,
  revision_no integer NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_username text NULL,
  changed_by_role text NULL,
  summary text NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicle_entry_estimation_changes_unique
  ON public.vehicle_entry_estimation_changes (vehicle_entry_id, revision_no);

CREATE INDEX IF NOT EXISTS vehicle_entry_estimation_changes_entry_idx
  ON public.vehicle_entry_estimation_changes (vehicle_entry_id, changed_at DESC);

ALTER TABLE public.vehicle_entry_estimation_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for public" ON public.vehicle_entry_estimation_changes;
CREATE POLICY "Enable all access for public" ON public.vehicle_entry_estimation_changes
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.vehicle_entry_estimation_changes TO anon, authenticated, service_role;

