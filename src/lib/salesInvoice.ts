import { supabase } from '@/lib/supabase';
import { normalizeWorkOrderStatus } from '@/lib/workOrderRules';

type VehicleSnapshot = {
  id?: string | null;
  license_plate?: string | null;
  brand_type?: string | null;
  owner_name?: string | null;
};

type VehicleEntryJobSnapshot = {
  estimated_price?: number | string | null;
  value_only?: boolean | null;
  job_type_id?: string | null;
  job_types?: { selling_price?: number | string | null } | Array<{ selling_price?: number | string | null }> | null;
};

type VehicleEntrySparepartSnapshot = {
  goods_id?: string | null;
  item_name?: string | null;
  qty?: number | string | null;
  estimated_price?: number | string | null;
  value_only?: boolean | null;
};

type VehicleEntrySnapshot = {
  vehicle_id?: string | null;
  vehicles?: VehicleSnapshot | VehicleSnapshot[] | null;
  vehicle_entry_jobs?: VehicleEntryJobSnapshot[] | null;
  vehicle_entry_spareparts?: VehicleEntrySparepartSnapshot[] | null;
} | null;

export type CompletedWorkOrderInvoiceSource = {
  id: string;
  wo_number: string;
  work_date?: string | null;
  completed_at?: string | null;
  status?: string | null;
  vehicle_entry_id?: string | null;
  vehicle_entries?: VehicleEntrySnapshot | VehicleEntrySnapshot[];
  customer_name?: string | null;
  work_order_billings?: Array<{
    item_type?: string | null;
    item_name?: string | null;
    job_type_id?: string | null;
    goods_id?: string | null;
    qty?: number | string | null;
    unit_price?: number | string | null;
    total_price?: number | string | null;
    is_info_only?: boolean | null;
  }> | null;
};

/** Estimasi jasa: pakai estimated_price, fallback ke selling_price job_types. */
export function getJobEstimationAmount(job: VehicleEntryJobSnapshot | null | undefined): number {
  if (!job) return 0;
  if (job.value_only === true) return 0;
  const raw = (job as { estimated_price?: unknown }).estimated_price;
  const ep = Number(raw);
  const jobTypes = Array.isArray(job.job_types) ? job.job_types[0] : job.job_types;
  const sp = Number(jobTypes?.selling_price || 0) || 0;
  if (Number.isFinite(ep) && ep > 0) return ep;
  if ((raw === null || raw === undefined || ep === 0) && sp > 0) return sp;
  return Number.isFinite(ep) && ep > 0 ? ep : 0;
}

export function getWorkOrderBillingTotal(
  workOrder: Pick<CompletedWorkOrderInvoiceSource, 'work_order_billings'> | null | undefined,
): number {
  return ((workOrder?.work_order_billings || []) as Array<{
    total_price?: number | string | null;
    is_info_only?: boolean | null;
  }>)
    .filter((billing) => billing?.is_info_only !== true)
    .reduce((sum, billing) => sum + (Number(billing?.total_price || 0) || 0), 0);
}

/** Fallback estimasi dari vehicle entry (jasa + sparepart, tanpa value_only). */
export function getWorkOrderEstimationTotal(workOrder: CompletedWorkOrderInvoiceSource): number {
  const entry = Array.isArray(workOrder.vehicle_entries)
    ? workOrder.vehicle_entries[0]
    : workOrder.vehicle_entries;
  if (!entry) return 0;
  let total = 0;
  (entry.vehicle_entry_jobs || []).forEach((job) => {
    total += getJobEstimationAmount(job);
  });
  (entry.vehicle_entry_spareparts || []).forEach((part) => {
    if (part?.value_only === true) return;
    const qty = Number(part?.qty || 0) || 0;
    const price = Number(part?.estimated_price || 0) || 0;
    if (qty > 0 && price > 0) total += qty * price;
  });
  return total;
}

/**
 * Total tagihan untuk invoice: pakai billing final bila ada,
 * fallback ke estimasi entry agar WO COMPLETED tanpa billing tetap bisa diinvoice.
 */
export function resolveWorkOrderInvoiceTotal(workOrder: CompletedWorkOrderInvoiceSource): number {
  const billingTotal = getWorkOrderBillingTotal(workOrder);
  if (billingTotal > 0) return billingTotal;
  return getWorkOrderEstimationTotal(workOrder);
}

export function hasFinalBilling(workOrder: CompletedWorkOrderInvoiceSource): boolean {
  return getWorkOrderBillingTotal(workOrder) > 0;
}

export type SalesInvoiceRecord = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  work_order_id?: string | null;
  customer_name?: string | null;
  due_date?: string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type EnsureSalesInvoiceResult = {
  invoice: SalesInvoiceRecord;
  created: boolean;
};

