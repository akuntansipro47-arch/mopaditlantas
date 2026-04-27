alter table public.vehicle_entry_attachments
  alter column data_url drop not null;

alter table public.vehicle_entry_attachments
  add column if not exists storage_bucket text,
  add column if not exists storage_path text;

create index if not exists vehicle_entry_attachments_storage_path_idx
  on public.vehicle_entry_attachments(storage_bucket, storage_path);

alter table public.vehicle_entry_attachments
  drop constraint if exists vehicle_entry_attachments_has_content;

alter table public.vehicle_entry_attachments
  add constraint vehicle_entry_attachments_has_content
  check (
    data_url is not null
    or (storage_bucket is not null and storage_path is not null)
  );

insert into storage.buckets (id, name, public)
values ('vehicle-entry-attachments', 'vehicle-entry-attachments', true)
on conflict (id) do nothing;

do $$
begin
  create policy "Allow public read vehicle-entry-attachments"
    on storage.objects for select
    using (bucket_id = 'vehicle-entry-attachments');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Allow anon upload vehicle-entry-attachments"
    on storage.objects for insert
    with check (
      bucket_id = 'vehicle-entry-attachments'
      and (auth.role() = 'anon' or auth.role() = 'authenticated')
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Allow anon delete vehicle-entry-attachments"
    on storage.objects for delete
    using (
      bucket_id = 'vehicle-entry-attachments'
      and (auth.role() = 'anon' or auth.role() = 'authenticated')
    );
exception
  when duplicate_object then null;
end $$;
