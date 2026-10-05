import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Bike, Car, Download, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { fetchHarwatRows, HARWAT_SHEET_URL, normalizePlate, type HarwatRow } from '@/lib/harwat';

// Laporan Estimasi vs Faktur Penjualan.
// - Estimasi : Google Sheet "Harwat" (tab R4 & R2).
// - Faktur   : tabel sales_invoices di sistem, dicocokkan per nopol kendaraan.
// No. Estimasi & No. Faktur digenerate otomatis oleh sistem:
//   EST/{JENIS}/{NOPOL} dan INV/{JENIS}/{NOPOL} (bila belum ada faktur asli).

const AUTO_REFRESH_MS = 5 * 60 * 1000;

type InvoiceLite = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number;
  paid_amount: number | null;
  status: string | null;
};

type CompareStatus = 'SESUAI' | 'KURANG' | 'LEBIH' | 'BELUM_FAKTUR' | 'TANPA_ESTIMASI';

type CompareRow = {
  key: string;
  jenis: string;
  nopol: string;
  jenisKendaraan: string;
  noEstimasi: string;
  totalEstimasi: number;
  itemCount: number;
  periodeList: string[];
  estimasiItems: HarwatRow[];
  noFaktur: string;
  fakturAuto: boolean;
  invoices: InvoiceLite[];
  totalFaktur: number;
  selisih: number;
  status: CompareStatus;
};

const STATUS_LABEL: Record<CompareStatus, string> = {
  SESUAI: 'Sesuai',
  KURANG: 'Faktur < Estimasi',
  LEBIH: 'Faktur > Estimasi',
  BELUM_FAKTUR: 'Belum Ada Faktur',
  TANPA_ESTIMASI: 'Tidak Ada di Sheet',
};

