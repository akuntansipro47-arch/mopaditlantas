create table if not exists public.vehicle_entry_spareparts (
  id uuid default gen_random_uuid() primary key,
  vehicle_entry_id uuid references public.vehicle_entries(id) on delete cascade not null,
  job_type_id uuid references public.job_types(id) on delete set null,
  item_name text not null,
  qty integer not null default 1,
  estimated_price numeric not null default 0,
  total_price numeric generated always as (qty * estimated_price) stored,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.vehicle_entry_spareparts enable row level security;

create policy "Enable read access for all users" on public.vehicle_entry_spareparts for select using (true);
create policy "Enable insert access for all users" on public.vehicle_entry_spareparts for insert with check (true);
create policy "Enable update access for all users" on public.vehicle_entry_spareparts for update using (true);
create policy "Enable delete access for all users" on public.vehicle_entry_spareparts for delete using (true);
