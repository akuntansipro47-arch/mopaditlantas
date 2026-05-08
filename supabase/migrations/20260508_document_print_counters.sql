create table if not exists public.document_print_counters (
  doc_type text not null,
  doc_id text not null,
  print_count integer not null default 0,
  first_printed_at timestamptz,
  last_printed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (doc_type, doc_id)
);

create or replace function public.increment_document_print_counter(p_doc_type text, p_doc_id text)
returns integer
language plpgsql
security definer
as $$
declare
  new_count integer;
begin
  insert into public.document_print_counters(
    doc_type,
    doc_id,
    print_count,
    first_printed_at,
    last_printed_at,
    created_at,
    updated_at
  )
  values (
    p_doc_type,
    p_doc_id,
    1,
    now(),
    now(),
    now(),
    now()
  )
  on conflict (doc_type, doc_id)
  do update set
    print_count = public.document_print_counters.print_count + 1,
    last_printed_at = now(),
    updated_at = now()
  returning print_count into new_count;

  return new_count;
end;
$$;

grant execute on function public.increment_document_print_counter(text, text) to anon, authenticated;

