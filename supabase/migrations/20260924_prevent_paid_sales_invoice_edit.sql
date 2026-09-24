-- Invoice yang sudah menerima pembayaran tidak boleh diedit maupun dihapus.
-- - Edit diblokir: perubahan data faktur (nomor, pelanggan, tanggal, jatuh tempo,
--   total, WO, kendaraan) pada invoice berstatus PAID/PARTIAL, dengan nilai bayar,
--   atau yang punya sales_receipts.
-- - Pembayaran tetap boleh diperbarui (alur Terima) dan dibatalkan (alur Batal Bayar),
--   karena hanya kolom paid_amount/status yang diizinkan berubah.
-- - Hapus dilayani oleh trg_prevent_paid_sales_invoice_delete (migrasi sebelumnya).

begin;

create or replace function public.prevent_paid_sales_invoice_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt_count integer := 0;
  v_has_payment boolean := false;
begin
  select count(*)
    into v_receipt_count
  from public.sales_receipts
  where invoice_id = old.id;

  v_has_payment := v_receipt_count > 0
    or coalesce(old.paid_amount, 0) > 0
    or upper(btrim(coalesce(old.status, ''))) in ('PAID', 'PARTIAL');

  if v_has_payment and (
       new.invoice_number is distinct from old.invoice_number
    or new.customer_name   is distinct from old.customer_name
    or new.invoice_date     is distinct from old.invoice_date
    or new.due_date         is distinct from old.due_date
    or new.total_amount     is distinct from old.total_amount
    or new.work_order_id    is distinct from old.work_order_id
    or new.vehicle_id       is distinct from old.vehicle_id
  ) then
    raise exception 'Invoice % sudah menerima pembayaran dan tidak dapat diedit. Batalkan pembayaran terlebih dahulu.',
      old.invoice_number
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_paid_sales_invoice_update on public.sales_invoices;
create trigger trg_prevent_paid_sales_invoice_update
before update on public.sales_invoices
for each row
execute function public.prevent_paid_sales_invoice_update();

commit;
