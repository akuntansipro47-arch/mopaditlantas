alter table public.work_orders
add column if not exists completed_at timestamptz;

create index if not exists idx_work_orders_completed_at on public.work_orders (completed_at);

update public.work_orders
set completed_at = (work_date::timestamptz)
where completed_at is null
  and status in ('COMPLETED', 'CLOSED')
  and work_date is not null;

update public.work_orders
set completed_at = null
where status not in ('COMPLETED', 'CLOSED');
