import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Bike, Car, Download, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCurrency } from '@/lib/utils';
import {
  fetchHarwatRows,
  groupHarwatByVehiclePeriod,
  periodeSortKey,
  type HarwatRow,
} from '@/lib/harwat';

// Laporan Estimasi vs Faktur Penjualan — seluruhnya dari Google Sheet "Harwat".
// Kolom estimasi : A..K  (JUMLAH = nilai estimasi)
// Kolom faktur   : L..M  (TANGGAL FAKTUR, NILAI FAKTUR)
// Baris laporan dikelompokkan per No. Polisi + Periode (Termin).
// No. Estimasi & No. Faktur digenerate otomatis oleh sistem:
//   EST/{JENIS}/{NOPOL}/{TERMIN} dan INV/{JENIS}/{NOPOL}/{TERMIN}.

const AUTO_REFRESH_MS = 5 * 60 * 1000;

type CompareStatus = 'SESUAI' | 'KURANG' | 'LEBIH' | 'BELUM_FAKTUR';

type CompareRow = {
  key: string;
  jenis: string;
  nopol: string;
  jenisKendaraan: string;
  termin: string;
  periode: string;
  noEstimasi: string;
  totalEstimasi: number;
  itemCount: number;
  items: HarwatRow[];
  noInvoice: string;
  invoiceAuto: boolean;
  tglInvoiceList: string[];
  totalInvoice: number;
  selisih: number;
  status: CompareStatus;
};

const STATUS_LABEL: Record<CompareStatus, string> = {
  SESUAI: 'Sesuai',
  KURANG: 'Faktur < Estimasi',
  LEBIH: 'Faktur > Estimasi',
  BELUM_FAKTUR: 'Belum Ada Faktur',
};

