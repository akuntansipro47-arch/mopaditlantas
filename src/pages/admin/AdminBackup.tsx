import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activityLog';
import { supabase } from '@/lib/supabase';
import { Download, Loader2 } from 'lucide-react';

type TableOption = { table: string; label: string };

const TABLE_OPTIONS: TableOption[] = [
  { table: 'agency_profile', label: 'Profil Instansi (agency_profile)' },
  { table: 'app_users', label: 'User Aplikasi (app_users)' },
  { table: 'vehicles', label: 'Kendaraan (vehicles)' },
  { table: 'mechanics', label: 'Mekanik (mechanics)' },
  { table: 'suppliers', label: 'Supplier (suppliers)' },
  { table: 'job_types', label: 'Pekerjaan (job_types)' },
  { table: 'goods', label: 'Barang/Jasa (goods)' },
  { table: 'budget_periods', label: 'Periode Anggaran (budget_periods)' },
  { table: 'budget_allocations', label: 'Alokasi Anggaran (budget_allocations)' },
  { table: 'vehicle_entries', label: 'Entry Kendaraan (vehicle_entries)' },
  { table: 'vehicle_entry_jobs', label: 'Jasa Entry (vehicle_entry_jobs)' },
  { table: 'vehicle_entry_spareparts', label: 'Sparepart Entry (vehicle_entry_spareparts)' },
  { table: 'work_orders', label: 'Work Order (work_orders)' },
  { table: 'work_order_billings', label: 'Billing WO (work_order_billings)' },
  { table: 'purchase_requests', label: 'Purchase Request (purchase_requests)' },
  { table: 'purchase_request_items', label: 'Item PR (purchase_request_items)' },
  { table: 'purchase_orders', label: 'Purchase Order (purchase_orders)' },
  { table: 'purchase_order_items', label: 'Item PO (purchase_order_items)' },
  { table: 'goods_receipts', label: 'Penerimaan Barang (goods_receipts)' },
  { table: 'goods_receipt_items', label: 'Item Penerimaan (goods_receipt_items)' },
  { table: 'goods_issues', label: 'Barang Keluar (goods_issues)' },
  { table: 'goods_issue_items', label: 'Item Barang Keluar (goods_issue_items)' },
  { table: 'purchase_returns', label: 'Retur Pembelian (purchase_returns)' },
  { table: 'purchase_return_items', label: 'Item Retur (purchase_return_items)' },
  { table: 'purchase_invoices', label: 'Invoice Pembelian (purchase_invoices)' },
  { table: 'purchase_invoice_items', label: 'Item Invoice Pembelian (purchase_invoice_items)' },
  { table: 'purchase_payments', label: 'Pembayaran Hutang (purchase_payments)' },
  { table: 'sales_invoices', label: 'Invoice Penjualan (sales_invoices)' },
  { table: 'sales_receipts', label: 'Pembayaran Piutang (sales_receipts)' },
  { table: 'chart_of_accounts', label: 'COA (chart_of_accounts)' },
  { table: 'journal_entries', label: 'Jurnal (journal_entries)' },
  { table: 'journal_entry_items', label: 'Item Jurnal (journal_entry_items)' },
  { table: 'employees', label: 'Karyawan (employees)' },
  { table: 'activity_logs', label: 'Log Aktivitas (activity_logs)' },
];

function downloadJson(filename: string, payload: any) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fetchAllRows(table: string, pageSize = 1000) {
  let all: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table as any)
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

