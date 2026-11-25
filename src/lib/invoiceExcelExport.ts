import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import type { SalesInvoiceRecord } from '@/lib/salesInvoice';

type InvoiceExcelSource = Pick<SalesInvoiceRecord, 'id'> & Partial<SalesInvoiceRecord>;

type VehicleInfo = {
  license_plate?: string | null;
  brand_type?: string | null;
  chassis_number?: string | null;
  engine_number?: string | null;
};

type VehicleEntryInfo = {
  entry_date?: string | null;
  nota_dinas_number?: string | null;
  vehicles?: VehicleInfo | VehicleInfo[] | null;
};

type InvoiceWorkOrder = {
  wo_number?: string | null;
  mechanics?: { name?: string | null } | Array<{ name?: string | null }> | null;
  vehicle_entries?: VehicleEntryInfo | VehicleEntryInfo[] | null;
};

type InvoiceBillingItem = {
  item_name?: string | null;
  item_type?: string | null;
  qty?: number | string | null;
  unit_price?: number | string | null;
  total_price?: number | string | null;
  is_info_only?: boolean | null;
};

type AgencyProfile = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

const CURRENCY_FORMAT = '#,##0';

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getStatusLabel(status?: string | null) {
  if (status === 'PAID') return 'LUNAS';
  if (status === 'PARTIAL') return 'SEBAGIAN';
  return 'BELUM LUNAS';
}

function sanitizeFileName(value: string) {
  const safe = String(value || 'invoice').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return safe || 'invoice';
}

function applyCurrencyFormat(ws: XLSX.WorkSheet, row: number, column: number) {
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: column })];
  if (cell && typeof cell.v === 'number') cell.z = CURRENCY_FORMAT;
}

async function fetchInvoice(invoice: InvoiceExcelSource) {
  if (invoice.invoice_number) return invoice as SalesInvoiceRecord;

  const { data, error } = await supabase
    .from('sales_invoices')
    .select('*')
    .eq('id', invoice.id)
    .single();
  if (error) throw error;
  return data as SalesInvoiceRecord;
}

/**
 * Export satu invoice / faktur penjualan ke file Excel dengan tata letak
 * mengikuti faktur cetak: header instansi, info kendaraan & pekerjaan,
 * rincian jasa/sparepart, total tagihan, status pembayaran, dan tanda tangan.
 */