function StatusBadge({ status }: { status: CompareStatus }) {
  const cls: Record<CompareStatus, string> = {
    SESUAI: 'bg-green-100 text-green-800',
    KURANG: 'bg-amber-100 text-amber-800',
    LEBIH: 'bg-red-100 text-red-800',
    BELUM_FAKTUR: 'bg-slate-100 text-slate-600',
  };
  return (
    <Badge variant="secondary" className={cn('border-transparent whitespace-nowrap', cls[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function JenisBadge({ jenis }: { jenis: string }) {
  const isR4 = jenis === 'R4';
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1 border-transparent', isR4 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800')}
    >
      {isR4 ? <Car className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
      {jenis || '-'}
    </Badge>
  );
}

function buildCompareRows(harwatRows: HarwatRow[]): CompareRow[] {
  const result = groupHarwatByVehiclePeriod(harwatRows).map((g) => {
    const terminTag = (g.termin.match(/\d+/) || ['0'])[0];
    const hasInvoice = g.totalInvoice > 0 || g.tglInvoiceList.length > 0;
    const selisih = g.totalInvoice - g.totalEstimasi;
    const status: CompareStatus = !hasInvoice
      ? 'BELUM_FAKTUR'
      : g.totalInvoice === g.totalEstimasi
        ? 'SESUAI'
        : g.totalInvoice < g.totalEstimasi
          ? 'KURANG'
          : 'LEBIH';
    return {
      ...g,
      noEstimasi: `EST/${g.jenis}/${g.nopol}/T${terminTag}`,
      // No. Faktur selalu digenerate oleh sistem (sheet tidak punya kolom no. faktur)
      noInvoice: `INV/${g.jenis}/${g.nopol}/T${terminTag}`,
      invoiceAuto: true,
      selisih,
      status,
    };
  });

  result.sort(
    (a, b) =>
      periodeSortKey(a.periode, a.termin) - periodeSortKey(b.periode, b.termin) ||
      a.jenis.localeCompare(b.jenis) ||
      a.nopol.localeCompare(b.nopol),
  );
  return result;
}

export default function EstimasiVsFakturReport() {
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const [jenisTab, setJenisTab] = useState<'SEMUA' | 'R4' | 'R2'>('SEMUA');
  const [periodeFilter, setPeriodeFilter] = useState('SEMUA');
  const [statusFilter, setStatusFilter] = useState('SEMUA');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CompareRow | null>(null);

  const fetchData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (options.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const harwatRows = await fetchHarwatRows();
      setRows(buildCompareRows(harwatRows));
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

  const periodeOptions = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      if (!r.periode) return;
      const key = periodeSortKey(r.periode, r.termin);
      const existing = map.get(r.periode);
      if (existing === undefined || key < existing) map.set(r.periode, key);
    });
    return [...map.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (jenisTab !== 'SEMUA' && r.jenis !== jenisTab) return false;
      if (periodeFilter !== 'SEMUA' && r.periode !== periodeFilter) return false;
      if (statusFilter !== 'SEMUA' && r.status !== statusFilter) return false;
      if (
        q &&
        !r.nopol.toLowerCase().includes(q) &&
        !r.jenisKendaraan.toLowerCase().includes(q) &&
        !r.noEstimasi.toLowerCase().includes(q) &&
        !r.noInvoice.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, jenisTab, periodeFilter, statusFilter, search]);

  const summary = useMemo(() => {
    const est = filtered.reduce((s, r) => s + r.totalEstimasi, 0);
    const inv = filtered.reduce((s, r) => s + r.totalInvoice, 0);
    const belum = filtered.filter((r) => r.status === 'BELUM_FAKTUR');
    return {
      est,
      inv,
      selisih: inv - est,
      belumCount: belum.length,
      belumEst: belum.reduce((s, r) => s + r.totalEstimasi, 0),
    };
  }, [filtered]);

  const countByJenis = useMemo(
    () => ({
      SEMUA: rows.length,
      R4: rows.filter((r) => r.jenis === 'R4').length,
      R2: rows.filter((r) => r.jenis === 'R2').length,
    }),
    [rows],
  );

  const exportToExcel = () => {
    const aoa: (string | number)[][] = [
      ['Laporan Estimasi vs Faktur Penjualan'],
      ['Sumber: Google Sheet Harwat (kolom estimasi A-K, kolom faktur L-M: TANGGAL FAKTUR & NILAI FAKTUR) • No. dokumen digenerate otomatis'],
      [`Filter: Jenis=${jenisTab}, Periode=${periodeFilter}, Status=${statusFilter}, Pencarian=${search || '-'}`],
      [],
      ['No', 'No. Estimasi', 'Periode', 'Termin', 'No. Polisi', 'Jenis Kendaraan', 'R4/R2', 'Jml Item', 'Estimasi (Rp)', 'No. Faktur', 'Tgl Faktur', 'Faktur (Rp)', 'Selisih (Rp)', 'Status'],
    ];
    filtered.forEach((r, idx) => {
      aoa.push([
        idx + 1,
        r.noEstimasi,
        r.periode,
        r.termin,
        r.nopol,
        r.jenisKendaraan,
        r.jenis,
        r.itemCount,
        r.totalEstimasi,
        r.noInvoice + (r.invoiceAuto ? ' (auto)' : ''),
        r.tglInvoiceList.join(', '),
        r.status === 'BELUM_FAKTUR' ? '' : r.totalInvoice,
        r.status === 'BELUM_FAKTUR' ? '' : r.selisih,
        STATUS_LABEL[r.status],
      ]);
    });
    aoa.push(['', '', '', '', '', '', '', '', summary.est, '', '', summary.inv, summary.selisih, 'TOTAL']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 10 }, { wch: 9 }, { wch: 14 }, { wch: 24 }, { wch: 7 }, { wch: 8 }, { wch: 16 }, { wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estimasi vs Faktur');
    XLSX.writeFile(wb, `Estimasi_vs_Faktur_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
        <p className="text-sm">Mengambil data dari Google Sheet...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2 sm:p-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Estimasi vs Faktur Penjualan</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            <p className="font-semibold">Gagal mengambil data Google Sheet</p>
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
            <p className="text-[11px] text-slate-400">{filtered.length} baris (nopol × periode)</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Total Faktur</p>
            <p className="mt-1 truncate text-sm font-bold text-slate-900 sm:text-lg">{formatCurrency(summary.inv)}</p>
            <p className="text-[11px] text-slate-400">dari kolom NILAI FAKTUR</p>
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
            <p className="mt-1 text-sm font-bold text-slate-900 sm:text-lg">{summary.belumCount} baris</p>
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
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <Select value={periodeFilter} onValueChange={setPeriodeFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Periode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEMUA">Semua Periode</SelectItem>
              {periodeOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEMUA">Semua Status</SelectItem>
              {(Object.keys(STATUS_LABEL) as CompareStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative col-span-2">
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
        <Table containerClassName="max-h-[70vh] overflow-y-auto">
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-white [&_th]:shadow-[inset_0_-1px_0_0_#e2e8f0]">
            <TableRow>
              <TableHead className="w-10">No</TableHead>
              <TableHead>No. Estimasi</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead>No. Polisi</TableHead>
              <TableHead>Jenis Kendaraan</TableHead>
              <TableHead className="w-16">R4/R2</TableHead>
              <TableHead className="text-right">Jml Item</TableHead>
              <TableHead className="text-right">Estimasi</TableHead>
              <TableHead>No. Faktur</TableHead>
              <TableHead>Tgl Faktur</TableHead>
              <TableHead className="text-right">Faktur</TableHead>
              <TableHead className="text-right">Selisih</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="h-24 text-center text-slate-500">
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
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.periode || '-'}
                      <span className="block text-[10px] text-slate-400">{r.termin}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-semibold">{r.nopol}</TableCell>
                    <TableCell className="text-xs">{r.jenisKendaraan}</TableCell>
                    <TableCell><JenisBadge jenis={r.jenis} /></TableCell>
                    <TableCell className="text-right">{r.itemCount}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.totalEstimasi)}</TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-xs" title={r.noInvoice}>
                      {r.noInvoice}
                      {r.invoiceAuto && <Badge variant="outline" className="ml-1 px-1 text-[9px]">auto</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.tglInvoiceList.join(', ') || '-'}</TableCell>
                    <TableCell className="text-right font-medium">{r.status === 'BELUM_FAKTUR' ? '-' : formatCurrency(r.totalInvoice)}</TableCell>
                    <TableCell className={cn('text-right', r.selisih > 0 && r.status !== 'BELUM_FAKTUR' ? 'text-amber-700' : r.selisih < 0 ? 'text-red-700' : '')}>
                      {r.status === 'BELUM_FAKTUR' ? '-' : `${r.selisih > 0 ? '+' : ''}${formatCurrency(r.selisih)}`}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-50 font-bold">
                  <TableCell colSpan={7}>TOTAL ({filtered.length} baris)</TableCell>
                  <TableCell className="text-right">{formatCurrency(summary.est)}</TableCell>
                  <TableCell colSpan={2} />
                  <TableCell className="text-right">{formatCurrency(summary.inv)}</TableCell>
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
        <DialogContent className="max-w-[calc(100vw-1rem)] p-3 sm:max-w-[1000px] sm:p-6">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {selected.nopol} — {selected.jenisKendaraan}
                  <StatusBadge status={selected.status} />
                </DialogTitle>
                <DialogDescription>
                  {selected.noEstimasi} • {selected.periode} ({selected.termin}) • Estimasi {formatCurrency(selected.totalEstimasi)} • Faktur {selected.status === 'BELUM_FAKTUR' ? 'belum ada' : formatCurrency(selected.totalInvoice)}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[65vh] overflow-y-auto">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Uraian Pekerjaan</TableHead>
                        <TableHead className="text-right text-xs">Qty</TableHead>
                        <TableHead className="text-right text-xs">Estimasi</TableHead>
                        <TableHead className="text-xs">Tgl Faktur</TableHead>
                        <TableHead className="text-right text-xs">Nilai Faktur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.items.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">
                            {it.uraian}
                            <span className="block text-[10px] text-slate-400">{it.group}</span>
                          </TableCell>
                          <TableCell className="text-right text-xs">{it.qty} {it.satuan}</TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(it.jumlah)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{it.tglInvoice || '-'}</TableCell>
                          <TableCell className="text-right text-xs">{it.tglInvoice || it.nilaiInvoice > 0 ? formatCurrency(it.nilaiInvoice) : '-'}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-slate-50 font-bold">
                        <TableCell colSpan={2} className="text-xs">Total</TableCell>
                        <TableCell className="text-right text-xs">{formatCurrency(selected.totalEstimasi)}</TableCell>
                        <TableCell colSpan={2} />
                        <TableCell className="text-right text-xs">{selected.status === 'BELUM_FAKTUR' ? '-' : formatCurrency(selected.totalInvoice)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
