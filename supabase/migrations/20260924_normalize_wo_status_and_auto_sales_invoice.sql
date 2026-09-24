-- 1) Normalisasi lifecycle Work Order dan otomatiskan invoice penjualan.
-- Rule baru: OPEN -> IN_PROGRESS (label UI: PROGRESS) -> COMPLETED.
-- CLOSE/CLOSED adalah status legacy dan dipetakan ke COMPLETED.

begin;

alter table public.work_orders
  add column if not exists completed_at timestamptz;

create index if not exists idx_work_orders_completed_at
  on public.work_orders (completed_at);

-- Rapikan nilai yang mungkin tersimpan dengan spasi/case berbeda.
update public.work_orders
set status = upper(btrim(status))
where status is not null
  and status <> upper(btrim(status));

update public.work_orders
set status = 'IN_PROGRESS'
where status in ('PROGRESS', 'IN PROGRESS');

update public.work_orders
set status = 'COMPLETED'
where status in ('CLOSE', 'CLOSED', 'COMPLETE');

update public.work_orders
set status = 'OPEN'
where status is null or btrim(status) = '';

-- Tanggal historical menggunakan tanggal WO; data yang sudah punya
-- completed_at tidak ditimpa.
update public.work_orders
set completed_at = work_date::timestamptz
where status = 'COMPLETED'
  and completed_at is null
  and work_date is not null;

update public.work_orders
set completed_at = null
where status <> 'COMPLETED'
  and completed_at is not null;

-- Ganti CHECK constraint lama yang masih mengizinkan CLOSED.
alter table public.work_orders
  drop constraint if exists work_orders_status_check;

alter table public.work_orders
  alter column status set default 'OPEN';

alter table public.work_orders
  alter column status set not null;

alter table public.work_orders
  add constraint work_orders_status_check
  check (status in ('OPEN', 'IN_PROGRESS', 'COMPLETED'));

-- 2) Database menjadi pemilik timestamp completion.
create or replace function public.set_work_order_completion_timestamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'COMPLETED' then
    if tg_op = 'INSERT' then
      new.completed_at = coalesce(new.completed_at, now());
    elsif old.status is distinct from 'COMPLETED' then
      new.completed_at = coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_work_order_completion_timestamp on public.work_orders;
create trigger trg_work_order_completion_timestamp
before insert or update of status on public.work_orders
for each row
execute function public.set_work_order_completion_timestamp();

-- 3) Fungsi invoice idempotent.
-- Nomor invoice diturunkan dari nomor WO sehingga aman dari trigger ganda/race.
alter table public.sales_invoices
  alter column invoice_number type varchar(100);

