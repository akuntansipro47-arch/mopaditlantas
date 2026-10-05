import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, ArrowLeftRight, Bike, Car, Download, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCurrency } from '@/lib/utils';
import {
  fetchHarwatRows,
  groupHarwatByVehiclePeriod,
  periodeSortKey,
  type HarwatVehiclePeriodGroup,
} from '@/lib/harwat';

// Monitoring Unit Masuk dan Keluar — dari Google Sheet "Harwat".
//   Unit Masuk (IN)  : unit yang sudah dibuatkan estimasi (kolom A-K).
//   Unit Keluar (OUT): unit yang sudah ada TANGGAL FAKTUR (kolom L).
//   Status           : SUDAH SELESAI bila sudah ada faktur, selain itu DALAM PROSES.

const AUTO_REFRESH_MS = 5 * 60 * 1000;

type UnitStatus = 'SELESAI' | 'PROSES';

type UnitRow = HarwatVehiclePeriodGroup & {
  status: UnitStatus;
};

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

export default function UnitMasukKeluarReport() {
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jenisTab, setJenisTab] = useState<'SEMUA' | 'R4' | 'R2'>('SEMUA');
  const [periodeFilter, setPeriodeFilter] = useState('SEMUA');
  const [statusFilter, setStatusFilter] = useState<'SEMUA' | UnitStatus>('SEMUA');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (options.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const harwatRows = await fetchHarwatRows();
      const grouped = groupHarwatByVehiclePeriod(harwatRows).map<UnitRow>((g) => ({
        ...g,
        status: g.tglInvoiceList.length > 0 || g.totalInvoice > 0 ? 'SELESAI' : 'PROSES',
      }));
      grouped.sort(
        (a, b) =>
          (a.status === 'PROSES' ? 0 : 1) - (b.status === 'PROSES' ? 0 : 1) ||
          periodeSortKey(a.periode, a.termin) - periodeSortKey(b.periode, b.termin) ||
          a.jenis.localeCompare(b.jenis) ||
          a.nopol.localeCompare(b.nopol),
      );
      setRows(grouped);
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
      if (q && !r.nopol.toLowerCase().includes(q) && !r.jenisKendaraan.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, jenisTab, periodeFilter, statusFilter, search]);

  const summary = useMemo(() => {
    const masuk = filtered.length;
    const selesai = filtered.filter((r) => r.status === 'SELESAI').length;
    const proses = masuk - selesai;
    const pct = masuk > 0 ? Math.round((selesai / masuk) * 100) : 0;
    return { masuk, selesai, proses, pct };
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
      ['Monitoring Unit Masuk dan Keluar'],
      ['Unit Masuk = estimasi dibuat • Unit Keluar = tanggal faktur terbit • Status selesai bila sudah ada faktur'],
      [`Filter: Jenis=${jenisTab}, Periode=${periodeFilter}, Status=${statusFilter === 'SEMUA' ? 'Semua' : statusFilter === 'SELESAI' ? 'Sudah Selesai' : 'Dalam Proses'}, Pencarian=${search || '-'}`],
      [],
      ['No', 'No. Polisi', 'Jenis Kendaraan', 'R4/R2', 'Periode', 'Termin', 'Unit Masuk', 'Jml Item', 'Tgl Unit Keluar', 'Nilai Faktur (Rp)', 'Status'],
    ];
    filtered.forEach((r, idx) => {
      aoa.push([
        idx + 1,
        r.nopol,
        r.jenisKendaraan,
        r.jenis,
        r.periode,
        r.termin,
        'IN',
        r.itemCount,
        r.tglInvoiceList.join(', ') || '-',
        r.status === 'SELESAI' ? r.totalInvoice : '',
        r.status === 'SELESAI' ? 'SUDAH SELESAI' : 'DALAM PROSES',
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 26 }, { wch: 7 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Unit Masuk Keluar');
    XLSX.writeFile(wb, `Monitoring_Unit_Masuk_Keluar_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
        <p className="text-sm">Memproses data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2 sm:p-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Monitoring Unit Masuk &amp; Keluar</h2>
            <ArrowLeftRight className="h-4 w-4 text-slate-400" />
          </div>
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
            <p className="font-semibold">Gagal memproses data</p>
            <p className="mt-0.5">{error}</p>
            {rows.length > 0 && <p className="mt-0.5 text-xs">Menampilkan data terakhir yang berhasil dimuat.</p>}
          </div>
        </div>
      )}

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Unit Masuk (IN)</p>
            <p className="mt-1 text-sm font-bold text-slate-900 sm:text-lg">{summary.masuk} unit</p>
            <p className="text-[11px] text-slate-400">estimasi dibuat</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Sudah Selesai</p>
            <p className="mt-1 text-sm font-bold text-slate-900 sm:text-lg">{summary.selesai} unit</p>
            <p className="text-[11px] text-slate-400">faktur terbit / unit keluar</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Dalam Proses</p>
            <p className="mt-1 text-sm font-bold text-slate-900 sm:text-lg">{summary.proses} unit</p>
            <p className="text-[11px] text-slate-400">belum ada faktur</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Tingkat Penyelesaian</p>
            <p className="mt-1 text-sm font-bold text-slate-900 sm:text-lg">{summary.pct}%</p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${summary.pct}%` }} />
            </div>
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
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'SEMUA' | UnitStatus)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEMUA">Semua Status</SelectItem>
              <SelectItem value="SELESAI">Sudah Selesai</SelectItem>
              <SelectItem value="PROSES">Dalam Proses</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="h-9 pl-8"
              placeholder="Cari nopol / jenis kendaraan..."
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
              <TableHead>No. Polisi</TableHead>
              <TableHead>Jenis Kendaraan</TableHead>
              <TableHead className="w-16">R4/R2</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead className="text-center">Unit Masuk</TableHead>
              <TableHead className="text-center">Unit Keluar</TableHead>
              <TableHead className="text-right">Nilai Faktur</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                  Tidak ada data yang cocok dengan filter.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filtered.map((r, idx) => (
                  <TableRow key={r.key}>
                    <TableCell className="text-slate-400">{idx + 1}</TableCell>
                    <TableCell className="whitespace-nowrap font-semibold">{r.nopol}</TableCell>
                    <TableCell className="text-xs">{r.jenisKendaraan}</TableCell>
                    <TableCell><JenisBadge jenis={r.jenis} /></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.periode || '-'}
                      <span className="block text-[10px] text-slate-400">{r.termin}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="border-transparent bg-blue-100 text-blue-800">IN</Badge>
                      <span className="block text-[10px] text-slate-400">{r.itemCount} item estimasi</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {r.status === 'SELESAI' ? (
                        <>
                          <Badge variant="secondary" className="border-transparent bg-green-100 text-green-800">OUT</Badge>
                          <span className="block text-[10px] text-slate-400">{r.tglInvoiceList.join(', ')}</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {r.status === 'SELESAI' ? formatCurrency(r.totalInvoice) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'border-transparent whitespace-nowrap',
                          r.status === 'SELESAI' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800',
                        )}
                      >
                        {r.status === 'SELESAI' ? 'SUDAH SELESAI' : 'DALAM PROSES'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-50 font-bold">
                  <TableCell colSpan={5}>TOTAL ({filtered.length} unit)</TableCell>
                  <TableCell className="text-center text-blue-700">{filtered.length} IN</TableCell>
                  <TableCell className="text-center text-green-700">{summary.selesai} OUT</TableCell>
                  <TableCell className="text-right">{formatCurrency(filtered.reduce((s, r) => s + r.totalInvoice, 0))}</TableCell>
                  <TableCell />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
