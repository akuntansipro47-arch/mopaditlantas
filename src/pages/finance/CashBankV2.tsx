import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Ban, Eye, FileSpreadsheet, Plus, RefreshCw, Search, Upload } from 'lucide-react';
import {
  formatCurrency, formatDate, getStartOfMonthInputValue, parseLocalizedNumber, toDateInputValue,
} from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { hasMenuAccess } from '@/lib/permissions';
import { logActivity } from '@/lib/activityLog';
import { useRealtimeRefetch } from '@/hooks/useRealtimeRefetch';
import {
  type BankBookRow,
  type CashAccount,
  type CashInput,
  type CashJournalDetail,
  type CashKind,
  type CashRecord,
  accountLabel,
  fetchBankBook,
  fetchCashAccounts,
  fetchCashJournalDetail,
  fetchCashRecords,
  getCashBankBalance,
  isCashAccount,
  postCashPayment,
  postCashReceipt,
  validateCashInput,
  voidCashEntry,
} from '@/lib/cashBank';

// ============================================================
// Kas & Bank — Penerimaan (non-usaha) / Pembayaran (beban) / Buku Bank
// Spesifikasi: docs/FS_Modul_KasBank.md
// ============================================================

const SOURCE_LABELS: Record<string, string> = {
  cash_receipts: 'Penerimaan Kas/Bank',
  cash_payments: 'Pembayaran Kas/Bank',
  purchase_payments: 'Pelunasan Hutang (AP)',
  sales_receipts: 'Pelunasan Piutang (AR)',
  goods_receipts: 'Penerimaan Barang (GR)',
  goods_issues: 'Pengeluaran Barang (GI)',
  purchase_returns: 'Retur Pembelian',
  excel_import: 'Impor Excel',
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  CASH_RECEIPT: 'Penerimaan Kas/Bank',
  CASH_PAYMENT: 'Pembayaran Kas/Bank',
  DEPOSIT: 'Setoran (Lama)',
  PAYMENT: 'Pembayaran (Lama)',
  GENERAL: 'Jurnal Umum',
  JOURNAL: 'Jurnal Lain',
};

function sourceLabel(row: Pick<BankBookRow, 'source_table' | 'entry_type'>): string {
  const st = String(row.source_table || '');
  if (SOURCE_LABELS[st]) return SOURCE_LABELS[st];
  const et = String(row.entry_type || '').toUpperCase();
  return ENTRY_TYPE_LABELS[et] || 'Jurnal Lain';
}

function statusBadge(status: string) {
  return status === 'VOID'
    ? <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Dibatalkan</span>
    : <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Terposting</span>;
}

