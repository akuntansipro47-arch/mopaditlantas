ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS locked_by_username text NULL,
  ADD COLUMN IF NOT EXISTS locked_by_role text NULL,
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS unlocked_by_username text NULL,
  ADD COLUMN IF NOT EXISTS unlocked_by_role text NULL,
  ADD COLUMN IF NOT EXISTS lock_reason text NULL;