export type SalesInvoiceInput = {
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
};

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Kesalahan tidak diketahui');
  }
  return String(error || 'Kesalahan tidak diketahui');
}

function getFirstVehicle(entry: VehicleEntrySnapshot): VehicleSnapshot | null {
  if (!entry) return null;
  if (Array.isArray(entry.vehicles)) return entry.vehicles[0] || null;
  return entry.vehicles || null;
}

/** Format a timestamp as a local YYYY-MM-DD value, not a UTC date slice. */
export function formatLocalInvoiceDate(value?: string | null): string {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildInvoiceNumber(woNumber: string): string {
  return `INV-${String(woNumber || 'WO').trim()}`.slice(0, 50);
}

async function findExistingInvoice(workOrderId: string) {
  const { data, error } = await supabase
    .from('sales_invoices')
    .select('*')
    .eq('work_order_id', workOrderId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Membuat rincian billing final dari estimasi vehicle entry bila WO COMPLETED
 * belum punya billing. Ini akar masalah "Billing final WO masih kosong":
 * alur COMPLETED normal tidak pernah mengisi work_order_billings.
 * Mengembalikan total billing final (>0) atau 0 bila tidak ada sumber tagihan.
 */
export async function ensureWorkOrderBillingsFromEstimation(workOrderId: string): Promise<number> {
  const { data: existing, error: existingError } = await supabase
    .from('work_order_billings')
    .select('total_price, is_info_only')
    .eq('work_order_id', workOrderId);
  if (existingError) throw new Error(`Gagal mengambil rincian tagihan WO: ${getErrorMessage(existingError)}`);
  const existingTotal = (existing || [])
    .filter((billing) => billing?.is_info_only !== true)
    .reduce((sum, billing) => sum + (Number(billing?.total_price || 0) || 0), 0);
  if (existingTotal > 0) return existingTotal;

  const { data: wo, error: woError } = await supabase
    .from('work_orders')
    .select('id, vehicle_entry_id')
    .eq('id', workOrderId)
    .maybeSingle();
  if (woError) throw new Error(`Gagal membaca Work Order: ${getErrorMessage(woError)}`);
  const vehicleEntryId = String((wo as { vehicle_entry_id?: unknown } | null)?.vehicle_entry_id || '').trim();
  if (!vehicleEntryId) return 0;

  const { data: jobs } = await supabase
    .from('vehicle_entry_jobs')
    .select('job_type_id, estimated_price, value_only, job_types (selling_price, job_name, job_group)')
    .eq('vehicle_entry_id', vehicleEntryId);
  const { data: parts } = await supabase
    .from('vehicle_entry_spareparts')
    .select('goods_id, item_name, qty, estimated_price, value_only')
    .eq('vehicle_entry_id', vehicleEntryId);

  const items: Record<string, unknown>[] = [];
  (jobs || []).forEach((job: unknown) => {
    const row = job as {
      job_type_id?: string | null;
      estimated_price?: number | string | null;
      value_only?: boolean | null;
      job_types?: { selling_price?: number | string | null; job_name?: string | null; job_group?: string | null } | Array<{ selling_price?: number | string | null; job_name?: string | null; job_group?: string | null }> | null;
    };
    if (row?.value_only === true) return;
    const jobType = Array.isArray(row?.job_types) ? row.job_types[0] : row?.job_types;
    const ep = Number(row?.estimated_price || 0) || 0;
    const sp = Number(jobType?.selling_price || 0) || 0;
    const unit = ep > 0 ? ep : sp;
    if (!(unit > 0)) return;
    items.push({
      work_order_id: workOrderId,
      item_type: 'JOB',
      job_type_id: row?.job_type_id || null,
      goods_id: null,
      item_name: String(jobType?.job_name || 'Jasa').slice(0, 200),
      job_group: jobType?.job_group || 'PERBAIKAN',
      qty: 1,
      unit_price: unit,
      total_price: unit,
    });
  });
  (parts || []).forEach((part: unknown) => {
    const row = part as {
      goods_id?: string | null;
      item_name?: string | null;
      qty?: number | string | null;
      estimated_price?: number | string | null;
      value_only?: boolean | null;
    };
    if (row?.value_only === true) return;
    const qty = Number(row?.qty || 0) || 0;
    const unit = Number(row?.estimated_price || 0) || 0;
    if (!(qty > 0 && unit > 0)) return;
    items.push({
      work_order_id: workOrderId,
      item_type: 'PART',
      job_type_id: null,
      goods_id: row?.goods_id || null,
      item_name: String(row?.item_name || 'Sparepart').slice(0, 200),
      job_group: 'PERBAIKAN',
      qty,
      unit_price: unit,
      total_price: unit * qty,
    });
  });

  if (items.length === 0) return 0;

  const { error: insertError } = await supabase.from('work_order_billings').insert(items);
  if (insertError) throw new Error(`Gagal membuat billing final otomatis: ${getErrorMessage(insertError)}`);

  const { data: refreshed, error: refreshError } = await supabase
    .from('work_order_billings')
    .select('total_price, is_info_only')
    .eq('work_order_id', workOrderId);
  if (refreshError) throw new Error(`Gagal membaca billing final: ${getErrorMessage(refreshError)}`);
  return (refreshed || [])
    .filter((billing) => billing?.is_info_only !== true)
    .reduce((sum, billing) => sum + (Number(billing?.total_price || 0) || 0), 0);
}

function isMissingBillingError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('rincian tagihan') ||
    message.includes('billing') ||
    message.includes('belum tersedia')
  );
}

/**
 * Creates a sales invoice for a completed Work Order exactly once.
 *
 * The database migration installs an idempotent RPC. The direct insert
 * fallback keeps the feature usable while that migration is being applied and
 * still uses the same deterministic, unique invoice number.
 */
export async function ensureSalesInvoiceForCompletedWorkOrder(
  workOrder: CompletedWorkOrderInvoiceSource,
  input: SalesInvoiceInput = {},
): Promise<EnsureSalesInvoiceResult> {
  if (!workOrder?.id || !workOrder?.wo_number) {
    throw new Error('Data Work Order tidak lengkap untuk membuat invoice.');
  }

  if (normalizeWorkOrderStatus(workOrder.status) !== 'COMPLETED') {
    throw new Error('Invoice hanya dapat dibuat dari Work Order berstatus COMPLETED.');
  }

  const existing = await findExistingInvoice(workOrder.id);
  if (existing) return { invoice: existing, created: false };

  const invoiceDate =
    String(input.invoiceDate || '').trim() ||
    formatLocalInvoiceDate(workOrder.completed_at || workOrder.work_date);
  const dueDate = String(input.dueDate || '').trim() || invoiceDate;
  const invoiceNumber = (
    String(input.invoiceNumber || '').trim() || buildInvoiceNumber(workOrder.wo_number)
  ).slice(0, 50);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new Error('Tanggal invoice dan jatuh tempo tidak valid.');
  }
  if (!invoiceNumber) {
    throw new Error('Nomor invoice tidak boleh kosong.');
  }
  if (dueDate < invoiceDate) {
    throw new Error('Tanggal jatuh tempo tidak boleh lebih awal dari tanggal invoice.');
  }

  // Prefer the transactional database function. It is safe to call repeatedly
  // and keeps the invoice creation rules in one place.
  const rpcPayload = {
    p_work_order_id: workOrder.id,
    p_invoice_number: invoiceNumber,
    p_invoice_date: invoiceDate,
    p_due_date: dueDate,
  };
  const { data: rpcInvoice, error: rpcError } = await supabase.rpc(
    'create_sales_invoice_from_work_order',
    rpcPayload,
  );

  if (!rpcError && rpcInvoice) {
    let invoice = rpcInvoice as SalesInvoiceRecord;
    const patch: Partial<SalesInvoiceRecord> = {};
    if (String(invoice.invoice_number || '') !== invoiceNumber) patch.invoice_number = invoiceNumber;
    if (String(invoice.invoice_date || '') !== invoiceDate) patch.invoice_date = invoiceDate;
    if (String(invoice.due_date || '') !== dueDate) patch.due_date = dueDate;

    if (Object.keys(patch).length > 0 && invoice.id) {
      const { data: updatedInvoice, error: updateError } = await supabase
        .from('sales_invoices')
        .update(patch)
        .eq('id', invoice.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      invoice = updatedInvoice as SalesInvoiceRecord;
    }
    return { invoice, created: true };
  }

  // WO COMPLETED tanpa billing adalah kasus normal (alur COMPLETED tidak
  // mengisi work_order_billings). Buatkan billing final dari estimasi entry,
  // lalu coba RPC sekali lagi sebelum memakai jalur insert langsung.
  if (rpcError && isMissingBillingError(rpcError)) {
    try {
      const generatedTotal = await ensureWorkOrderBillingsFromEstimation(workOrder.id);
      if (generatedTotal > 0) {
        const retry = await supabase.rpc('create_sales_invoice_from_work_order', rpcPayload);
        if (!retry.error && retry.data) {
          return { invoice: retry.data as SalesInvoiceRecord, created: true };
        }
      }
    } catch (generationError) {
      throw new Error(
        `Billing final WO masih kosong dan gagal dibuat otomatis: ${getErrorMessage(generationError)}`,
      );
    }
  } else if (rpcError) {
    const rpcMessage = getErrorMessage(rpcError);
    // Bukan error billing kosong (mis. nomor duplikat, validasi tanggal):
    // biarkan fallback di bawah yang memeriksa invoice yang sudah ada,
    // kecuali errornya jelas bukan soal koneksi/migrasi.
    if (!/function|not exist|schema|permission|denied/i.test(rpcMessage)) {
      const raced = await findExistingInvoice(workOrder.id).catch(() => null);
      if (raced) return { invoice: raced, created: false };
      if (/sudah digunakan|tidak boleh|hanya dapat dibuat/i.test(rpcMessage)) {
        throw new Error(rpcMessage);
      }
    }
  }

  // Backward-compatible fallback when the SQL migration has not been applied.
  const { data: billings, error: billingError } = await supabase
    .from('work_order_billings')
    .select('total_price, is_info_only')
    .eq('work_order_id', workOrder.id);

  if (billingError) {
    throw new Error(`Gagal mengambil rincian tagihan WO: ${getErrorMessage(billingError)}`);
  }

  const totalAmountFromBillings = (billings || [])
    .filter((billing) => billing?.is_info_only !== true)
    .reduce((sum, billing) => sum + (Number(billing?.total_price || 0) || 0), 0);

  let totalAmount = totalAmountFromBillings;
  if (!(totalAmount > 0)) {
    // Fallback 1: estimasi yang sudah ikut ter-load di objek WO (tanpa query tambahan).
    totalAmount = resolveWorkOrderInvoiceTotal(workOrder);
  }
  if (!(totalAmount > 0)) {
    // Fallback 2: buatkan billing final dari estimasi entry, lalu pakai hasilnya.
    totalAmount = await ensureWorkOrderBillingsFromEstimation(workOrder.id);
  }

  if (totalAmount <= 0) {
    throw new Error('Billing final WO masih kosong. Siapkan rincian final sebelum menyimpan invoice.');
  }

  const entry = Array.isArray(workOrder.vehicle_entries)
    ? workOrder.vehicle_entries[0]
    : workOrder.vehicle_entries;
  const vehicle = getFirstVehicle(entry || null);
  const customerName =
    String(vehicle?.owner_name || '').trim() ||
    String(workOrder.customer_name || '').trim() ||
    [vehicle?.license_plate, vehicle?.brand_type].filter(Boolean).join(' - ') ||
    String(workOrder.wo_number || 'Umum');

  const payload = {
    invoice_number: invoiceNumber,
    work_order_id: workOrder.id,
    customer_name: customerName,
    vehicle_id: vehicle?.id || entry?.vehicle_id || null,
    invoice_date: invoiceDate,
    due_date: dueDate,
    total_amount: totalAmount,
    paid_amount: 0,
    status: 'UNPAID',
  };

  const { error: insertError } = await supabase
    .from('sales_invoices')
    .upsert(payload, { onConflict: 'invoice_number', ignoreDuplicates: true });

  if (insertError) {
    const invoiceAfterRace = await findExistingInvoice(workOrder.id);
    if (invoiceAfterRace) return { invoice: invoiceAfterRace, created: false };
    throw new Error(`Gagal membuat invoice penjualan: ${getErrorMessage(insertError)}`);
  }

  const invoice = await findExistingInvoice(workOrder.id);
  if (!invoice) {
    // A pre-existing invoice may use the deterministic number while its WO link
    // was historically detached. Adopt that invoice instead of duplicating it.
    const { data: invoiceByNumber, error: lookupError } = await supabase
      .from('sales_invoices')
      .select('*')
      .eq('invoice_number', invoiceNumber)
      .limit(1)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (invoiceByNumber) {
      const linkedWorkOrderId = String(invoiceByNumber.work_order_id || '');
      if (linkedWorkOrderId && linkedWorkOrderId !== String(workOrder.id)) {
        throw new Error(`Nomor invoice ${invoiceNumber} sudah digunakan oleh Work Order lain.`);
      }
      if (!linkedWorkOrderId) {
        const { data: linkedInvoice, error: linkError } = await supabase
          .from('sales_invoices')
          .update({ work_order_id: workOrder.id })
          .eq('id', invoiceByNumber.id)
          .select('*')
          .single();
        if (linkError) throw linkError;
        return { invoice: linkedInvoice as SalesInvoiceRecord, created: false };
      }
      return { invoice: invoiceByNumber, created: false };
    }
    throw new Error('Invoice selesai diproses tetapi data invoice belum dapat dibaca.');
  }

  return { invoice, created: true };
}
