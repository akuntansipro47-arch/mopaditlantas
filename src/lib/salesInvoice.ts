import { supabase } from '@/lib/supabase';
import { normalizeWorkOrderStatus } from '@/lib/workOrderRules';

type VehicleSnapshot = {
  id?: string | null;
  license_plate?: string | null;
  brand_type?: string | null;
  owner_name?: string | null;
};

type VehicleEntrySnapshot = {
  vehicle_id?: string | null;
  vehicles?: VehicleSnapshot | VehicleSnapshot[] | null;
} | null;

export type CompletedWorkOrderInvoiceSource = {
  id: string;
  wo_number: string;
  work_date?: string | null;
  completed_at?: string | null;
  status?: string | null;
  vehicle_entry_id?: string | null;
  vehicle_entries?: VehicleEntrySnapshot;
  customer_name?: string | null;
};

export type SalesInvoiceRecord = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  work_order_id?: string | null;
  customer_name?: string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type EnsureSalesInvoiceResult = {
  invoice: SalesInvoiceRecord;
  created: boolean;
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

function buildInvoiceNumber(woNumber: string): string {
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
 * Creates a sales invoice for a completed Work Order exactly once.
 *
 * The database migration installs an idempotent RPC. The direct insert
 * fallback keeps the feature usable while that migration is being applied and
 * still uses the same deterministic, unique invoice number.
 */
export async function ensureSalesInvoiceForCompletedWorkOrder(
  workOrder: CompletedWorkOrderInvoiceSource,
): Promise<EnsureSalesInvoiceResult> {
  if (!workOrder?.id || !workOrder?.wo_number) {
    throw new Error('Data Work Order tidak lengkap untuk membuat invoice.');
  }

  if (normalizeWorkOrderStatus(workOrder.status) !== 'COMPLETED') {
    throw new Error('Invoice hanya dapat dibuat dari Work Order berstatus COMPLETED.');
  }

  const existing = await findExistingInvoice(workOrder.id);
  if (existing) return { invoice: existing, created: false };

  // Prefer the transactional database function. It is safe to call repeatedly
  // and returns the existing invoice when the trigger has already created it.
  const { data: rpcInvoice, error: rpcError } = await supabase.rpc(
    'create_sales_invoice_from_work_order',
    { p_work_order_id: workOrder.id },
  );

  if (!rpcError && rpcInvoice) {
    return { invoice: rpcInvoice as SalesInvoiceRecord, created: true };
  }

  // Backward-compatible fallback when the SQL migration has not been applied.
  const { data: billings, error: billingError } = await supabase
    .from('work_order_billings')
    .select('total_price, is_info_only')
    .eq('work_order_id', workOrder.id);

  if (billingError) {
    throw new Error(`Gagal mengambil rincian tagihan WO: ${getErrorMessage(billingError)}`);
  }

  const totalAmount = (billings || [])
    .filter((billing) => billing?.is_info_only !== true)
    .reduce((sum, billing) => sum + (Number(billing?.total_price || 0) || 0), 0);

  if (totalAmount <= 0) {
    throw new Error('Rincian tagihan final WO belum tersedia. Siapkan billing final sebelum membuat invoice.');
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

  const invoiceDate = formatLocalInvoiceDate(workOrder.completed_at || workOrder.work_date);
  const invoiceNumber = buildInvoiceNumber(workOrder.wo_number);
  const payload = {
    invoice_number: invoiceNumber,
    work_order_id: workOrder.id,
    customer_name: customerName,
    vehicle_id: vehicle?.id || entry?.vehicle_id || null,
    invoice_date: invoiceDate,
    due_date: invoiceDate,
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
    if (invoiceByNumber) return { invoice: invoiceByNumber, created: false };
    throw new Error('Invoice selesai diproses tetapi data invoice belum dapat dibaca.');
  }

  return { invoice, created: true };
}
