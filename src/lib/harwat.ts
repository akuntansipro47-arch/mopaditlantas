// Konfigurasi & parser bersama untuk data "Harwat" (perawatan kendaraan R4 & R2)
// yang bersumber dari Google Sheet. Sheet harus di-share publik:
// Bagikan → "Siapa saja yang memiliki link" → Penonton.

import {
  fetchGoogleSheetTable,
  gsheetCellDisplay,
  gsheetCellNumber,
  gsheetCellText,
  type GSheetRow,
} from '@/lib/googleSheets';
import { isDemoMode } from '@/lib/demoSupabase';

export const HARWAT_SPREADSHEET_ID = '1kUq9h1sHPzKTw4WsJkXKtYw638hIzbtd52hnd9un1f4';
export const HARWAT_SHEET_URL = `https://docs.google.com/spreadsheets/d/${HARWAT_SPREADSHEET_ID}/edit`;

// Data dipisah per tab sheet di dalam spreadsheet yang sama (tab "R4" & "R2").
export const HARWAT_SHEETS: { jenis: 'R4' | 'R2'; sheet: string }[] = [
  { jenis: 'R4', sheet: 'R4' },
  { jenis: 'R2', sheet: 'R2' },
];

export interface HarwatRow {
  jenis: string;
  termin: string;
  periode: string;
  jenisKendaraan: string;
  nopol: string;
  group: string;
  uraian: string;
  qty: number;
  satuan: string;
  hargaSatuan: number;
  jumlah: number;
  // Kolom faktur (opsional, di samping kolom estimasi pada sheet yang sama).
  // No. faktur tidak ada di sheet — selalu digenerate otomatis oleh sistem.
  tglInvoice: string;
  nilaiInvoice: number;
}

// Kolom sheet: A..K (estimasi) + L..M (faktur, opsional)
const COL = {
  TERMIN: 0,
  PERIODE: 1,
  JENIS: 2,
  JENIS_KENDARAAN: 3,
  NOPOL: 4,
  GROUP: 5,
  URAIAN: 6,
  QTY: 7,
  SATUAN: 8,
  HARGA_SATUAN: 9,
  JUMLAH: 10,
  TGL_FAKTUR: 11,
  NILAI_FAKTUR: 12,
} as const;

export function parseHarwatRows(rows: GSheetRow[], fallbackJenis: string): HarwatRow[] {
  const parsed: HarwatRow[] = [];
  for (const row of rows || []) {
    const nopol = gsheetCellText(row, COL.NOPOL);
    const uraian = gsheetCellText(row, COL.URAIAN);
    // Lewati baris yang benar-benar kosong
    if (!nopol && !uraian) continue;
    parsed.push({
      jenis: (gsheetCellText(row, COL.JENIS) || fallbackJenis).toUpperCase(),
      termin: gsheetCellText(row, COL.TERMIN),
      periode: gsheetCellText(row, COL.PERIODE),
      jenisKendaraan: gsheetCellText(row, COL.JENIS_KENDARAAN),
      nopol,
      group: gsheetCellText(row, COL.GROUP),
      uraian,
      qty: gsheetCellNumber(row, COL.QTY),
      satuan: gsheetCellText(row, COL.SATUAN),
      hargaSatuan: gsheetCellNumber(row, COL.HARGA_SATUAN),
      jumlah: gsheetCellNumber(row, COL.JUMLAH),
      tglInvoice: gsheetCellDisplay(row, COL.TGL_FAKTUR),
      nilaiInvoice: gsheetCellNumber(row, COL.NILAI_FAKTUR),
    });
  }
  return parsed;
}

/** Ambil seluruh baris Harwat dari semua tab sheet (R4 & R2).
    Pada mode demo (login demo/demo123) tidak mengambil data online,
    melainkan data dummy agar konsisten dengan modul lainnya. */
export async function fetchHarwatRows(): Promise<HarwatRow[]> {
  if (isDemoMode()) return getDemoHarwatRows();
  const results = await Promise.all(
    HARWAT_SHEETS.map(({ sheet }) =>
      fetchGoogleSheetTable(HARWAT_SPREADSHEET_ID, { sheet }),
    ),
  );
  return results.flatMap((table, idx) =>
    parseHarwatRows(table.rows, HARWAT_SHEETS[idx].jenis),
  );
}

/** Data dummy Harwat untuk mode demo. Periode mengikuti bulan berjalan &
    bulan sebelumnya; mencakup semua status (sesuai/kurang/lebih/belum faktur). */
