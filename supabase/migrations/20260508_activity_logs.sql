create extension if not exists pgcrypto;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id uuid,
  username text,
  role text,
  action text not null,
  module text,
  entity_type text,
  entity_id text,
  details text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists activity_logs_occurred_at_idx on public.activity_logs(occurred_at desc);
create index if not exists activity_logs_user_id_idx on public.activity_logs(user_id);
create index if not exists activity_logs_action_idx on public.activity_logs(action);

alter table public.activity_logs enable row level security;

do $$
begin
  create policy "Enable read activity logs" on public.activity_logs for select using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Enable insert activity logs" on public.activity_logs for insert with check (true);
exception
  when duplicate_object then null;
end $$;
