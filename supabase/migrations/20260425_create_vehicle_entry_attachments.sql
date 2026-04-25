create table if not exists public.vehicle_entry_attachments (
  id uuid default gen_random_uuid() primary key,
  vehicle_entry_id uuid references public.vehicle_entries(id) on delete cascade not null,
  file_name text not null,
  mime_type text not null,
  data_url text not null,
  size_original integer,
  size_stored integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists vehicle_entry_attachments_vehicle_entry_id_idx
  on public.vehicle_entry_attachments(vehicle_entry_id);

alter table public.vehicle_entry_attachments enable row level security;

create policy "Enable read access for all users" on public.vehicle_entry_attachments for select using (true);
create policy "Enable insert access for all users" on public.vehicle_entry_attachments for insert with check (true);
create policy "Enable update access for all users" on public.vehicle_entry_attachments for update using (true);
create policy "Enable delete access for all users" on public.vehicle_entry_attachments for delete using (true);
