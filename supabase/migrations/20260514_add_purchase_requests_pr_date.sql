alter table public.purchase_requests
add column if not exists pr_date date;

update public.purchase_requests
set pr_date = (created_at at time zone 'utc')::date
where pr_date is null;

alter table public.purchase_requests
alter column pr_date set default current_date;

alter table public.purchase_requests
alter column pr_date set not null;

create index if not exists purchase_requests_pr_date_idx on public.purchase_requests(pr_date);
