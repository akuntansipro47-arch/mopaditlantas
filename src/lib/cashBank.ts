import { supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demoSupabase';

// ============================================================
// Modul Kas/Bank — lapisan data (lihat docs/FS_Modul_KasBank.md)
// - Mode produksi : posting atomik via RPC (post_cash_receipt/payment)
// - Mode demo     : insert berurutan ke localStorage (tanpa jaringan)
// ============================================================

export type CashKind = 'receipt' | 'payment';

export type CashAccount = {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  category: string;
  sub_category: string;
  balance_type: string;
  is_cash_bank?: boolean | null;
};

export type CashRecord = {
  id: string;
  no: string;
  date: string;
  cash_account_id: string;
  account_id: string;
  amount: number;
  description: string;
  reference_no?: string | null;
  status: 'POSTED' | 'VOID';
  created_at: string;
  created_by?: string | null;
};

export type CashInput = {
  date: string;
  cashAccountId: string;
  accountId: string;
  amount: number;
  description: string;
  referenceNo?: string;
  voucherNo?: string; // dipakai kembali saat impor Excel
  createdBy?: string | null;
};

export type BankBookRow = {
  line_id: string;
  entry_date: string;
  voucher_no: string | null;
  entry_type: string | null;
  source_table: string | null;
  reference: string | null;
  entry_description: string | null;
  account_id: string;
  account_code: string;
  account_name: string;
  balance_type: string;
  debit: number;
  credit: number;
  line_description: string | null;
};

export type BankBookFilter = {
  startDate: string;
  endDate: string;
  accountId?: string; // '' / undefined = semua akun
};

export type JournalLine = {
  id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string | null;
};

export type CashJournalDetail = {
  entry: {
    id: string;
    entry_date: string;
    voucher_no: string | null;
    entry_type: string;
    description: string | null;
    total_amount: number;
    reference: string | null;
    source_table: string | null;
  };
  items: JournalLine[];
};

const TABLE_OF: Record<CashKind, string> = {
  receipt: 'cash_receipts',
  payment: 'cash_payments',
};

const ENTRY_TYPE_OF: Record<CashKind, string> = {
  receipt: 'CASH_RECEIPT',
  payment: 'CASH_PAYMENT',
};

/** Username aktif dari session aplikasi (untuk kolom created_by / audit). */
function currentUsername(): string | null {
  try {
    const raw = localStorage.getItem('app_user');
    return raw ? (JSON.parse(raw)?.username ?? null) : null;
  } catch {
    return null;
  }
}

/** Akun dianggap kas/bank bila ber-flag is_cash_bank (atau heuristik nama lama). */
export function isCashAccount(a: Partial<CashAccount> | null | undefined): boolean {
  if (!a) return false;
  if (a.is_cash_bank === true) return true;
  const name = String(a.account_name || '').toLowerCase();
  return a.sub_category === 'AKTIVA_LANCAR' && (name.includes('kas') || name.includes('bank'));
}

export function accountLabel(a: Partial<CashAccount> | null | undefined): string {
  if (!a) return '-';
  return `${a.account_code || ''} - ${a.account_name || ''}`.trim();
}

// ------------------------------------------------------------
// Master akun
// ------------------------------------------------------------
export async function fetchCashAccounts(): Promise<CashAccount[]> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('account_type', 'DETAIL')
    .order('account_code');

  if (error) throw new Error(error.message || 'Gagal memuat akun');
  return (data || []) as CashAccount[];
}

