// Helper untuk membaca data dari Google Sheet yang di-share publik
// ("Siapa saja yang memiliki link" - Penonton) memakai endpoint gviz JSON.
// Endpoint ini CORS-friendly sehingga bisa dipanggil langsung dari browser
// tanpa API key maupun backend.

export interface GSheetCell {
  v?: string | number | boolean | null;
  f?: string;
}

export interface GSheetRow {
  c?: (GSheetCell | null)[] | null;
}

export interface GSheetColumn {
  id?: string;
  label?: string;
  type?: string;
}

export interface GSheetTable {
  cols: GSheetColumn[];
  rows: GSheetRow[];
}

export async function fetchGoogleSheetTable(
  spreadsheetId: string,
  options: { gid?: string; sheet?: string } = {},
): Promise<GSheetTable> {
  const params = new URLSearchParams({ tqx: 'out:json' });
  if (options.gid) params.set('gid', options.gid);
  if (options.sheet) params.set('sheet', options.sheet);
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Tidak dapat terhubung ke Google Sheet. Periksa koneksi internet Anda.');
  }
  if (!response.ok) {
    throw new Error(
      `Google Sheet menolak akses (HTTP ${response.status}). Pastikan sheet sudah di-share: Bagikan → "Siapa saja yang memiliki link" → Penonton.`,
    );
  }

  const text = await response.text();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Respon Google Sheet tidak valid.');
  }

  let parsed: { status?: string; errors?: { detailed_message?: string }[]; table?: GSheetTable };
  try {
    parsed = JSON.parse(text.substring(start, end + 1));
  } catch {
    throw new Error('Respon Google Sheet tidak dapat di-parse.');
  }
  if (parsed?.status === 'error') {
    const message = parsed?.errors?.[0]?.detailed_message || 'Google Sheet mengembalikan error.';
    throw new Error(String(message));
  }
  if (!parsed?.table) {
    throw new Error('Data tabel tidak ditemukan pada respon Google Sheet.');
  }
  return parsed.table;
}

/** Nilai teks dari sel gviz (aman untuk sel/baris kosong). */
export function gsheetCellText(row: GSheetRow, index: number): string {
  const cells = row?.c;
  if (!cells || index >= cells.length) return '';
  const cell = cells[index];
  if (!cell || cell.v === null || cell.v === undefined) return '';
  return String(cell.v).trim();
}

/**
 * Nilai tampilan dari sel gviz: mengutamakan teks terformat (f) bila ada,
 * cocok untuk kolom tanggal. Fallback ke nilai mentah (v).
 */
export function gsheetCellDisplay(row: GSheetRow, index: number): string {
  const cells = row?.c;
  if (!cells || index >= cells.length) return '';
  const cell = cells[index];
  if (!cell) return '';
  if (cell.f !== null && cell.f !== undefined && String(cell.f).trim() !== '') return String(cell.f).trim();
  if (cell.v === null || cell.v === undefined) return '';
  return String(cell.v).trim();
}

/**
 * Nilai angka dari sel gviz. Kolom bertipe number memiliki v numerik;
 * kolom teks berformat US ("1,234.56") di-parse dengan menghapus koma ribuan.
 */
export function gsheetCellNumber(row: GSheetRow, index: number): number {
  const cells = row?.c;
  if (!cells || index >= cells.length) return 0;
  const cell = cells[index];
  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return 0;
  if (typeof cell.v === 'number') return Number.isFinite(cell.v) ? cell.v : 0;
  const cleaned = String(cell.v)
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}
