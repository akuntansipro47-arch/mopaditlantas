create extension if not exists pgcrypto;

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  pr_number text not null unique,
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  status text not null default 'OPEN',
  po_id uuid references public.purchase_orders(id) on delete set null,
  po_number text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists purchase_requests_one_active_per_wo
  on public.purchase_requests(work_order_id)
  where status <> 'CANCELLED';

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  line_type text not null,
  goods_id uuid references public.goods(id),
  job_type_id uuid references public.job_types(id),
  service_name text,
  brand text,
  quantity integer not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.purchase_request_items
  add constraint purchase_request_items_line_type_check
  check (line_type in ('PART','JASA'));

alter table public.purchase_request_items
  add constraint purchase_request_items_required_ref_check
  check (
    (line_type = 'PART' and goods_id is not null) or
    (line_type = 'JASA' and (job_type_id is not null or service_name is not null))
  );

create index if not exists purchase_request_items_request_id_idx on public.purchase_request_items(purchase_request_id);
create index if not exists purchase_requests_work_order_id_idx on public.purchase_requests(work_order_id);
create index if not exists purchase_requests_status_idx on public.purchase_requests(status);

alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;

do $$
begin
  create policy "Enable read purchase requests" on public.purchase_requests for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Enable write purchase requests" on public.purchase_requests for insert with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Enable update purchase requests" on public.purchase_requests for update using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Enable delete purchase requests" on public.purchase_requests for delete using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Enable read purchase request items" on public.purchase_request_items for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Enable write purchase request items" on public.purchase_request_items for insert with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Enable update purchase request items" on public.purchase_request_items for update using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Enable delete purchase request items" on public.purchase_request_items for delete using (true);
exception when duplicate_object then null;
end $$;