create or replace function public.create_sales_invoice_from_work_order(p_work_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_invoice public.sales_invoices%rowtype;
  v_vehicle_id uuid;
  v_license_plate text;
  v_brand_type text;
  v_customer_name text;
  v_total_amount numeric(15, 2) := 0;
  v_invoice_date date;
  v_invoice_number varchar(100);
begin
  select *
    into v_work_order
  from public.work_orders
  where id = p_work_order_id;

  if not found then
    raise exception 'Work Order % tidak ditemukan', p_work_order_id using errcode = 'P0002';
  end if;

  if upper(btrim(coalesce(v_work_order.status, ''))) not in ('COMPLETED', 'CLOSE', 'CLOSED') then
    raise exception 'Invoice hanya dapat dibuat untuk Work Order berstatus COMPLETED'
      using errcode = '22023';
  end if;

  select *
    into v_invoice
  from public.sales_invoices
  where work_order_id = p_work_order_id
  order by created_at asc
  limit 1;

  if found then
    return to_jsonb(v_invoice);
  end if;

  select
    ve.vehicle_id,
    v.license_plate,
    v.brand_type
  into
    v_vehicle_id,
    v_license_plate,
    v_brand_type
  from public.vehicle_entries ve
  left join public.vehicles v on v.id = ve.vehicle_id
  where ve.id = v_work_order.vehicle_entry_id;

  if nullif(btrim(coalesce(v_license_plate, '')), '') is not null
     or nullif(btrim(coalesce(v_brand_type, '')), '') is not null then
    v_customer_name := btrim(coalesce(v_license_plate, '') || ' - ' || coalesce(v_brand_type, ''));
  else
    v_customer_name := v_work_order.wo_number;
  end if;

  select coalesce(
      sum(wob.total_price) filter (where coalesce(wob.is_info_only, false) = false),
      0
    )
    into v_total_amount
  from public.work_order_billings wob
  where wob.work_order_id = p_work_order_id;

  v_invoice_date := coalesce(
    (v_work_order.completed_at at time zone 'Asia/Jakarta')::date,
    v_work_order.work_date,
    current_date
  );
  v_invoice_number := left('INV-' || coalesce(v_work_order.wo_number, v_work_order.id::text), 100);

  insert into public.sales_invoices (
    invoice_number,
    work_order_id,
    customer_name,
    vehicle_id,
    invoice_date,
    due_date,
    total_amount,
    paid_amount,
    status
  ) values (
    v_invoice_number,
    p_work_order_id,
    v_customer_name,
    v_vehicle_id,
    v_invoice_date,
    v_invoice_date,
    v_total_amount,
    0,
    'UNPAID'
  )
  on conflict (invoice_number) do update
    set work_order_id = coalesce(public.sales_invoices.work_order_id, excluded.work_order_id)
  returning * into v_invoice;

  if v_invoice.work_order_id is not null and v_invoice.work_order_id <> p_work_order_id then
    raise exception 'Nomor invoice % sudah digunakan oleh Work Order lain', v_invoice.invoice_number
      using errcode = '23505';
  end if;

  return to_jsonb(v_invoice);
end;
$$;

revoke all on function public.create_sales_invoice_from_work_order(uuid) from public;
grant execute on function public.create_sales_invoice_from_work_order(uuid) to anon, authenticated;

-- 4) Transisi WO menjadi COMPLETED otomatis memanggil pembuatan invoice.
create or replace function public.handle_completed_work_order_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'COMPLETED' then
    if tg_op = 'INSERT' then
      perform public.create_sales_invoice_from_work_order(new.id);
    elsif old.status is distinct from 'COMPLETED' then
      perform public.create_sales_invoice_from_work_order(new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_completed_work_order_invoice on public.work_orders;
create trigger trg_completed_work_order_invoice
after insert or update of status on public.work_orders
for each row
execute function public.handle_completed_work_order_invoice();

-- Invoice WO lama tidak dibuat otomatis dalam migration agar tidak membuat
-- record keuangan tanpa persetujuan. Gunakan tombol "Proses WO Selesai" pada
-- modul Invoice / Faktur Penjualan untuk memproses WO COMPLETED yang belum
-- memiliki invoice.

-- Tambahkan unique index hanya jika tidak ada invoice duplikat per WO.
-- Data duplikat historis tidak dihapus otomatis agar tidak merusak riwayat kas.
do $$
begin
  if not exists (
    select 1
    from public.sales_invoices
    where work_order_id is not null
    group by work_order_id
    having count(*) > 1
  ) then
    create unique index if not exists sales_invoices_one_per_work_order
      on public.sales_invoices (work_order_id)
      where work_order_id is not null;
  else
    raise notice 'Invoice ganda per Work Order terdeteksi; unique index tidak dibuat.';
  end if;
end;
$$;

-- 6) Aplikasi memakai custom login dan request Supabase datang sebagai anon.
-- Policy ini mengikuti model akses aplikasi yang sudah berjalan, sehingga modul
-- invoice/penerimaan dapat memakai RLS tanpa Supabase Auth session.
drop policy if exists "Enable all access for authenticated users" on public.sales_invoices;
drop policy if exists "Enable sales invoice app access" on public.sales_invoices;
create policy "Enable sales invoice app access"
on public.sales_invoices
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Enable all access for authenticated users" on public.sales_receipts;
drop policy if exists "Enable sales receipt app access" on public.sales_receipts;
create policy "Enable sales receipt app access"
on public.sales_receipts
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.sales_invoices to anon, authenticated;
grant select, insert, update, delete on public.sales_receipts to anon, authenticated;

commit;
