// Konfigurasi & parser bersama untuk data "Harwat" (perawatan kendaraan R4 & R2)
// yang bersumber dari Google Sheet. Sheet harus di-share publik:
// Bagikan → "Siapa saja yang memiliki link" → Penonton.

import {
  fetchGoogleSheetTable,
  gsheetCellNumber,
  gsheetCellText,
  type GSheetRow,
} from '@/lib/googleSheets';

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
}

// Kolom sheet: A..K
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
    });
  }
  return parsed;
}

/** Ambil seluruh baris Harwat dari semua tab sheet (R4 & R2). */
export async function fetchHarwatRows(): Promise<HarwatRow[]> {
  const results = await Promise.all(
    HARWAT_SHEETS.map(({ sheet }) =>
      fetchGoogleSheetTable(HARWAT_SPREADSHEET_ID, { sheet }),
    ),
  );
  return results.flatMap((table, idx) =>
    parseHarwatRows(table.rows, HARWAT_SHEETS[idx].jenis),
  );
}

/** Normalisasi nomor polisi untuk pencocokan antar sumber data
    (huruf besar, tanpa spasi/strip/karakter non-alfanumerik). */
export function normalizePlate(value: string | null | undefined): string {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