// ------------------------------------------------------------
// Daftar transaksi (sub-ledger)
// ------------------------------------------------------------
export async function fetchCashRecords(
  kind: CashKind,
  startDate: string,
  endDate: string,
): Promise<CashRecord[]> {
  const table = TABLE_OF[kind];
  const dateCol = kind === 'receipt' ? 'receipt_date' : 'payment_date';
  const noCol = kind === 'receipt' ? 'receipt_no' : 'payment_no';

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .gte(dateCol, startDate)
    .lte(dateCol, endDate)
    .order(dateCol, { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Gagal memuat data transaksi');

  return ((data || []) as any[]).map((r) => ({
    id: r.id,
    no: String(r[noCol] || ''),
    date: String(r[dateCol] || ''),
    cash_account_id: r.cash_account_id,
    account_id: r.account_id,
    amount: Number(r.amount) || 0,
    description: r.description,
    reference_no: r.reference_no,
    status: (r.status === 'VOID' ? 'VOID' : 'POSTED') as CashRecord['status'],
    created_at: r.created_at,
    created_by: r.created_by,
  }));
}

// ------------------------------------------------------------
// Validasi input (klien) — cerminan validasi server FSD §4.4 / §5.4
// ------------------------------------------------------------
export function validateCashInput(
  kind: CashKind,
  input: CashInput,
  accounts: CashAccount[],
): string | null {
  const isReceipt = kind === 'receipt';
  const today = new Date().toISOString().split('T')[0];

  if (!input.date) return isReceipt ? 'Tanggal penerimaan wajib diisi.' : 'Tanggal pembayaran wajib diisi.';
  if (input.date > today) {
    return isReceipt
      ? 'Tanggal penerimaan tidak boleh di masa depan.'
      : 'Tanggal pembayaran tidak boleh di masa depan.';
  }

  const cash = accounts.find((a) => a.id === input.cashAccountId);
  if (!cash || cash.account_type !== 'DETAIL' || !isCashAccount(cash)) {
    return 'Pilih akun kas/bank yang valid.';
  }

  const contra = accounts.find((a) => a.id === input.accountId);
  if (!contra) {
    return isReceipt ? 'Pilih akun pendapatan terlebih dahulu.' : 'Pilih akun beban terlebih dahulu.';
  }
  if (contra.id === cash.id || isCashAccount(contra)) {
    return 'Akun lawan tidak boleh sama dengan akun kas/bank.';
  }

  const category = String(contra.category || '').toUpperCase();

  if (isReceipt) {
    if (contra.account_type !== 'DETAIL' || contra.balance_type !== 'CREDIT') {
      return 'Akun kredit harus akun detail bertipe kredit (Pendapatan Non-Operasional).';
    }
    if (/piutang/i.test(contra.account_name || '')) {
      return 'Pelunasan piutang dicatat di modul Penjualan — pilih akun pendapatan non-operasional.';
    }
    if (['AKTIVA', 'PASSIVA', 'MODAL'].includes(category)) {
      return 'Akun kredit harus kategori Pendapatan, bukan aset/hutang/modal.';
    }
  } else {
    if (contra.account_type !== 'DETAIL' || contra.balance_type !== 'DEBIT') {
      return 'Akun debit harus akun beban operasional (detail bertipe debet).';
    }
    if (/hutang/i.test(contra.account_name || '')) {
      return 'Pelunasan hutang dagang diproses di modul Pembelian — pilih akun beban operasional.';
    }
    if (category === 'AKTIVA') {
      return 'Akun debit harus kategori Beban, bukan aset (persediaan/piutang).';
    }
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Jumlah harus lebih dari Rp 0.';
  if (Number(amount.toFixed(2)) !== amount) return 'Jumlah maksimal 2 desimal.';

  const desc = String(input.description || '').trim();
  if (desc.length < 3) return 'Uraian wajib diisi (min. 3 karakter).';
  if (desc.length > 255) return 'Uraian maksimal 255 karakter.';

  return null;
}

// ------------------------------------------------------------
// Posting (RPC atomik / fallback demo)
// ------------------------------------------------------------
export async function postCashReceipt(
  input: CashInput,
): Promise<{ id: string; receipt_no?: string; payment_no?: string }> {
  if (isDemoMode()) return demoPost('receipt', input);

  const { data, error } = await supabase.rpc('post_cash_receipt', {
    p_receipt_date: input.date,
    p_cash_account_id: input.cashAccountId,
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_description: input.description,
    p_reference_no: input.referenceNo || null,
    p_receipt_no: input.voucherNo || null,
    p_created_by: input.createdBy ?? currentUsername(),
  });
  if (error) throw new Error(error.message || 'Gagal menyimpan penerimaan');
  return data as { id: string; receipt_no?: string; payment_no?: string };
}

export async function postCashPayment(
  input: CashInput,
): Promise<{ id: string; receipt_no?: string; payment_no?: string }> {
  if (isDemoMode()) return demoPost('payment', input);

  const { data, error } = await supabase.rpc('post_cash_payment', {
    p_payment_date: input.date,
    p_cash_account_id: input.cashAccountId,
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_description: input.description,
    p_reference_no: input.referenceNo || null,
    p_payment_no: input.voucherNo || null,
    p_created_by: input.createdBy ?? currentUsername(),
  });
  if (error) throw new Error(error.message || 'Gagal menyimpan pembayaran');
  return data as { id: string; receipt_no?: string; payment_no?: string };
}

async function demoNextNo(kind: CashKind): Promise<string> {
  const table = TABLE_OF[kind];
  const noCol = kind === 'receipt' ? 'receipt_no' : 'payment_no';
  const prefix = kind === 'receipt' ? 'KBM' : 'KBU';
  const dateStr = new Date().toISOString().split('T')[0];
  const key = `${prefix}/${dateStr.replace(/-/g, '')}/`;

  const { data } = await supabase.from(table).select('*');
  const maxSeq = ((data || []) as any[]).reduce((max, r) => {
    const no = String(r?.[noCol] || '');
    if (!no.startsWith(key)) return max;
    const seq = parseInt(no.split('/')[2] || '0', 10);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);

  return `${key}${String(maxSeq + 1).padStart(3, '0')}`;
}

async function demoPost(
  kind: CashKind,
  input: CashInput,
): Promise<{ id: string; receipt_no?: string; payment_no?: string }> {
  const table = TABLE_OF[kind];
  const entryType = ENTRY_TYPE_OF[kind];
  const no = input.voucherNo?.trim() || (await demoNextNo(kind));
  const noField = kind === 'receipt' ? 'receipt_no' : 'payment_no';
  const dateField = kind === 'receipt' ? 'receipt_date' : 'payment_date';

  const subRow: any = {
    [noField]: no,
    [dateField]: input.date,
    cash_account_id: input.cashAccountId,
    account_id: input.accountId,
    amount: input.amount,
    description: input.description,
    reference_no: input.referenceNo || null,
    status: 'POSTED',
    created_by: input.createdBy ?? currentUsername(),
  };

  const { data: sub, error: subErr } = await supabase.from(table).insert([subRow]).select().single();
  if (subErr || !sub) {
    throw new Error(subErr?.message || 'Gagal menyimpan transaksi (demo)');
  }

  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .insert([
      {
        entry_date: input.date,
        voucher_no: no,
        description: input.description,
        entry_type: entryType,
        total_amount: input.amount,
        reference: (sub as any).id,
        source_table: table,
      },
    ])
    .select()
    .single();

  if (jeErr || !je) {
    await supabase.from(table).delete().eq('id', (sub as any).id);
    throw new Error(jeErr?.message || 'Gagal membuat jurnal (demo)');
  }

  const cashLine =
    kind === 'receipt'
      ? { account_id: input.cashAccountId, debit: input.amount, credit: 0 }
      : { account_id: input.cashAccountId, debit: 0, credit: input.amount };
  const contraLine =
    kind === 'receipt'
      ? { account_id: input.accountId, debit: 0, credit: input.amount }
      : { account_id: input.accountId, debit: input.amount, credit: 0 };

  const { error: itemErr } = await supabase.from('journal_entry_items').insert([
    { journal_entry_id: (je as any).id, ...cashLine, description: input.description },
    { journal_entry_id: (je as any).id, ...contraLine, description: input.description },
  ]);
  if (itemErr) {
    await supabase.from('journal_entries').delete().eq('id', (je as any).id);
    await supabase.from(table).delete().eq('id', (sub as any).id);
    throw new Error(itemErr.message || 'Gagal membuat rincian jurnal (demo)');
  }

  return kind === 'receipt' ? { id: (sub as any).id, receipt_no: no } : { id: (sub as any).id, payment_no: no };
}

// ------------------------------------------------------------
// Void
// ------------------------------------------------------------
export async function voidCashEntry(kind: CashKind, id: string): Promise<void> {
  if (isDemoMode()) {
    const table = TABLE_OF[kind];
    const entryType = ENTRY_TYPE_OF[kind];

    const { error } = await supabase.from(table).update({ status: 'VOID' }).eq('id', id);
    if (error) throw new Error(error.message || 'Gagal membatalkan transaksi');

    const { data: jes } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('reference', id)
      .eq('entry_type', entryType);
    const entryIds = ((jes || []) as any[]).map((j) => j.id);
    if (entryIds.length > 0) {
      await supabase.from('journal_entry_items').delete().in('journal_entry_id', entryIds);
      await supabase.from('journal_entries').delete().in('id', entryIds);
    }
    return;
  }

  const fn = kind === 'receipt' ? 'void_cash_receipt' : 'void_cash_payment';
  const { error } = await supabase.rpc(fn, { p_id: id });
  if (error) throw new Error(error.message || 'Gagal membatalkan transaksi');
}

// ------------------------------------------------------------
// Saldo akun kas/bank (untuk peringatan lunak FSD — level SOFT)
// ------------------------------------------------------------
export async function getCashBankBalance(accountId: string, asOfDate: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('journal_entry_items')
      .select('debit, credit, journal_entries!inner(entry_date)')
      .eq('account_id', accountId)
      .lte('journal_entries.entry_date', asOfDate);

    if (error) throw error;
    return ((data || []) as any[]).reduce(
      (sum, r) => sum + (Number(r.debit) || 0) - (Number(r.credit) || 0),
      0,
    );
  } catch {
    return null; // gagal menghitung → jangan blokir transaksi
  }
}

// ------------------------------------------------------------
// Detail jurnal sebuah voucher (dialog Detail — query datar, demo aman)
// ------------------------------------------------------------
export async function fetchCashJournalDetail(
  kind: CashKind,
  referenceId: string,
): Promise<CashJournalDetail | null> {
  const entryType = ENTRY_TYPE_OF[kind];

  const { data: entry, error } = await supabase
    .from('journal_entries')
    .select('id, entry_date, voucher_no, entry_type, description, total_amount, reference, source_table')
    .eq('reference', referenceId)
    .eq('entry_type', entryType)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Gagal memuat jurnal');
  if (!entry) return null;

  const { data: items, error: itemsErr } = await supabase
    .from('journal_entry_items')
    .select('id, account_id, debit, credit, description')
    .eq('journal_entry_id', (entry as any).id)
    .order('id');

  if (itemsErr) throw new Error(itemsErr.message || 'Gagal memuat rincian jurnal');

  return {
    entry: entry as CashJournalDetail['entry'],
    items: (items || []) as JournalLine[],
  };
}

// ------------------------------------------------------------
// Buku Bank — rekapitulasi otomatis (FSD §6)
// ------------------------------------------------------------
const BOOK_COLS =
  'line_id, entry_date, voucher_no, entry_type, source_table, reference, entry_description, ' +
  'account_id, account_code, account_name, balance_type, debit, credit, line_description';

export async function fetchBankBook(
  filter: BankBookFilter,
): Promise<{ opening: Record<string, number>; rows: BankBookRow[] }> {
  if (isDemoMode()) return demoFetchBankBook(filter);

  let query = supabase
    .from('v_cash_bank_book')
    .select(BOOK_COLS)
    .gte('entry_date', filter.startDate)
    .lte('entry_date', filter.endDate);
  if (filter.accountId) query = query.eq('account_id', filter.accountId);

  const { data, error } = await query
    .order('entry_date', { ascending: true })
    .order('line_created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Gagal memuat Buku Bank');

  let openQuery = supabase
    .from('v_cash_bank_book')
    .select('account_id, balance_type, debit, credit')
    .lt('entry_date', filter.startDate);
  if (filter.accountId) openQuery = openQuery.eq('account_id', filter.accountId);

  const { data: openRows, error: openErr } = await openQuery;
  if (openErr) throw new Error(openErr.message || 'Gagal memuat saldo awal');

  const opening: Record<string, number> = {};
  ((openRows || []) as any[]).forEach((r) => {
    const d = Number(r.debit) || 0;
    const c = Number(r.credit) || 0;
    const delta = String(r.balance_type) === 'DEBIT' ? d - c : c - d;
    opening[r.account_id] = (opening[r.account_id] || 0) + delta;
  });

  return { opening, rows: (data || []) as BankBookRow[] };
}

async function demoFetchBankBook(
  filter: BankBookFilter,
): Promise<{ opening: Record<string, number>; rows: BankBookRow[] }> {
  const accounts = await fetchCashAccounts();
  const cashIds = new Set(accounts.filter((a) => isCashAccount(a)).map((a) => a.id));
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  const loadRows = async (mode: 'range' | 'opening'): Promise<BankBookRow[]> => {
    let entryQuery = supabase
      .from('journal_entries')
      .select('id, entry_date, voucher_no, entry_type, description, source_table, reference');
    entryQuery =
      mode === 'range'
        ? entryQuery.gte('entry_date', filter.startDate).lte('entry_date', filter.endDate)
        : entryQuery.lt('entry_date', filter.startDate);

    const { data: entries, error } = await entryQuery;
    if (error) throw new Error(error.message || 'Gagal memuat jurnal (demo)');
    const list = (entries || []) as any[];
    if (list.length === 0) return [];

    const entryMap = new Map(list.map((e) => [String(e.id), e]));
    const { data: items, error: itemsErr } = await supabase
      .from('journal_entry_items')
      .select('id, journal_entry_id, account_id, debit, credit, description')
      .in('journal_entry_id', list.map((e) => String(e.id)));
    if (itemsErr) throw new Error(itemsErr.message || 'Gagal memuat rincian jurnal (demo)');

    return ((items || []) as any[])
      .filter((it) => cashIds.has(String(it.account_id)))
      .map((it) => {
        const je = entryMap.get(String(it.journal_entry_id));
        const acc = accMap.get(String(it.account_id));
        return {
          line_id: String(it.id),
          entry_date: String(je?.entry_date || ''),
          voucher_no: je?.voucher_no ?? null,
          entry_type: je?.entry_type ?? null,
          source_table: je?.source_table ?? null,
          reference: je?.reference ?? null,
          entry_description: je?.description ?? null,
          account_id: String(it.account_id),
          account_code: acc?.account_code || '',
          account_name: acc?.account_name || '',
          balance_type: acc?.balance_type || 'DEBIT',
          debit: Number(it.debit) || 0,
          credit: Number(it.credit) || 0,
          line_description: it.description ?? null,
        } as BankBookRow;
      })
      .filter((r) => (filter.accountId ? r.account_id === filter.accountId : true))
      .sort((a, b) =>
        a.entry_date === b.entry_date
          ? String(a.voucher_no || '').localeCompare(String(b.voucher_no || ''))
          : a.entry_date.localeCompare(b.entry_date),
      );
  };

  const rows = await loadRows('range');
  const openRows = await loadRows('opening');

  const opening: Record<string, number> = {};
  openRows.forEach((r) => {
    const delta = r.balance_type === 'DEBIT' ? r.debit - r.credit : r.credit - r.debit;
    opening[r.account_id] = (opening[r.account_id] || 0) + delta;
  });

  return { opening, rows };
}
