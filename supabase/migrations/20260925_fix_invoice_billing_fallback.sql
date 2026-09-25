-- Fix: WO COMPLETED normal tidak pernah mengisi work_order_billings,
-- sehingga create_sales_invoice_from_work_order selalu gagal dengan
-- "Rincian tagihan final WO belum tersedia".
-- Fallback: bila billing kosong, hitung dari estimasi vehicle entry
-- (jasa: estimated_price else selling_price; part: qty * estimated_price;
-- keduanya mengabaikan value_only) agar invoice tetap bisa dibuat.

begin;

create or replace function public.create_sales_invoice_from_work_order(
  p_work_order_id uuid,
  p_invoice_number text default null,
  p_invoice_date date default null,
  p_due_date date default null
)
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
  v_est_total numeric(15, 2) := 0;
  v_invoice_date date;
  v_due_date date;
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

  if coalesce(v_total_amount, 0) <= 0 then
    -- Fallback estimasi entry (abaikan value_only).
    select coalesce(sum(
      case
        when coalesce(vej.estimated_price, 0) > 0 then vej.estimated_price
        else coalesce(jt.selling_price, 0)
      end
    ), 0)
      into v_est_total
    from public.vehicle_entry_jobs vej
    left join public.job_types jt on jt.id = vej.job_type_id
    where vej.vehicle_entry_id = v_work_order.vehicle_entry_id
      and coalesce(vej.value_only, false) = false;

    select coalesce(v_est_total, 0) + coalesce(sum(ves.qty * ves.estimated_price), 0)
      into v_est_total
    from public.vehicle_entry_spareparts ves
    where ves.vehicle_entry_id = v_work_order.vehicle_entry_id
      and coalesce(ves.value_only, false) = false
      and coalesce(ves.qty, 0) > 0
      and coalesce(ves.estimated_price, 0) > 0;

    v_total_amount := coalesce(v_est_total, 0);
  end if;

  if v_total_amount <= 0 then
    raise exception 'Billing final WO masih kosong dan estimasi juga kosong. Lengkapi jasa / sparepart di Nota Dinas terlebih dahulu'
      using errcode = '22023';
  end if;

  v_invoice_date := coalesce(
    p_invoice_date,
    (v_work_order.completed_at at time zone 'Asia/Jakarta')::date,
    v_work_order.work_date,
    current_date
  );
  v_due_date := coalesce(p_due_date, v_invoice_date);
  if v_due_date < v_invoice_date then
    raise exception 'Tanggal jatuh tempo tidak boleh lebih awal dari tanggal invoice'
      using errcode = '22023';
  end if;
  v_invoice_number := left(
    coalesce(
      nullif(btrim(coalesce(p_invoice_number, '')), ''),
      'INV-' || coalesce(v_work_order.wo_number, v_work_order.id::text)
    ),
    100
  );

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
    v_due_date,
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

revoke all on function public.create_sales_invoice_from_work_order(uuid, text, date, date) from public;
grant execute on function public.create_sales_invoice_from_work_order(uuid, text, date, date) to anon, authenticated;

commit;