function StatusBadge({ status }: { status: CompareStatus }) {
  const cls: Record<CompareStatus, string> = {
    SESUAI: 'bg-green-100 text-green-800',
    KURANG: 'bg-amber-100 text-amber-800',
    LEBIH: 'bg-red-100 text-red-800',
    BELUM_FAKTUR: 'bg-slate-100 text-slate-600',
    TANPA_ESTIMASI: 'bg-purple-100 text-purple-800',
  };
  return (
    <Badge variant="secondary" className={cn('border-transparent whitespace-nowrap', cls[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export default function EstimasiVsFakturReport() {
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const [jenisTab, setJenisTab] = useState<'SEMUA' | 'R4' | 'R2'>('SEMUA');
  const [statusFilter, setStatusFilter] = useState('SEMUA');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CompareRow | null>(null);

  const fetchData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (options.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [harwatRows, invoicesRes, vehiclesRes] = await Promise.all([
        fetchHarwatRows(),
        supabase
          .from('sales_invoices')
          .select('id, invoice_number, vehicle_id, invoice_date, total_amount, paid_amount, status')
          .order('invoice_date', { ascending: false })
          .limit(5000),
        supabase.from('vehicles').select('id, license_plate, brand_type').limit(5000),
      ]);
      if (invoicesRes.error) throw invoicesRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;

      // Peta kendaraan: id → info nopol
      const vehicleById = new Map<string, { plate: string; normPlate: string; brandType: string }>();
      for (const v of (vehiclesRes.data || []) as { id: unknown; license_plate: unknown; brand_type: unknown }[]) {
        const plate = String(v?.license_plate || '').trim();
        vehicleById.set(String(v?.id), { plate, normPlate: normalizePlate(plate), brandType: String(v?.brand_type || '').trim() });
      }

      // Kelompokkan estimasi (sheet) per nopol
      const estimasiByPlate = new Map<string, { jenis: string; nopol: string; jenisKendaraan: string; items: HarwatRow[]; total: number; periodeList: string[] }>();
      for (const r of harwatRows) {
        const norm = normalizePlate(r.nopol);
        if (!norm) continue;
        let g = estimasiByPlate.get(norm);
        if (!g) {
          g = { jenis: r.jenis, nopol: r.nopol, jenisKendaraan: r.jenisKendaraan, items: [], total: 0, periodeList: [] };
          estimasiByPlate.set(norm, g);
        }
        g.items.push(r);
        g.total += r.jumlah;
        if (r.periode && !g.periodeList.includes(r.periode)) g.periodeList.push(r.periode);
      }

      // Kelompokkan faktur (sales_invoices) per nopol
      const fakturByPlate = new Map<string, { invoices: InvoiceLite[]; total: number }>();
      for (const raw of (invoicesRes.data || []) as Record<string, unknown>[]) {
        const veh = vehicleById.get(String(raw?.vehicle_id || ''));
        const norm = veh?.normPlate || '';
        if (!norm) continue;
        let g = fakturByPlate.get(norm);
        if (!g) {
          g = { invoices: [], total: 0 };
          fakturByPlate.set(norm, g);
        }
        const inv: InvoiceLite = {
          id: String(raw?.id || ''),
          invoice_number: String(raw?.invoice_number || ''),
          invoice_date: raw?.invoice_date ? String(raw.invoice_date) : null,
          total_amount: Number(raw?.total_amount || 0) || 0,
          paid_amount: raw?.paid_amount === null || raw?.paid_amount === undefined ? null : Number(raw.paid_amount),
          status: raw?.status ? String(raw.status) : null,
        };
        g.invoices.push(inv);
        g.total += inv.total_amount;
      }

      // Gabungkan semua nopol dari kedua sumber
      const allPlates = new Set<string>([...estimasiByPlate.keys(), ...fakturByPlate.keys()]);
      const combined: CompareRow[] = [];
      for (const norm of allPlates) {
        const est = estimasiByPlate.get(norm);
        const fak = fakturByPlate.get(norm);
        const jenis = est?.jenis || '-';
        const nopol = est?.nopol || [...vehicleById.values()].find((v) => v.normPlate === norm)?.plate || norm;
        const jenisKendaraan = est?.jenisKendaraan || [...vehicleById.values()].find((v) => v.normPlate === norm)?.brandType || '-';
        const totalEstimasi = est?.total || 0;
        const totalFaktur = fak?.total || 0;
        const invoices = fak?.invoices || [];
        const fakturAuto = invoices.length === 0;

        let status: CompareStatus;
        if (!est) status = 'TANPA_ESTIMASI';
        else if (invoices.length === 0) status = 'BELUM_FAKTUR';
        else if (totalFaktur === totalEstimasi) status = 'SESUAI';
        else if (totalFaktur < totalEstimasi) status = 'KURANG';
        else status = 'LEBIH';

        combined.push({
          key: norm,
          jenis,
          nopol,
          jenisKendaraan,
          // No. dokumen digenerate otomatis oleh sistem
          noEstimasi: est ? `EST/${jenis}/${nopol}` : '-',
          totalEstimasi,
          itemCount: est?.items.length || 0,
          periodeList: est?.periodeList || [],
          estimasiItems: est?.items || [],
          noFaktur: invoices.length > 0 ? invoices.map((i) => i.invoice_number).join(', ') : (est ? `INV/${jenis}/${nopol}` : '-'),
          fakturAuto,
          invoices,
          totalFaktur,
          selisih: totalFaktur - totalEstimasi,
          status,
        });
      }

      const statusRank: Record<CompareStatus, number> = { BELUM_FAKTUR: 0, KURANG: 1, LEBIH: 2, SESUAI: 3, TANPA_ESTIMASI: 4 };
      combined.sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.totalEstimasi - a.totalEstimasi);

      setRows(combined);
      setLastFetchedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => fetchData({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (jenisTab !== 'SEMUA' && r.jenis !== jenisTab) return false;
      if (statusFilter !== 'SEMUA' && r.status !== statusFilter) return false;
      if (q && !r.nopol.toLowerCase().includes(q) && !r.jenisKendaraan.toLowerCase().includes(q) && !r.noEstimasi.toLowerCase().includes(q) && !r.noFaktur.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, jenisTab, statusFilter, search]);

  const summary = useMemo(() => {
    const est = filtered.reduce((s, r) => s + r.totalEstimasi, 0);
    const fak = filtered.reduce((s, r) => s + r.totalFaktur, 0);
    const belumFaktur = filtered.filter((r) => r.status === 'BELUM_FAKTUR');
    return {
      est,
      fak,
      selisih: fak - est,
      belumCount: belumFaktur.length,
      belumEst: belumFaktur.reduce((s, r) => s + r.totalEstimasi, 0),
    };
  }, [filtered]);

  const countByJenis = useMemo(() => ({
    SEMUA: rows.length,
    R4: rows.filter((r) => r.jenis === 'R4').length,
    R2: rows.filter((r) => r.jenis === 'R2').length,
  }), [rows]);

  const exportToExcel = () => {
    const aoa: (string | number)[][] = [
      ['Laporan Estimasi vs Faktur Penjualan'],
      [`Sumber estimasi: Google Sheet Harwat • Sumber faktur: Sales Invoice sistem • No. dokumen digenerate otomatis`],
      [`Filter: Jenis=${jenisTab}, Status=${statusFilter}, Pencarian=${search || '-'}`],
      [],
      ['No', 'No. Estimasi', 'No. Polisi', 'Jenis Kendaraan', 'R4/R2', 'Periode', 'Jml Item', 'Estimasi (Rp)', 'No. Faktur', 'Faktur (Rp)', 'Selisih (Rp)', 'Status'],
    ];
    filtered.forEach((r, idx) => {
      aoa.push([
        idx + 1,
        r.noEstimasi,
        r.nopol,
        r.jenisKendaraan,
        r.jenis,
        r.periodeList.join(', '),
        r.itemCount,
        r.totalEstimasi,
        r.noFaktur + (r.fakturAuto && r.noFaktur !== '-' ? ' (auto)' : ''),
        r.totalFaktur,
        r.status === 'BELUM_FAKTUR' || r.status === 'TANPA_ESTIMASI' ? '' : r.selisih,
        STATUS_LABEL[r.status],
      ]);
    });
    aoa.push(['', '', '', '', '', '', '', summary.est, '', summary.fak, summary.selisih, 'TOTAL']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 14 }, { wch: 24 }, { wch: 7 }, { wch: 22 }, { wch: 8 }, { wch: 16 }, { wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estimasi vs Faktur');
    XLSX.writeFile(wb, `Estimasi_vs_Faktur_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
        <p className="text-sm">Mengambil data Google Sheet &amp; faktur penjualan...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2 sm:p-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Estimasi vs Faktur Penjualan</h2>
            <Badge variant="outline" className="text-[10px] font-normal">Google Sheet + Sistem</Badge>
          </div>
          <p className="text-xs text-slate-500 sm:text-sm">
            Estimasi dari sheet &quot;Harwat&quot;, faktur dari Sales Invoice • No. dokumen digenerate otomatis
            {lastFetchedAt && <> • Diupdate {lastFetchedAt.toLocaleTimeString('id-ID')}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={HARWAT_SHEET_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> Buka Sheet
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchData({ silent: true })} disabled={refreshing}>
            <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Gagal mengambil sebagian data</p>
            <p className="mt-0.5">{error}</p>
            {rows.length > 0 && <p className="mt-0.5 text-xs">Menampilkan data terakhir yang berhasil dimuat.</p>}
          </div>
        </div>
      )}

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Total Estimasi</p>
            <p className="mt-1 truncate text-sm font-bold text-slate-900 sm:text-lg">{formatCurrency(summary.est)}</p>
            <p className="text-[11px] text-slate-400">{filtered.length} kendaraan</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Total Faktur</p>
            <p className="mt-1 truncate text-sm font-bold text-slate-900 sm:text-lg">{formatCurrency(summary.fak)}</p>
            <p className="text-[11px] text-slate-400">sales invoice sistem</p>
          </CardContent>
        </Card>
        <Card className={cn('border-l-4', summary.selisih >= 0 ? 'border-l-amber-500' : 'border-l-red-500')}>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Selisih (Faktur − Estimasi)</p>
            <p className={cn('mt-1 truncate text-sm font-bold sm:text-lg', summary.selisih >= 0 ? 'text-amber-700' : 'text-red-700')}>
              {summary.selisih >= 0 ? '+' : ''}{formatCurrency(summary.selisih)}
            </p>
            <p className="text-[11px] text-slate-400">mengikuti filter aktif</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Belum Ada Faktur</p>
            <p className="mt-1 text-sm font-bold text-slate-900 sm:text-lg">{summary.belumCount} kendaraan</p>
            <p className="text-[11px] text-slate-400">estimasi {formatCurrency(summary.belumEst)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <Tabs value={jenisTab} onValueChange={(v) => setJenisTab(v as 'SEMUA' | 'R4' | 'R2')}>
          <TabsList className="grid w-full grid-cols-3 xl:w-auto">
            <TabsTrigger value="SEMUA">Semua ({countByJenis.SEMUA})</TabsTrigger>
            <TabsTrigger value="R4" className="gap-1"><Car className="h-3.5 w-3.5" /> R4 ({countByJenis.R4})</TabsTrigger>
            <TabsTrigger value="R2" className="gap-1"><Bike className="h-3.5 w-3.5" /> R2 ({countByJenis.R2})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEMUA">Semua Status</SelectItem>
              {(Object.keys(STATUS_LABEL) as CompareStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative col-span-2 sm:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="h-9 pl-8"
              placeholder="Cari nopol / kendaraan / no. dokumen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">No</TableHead>
              <TableHead>No. Estimasi</TableHead>
              <TableHead>No. Polisi</TableHead>
              <TableHead>Jenis Kendaraan</TableHead>
              <TableHead className="w-16">R4/R2</TableHead>
              <TableHead className="text-right">Jml Item</TableHead>
              <TableHead className="text-right">Estimasi</TableHead>
              <TableHead>No. Faktur</TableHead>
              <TableHead className="text-right">Faktur</TableHead>
              <TableHead className="text-right">Selisih</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-center text-slate-500">
                  Tidak ada data yang cocok dengan filter.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filtered.map((r, idx) => (
                  <TableRow
                    key={r.key}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelected(r)}
                    title="Klik untuk melihat rincian"
                  >
                    <TableCell className="text-slate-400">{idx + 1}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{r.noEstimasi}</TableCell>
                    <TableCell className="whitespace-nowrap font-semibold">{r.nopol}</TableCell>
                    <TableCell className="text-xs">{r.jenisKendaraan}</TableCell>
                    <TableCell>
                      {r.jenis === 'R4' || r.jenis === 'R2' ? (
                        <Badge variant="secondary" className={cn('gap-1 border-transparent', r.jenis === 'R4' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800')}>
                          {r.jenis === 'R4' ? <Car className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
                          {r.jenis}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">{r.itemCount || '-'}</TableCell>
                    <TableCell className="text-right font-medium">{r.status === 'TANPA_ESTIMASI' ? '-' : formatCurrency(r.totalEstimasi)}</TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs" title={r.noFaktur}>
                      {r.noFaktur}
                      {r.fakturAuto && r.noFaktur !== '-' && (
                        <Badge variant="outline" className="ml-1 px-1 text-[9px]">auto</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{r.invoices.length === 0 ? '-' : formatCurrency(r.totalFaktur)}</TableCell>
                    <TableCell className={cn('text-right', r.selisih > 0 ? 'text-amber-700' : r.selisih < 0 && r.status !== 'BELUM_FAKTUR' ? 'text-red-700' : '')}>
                      {r.status === 'BELUM_FAKTUR' || r.status === 'TANPA_ESTIMASI' ? '-' : `${r.selisih > 0 ? '+' : ''}${formatCurrency(r.selisih)}`}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-50 font-bold">
                  <TableCell colSpan={6}>TOTAL ({filtered.length} kendaraan)</TableCell>
                  <TableCell className="text-right">{formatCurrency(summary.est)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right">{formatCurrency(summary.fak)}</TableCell>
                  <TableCell className="text-right">{summary.selisih >= 0 ? '+' : ''}{formatCurrency(summary.selisih)}</TableCell>
                  <TableCell />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog rincian */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-[calc(100vw-1rem)] p-3 sm:max-w-[900px] sm:p-6">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {selected.nopol} — {selected.jenisKendaraan}
                  <StatusBadge status={selected.status} />
                </DialogTitle>
                <DialogDescription>
                  {selected.noEstimasi} • Estimasi {formatCurrency(selected.totalEstimasi)} • Faktur {selected.invoices.length > 0 ? formatCurrency(selected.totalFaktur) : 'belum ada'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid max-h-[65vh] gap-4 overflow-y-auto md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Rincian Estimasi (Sheet Harwat)</h3>
                  {selected.estimasiItems.length === 0 ? (
                    <p className="text-sm italic text-slate-400">Tidak ada data estimasi di sheet.</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Uraian</TableHead>
                            <TableHead className="text-right text-xs">Qty</TableHead>
                            <TableHead className="text-right text-xs">Jumlah</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selected.estimasiItems.map((it, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">
                                {it.uraian}
                                <span className="block text-[10px] text-slate-400">{it.termin} • {it.periode} • {it.group}</span>
                              </TableCell>
                              <TableCell className="text-right text-xs">{it.qty} {it.satuan}</TableCell>
                              <TableCell className="text-right text-xs">{formatCurrency(it.jumlah)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-slate-50 font-bold">
                            <TableCell colSpan={2} className="text-xs">Total Estimasi</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(selected.totalEstimasi)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Faktur Penjualan (Sistem)</h3>
                  {selected.invoices.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-center">
                      <p className="text-sm italic text-slate-400">Belum ada faktur di sistem untuk nopol ini.</p>
                      <p className="mt-1 text-xs text-slate-400">No. faktur otomatis: <span className="font-mono">{selected.noFaktur}</span></p>
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">No. Faktur</TableHead>
                            <TableHead className="text-xs">Tanggal</TableHead>
                            <TableHead className="text-right text-xs">Total</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selected.invoices.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                              <TableCell className="text-xs">{formatDate(inv.invoice_date)}</TableCell>
                              <TableCell className="text-right text-xs">{formatCurrency(inv.total_amount)}</TableCell>
                              <TableCell className="text-xs">{inv.status || '-'}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-slate-50 font-bold">
                            <TableCell colSpan={2} className="text-xs">Total Faktur</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(selected.totalFaktur)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
