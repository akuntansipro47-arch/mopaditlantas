import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Bike, Car, Download, LayoutList, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
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
  periodeSortKey,
  type HarwatRow,
} from '@/lib/harwat';

const AUTO_REFRESH_MS = 5 * 60 * 1000; // auto-refresh tiap 5 menit
const DEFAULT_DETAIL_LIMIT = 300;

type VehicleSummary = {
  key: string;
  jenis: string;
  nopol: string;
  jenisKendaraan: string;
  itemCount: number;
  totalBiaya: number;
  periodeList: string[];
};

function JenisBadge({ jenis }: { jenis: string }) {
  const isR4 = jenis === 'R4';
  return (
    <Badge
      variant="secondary"
      className={cn(
        'gap-1 border-transparent',
        isR4 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800',
      )}
    >
      {isR4 ? <Car className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
      {jenis || '-'}
    </Badge>
  );
}

export default function HarwatMonitoringReport() {
  const [rows, setRows] = useState<HarwatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const [jenisTab, setJenisTab] = useState<'SEMUA' | 'R4' | 'R2'>('SEMUA');
  const [periodeFilter, setPeriodeFilter] = useState('SEMUA');
  const [terminFilter, setTerminFilter] = useState('SEMUA');
  const [groupFilter, setGroupFilter] = useState('SEMUA');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'kendaraan' | 'detail'>('kendaraan');
  const [detailLimit, setDetailLimit] = useState(DEFAULT_DETAIL_LIMIT);

  const fetchData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (options.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const combined = await fetchHarwatRows();
      setRows(combined);
      if (options.silent) toast.success('Data Harwat diperbarui');
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

  // ------------------------------- Opsi filter ------------------------------
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

  const terminOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.termin && set.add(r.termin));
    return [...set].sort((a, b) => periodeSortKey('', a) - periodeSortKey('', b));
  }, [rows]);

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.group && set.add(r.group));
    return [...set].sort();
  }, [rows]);

  // --------------------------------- Filter ---------------------------------
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (periodeFilter !== 'SEMUA' && r.periode !== periodeFilter) return false;
      if (terminFilter !== 'SEMUA' && r.termin !== terminFilter) return false;
      if (groupFilter !== 'SEMUA' && r.group !== groupFilter) return false;
      if (
        q &&
        !r.nopol.toLowerCase().includes(q) &&
        !r.jenisKendaraan.toLowerCase().includes(q) &&
        !r.uraian.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, periodeFilter, terminFilter, groupFilter, search]);

  const filtered = useMemo(
    () => (jenisTab === 'SEMUA' ? baseFiltered : baseFiltered.filter((r) => r.jenis === jenisTab)),
    [baseFiltered, jenisTab],
  );

  // -------------------------------- Ringkasan -------------------------------
  const summary = useMemo(() => {
    const calc = (list: HarwatRow[]) => ({
      total: list.reduce((sum, r) => sum + r.jumlah, 0),
      vehicles: new Set(list.map((r) => r.nopol).filter(Boolean)).size,
      items: list.length,
    });
    const r4 = calc(baseFiltered.filter((r) => r.jenis === 'R4'));
    const r2 = calc(baseFiltered.filter((r) => r.jenis === 'R2'));
    return { r4, r2 };
  }, [baseFiltered]);

  const vehicleSummaries = useMemo<VehicleSummary[]>(() => {
    const map = new Map<string, VehicleSummary>();
    for (const r of filtered) {
      const key = `${r.jenis}|${r.nopol}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          jenis: r.jenis,
          nopol: r.nopol || '-',
          jenisKendaraan: r.jenisKendaraan || '-',
          itemCount: 0,
          totalBiaya: 0,
          periodeList: [],
        };
        map.set(key, entry);
      }
      entry.itemCount += 1;
      entry.totalBiaya += r.jumlah;
      if (r.periode && !entry.periodeList.includes(r.periode)) entry.periodeList.push(r.periode);
    }
    return [...map.values()].sort((a, b) => b.totalBiaya - a.totalBiaya);
  }, [filtered]);

  const grandTotal = useMemo(() => filtered.reduce((sum, r) => sum + r.jumlah, 0), [filtered]);

  const visibleDetails = useMemo(
    () => filtered.slice(0, detailLimit),
    [filtered, detailLimit],
  );

  // --------------------------------- Export ---------------------------------
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    const summaryAoA: (string | number)[][] = [
      ['Monitoring Harwat R4 & R2 — Ringkasan per Kendaraan'],
      [`Filter: Jenis=${jenisTab}, Periode=${periodeFilter}, Termin=${terminFilter}, Group=${groupFilter}, Pencarian=${search || '-'}`],
      [],
      ['No', 'No. Polisi', 'Jenis Kendaraan', 'R4/R2', 'Jml Item', 'Periode', 'Total Biaya (Rp)'],
    ];
    vehicleSummaries.forEach((v, idx) => {
      summaryAoA.push([idx + 1, v.nopol, v.jenisKendaraan, v.jenis, v.itemCount, v.periodeList.join(', '), v.totalBiaya]);
    });
    summaryAoA.push(['', '', '', '', '', 'TOTAL', vehicleSummaries.reduce((s, v) => s + v.totalBiaya, 0)]);
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA);
    wsSummary['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 26 }, { wch: 8 }, { wch: 9 }, { wch: 24 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Kendaraan');

    const detailAoA: (string | number)[][] = [
      ['No', 'Termin', 'Periode', 'R4/R2', 'Jenis Kendaraan', 'No. Polisi', 'Group', 'Uraian Pekerjaan', 'Qty', 'Satuan', 'Harga Satuan (Rp)', 'Jumlah (Rp)'],
    ];
    filtered.forEach((r, idx) => {
      detailAoA.push([idx + 1, r.termin, r.periode, r.jenis, r.jenisKendaraan, r.nopol, r.group, r.uraian, r.qty, r.satuan, r.hargaSatuan, r.jumlah]);
    });
    detailAoA.push(['', '', '', '', '', '', '', '', '', '', 'TOTAL', grandTotal]);
    const wsDetail = XLSX.utils.aoa_to_sheet(detailAoA);
    wsDetail['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 11 }, { wch: 7 }, { wch: 24 }, { wch: 14 }, { wch: 11 }, { wch: 38 }, { wch: 6 }, { wch: 8 }, { wch: 17 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail');

    XLSX.writeFile(wb, `Monitoring_Harwat_${jenisTab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const showVehicleDetail = (nopol: string) => {
    setSearch(nopol === '-' ? '' : nopol);
    setViewMode('detail');
    setDetailLimit(DEFAULT_DETAIL_LIMIT);
  };

  // ---------------------------------- Render ---------------------------------
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
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Monitoring Harwat R4 & R2</h2>
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

      {/* Kartu ringkasan (mengikuti filter selain tab jenis) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Total Biaya R4</p>
              <Car className="h-4 w-4 shrink-0 text-blue-500" />
            </div>
            <p className="mt-1 truncate text-sm font-bold text-slate-900 sm:text-lg">{formatCurrency(summary.r4.total)}</p>
            <p className="text-[11px] text-slate-400">{summary.r4.items} item</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Total Biaya R2</p>
              <Bike className="h-4 w-4 shrink-0 text-orange-500" />
            </div>
            <p className="mt-1 truncate text-sm font-bold text-slate-900 sm:text-lg">{formatCurrency(summary.r2.total)}</p>
            <p className="text-[11px] text-slate-400">{summary.r2.items} item</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Kendaraan R4</p>
            <p className="mt-1 text-sm font-bold text-slate-900 sm:text-lg">{summary.r4.vehicles} unit</p>
            <p className="text-[11px] text-slate-400">unik no. polisi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Kendaraan R2</p>
            <p className="mt-1 text-sm font-bold text-slate-900 sm:text-lg">{summary.r2.vehicles} unit</p>
            <p className="text-[11px] text-slate-400">unik no. polisi</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <Tabs value={jenisTab} onValueChange={(v) => setJenisTab(v as 'SEMUA' | 'R4' | 'R2')}>
          <TabsList className="grid w-full grid-cols-3 xl:w-auto">
            <TabsTrigger value="SEMUA">Semua ({baseFiltered.length})</TabsTrigger>
            <TabsTrigger value="R4" className="gap-1"><Car className="h-3.5 w-3.5" /> R4 ({summary.r4.items})</TabsTrigger>
            <TabsTrigger value="R2" className="gap-1"><Bike className="h-3.5 w-3.5" /> R2 ({summary.r2.items})</TabsTrigger>
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
          <Select value={terminFilter} onValueChange={setTerminFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Termin" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEMUA">Semua Termin</SelectItem>
              {terminOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Group" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEMUA">Semua Group</SelectItem>
              {groupOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="h-9 pl-8"
              placeholder="Cari nopol / kendaraan / uraian..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-1 rounded-md border bg-slate-50 p-1">
          <Button
            size="sm"
            variant={viewMode === 'kendaraan' ? 'default' : 'ghost'}
            className="h-7 flex-1 sm:flex-none"
            onClick={() => setViewMode('kendaraan')}
          >
            <Car className="mr-1 h-3.5 w-3.5" /> Per Kendaraan
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'detail' ? 'default' : 'ghost'}
            className="h-7 flex-1 sm:flex-none"
            onClick={() => setViewMode('detail')}
          >
            <LayoutList className="mr-1 h-3.5 w-3.5" /> Detail
          </Button>
        </div>
      </div>

      {/* Konten */}
      {viewMode === 'kendaraan' ? (
        <div className="rounded-md border">
          <Table containerClassName="max-h-[70vh] overflow-y-auto">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-white [&_th]:shadow-[inset_0_-1px_0_0_#e2e8f0]">
              <TableRow>
                <TableHead className="w-10">No</TableHead>
                <TableHead>No. Polisi</TableHead>
                <TableHead>Jenis Kendaraan</TableHead>
                <TableHead className="w-20">R4/R2</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead className="text-right">Jml Item</TableHead>
                <TableHead className="text-right">Total Biaya</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicleSummaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                    Tidak ada data yang cocok dengan filter.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {vehicleSummaries.map((v, idx) => (
                    <TableRow
                      key={v.key}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => showVehicleDetail(v.nopol)}
                      title="Klik untuk melihat detail kendaraan ini"
                    >
                      <TableCell className="text-slate-400">{idx + 1}</TableCell>
                      <TableCell className="font-semibold">{v.nopol}</TableCell>
                      <TableCell>{v.jenisKendaraan}</TableCell>
                      <TableCell><JenisBadge jenis={v.jenis} /></TableCell>
                      <TableCell className="text-xs text-slate-500">{v.periodeList.join(', ') || '-'}</TableCell>
                      <TableCell className="text-right">{v.itemCount}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(v.totalBiaya)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50 font-bold">
                    <TableCell colSpan={5}>TOTAL ({vehicleSummaries.length} kendaraan)</TableCell>
                    <TableCell className="text-right">{filtered.length}</TableCell>
                    <TableCell className="text-right">{formatCurrency(grandTotal)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table containerClassName="max-h-[70vh] overflow-y-auto">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-white [&_th]:shadow-[inset_0_-1px_0_0_#e2e8f0]">
              <TableRow>
                <TableHead className="w-10">No</TableHead>
                <TableHead>Termin</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead className="w-20">R4/R2</TableHead>
                <TableHead>No. Polisi</TableHead>
                <TableHead>Jenis Kendaraan</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Uraian Pekerjaan</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Satuan</TableHead>
                <TableHead className="text-right">Harga Satuan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDetails.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center text-slate-500">
                    Tidak ada data yang cocok dengan filter.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {visibleDetails.map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-slate-400">{idx + 1}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{r.termin}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{r.periode}</TableCell>
                      <TableCell><JenisBadge jenis={r.jenis} /></TableCell>
                      <TableCell className="whitespace-nowrap font-semibold">{r.nopol}</TableCell>
                      <TableCell className="text-xs">{r.jenisKendaraan}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{r.group || '-'}</Badge>
                      </TableCell>
                      <TableCell className="min-w-[220px] text-xs">{r.uraian}</TableCell>
                      <TableCell className="text-right">{r.qty}</TableCell>
                      <TableCell className="text-xs">{r.satuan}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.hargaSatuan)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.jumlah)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50 font-bold">
                    <TableCell colSpan={11}>TOTAL</TableCell>
                    <TableCell className="text-right">{formatCurrency(grandTotal)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
          {filtered.length > visibleDetails.length && (
            <div className="flex items-center justify-between gap-2 border-t bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <span>Menampilkan {visibleDetails.length} dari {filtered.length} baris</span>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setDetailLimit(filtered.length)}>
                Tampilkan Semua
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