function getDemoHarwatRows(): HarwatRow[] {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthName = (d: Date) => {
    const m = MONTH_ORDER[d.getMonth()] || '';
    return m.charAt(0).toUpperCase() + m.slice(1);
  };
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const tglFaktur = fmt(new Date(now.getFullYear(), now.getMonth(), Math.min(5, now.getDate())));
  const tglFakturLalu = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 25));

  const row = (r: Omit<HarwatRow, 'tglInvoice' | 'nilaiInvoice'> & Partial<Pick<HarwatRow, 'tglInvoice' | 'nilaiInvoice'>>): HarwatRow => ({
    tglInvoice: '',
    nilaiInvoice: 0,
    ...r,
  });

  return [
    // R4 — bulan ini, faktur = estimasi (SESUAI / SUDAH SELESAI)
    row({ jenis: 'R4', termin: 'TERMIN 1', periode: monthName(thisMonth), jenisKendaraan: 'TOYOTA AVANZA DEMO', nopol: 'B 1234 DEMO', group: 'SPAREPART', uraian: 'OLI MESIN DEMO 10W-40', qty: 4, satuan: 'LITER', hargaSatuan: 85000, jumlah: 340000, tglInvoice: tglFaktur, nilaiInvoice: 340000 }),
    row({ jenis: 'R4', termin: 'TERMIN 1', periode: monthName(thisMonth), jenisKendaraan: 'TOYOTA AVANZA DEMO', nopol: 'B 1234 DEMO', group: 'SPAREPART', uraian: 'FILTER OLI DEMO', qty: 1, satuan: 'PCS', hargaSatuan: 75000, jumlah: 75000, tglInvoice: tglFaktur, nilaiInvoice: 75000 }),
    row({ jenis: 'R4', termin: 'TERMIN 1', periode: monthName(thisMonth), jenisKendaraan: 'TOYOTA AVANZA DEMO', nopol: 'B 1234 DEMO', group: 'JASA', uraian: 'JASA TUNE UP DEMO', qty: 1, satuan: 'PAKET', hargaSatuan: 250000, jumlah: 250000, tglInvoice: tglFaktur, nilaiInvoice: 250000 }),
    // R4 — bulan ini, faktur > estimasi (LEBIH / SUDAH SELESAI)
    row({ jenis: 'R4', termin: 'TERMIN 1', periode: monthName(thisMonth), jenisKendaraan: 'TOYOTA FORTUNER DEMO', nopol: 'B 9999 DEMO', group: 'SPAREPART', uraian: 'KAMPAS REM DEMO', qty: 1, satuan: 'SET', hargaSatuan: 450000, jumlah: 450000, tglInvoice: tglFaktur, nilaiInvoice: 475000 }),
    row({ jenis: 'R4', termin: 'TERMIN 1', periode: monthName(thisMonth), jenisKendaraan: 'TOYOTA FORTUNER DEMO', nopol: 'B 9999 DEMO', group: 'JASA', uraian: 'JASA GANTI REM DEMO', qty: 1, satuan: 'PAKET', hargaSatuan: 150000, jumlah: 150000, tglInvoice: tglFaktur, nilaiInvoice: 150000 }),
    // R4 — bulan lalu, faktur < estimasi (KURANG / SUDAH SELESAI)
    row({ jenis: 'R4', termin: 'TERMIN 2', periode: monthName(lastMonth), jenisKendaraan: 'TOYOTA AVANZA DEMO', nopol: 'B 1234 DEMO', group: 'SPAREPART', uraian: 'BAN DEMO 185/70 R14', qty: 2, satuan: 'PCS', hargaSatuan: 750000, jumlah: 1500000, tglInvoice: tglFakturLalu, nilaiInvoice: 1400000 }),
    // R2 — bulan ini, belum ada faktur (BELUM_FAKTUR / DALAM PROSES)
    row({ jenis: 'R2', termin: 'TERMIN 1', periode: monthName(thisMonth), jenisKendaraan: 'HONDA VARIO DEMO', nopol: 'D 5678 DEMO', group: 'SPAREPART', uraian: 'OLI MATIC DEMO', qty: 1, satuan: 'LITER', hargaSatuan: 65000, jumlah: 65000 }),
    row({ jenis: 'R2', termin: 'TERMIN 1', periode: monthName(thisMonth), jenisKendaraan: 'HONDA VARIO DEMO', nopol: 'D 5678 DEMO', group: 'JASA', uraian: 'JASA SERVICE RINGAN DEMO', qty: 1, satuan: 'PAKET', hargaSatuan: 90000, jumlah: 90000 }),
  ];
}

/** Normalisasi nomor polisi untuk pencocokan antar sumber data
    (huruf besar, tanpa spasi/strip/karakter non-alfanumerik). */
export function normalizePlate(value: string | null | undefined): string {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Grouping bersama: baris Harwat per kendaraan (nopol) + periode (termin)
// ---------------------------------------------------------------------------
export interface HarwatVehiclePeriodGroup {
  key: string;
  jenis: string;
  nopol: string;
  jenisKendaraan: string;
  termin: string;
  periode: string;
  itemCount: number;
  items: HarwatRow[];
  totalEstimasi: number;
  totalInvoice: number;
  tglInvoiceList: string[];
}

export function groupHarwatByVehiclePeriod(rows: HarwatRow[]): HarwatVehiclePeriodGroup[] {
  const groups = new Map<string, HarwatVehiclePeriodGroup>();
  for (const r of rows) {
    const norm = normalizePlate(r.nopol);
    if (!norm) continue;
    const key = `${norm}|${r.jenis}|${r.termin}|${r.periode}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        jenis: r.jenis,
        nopol: r.nopol || '-',
        jenisKendaraan: r.jenisKendaraan || '-',
        termin: r.termin,
        periode: r.periode,
        itemCount: 0,
        items: [],
        totalEstimasi: 0,
        totalInvoice: 0,
        tglInvoiceList: [],
      };
      groups.set(key, g);
    }
    g.items.push(r);
    g.itemCount += 1;
    g.totalEstimasi += r.jumlah;
    g.totalInvoice += r.nilaiInvoice;
    if (r.tglInvoice && !g.tglInvoiceList.includes(r.tglInvoice)) g.tglInvoiceList.push(r.tglInvoice);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// Utilitas urutan periode (bulan Indonesia + nomor termin)
// ---------------------------------------------------------------------------
export const MONTH_ORDER = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni',
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
];

export function periodeSortKey(periode: string, termin: string): number {
  const monthIdx = MONTH_ORDER.indexOf(periode.trim().toLowerCase());
  const terminNum = parseInt((termin.match(/\d+/) || ['999'])[0], 10);
  return (monthIdx >= 0 ? monthIdx : 500) * 1000 + (Number.isFinite(terminNum) ? terminNum : 999);
}
