import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLog';

type ActivityLogRow = {
  id: string;
  occurred_at: string;
  user_id: string | null;
  username: string | null;
  role: string | null;
  action: string;
  module: string | null;
  entity_type: string | null;
  entity_id: string | null;
  details: string | null;
  meta: any;
};

export default function ActivityLogReport() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const missingTableWarnedRef = useRef(false);

  const isAllowed = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const isMissingActivityLogsTable = (msg: string) => {
    const m = String(msg || '').toLowerCase();
    return (
      (m.includes('could not find the table') && m.includes('activity_logs')) ||
      (m.includes('schema cache') && m.includes('activity_logs')) ||
      (m.includes('relation') && m.includes('activity_logs') && m.includes('does not exist'))
    );
  };

  const actions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const a = String(r.action || '').trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter && String(r.action || '') !== actionFilter) return false;
      if (!q) return true;
      const hay = [
        r.username,
        r.role,
        r.action,
        r.module,
        r.entity_type,
        r.entity_id,
        r.details,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [rows, search, actionFilter]);

  useEffect(() => {
    if (!isAllowed) return;
    const t = window.setTimeout(() => fetchData(), 250);
    return () => window.clearTimeout(t);
  }, [dateRange.start, dateRange.end, isAllowed]);

  async function fetchData() {
    if (!isAllowed) return;
    setLoading(true);
    try {
      const startIso = `${dateRange.start}T00:00:00`;
      const endIso = `${dateRange.end}T23:59:59`;
      const { data, error } = await supabase
        .from('activity_logs' as any)
        .select('id, occurred_at, user_id, username, role, action, module, entity_type, entity_id, details, meta')
        .gte('occurred_at', startIso)
        .lte('occurred_at', endIso)
        .order('occurred_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (isMissingActivityLogsTable(msg)) {
        if (!missingTableWarnedRef.current) {
          missingTableWarnedRef.current = true;
          toast.error("Log Aktivitas belum aktif: tabel 'activity_logs' belum ada / schema cache belum update. Jalankan migration 20260508_activity_logs.sql lalu refresh schema cache Supabase.");
        }
      } else {
        toast.error('Gagal memuat log aktivitas: ' + msg);
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const handleExport = () => {
    try {
      const sheetRows = filtered.map((r) => ({
        Waktu: r.occurred_at ? new Date(r.occurred_at).toLocaleString('id-ID') : '-',
        Username: r.username || '-',
        Role: r.role || '-',
        Aksi: r.action,
        Modul: r.module || '-',
        Entitas: r.entity_type || '-',
        'ID Entitas': r.entity_id || '-',
        Detail: r.details || '-',
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Log Aktivitas');
      XLSX.writeFile(wb, `Log_Aktivitas_${dateRange.start}_sd_${dateRange.end}.xlsx`);
      toast.success('Export berhasil');
      if (user) {
        void logActivity({
          user_id: user.id,
          username: user.username,
          role: user.role,
          action: 'REPORT_EXPORT',
          module: 'REPORT_ACTIVITY_LOG',
          details: `Export log aktivitas ${dateRange.start} s/d ${dateRange.end}`,
          meta: { rows: filtered.length },
        });
      }
    } catch (e: any) {
      toast.error('Gagal export: ' + String(e?.message || e));
    }
  };

  if (!isAllowed) {
    return (
      <CardContent className="p-8">
        <div className="text-center text-sm text-slate-500">Akses terbatas. Menu ini hanya untuk Administrator.</div>
      </CardContent>
    );
  }

  return (
    <>
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <CardTitle>Log Aktivitas</CardTitle>
            <div className="text-xs text-slate-500">Aktivitas login, transaksi, dan laporan.</div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              type="date"
              className="w-auto"
              value={dateRange.start}
              onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
            />
            <Input
              type="date"
              className="w-auto"
              value={dateRange.end}
              onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
            />
            <Input placeholder="Cari user/aksi/modul..." className="w-[240px]" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">Semua Aksi</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => fetchData()} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <div>Periode: {formatDate(dateRange.start)} s/d {formatDate(dateRange.end)}</div>
          <div>Total: {filtered.length.toLocaleString('id-ID')}</div>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Waktu</TableHead>
                <TableHead className="w-[140px]">User</TableHead>
                <TableHead className="w-[110px]">Role</TableHead>
                <TableHead className="w-[160px]">Aksi</TableHead>
                <TableHead className="w-[160px]">Modul</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-sm text-slate-500">
                    Memuat...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-sm text-slate-500">
                    Tidak ada data.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.occurred_at ? new Date(r.occurred_at).toLocaleString('id-ID') : '-'}</TableCell>
                    <TableCell className="text-xs font-medium">{r.username || '-'}</TableCell>
                    <TableCell className="text-xs">{r.role || '-'}</TableCell>
                    <TableCell className="text-xs font-medium">{r.action}</TableCell>
                    <TableCell className="text-xs">{r.module || '-'}</TableCell>
                    <TableCell className="text-xs">
                      <div className="truncate max-w-[560px]">{r.details || '-'}</div>
                      {(r.entity_type || r.entity_id) && (
                        <div className="text-[10px] text-slate-400">
                          {r.entity_type || '-'} {r.entity_id ? `• ${r.entity_id}` : ''}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </>
  );
}