export default function AdminBackup() {
  const { user } = useAuth();
  const defaultSelected = useMemo(() => Object.fromEntries(TABLE_OPTIONS.map((t) => [t.table, true])), []);
  const [selected, setSelected] = useState<Record<string, boolean>>(defaultSelected);
  const [running, setRunning] = useState(false);
  const [currentTable, setCurrentTable] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<Record<string, string>>({});

  const pickedTables = useMemo(
    () => TABLE_OPTIONS.filter((t) => selected[t.table]).map((t) => t.table),
    [selected]
  );

  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold tracking-tight">Backup & Export</h2>
        <Card>
          <CardHeader>
            <CardTitle>Akses Ditolak</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Halaman ini hanya untuk Super Admin.</CardContent>
        </Card>
      </div>
    );
  }

  async function runBackup() {
    if (running) return;
    if (pickedTables.length === 0) {
      toast.error('Pilih minimal 1 tabel untuk dibackup.');
      return;
    }

    setRunning(true);
    setCurrentTable(null);
    setDone(0);
    setTotal(pickedTables.length);
    setCounts({});
    setSkipped({});

    const output: Record<string, any[]> = {};
    const localCounts: Record<string, number> = {};
    const localSkipped: Record<string, string> = {};

    try {
      for (let i = 0; i < pickedTables.length; i++) {
        const table = pickedTables[i];
        setCurrentTable(table);
        try {
          const rows = await fetchAllRows(table);
          output[table] = rows;
          localCounts[table] = rows.length;
          setCounts((prev) => ({ ...prev, [table]: rows.length }));
        } catch (e: any) {
          const msg = String(e?.message || e);
          localSkipped[table] = msg;
          setSkipped((prev) => ({ ...prev, [table]: msg }));
        } finally {
          setDone(i + 1);
        }
      }

      const exportedAt = new Date().toISOString();
      const payload = {
        format: 'supabase-json-backup-v1',
        exported_at: exportedAt,
        exported_by: { id: user.id, username: user.username, role: user.role },
        tables: output,
        counts: localCounts,
        skipped: localSkipped,
      };

      const safeTime = exportedAt.replace(/[:.]/g, '-');
      downloadJson(`backup-${safeTime}.json`, payload);

      await logActivity({
        action: 'backup_export',
        module: 'admin',
        details: `Export JSON (${pickedTables.length} tabel)`,
        meta: { counts: localCounts, skipped: localSkipped },
      });

      if (Object.keys(localSkipped).length > 0) {
        toast.success(`Backup terunduh, ${Object.keys(localSkipped).length} tabel dilewati.`);
      } else {
        toast.success('Backup berhasil diunduh.');
      }
    } catch (e: any) {
      toast.error('Backup gagal: ' + String(e?.message || e));
    } finally {
      setRunning(false);
      setCurrentTable(null);
    }
  }

  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Backup & Export</h2>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Backup Data (JSON)</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              Mengunduh data sebagai file JSON untuk keperluan migrasi dari Supabase ke sistem lain.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runBackup} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download Backup
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium">Cakupan Backup</div>
            <div className="text-xs text-muted-foreground mt-1">
              Pilih tabel yang ingin diekspor. Untuk migrasi penuh, centang semuanya.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
              {TABLE_OPTIONS.map((t) => {
                const checked = Boolean(selected[t.table]);
                return (
                  <div key={t.table} className="flex items-start gap-2">
                    <Checkbox
                      checked={checked}
                      disabled={running}
                      onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [t.table]: Boolean(v) }))}
                    />
                    <div className="grid gap-0.5 leading-none">
                      <Label className="text-sm">{t.label}</Label>
                      <div className="text-xs text-muted-foreground">
                        {typeof counts[t.table] === 'number'
                          ? `${counts[t.table]} baris`
                          : skipped[t.table]
                            ? 'Dilewati'
                            : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div>
                Status:{' '}
                {running ? (
                  <span className="font-medium">
                    Memproses {done}/{total} {currentTable ? `(${currentTable})` : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Siap</span>
                )}
              </div>
              <div className="tabular-nums">{running ? `${progressPct}%` : ''}</div>
            </div>
            <div className="h-2 w-full rounded bg-slate-200 overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${running ? progressPct : 0}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">
              Catatan: jika data sangat besar, proses export bisa lama dan file hasilnya besar.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