function excelSerialToInput(n: number): string {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

// ------------------------------------------------------------
// Halaman utama
// ------------------------------------------------------------
export default function CashBankV2() {
  const { user } = useAuth();
  const canImportCashBank = hasMenuAccess(user, 'finance_cashbank_import');

  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [importKind, setImportKind] = useState<CashKind | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await fetchCashAccounts());
    } catch (e: any) {
      toast.error('Gagal memuat akun: ' + (e?.message || 'Unknown error'));
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    const onFocus = () => loadAccounts();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadAccounts]);

  useRealtimeRefetch({ tables: ['chart_of_accounts'], onRefetch: loadAccounts });

  const cashAccounts = useMemo(() => accounts.filter((a) => isCashAccount(a)), [accounts]);

  const openImport = (kind: CashKind) => {
    if (!canImportCashBank) {
      toast.error('Anda tidak memiliki izin untuk melakukan import data.');
      return;
    }
    setImportKind(kind);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kas &amp; Bank</h1>
        <p className="text-sm text-slate-500">
          Penerimaan non-operasional, pembayaran biaya operasional, dan rekapitulasi mutasi kas/bank otomatis.
        </p>
      </div>

      <Tabs defaultValue="receipts">
        <TabsList>
          <TabsTrigger value="receipts">Penerimaan</TabsTrigger>
          <TabsTrigger value="payments">Pembayaran</TabsTrigger>
          <TabsTrigger value="book">Buku Bank</TabsTrigger>
        </TabsList>

        <TabsContent value="receipts">
          <RecordsSection
            kind="receipt"
            accounts={accounts}
            cashAccounts={cashAccounts}
            accountsLoading={accountsLoading}
            refreshKey={refreshKey}
            canImport={canImportCashBank}
            onImport={() => openImport('receipt')}
          />
        </TabsContent>

        <TabsContent value="payments">
          <RecordsSection
            kind="payment"
            accounts={accounts}
            cashAccounts={cashAccounts}
            accountsLoading={accountsLoading}
            refreshKey={refreshKey}
            canImport={canImportCashBank}
            onImport={() => openImport('payment')}
          />
        </TabsContent>

        <TabsContent value="book">
          <BankBookSection
            cashAccounts={cashAccounts}
            accountsLoading={accountsLoading}
            refreshKey={refreshKey}
          />
        </TabsContent>
      </Tabs>

      {importKind && (
        <ImportDialog
          kind={importKind}
          accounts={accounts}
          onClose={() => setImportKind(null)}
          onImported={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Sub-Modul: Penerimaan / Pembayaran
// ------------------------------------------------------------
type RecordsSectionProps = {
  kind: CashKind;
  accounts: CashAccount[];
  cashAccounts: CashAccount[];
  accountsLoading: boolean;
  refreshKey: number;
  canImport: boolean;
  onImport: () => void;
};

function RecordsSection(props: RecordsSectionProps) {
  const { kind, accounts, cashAccounts, accountsLoading, refreshKey, canImport, onImport } = props;
  const isReceipt = kind === 'receipt';
  const label = isReceipt ? 'Penerimaan' : 'Pembayaran';

  const [rows, setRows] = useState<CashRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    startDate: getStartOfMonthInputValue(),
    endDate: toDateInputValue(),
  });
  const [search, setSearch] = useState('');

  // Form tambah
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: toDateInputValue(),
    cashAccountId: '',
    accountId: '',
    amount: '',
    description: '',
    referenceNo: '',
  });
  const [balanceWarned, setBalanceWarned] = useState(false);
  const [cashBalance, setCashBalance] = useState<number | null>(null);

  // Detail & Void
  const [detail, setDetail] = useState<{ record: CashRecord; data: CashJournalDetail | null } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState<CashRecord | null>(null);
  const [voiding, setVoiding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchCashRecords(kind, filter.startDate, filter.endDate));
    } catch (e: any) {
      toast.error('Gagal memuat data: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [kind, filter.startDate, filter.endDate]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Akun lawan yang sah (klien) — cerminan validasi server FSD §4.4 / §5.4
  const contraOptions = useMemo(() => {
    return accounts.filter((a) => {
      if (a.account_type !== 'DETAIL' || isCashAccount(a)) return false;
      const cat = String(a.category || '').toUpperCase();
      const name = String(a.account_name || '');
      if (isReceipt) {
        return a.balance_type === 'CREDIT'
          && !['AKTIVA', 'PASSIVA', 'MODAL'].includes(cat)
          && !/piutang/i.test(name);
      }
      return a.balance_type === 'DEBIT' && cat !== 'AKTIVA' && !/hutang/i.test(name);
    });
  }, [accounts, isReceipt]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.no.toLowerCase().includes(q)
      || String(r.description || '').toLowerCase().includes(q)
      || String(r.reference_no || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Saldo akun kas terpilih (peringatan lunak)
  useEffect(() => {
    if (!formOpen || !form.cashAccountId) {
      setCashBalance(null);
      return;
    }
    let alive = true;
    getCashBankBalance(form.cashAccountId, form.date || toDateInputValue()).then((b) => {
      if (alive) setCashBalance(b);
    });
    return () => { alive = false; };
  }, [formOpen, form.cashAccountId, form.date]);

  const openForm = () => {
    setForm({
      date: toDateInputValue(),
      cashAccountId: cashAccounts[0]?.id || '',
      accountId: '',
      amount: '',
      description: '',
      referenceNo: '',
    });
    setBalanceWarned(false);
    setFormOpen(true);
  };

  const handleSave = async () => {
    const input: CashInput = {
      date: form.date,
      cashAccountId: form.cashAccountId,
      accountId: form.accountId,
      amount: parseLocalizedNumber(form.amount),
      description: String(form.description || '').trim(),
      referenceNo: String(form.referenceNo || '').trim() || undefined,
    };

    const err = validateCashInput(kind, input, accounts);
    if (err) {
      toast.error(err);
      return;
    }

    // Peringatan lunak saldo (level SOFT — FSD §4.4/§5.4 no. 7)
    if (cashBalance !== null && input.amount > cashBalance && !balanceWarned) {
      setBalanceWarned(true);
      toast.warning(
        `Saldo akun tidak mencukupi (saldo ${formatCurrency(cashBalance)}). Klik Simpan sekali lagi untuk melanjutkan.`,
      );
      return;
    }

    setSaving(true);
    try {
      const res = isReceipt ? await postCashReceipt(input) : await postCashPayment(input);
      const savedNo = String((res as any).receipt_no || (res as any).payment_no || '');

      await logActivity({
        action: 'CREATE',
        module: 'kas_bank',
        entity_type: isReceipt ? 'cash_receipt' : 'cash_payment',
        entity_id: res.id,
        details: `${label} ${savedNo} senilai ${formatCurrency(input.amount)}`,
        meta: {
          no: savedNo,
          date: input.date,
          amount: input.amount,
          cash_account_id: input.cashAccountId,
          account_id: input.accountId,
        },
      });

      toast.success(`${label} berhasil disimpan — No. ${savedNo}`);
      setFormOpen(false);
      load();
    } catch (e: any) {
      toast.error('Gagal menyimpan: ' + (e?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (record: CashRecord) => {
    setDetail({ record, data: null });
    setDetailLoading(true);
    try {
      const data = await fetchCashJournalDetail(kind, record.id);
      setDetail({ record, data });
    } catch (e: any) {
      toast.error('Gagal memuat detail: ' + (e?.message || 'Unknown error'));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidCashEntry(kind, voidTarget.id);
      await logActivity({
        action: 'VOID',
        module: 'kas_bank',
        entity_type: isReceipt ? 'cash_receipt' : 'cash_payment',
        entity_id: voidTarget.id,
        details: `Membatalkan ${label} ${voidTarget.no} senilai ${formatCurrency(voidTarget.amount)}`,
        meta: {
          no: voidTarget.no,
          date: voidTarget.date,
          amount: voidTarget.amount,
          cash_account_id: voidTarget.cash_account_id,
          account_id: voidTarget.account_id,
        },
      });
      toast.success(`${label} ${voidTarget.no} dibatalkan dan jurnal ditarik dari pembukuan`);
      setVoidTarget(null);
      load();
    } catch (e: any) {
      toast.error('Gagal membatalkan: ' + (e?.message || 'Unknown error'));
    } finally {
      setVoiding(false);
    }
  };

  const exportExcel = () => {
    if (visibleRows.length === 0) {
      toast.error('Tidak ada data untuk diekspor');
      return;
    }
    const data = visibleRows.map((r) => ({
      Tanggal: formatDate(r.date),
      'No. Bukti': r.no,
      'Akun Kas/Bank': accountLabel(accById.get(r.cash_account_id)),
      [isReceipt ? 'Akun Pendapatan' : 'Akun Beban']: accountLabel(accById.get(r.account_id)),
      Jumlah: r.amount,
      Uraian: r.description,
      'No. Dokumen': r.reference_no || '',
      Status: r.status === 'VOID' ? 'Dibatalkan' : 'Terposting',
      'Dibuat Oleh': r.created_by || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label);
    XLSX.writeFile(wb, `${label}_Kas_Bank_${filter.startDate}_sd_${filter.endDate}.xlsx`);
  };

  const today = toDateInputValue();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Daftar {label} Kas/Bank</CardTitle>
            <CardDescription>
              {isReceipt
                ? 'Penerimaan non-usaha: pendapatan lain-lain, bunga bank, dan penerimaan non-operasional lainnya.'
                : 'Pengeluaran kas/bank untuk biaya/beban operasional — di luar pelunasan hutang dagang (AP).'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onImport} title={canImport ? undefined : 'Tanpa izin impor'}>
              <Upload className="h-4 w-4 mr-2" />
              Impor Excel
            </Button>
            <Button onClick={openForm} className="bg-green-600 hover:bg-green-700">
              <Plus className="h-4 w-4 mr-2" />
              Tambah {label}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Tanggal Mulai</Label>
              <Input
                type="date"
                className="w-[160px]"
                value={filter.startDate}
                onChange={(e) => setFilter((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Tanggal Akhir</Label>
              <Input
                type="date"
                className="w-[160px]"
                value={filter.endDate}
                onChange={(e) => setFilter((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1 min-w-[220px] flex-1">
              <Label>Pencarian</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-8"
                  placeholder="No. bukti / uraian / no. dokumen"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Muat Ulang
              </Button>
              <Button variant="outline" onClick={exportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>No. Bukti</TableHead>
                <TableHead>Akun Kas/Bank</TableHead>
                <TableHead>{isReceipt ? 'Akun Pendapatan' : 'Akun Beban'}</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead>Uraian</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || accountsLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                    Memproses data...
                  </TableCell>
                </TableRow>
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                    Tidak ada data {label.toLowerCase()} pada periode ini.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((r) => (
                  <TableRow key={r.id} className={r.status === 'VOID' ? 'opacity-60' : undefined}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{r.no}</TableCell>
                    <TableCell>{accountLabel(accById.get(r.cash_account_id))}</TableCell>
                    <TableCell>{accountLabel(accById.get(r.account_id))}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">
                      {formatCurrency(r.amount)}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate" title={r.description}>
                      {r.description}
                      {r.reference_no ? <span className="block text-xs text-slate-400">Ref: {r.reference_no}</span> : null}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Detail jurnal" onClick={() => openDetail(r)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {r.status === 'POSTED' && (
                          <Button size="sm" variant="ghost" title="Batalkan transaksi" onClick={() => setVoidTarget(r)}>
                            <Ban className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="text-sm text-slate-500">
            Menampilkan {visibleRows.length} dari {rows.length} data
            {filter.startDate || filter.endDate ? ` • periode ${formatDate(filter.startDate)} s/d ${formatDate(filter.endDate)}` : ''}
          </div>
        </CardContent>
      </Card>

      {/* Dialog Form Tambah */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah {label} Kas/Bank</DialogTitle>
            <DialogDescription>
              {isReceipt
                ? 'Catat penerimaan non-usaha. Pelunasan piutang dicatat di modul Penjualan.'
                : 'Catat pengeluaran untuk biaya operasional. Pelunasan hutang dagang dicatat di modul Pembelian.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tanggal *</Label>
                <Input
                  type="date"
                  max={today}
                  value={form.date}
                  onChange={(e) => { setForm((f) => ({ ...f, date: e.target.value })); setBalanceWarned(false); }}
                />
              </div>
              <div className="space-y-1">
                <Label>No. Dokumen</Label>
                <Input
                  placeholder="Opsional (kwitansi/invoice)"
                  value={form.referenceNo}
                  onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Akun Kas/Bank *</Label>
              <Select
                value={form.cashAccountId || undefined}
                onValueChange={(v) => { setForm((f) => ({ ...f, cashAccountId: v })); setBalanceWarned(false); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih akun kas/bank" />
                </SelectTrigger>
                <SelectContent>
                  {cashAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cashBalance !== null && (
                <p className="text-xs text-slate-500 mt-1">
                  Saldo saat ini: <span className="font-semibold">{formatCurrency(cashBalance)}</span>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>{isReceipt ? 'Akun Pendapatan Non-Operasional *' : 'Akun Beban Operasional *'}</Label>
              <Select
                value={form.accountId || undefined}
                onValueChange={(v) => { setForm((f) => ({ ...f, accountId: v })); setBalanceWarned(false); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={isReceipt ? 'Pilih akun pendapatan (mis. Bunga Bank)' : 'Pilih akun beban (mis. Beban Listrik)'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {contraOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Jumlah (Rp) *</Label>
              <Input
                inputMode="decimal"
                placeholder="0"
                value={form.amount}
                onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setBalanceWarned(false); }}
              />
            </div>

            <div className="space-y-1">
              <Label>Uraian *</Label>
              <Textarea
                rows={2}
                placeholder={isReceipt ? 'Contoh: Bunga bank bulan Oktober' : 'Contoh: Bayar listrik bulan Oktober'}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button
              onClick={handleSave}
              disabled={saving || accountsLoading}
              className="bg-green-600 hover:bg-green-700 min-w-[140px]"
            >
              {saving ? 'Memproses data...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Detail */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Detail {label} {detail?.record.no ? `— ${detail.record.no}` : ''}
            </DialogTitle>
            <DialogDescription>Rincian jurnal yang terbentuk dari transaksi ini.</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="py-6 text-center text-sm text-slate-500">Memproses data...</div>
          ) : detail?.data ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-slate-500">Tanggal</span> — {formatDate(detail.data.entry.entry_date)}</div>
                <div><span className="text-slate-500">Status</span> — {statusBadge(detail.record.status)}</div>
                <div className="col-span-2"><span className="text-slate-500">Uraian</span> — {detail.data.entry.description}</div>
                {detail.record.reference_no ? (
                  <div className="col-span-2"><span className="text-slate-500">No. Dokumen</span> — {detail.record.reference_no}</div>
                ) : null}
                <div className="col-span-2"><span className="text-slate-500">Dibuat oleh</span> — {detail.record.created_by || '-'}</div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Akun</TableHead>
                    <TableHead className="text-right">Debet</TableHead>
                    <TableHead className="text-right">Kredit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.data.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>{accountLabel(accById.get(it.account_id))}</TableCell>
                      <TableCell className="text-right">{Number(it.debit) > 0 ? formatCurrency(Number(it.debit)) : ''}</TableCell>
                      <TableCell className="text-right">{Number(it.credit) > 0 ? formatCurrency(Number(it.credit)) : ''}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(detail.data.items.reduce((s, i) => s + (Number(i.debit) || 0), 0))}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(detail.data.items.reduce((s, i) => s + (Number(i.credit) || 0), 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="py-4 text-sm text-slate-500">Jurnal untuk transaksi ini tidak ditemukan.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Void */}
      <Dialog open={!!voidTarget} onOpenChange={(open) => { if (!open) setVoidTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Batalkan {label}?</DialogTitle>
            <DialogDescription>
              Transaksi <b>{voidTarget?.no}</b> senilai <b>{voidTarget ? formatCurrency(voidTarget.amount) : ''}</b>{' '}
              akan ditandai <b>VOID</b> dan jurnalnya ditarik dari pembukuan. Tindakan ini tercatat di log aktivitas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>Kembali</Button>
            <Button variant="destructive" disabled={voiding} onClick={confirmVoid}>
              {voiding ? 'Memproses data...' : 'Ya, Batalkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------
// Buku Bank (Bank Book / Cash Ledger) — otomatis dari jurnal
// ------------------------------------------------------------
type BankBookSectionProps = {
  cashAccounts: CashAccount[];
  accountsLoading: boolean;
  refreshKey: number;
};

type BookGroup = {
  accountId: string;
  label: string;
  opening: number;
  rows: { row: BankBookRow; running: number; visible: boolean }[];
  visDebit: number;
  visCredit: number;
  totalDebit: number;
  totalCredit: number;
  closing: number;
};

function BankBookSection({ cashAccounts, accountsLoading, refreshKey }: BankBookSectionProps) {
  const [filter, setFilter] = useState({
    startDate: getStartOfMonthInputValue(),
    endDate: toDateInputValue(),
    accountId: 'ALL',
    jenis: 'ALL',
    search: '',
  });
  const [data, setData] = useState<{ opening: Record<string, number>; rows: BankBookRow[] }>({
    opening: {},
    rows: [],
  });
  const [loading, setLoading] = useState(true);

  const accountId = filter.accountId === 'ALL' ? '' : filter.accountId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchBankBook({ startDate: filter.startDate, endDate: filter.endDate, accountId }));
    } catch (e: any) {
      toast.error('Gagal memuat Buku Bank: ' + (e?.message || 'Unknown error'));
      setData({ opening: {}, rows: [] });
    } finally {
      setLoading(false);
    }
  }, [filter.startDate, filter.endDate, accountId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const groups = useMemo<BookGroup[]>(() => {
    const map = new Map<string, BookGroup>();

    data.rows.forEach((row) => {
      let g = map.get(row.account_id);
      if (!g) {
        g = {
          accountId: row.account_id,
          label: `${row.account_code} - ${row.account_name}`,
          opening: data.opening[row.account_id] || 0,
          rows: [],
          visDebit: 0,
          visCredit: 0,
          totalDebit: 0,
          totalCredit: 0,
          closing: 0,
        };
        map.set(row.account_id, g);
      }
      const signed = row.balance_type === 'DEBIT'
        ? (Number(row.debit) - Number(row.credit))
        : (Number(row.credit) - Number(row.debit));
      const prev = g.rows.length > 0 ? g.rows[g.rows.length - 1].running : g.opening;
      g.rows.push({ row, running: prev + signed, visible: true });
      g.totalDebit += Number(row.debit) || 0;
      g.totalCredit += Number(row.credit) || 0;
    });

    const q = filter.search.trim().toLowerCase();
    map.forEach((g) => {
      g.rows.forEach((item) => {
        const r = item.row;
        const jenisOk = filter.jenis === 'ALL'
          || (filter.jenis === 'IN' && Number(r.debit) > 0)
          || (filter.jenis === 'OUT' && Number(r.credit) > 0);
        const qOk = !q
          || String(r.voucher_no || '').toLowerCase().includes(q)
          || String(r.entry_description || '').toLowerCase().includes(q)
          || String(r.line_description || '').toLowerCase().includes(q);
        item.visible = jenisOk && qOk;
        if (item.visible) {
          g.visDebit += Number(r.debit) || 0;
          g.visCredit += Number(r.credit) || 0;
        }
      });
      const last = g.rows[g.rows.length - 1];
      g.closing = last ? last.running : g.opening;
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [data, filter.jenis, filter.search]);

  const summary = useMemo(() => {
    const openingTotal = accountId
      ? (data.opening[accountId] || 0)
      : Object.values(data.opening).reduce((s, v) => s + v, 0);
    let totalIn = 0;
    let totalOut = 0;
    data.rows.forEach((r) => {
      totalIn += Number(r.debit) || 0;
      totalOut += Number(r.credit) || 0;
    });
    return { openingTotal, totalIn, totalOut, closing: openingTotal + totalIn - totalOut };
  }, [data, accountId]);

  const anyVisible = groups.some((g) => g.rows.some((it) => it.visible));

  const exportExcel = () => {
    if (!anyVisible) {
      toast.error('Tidak ada data untuk diekspor');
      return;
    }
    const out: any[] = [];
    groups.forEach((g) => {
      const visible = g.rows.filter((it) => it.visible);
      if (visible.length === 0) return;
      out.push({ Tanggal: '', 'No. Voucher': '', Uraian: `SALDO AWAL — ${g.label}`, Sumber: '', Debet: '', Kredit: '', Saldo: g.opening });
      visible.forEach((it) => {
        out.push({
          Tanggal: formatDate(it.row.entry_date),
          'No. Voucher': it.row.voucher_no || '',
          Uraian: it.row.entry_description || it.row.line_description || '',
          Sumber: sourceLabel(it.row),
          Debet: Number(it.row.debit) || '',
          Kredit: Number(it.row.credit) || '',
          Saldo: it.running,
        });
      });
      out.push({
        Tanggal: '', 'No. Voucher': '',
        Uraian: `SALDO AKHIR — ${g.label}`, Sumber: '',
        Debet: g.visDebit || '', Kredit: g.visCredit || '', Saldo: g.closing,
      });
    });
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buku Bank');
    XLSX.writeFile(wb, `Buku_Bank_${filter.startDate}_sd_${filter.endDate}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">Saldo Awal</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-slate-900">{formatCurrency(summary.openingTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">Total Masuk</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-green-600">{formatCurrency(summary.totalIn)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">Total Keluar</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-red-600">{formatCurrency(summary.totalOut)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">Saldo Akhir</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-slate-900">{formatCurrency(summary.closing)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Buku Bank / Buku Kas</CardTitle>
            <CardDescription>
              Rekapitulasi otomatis seluruh mutasi debet/kredit akun kas &amp; bank dari semua modul.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Muat Ulang
            </Button>
            <Button variant="outline" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Tanggal Mulai</Label>
              <Input
                type="date"
                className="w-[160px]"
                value={filter.startDate}
                onChange={(e) => setFilter((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Tanggal Akhir</Label>
              <Input
                type="date"
                className="w-[160px]"
                value={filter.endDate}
                onChange={(e) => setFilter((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Akun Kas/Bank</Label>
              <Select value={filter.accountId} onValueChange={(v) => setFilter((f) => ({ ...f, accountId: v }))}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua akun Kas/Bank</SelectItem>
                  {cashAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Jenis Mutasi</Label>
              <Select value={filter.jenis} onValueChange={(v) => setFilter((f) => ({ ...f, jenis: v }))}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  <SelectItem value="IN">Masuk</SelectItem>
                  <SelectItem value="OUT">Keluar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[200px] flex-1">
              <Label>Pencarian</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-8"
                  placeholder="No. voucher / uraian"
                  value={filter.search}
                  onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>No. Voucher</TableHead>
                <TableHead>Uraian</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead className="text-right">Debet</TableHead>
                <TableHead className="text-right">Kredit</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || accountsLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">Memproses data...</TableCell>
                </TableRow>
              ) : groups.length === 0 || !anyVisible ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    Tidak ada mutasi kas/bank pada periode ini.
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((g) => {
                  const visible = g.rows.filter((it) => it.visible);
                  if (visible.length === 0) return null;
                  return (
                    <Fragment key={g.accountId}>
                      <TableRow className="bg-slate-100 hover:bg-slate-100">
                        <TableCell colSpan={7} className="font-semibold text-slate-700">
                          {g.label}
                          <span className="ml-3 font-normal text-slate-500">
                            Saldo Awal: {formatCurrency(g.opening)}
                          </span>
                        </TableCell>
                      </TableRow>
                      {visible.map((it) => (
                        <TableRow key={it.row.line_id}>
                          <TableCell className="whitespace-nowrap">{formatDate(it.row.entry_date)}</TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{it.row.voucher_no || '-'}</TableCell>
                          <TableCell>{it.row.entry_description || it.row.line_description || '-'}</TableCell>
                          <TableCell className="text-xs text-slate-500">{sourceLabel(it.row)}</TableCell>
                          <TableCell className="text-right">
                            {Number(it.row.debit) > 0 ? formatCurrency(Number(it.row.debit)) : ''}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(it.row.credit) > 0 ? formatCurrency(Number(it.row.credit)) : ''}
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(it.running)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t">
                        <TableCell colSpan={4} className="text-right text-xs font-semibold text-slate-600">
                          Total Debet / Kredit — Saldo Akhir {g.label}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(g.visDebit)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(g.visCredit)}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(g.closing)}</TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------
// Dialog Impor Excel (dipertahankan dari modul lama, kini lewat sub-ledger)
// ------------------------------------------------------------
type ImportDialogProps = {
  kind: CashKind;
  accounts: CashAccount[];
  onClose: () => void;
  onImported: () => void;
};

function ImportDialog({ kind, accounts, onClose, onImported }: ImportDialogProps) {
  const isReceipt = kind === 'receipt';
  const label = isReceipt ? 'Penerimaan' : 'Pembayaran';

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      toast.error('File harus berformat Excel (.xlsx atau .xls)');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const workbook = XLSX.read(ev.target?.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        const nonEmpty = json.filter((row: any) =>
          Object.values(row || {}).some((v) => v !== undefined && v !== null && String(v).trim() !== ''),
        );
        setPreview(nonEmpty);
        setErrorLog([]);
        setResult(null);
        toast.success(`Berhasil memuat ${nonEmpty.length} baris data`);
      } catch {
        toast.error('Gagal membaca file Excel');
      }
    };
    reader.readAsBinaryString(f);
  };

  const downloadTemplate = () => {
    const template = [
      {
        'Tanggal': '2026-10-01',
        'No. Voucher': isReceipt ? 'KBM/20261001/001' : 'KBU/20261001/001',
        'Kode Akun Kas/Bank': '1101',
        [isReceipt ? 'Kode Akun Sumber' : 'Kode Akun Biaya']: isReceipt ? '4102' : '6101',
        'Jumlah': isReceipt ? 500000 : 250000,
        'Keterangan': isReceipt ? 'Contoh penerimaan' : 'Contoh pengeluaran',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `Template_Import_${label}.xlsx`);
  };

  const processImport = async () => {
    if (!file || preview.length === 0) {
      toast.error('Pilih file Excel terlebih dahulu');
      return;
    }
    setImporting(true);
    let success = 0;
    const logs: string[] = [];

    for (let i = 0; i < preview.length; i++) {
      const rowNum = i + 2;
      try {
        const row = preview[i];
        const norm: Record<string, any> = {};
        for (const key of Object.keys(row || {})) {
          const k = (key || '').trim();
          let v = (row as any)[key];
          if (typeof v === 'string') v = v.trim();
          norm[k] = v;
          if (k) norm[k.toLowerCase()] = v;
        }
        const pick = (...names: string[]) => {
          for (const n of names) {
            const v = norm[n] ?? norm[n.toLowerCase()];
            if (v !== undefined && v !== null && String(v).trim() !== '') return v;
          }
          return '';
        };

        let entryDate = pick('Tanggal', 'tanggal', 'date');
        if (entryDate instanceof Date) entryDate = toDateInputValue(entryDate);
        else if (typeof entryDate === 'number') entryDate = excelSerialToInput(entryDate);
        else if (typeof entryDate === 'string') entryDate = entryDate.split('T')[0];
        else entryDate = toDateInputValue();

        const voucherNo = String(pick('No. Voucher', 'no_voucher', 'voucher no') || '');
        const cashCode = String(pick('Kode Akun Kas/Bank', 'kode akun kas/bank', 'kas/bank account', 'cash bank account') || '');
        const contraCode = String(
          isReceipt
            ? pick('Kode Akun Sumber', 'kode akun sumber', 'source account')
            : pick('Kode Akun Biaya', 'kode akun biaya', 'expense account'),
        );
        const amount = parseLocalizedNumber(pick('Jumlah', 'jumlah', 'amount') ?? 0);
        const memo = String(pick('Keterangan', 'keterangan', 'description') || '');

        if (!cashCode || !contraCode || !(amount > 0)) {
          const missing: string[] = [];
          if (!cashCode) missing.push('Kode Akun Kas/Bank');
          if (!contraCode) missing.push(isReceipt ? 'Kode Akun Sumber' : 'Kode Akun Biaya');
          if (!(amount > 0)) missing.push('Jumlah (harus > 0)');
          logs.push(`Baris ${rowNum}: Data tidak lengkap — kolom ${missing.join(', ')}`);
          continue;
        }

        const cashAcc = accounts.find((a) => a.account_code === cashCode);
        const contraAcc = accounts.find((a) => a.account_code === contraCode);
        if (!cashAcc || !contraAcc) {
          const missing: string[] = [];
          if (!cashAcc) missing.push(`Kode Akun Kas/Bank '${cashCode}'`);
          if (!contraAcc) missing.push(`Kode Akun ${isReceipt ? 'Sumber' : 'Biaya'} '${contraCode}'`);
          logs.push(`Baris ${rowNum}: Akun tidak ditemukan — ${missing.join(', ')}. Pastikan kode akun ada di Chart of Accounts.`);
          continue;
        }

        const input: CashInput = {
          date: String(entryDate),
          cashAccountId: cashAcc.id,
          accountId: contraAcc.id,
          amount,
          description: memo.length >= 3 ? memo : 'Transaksi hasil impor Excel',
          referenceNo: undefined,
          voucherNo: voucherNo || undefined,
        };

        const err = validateCashInput(kind, input, accounts);
        if (err) {
          logs.push(`Baris ${rowNum}: ${err}`);
          continue;
        }

        if (isReceipt) await postCashReceipt(input);
        else await postCashPayment(input);
        success++;
      } catch (e: any) {
        logs.push(`Baris ${rowNum}: ${e?.message || String(e)}`);
      }
    }

    setResult({ success, failed: logs.length });
    setErrorLog(logs);
    toast.success(`Impor selesai: ${success} berhasil, ${logs.length} gagal`);
    onImported();
    setImporting(false);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impor {label} dari Excel</DialogTitle>
          <DialogDescription>
            Kolom: Tanggal, No. Voucher, Kode Akun Kas/Bank, {isReceipt ? 'Kode Akun Sumber' : 'Kode Akun Biaya'}, Jumlah, Keterangan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Unduh Template
          </Button>

          {file && preview.length > 0 && (
            <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-600">
              File: <b>{file.name}</b> — siap impor <b>{preview.length}</b> baris.
            </div>
          )}

          {result && (
            <div className="rounded-md border bg-slate-50 p-3 text-sm">
              Hasil: <b className="text-green-700">{result.success} berhasil</b>,{' '}
              <b className="text-red-600">{result.failed} gagal</b>.
            </div>
          )}

          {errorLog.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorLog.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button onClick={processImport} disabled={!preview.length || importing} className="min-w-[160px]">
            {importing ? 'Memproses data...' : `Impor ${preview.length || ''} Baris`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
