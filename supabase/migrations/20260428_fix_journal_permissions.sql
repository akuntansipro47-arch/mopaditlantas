alter table public.journal_entries enable row level security;
alter table public.journal_entry_items enable row level security;

drop policy if exists "Authenticated Users Full Access Journal" on public.journal_entries;
drop policy if exists "Authenticated Users Full Access Journal Items" on public.journal_entry_items;
drop policy if exists "Enable all access for public" on public.journal_entries;
drop policy if exists "Enable all access for public" on public.journal_entry_items;

create policy "Enable all access for public" on public.journal_entries
  for all
  to public
  using (true)
  with check (true);

create policy "Enable all access for public" on public.journal_entry_items
  for all
  to public
  using (true)
  with check (true);

grant all on public.journal_entries to anon, authenticated, service_role;
grant all on public.journal_entry_items to anon, authenticated, service_role;