export async function exportSalesInvoiceToExcel(invoiceSource: InvoiceExcelSource): Promise<string> {
  const invoice = await fetchInvoice(invoiceSource);
  const workOrderId = String(invoice.work_order_id || '').trim();

  const [agencyResult, workOrderResult, billingResult] = await Promise.all([
    supabase.from('agency_profile').select('*').maybeSingle(),
    workOrderId
      ? supabase
          .from('work_orders')
          .select('wo_number, mechanics (name), vehicle_entries (entry_date, nota_dinas_number, vehicles (*))')
          .eq('id', workOrderId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workOrderId
      ? supabase
          .from('work_order_billings')
          .select('item_name, item_type, qty, unit_price, total_price, is_info_only')
          .eq('work_order_id', workOrderId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (workOrderResult.error) throw workOrderResult.error;
  if (billingResult.error) throw billingResult.error;

  const agency = (agencyResult.data || null) as AgencyProfile | null;
  const workOrder = (workOrderResult.data || null) as InvoiceWorkOrder | null;
  const billings = ((billingResult.data || []) as InvoiceBillingItem[]).filter(
    (billing) => billing?.is_info_only !== true,
  );

  const entry = firstOrSelf(workOrder?.vehicle_entries);
  const vehicle = firstOrSelf(entry?.vehicles);
  const mechanic = firstOrSelf(workOrder?.mechanics);
  const totalAmount = Number(invoice.total_amount || 0) || 0;
  const paidAmount = Number(invoice.paid_amount || 0) || 0;
  const remaining = Math.max(totalAmount - paidAmount, 0);
  const customerName =
    String(invoice.customer_name || '').trim() ||
    [vehicle?.license_plate, vehicle?.brand_type].filter(Boolean).join(' - ') ||
    '-';

  const rows: Array<Array<string | number | null>> = [];
  const merges: XLSX.Range[] = [];
  const mergeRow = (rowIndex: number, startColumn: number, endColumn: number) => {
    merges.push({
      s: { r: rowIndex, c: startColumn },
      e: { r: rowIndex, c: endColumn },
    });
  };

  // Header instansi & identitas faktur.
  rows.push([agency?.name || 'INSTANSI BELUM DISETTING', null, null, null, 'INVOICE / TAGIHAN', null]);
  mergeRow(0, 0, 3);
  mergeRow(0, 4, 5);

  rows.push([
    agency?.address || '-',
    null,
    null,
    null,
    'No. Invoice',
    invoice.invoice_number || '-',
  ]);
  mergeRow(1, 0, 3);

  rows.push([
    [agency?.phone ? `Telp: ${agency.phone}` : '', agency?.email ? `Email: ${agency.email}` : '']
      .filter(Boolean)
      .join(' | ') || '-',
    null,
    null,
    null,
    'Tanggal Invoice',
    formatDate(invoice.invoice_date),
  ]);
  mergeRow(2, 0, 3);

  rows.push([]);

  // Blok informasi kendaraan & pekerjaan.
  rows.push(['INFORMASI KENDARAAN', null, null, 'INFORMASI PEKERJAAN', null, null]);
  mergeRow(4, 0, 2);
  mergeRow(4, 3, 5);

  const infoPairs: Array<[string, string, string, string]> = [
    ['No. Polisi', vehicle?.license_plate || '-', 'No. WO', workOrder?.wo_number || '-'],
    ['Tipe/Merk', vehicle?.brand_type || '-', 'Mekanik', mechanic?.name || '-'],
    ['No. Rangka', vehicle?.chassis_number || '-', 'Jatuh Tempo', formatDate(invoice.due_date)],
    ['No. Mesin', vehicle?.engine_number || '-', 'Tgl. Masuk', formatDate(entry?.entry_date)],
    ['Pelanggan', customerName, 'No. Nota Dinas', entry?.nota_dinas_number || '-'],
  ];
  infoPairs.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
    rows.push([leftLabel, leftValue, null, rightLabel, rightValue, null]);
    const rowIndex = rows.length - 1;
    mergeRow(rowIndex, 1, 2);
    mergeRow(rowIndex, 4, 5);
  });

  rows.push([]);

  rows.push(['NO', 'DESKRIPSI PEKERJAAN / SPAREPART', 'JENIS', 'QTY', 'HARGA SATUAN', 'TOTAL']);

  const firstItemRowIndex = rows.length;
  if (billings.length === 0) {
    rows.push([1, 'Tagihan Invoice', '-', 1, totalAmount, totalAmount]);
  } else {
    billings.forEach((item, index) => {
      const qty = Number(item.qty || 0) || 0;
      const unitPrice = Number(item.unit_price || 0) || 0;
      const totalPrice = Number(item.total_price || 0) || qty * unitPrice;
      rows.push([
        index + 1,
        item.item_name || '-',
        item.item_type === 'JOB' ? 'JASA' : item.item_type === 'PART' ? 'PART' : '-',
        qty,
        unitPrice,
        totalPrice,
      ]);
    });
  }
  const lastItemRowIndex = rows.length - 1;

  rows.push([null, null, null, null, 'TOTAL TAGIHAN', totalAmount]);
  const totalRowIndex = rows.length - 1;
  mergeRow(totalRowIndex, 0, 4);

  // Ringkasan pembayaran.
  rows.push([]);
  rows.push(['Status Pembayaran', null, null, getStatusLabel(invoice.status), null, null]);
  mergeRow(rows.length - 1, 1, 3);
  rows.push(['Sudah Dibayar', null, null, null, null, paidAmount]);
  mergeRow(rows.length - 1, 0, 4);
  rows.push(['Sisa Tagihan', null, null, null, null, remaining]);
  mergeRow(rows.length - 1, 0, 4);
  const paidRowIndex = rows.length - 2;
  const remainingRowIndex = rows.length - 1;

  // Tanda tangan.
  rows.push([]);
  rows.push(['Hormat Kami,', null, 'Mengetahui,', null, 'Penyerah / Customer,', null]);
  const signatureRowIndex = rows.length - 1;
  mergeRow(signatureRowIndex, 0, 1);
  mergeRow(signatureRowIndex, 2, 3);
  mergeRow(signatureRowIndex, 4, 5);
  rows.push([]);
  rows.push([]);
  rows.push(['Kasir / Admin', null, 'Kepala Bengkel', null, 'Tanda Tangan & Nama Jelas', null]);
  const signatureNameRowIndex = rows.length - 1;
  mergeRow(signatureNameRowIndex, 0, 1);
  mergeRow(signatureNameRowIndex, 2, 3);
  mergeRow(signatureNameRowIndex, 4, 5);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 18 },
    { wch: 38 },
    { wch: 10 },
    { wch: 8 },
    { wch: 16 },
    { wch: 18 },
  ];

  for (let row = firstItemRowIndex; row <= lastItemRowIndex; row += 1) {
    applyCurrencyFormat(ws, row, 4);
    applyCurrencyFormat(ws, row, 5);
  }
  applyCurrencyFormat(ws, totalRowIndex, 5);
  applyCurrencyFormat(ws, paidRowIndex, 5);
  applyCurrencyFormat(ws, remainingRowIndex, 5);

  const workbook = XLSX.utils.book_new();
  const sheetName = sanitizeFileName(invoice.invoice_number || 'Faktur').slice(0, 31);
  XLSX.utils.book_append_sheet(workbook, ws, sheetName);

  const fileName = `Faktur_${sanitizeFileName(invoice.invoice_number || invoice.id)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  return fileName;
}
