import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Download, Loader2, RefreshCw, Save } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

type GroupKey = 'R2' | 'R4';

type MonitoringRow = {
  id: string;
  no: number;
  groupKey: GroupKey;
  period: string;
  termin: string;
  pagu: number;
  pajak: number;
  lainnya: number;
};

type MonitoringSheet = {
  kind: 'pagu-monitoring-v1';
  year: number;
  rows: MonitoringRow[];
};

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const STORAGE_PROJECT = 'PAGU_MONITORING';

function getDefaultRows(): MonitoringRow[] {
  return [
    { id: 'r2-t1', no: 1, groupKey: 'R2', period: 'Februari dan Maret', termin: 'Termin 1', pagu: 305000000, pajak: 35720721, lainnya: 80783783.7 },
    { id: 'r2-t2', no: 2, groupKey: 'R2', period: 'April', termin: 'Termin 2', pagu: 82500000, pajak: 9662162, lainnya: 30851351.4 },
    { id: 'r2-t3', no: 3, groupKey: 'R2', period: 'Mei', termin: 'Termin 3', pagu: 72000000, pajak: 8432432, lainnya: 28070270.4 },
    { id: 'r2-t4', no: 4, groupKey: 'R2', period: 'Juni', termin: 'Termin 4', pagu: 92300000, pajak: 10809910, lainnya: 33447027 },
    { id: 'r2-t5', no: 5, groupKey: 'R2', period: 'Juli', termin: 'Termin 5', pagu: 78700000, pajak: 9217117, lainnya: 29844864.9 },
    { id: 'r2-t6', no: 6, groupKey: 'R2', period: 'Agustus', termin: 'Termin 6', pagu: 71400000, pajak: 9996000, lainnya: 27421200 },
    { id: 'r2-t7', no: 7, groupKey: 'R2', period: 'September', termin: 'Termin 7', pagu: 70200000, pajak: 9828000, lainnya: 27111600 },
    { id: 'r2-t8', no: 8, groupKey: 'R2', period: 'Oktober', termin: 'Termin 8', pagu: 81400000, pajak: 11396000, lainnya: 30001200 },
    { id: 'r2-t9', no: 9, groupKey: 'R2', period: 'Nopember', termin: 'Termin 9', pagu: 91200000, pajak: 12768000, lainnya: 32529600 },
    { id: 'r2-t10', no: 10, groupKey: 'R2', period: 'Desember', termin: 'Termin 10', pagu: 76300000, pajak: 10682000, lainnya: 28685400 },
    { id: 'r4-t1', no: 1, groupKey: 'R4', period: 'Februari dan Maret', termin: 'Termin 1', pagu: 612000000, pajak: 71675676, lainnya: 162097297.2 },
    { id: 'r4-t2', no: 2, groupKey: 'R4', period: 'April', termin: 'Termin 2', pagu: 254883000, pajak: 29851162, lainnya: 67509551.4 },
    { id: 'r4-t3', no: 3, groupKey: 'R4', period: 'Mei', termin: 'Termin 3', pagu: 236571000, pajak: 27706514, lainnya: 71659345.8 },
    { id: 'r4-t4', no: 4, groupKey: 'R4', period: 'Juni', termin: 'Termin 4', pagu: 214500000, pajak: 25121622, lainnya: 65813513.4 },
    { id: 'r4-t5', no: 5, groupKey: 'R4', period: 'Juli', termin: 'Termin 5', pagu: 246800000, pajak: 28904505, lainnya: 74368648.5 },
    { id: 'r4-t6', no: 6, groupKey: 'R4', period: 'Agustus', termin: 'Termin 6', pagu: 210000000, pajak: 24594595, lainnya: 64621621.5 },
    { id: 'r4-t7', no: 7, groupKey: 'R4', period: 'September', termin: 'Termin 7', pagu: 236017000, pajak: 2360170, lainnya: 79097049 },
    { id: 'r4-t8', no: 8, groupKey: 'R4', period: 'Oktober', termin: 'Termin 8', pagu: 236996000, pajak: 2369960, lainnya: 79387812 },
    { id: 'r4-t9', no: 9, groupKey: 'R4', period: 'Nopember', termin: 'Termin 9', pagu: 221713000, pajak: 2217130, lainnya: 74848761 },
    { id: 'r4-t10', no: 10, groupKey: 'R4', period: 'Desember', termin: 'Termin 10', pagu: 225500000, pajak: 2255000, lainnya: 75973500 },
  ];
}

function buildDefaultSheet(year: number): MonitoringSheet {
  return {
    kind: 'pagu-monitoring-v1',
    year,
    rows: getDefaultRows(),
  };
}

function normalizeRow(row: any): MonitoringRow | null {
  const groupKey = String(row?.groupKey || '').toUpperCase();
  if (groupKey !== 'R2' && groupKey !== 'R4') return null;
  return {
    id: String(row?.id || `${groupKey.toLowerCase()}-${row?.no || 'row'}`),
    no: Number(row?.no || 0),
    groupKey: groupKey as GroupKey,
    period: String(row?.period || '').trim(),
    termin: String(row?.termin || '').trim(),
    pagu: Number(row?.pagu || 0),
    pajak: Number(row?.pajak || 0),
    lainnya: Number(row?.lainnya || 0),
  };
}

function normalizeSheet(data: any, year: number): MonitoringSheet {
  const rows = Array.isArray(data?.rows)
    ? data.rows.map(normalizeRow).filter(Boolean) as MonitoringRow[]
    : [];
  return {
    kind: 'pagu-monitoring-v1',
    year,
    rows: rows.length > 0 ? rows : getDefaultRows(),
  };
}

function emptyMonths() {
  return Array.from({ length: 12 }, () => 0);
}

function parseNumber(input: string) {
  const raw = String(input || '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/[^0-9,-]/g, '').replace(',', '.');
  const out = Number(normalized);
  return Number.isFinite(out) ? out : 0;
}

function getTerminNumber(termin: string) {
  const match = String(termin || '').match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function getGroupKey(entry: any): GroupKey | '' {
  const sg = String(entry?.service_group || '').toUpperCase();
  if (sg.includes('R4')) return 'R4';
  if (sg.includes('R2_KECIL') || sg.includes('R2 KECIL') || sg.includes('KECIL')) return 'R2';
  if (sg.includes('R2')) return 'R2';

  const vt = String(entry?.vehicles?.vehicle_type || '').toUpperCase();
  if (vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
  if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2';
  if (vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
  return '';
}

function getJobEstimation(job: any) {
  const estimatedPriceRaw = job?.estimated_price;
  const estimatedPrice = Number(estimatedPriceRaw);
  const sellingPrice = Number(job?.job_types?.selling_price || 0);
  if (Number.isFinite(estimatedPrice) && estimatedPrice > 0) return estimatedPrice;
  if ((!Number.isFinite(estimatedPrice) || estimatedPriceRaw === null || estimatedPriceRaw === undefined) && sellingPrice > 0) return sellingPrice;
  if (Number.isFinite(estimatedPrice) && estimatedPrice === 0 && sellingPrice > 0) return sellingPrice;
  return Number.isFinite(estimatedPrice) ? estimatedPrice : 0;
}

export default function BudgetMonitoringReport() {
  const { user } = useAuth();
  const canEdit = ['SUPER_ADMIN', 'ADMIN'].includes(String((user as any)?.role || '').toUpperCase());
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [rows, setRows] = useState<MonitoringRow[]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [loadingRealisasi, setLoadingRealisasi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbReady, setDbReady] = useState(true);
  const [realisasiByGroup, setRealisasiByGroup] = useState<Record<GroupKey, number[]>>({
    R2: emptyMonths(),
    R4: emptyMonths(),
  });

  useEffect(() => {
    void loadSheet();
  }, [selectedYear]);

  useEffect(() => {
    void loadRealisasi();
  }, [selectedYear]);

  async function loadSheet() {
    setLoadingSheet(true);
    try {
      const { data, error } = await supabase
        .from('budget_forecast_sheets' as any)
        .select('data')
        .eq('project', STORAGE_PROJECT)
        .eq('year', selectedYear)
        .maybeSingle();

      if (error) throw error;
      setDbReady(true);

      const payload = data?.data;
      const nextSheet = payload?.kind === 'pagu-monitoring-v1'
        ? normalizeSheet(payload, selectedYear)
        : buildDefaultSheet(selectedYear);
      setRows(nextSheet.rows);
    } catch (error: any) {
      const msg = String(error?.message || error);
      if (msg.toLowerCase().includes('could not find the table')) {
        setDbReady(false);
        toast.error('Tabel penyimpanan monitoring belum tersedia. Data ditampilkan lokal terlebih dulu.');
      } else {
        toast.error('Gagal memuat monitoring pagu: ' + msg);
      }
      setRows(buildDefaultSheet(selectedYear).rows);
    } finally {
      setLoadingSheet(false);
    }
  }

  async function loadRealisasi() {
    setLoadingRealisasi(true);
    try {
      const sums: Record<GroupKey, number[]> = { R2: emptyMonths(), R4: emptyMonths() };
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      const pageSize = 500;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('vehicle_entries')
          .select(
            `
            id,
            entry_date,
            service_group,
            vehicles (vehicle_type),
            vehicle_entry_jobs (
              estimated_price,
              job_types (selling_price)
            ),
            vehicle_entry_spareparts (
              qty,
              estimated_price
            )
          `
          )
          .gte('entry_date', startDate)
          .lte('entry_date', endDate)
          .range(from, from + pageSize - 1)
          .order('entry_date', { ascending: true })
          .order('id', { ascending: true });

        if (error) throw error;
        const list = Array.isArray(data) ? data : [];

        for (const entry of list as any[]) {
          const groupKey = getGroupKey(entry);
          if (!groupKey) continue;

          const dateStr = String(entry?.entry_date || '').slice(0, 10);
          const month = Number(dateStr.slice(5, 7));
          const monthIndex = Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : -1;
          if (monthIndex < 0) continue;

          let estJob = 0;
          let estPart = 0;
          const jobs = Array.isArray(entry?.vehicle_entry_jobs) ? entry.vehicle_entry_jobs : [];
          const parts = Array.isArray(entry?.vehicle_entry_spareparts) ? entry.vehicle_entry_spareparts : [];

          jobs.forEach((job: any) => {
            estJob += getJobEstimation(job);
          });

          parts.forEach((part: any) => {
            estPart += Number(part?.estimated_price || 0) * Number(part?.qty || 0);
          });

          const total = estJob + estPart;
          if (!Number.isFinite(total) || total === 0) continue;
          sums[groupKey][monthIndex] += total;
        }

        if (list.length < pageSize) break;
        from += pageSize;
      }

      setRealisasiByGroup(sums);
    } catch (error: any) {
      toast.error('Gagal memuat realisasi otomatis: ' + String(error?.message || error));
      setRealisasiByGroup({ R2: emptyMonths(), R4: emptyMonths() });
    } finally {
      setLoadingRealisasi(false);
    }
  }

  function updateNumericCell(id: string, field: 'pagu' | 'pajak' | 'lainnya', value: string) {
    const nextValue = parseNumber(value);
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: nextValue } : row)));
  }

  async function saveSheet() {
    if (!canEdit) {
      toast.error('Hanya admin yang dapat menyimpan monitoring pagu.');
      return;
    }
    if (!dbReady) {
      toast.error('Penyimpanan database belum siap.');
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const payload: MonitoringSheet = {
        kind: 'pagu-monitoring-v1',
        year: selectedYear,
        rows,
      };

      const { error } = await supabase
        .from('budget_forecast_sheets' as any)
        .upsert([{ project: STORAGE_PROJECT, year: selectedYear, data: payload }] as any, { onConflict: 'project,year' } as any);

      if (error) throw error;
      toast.success('Monitoring pagu tersimpan.');
    } catch (error: any) {
      toast.error('Gagal menyimpan monitoring pagu: ' + String(error?.message || error));
    } finally {
      setSaving(false);
    }
  }

  const computedRows = useMemo(() => {
    return rows.map((row) => {
      const afterPajak = Number(row.pagu || 0) - Number(row.pajak || 0);
      const nilaiPaguDigunakan = afterPajak - Number(row.lainnya || 0);
      const terminNumber = getTerminNumber(row.termin);

      let realisasi = 0;
      if (terminNumber === 1) {
        realisasi =
          Number(realisasiByGroup[row.groupKey]?.[0] || 0) +
          Number(realisasiByGroup[row.groupKey]?.[1] || 0) +
          Number(realisasiByGroup[row.groupKey]?.[2] || 0);
      } else {
        const monthIndex = terminNumber + 1;
        realisasi = Number(realisasiByGroup[row.groupKey]?.[monthIndex] || 0);
      }

      const balance = nilaiPaguDigunakan - realisasi;
      return {
        ...row,
        afterPajak,
        nilaiPaguDigunakan,
        realisasi,
        balance,
      };
    });
  }, [rows, realisasiByGroup]);

  const groupedRows = useMemo(() => {
    return {
      R2: computedRows.filter((row) => row.groupKey === 'R2'),
      R4: computedRows.filter((row) => row.groupKey === 'R4'),
    };
  }, [computedRows]);

  const totals = useMemo(() => {
    const calc = (groupRows: typeof computedRows) => groupRows.reduce(
      (acc, row) => ({
        pagu: acc.pagu + row.pagu,
        pajak: acc.pajak + row.pajak,
        afterPajak: acc.afterPajak + row.afterPajak,
        lainnya: acc.lainnya + row.lainnya,
        nilaiPaguDigunakan: acc.nilaiPaguDigunakan + row.nilaiPaguDigunakan,
        realisasi: acc.realisasi + row.realisasi,
        balance: acc.balance + row.balance,
      }),
      { pagu: 0, pajak: 0, afterPajak: 0, lainnya: 0, nilaiPaguDigunakan: 0, realisasi: 0, balance: 0 },
    );

    return {
      R2: calc(groupedRows.R2),
      R4: calc(groupedRows.R4),
    };
  }, [groupedRows]);

  function exportToExcel() {
    const aoa: Array<Array<string | number>> = [];

    const pushSection = (title: GroupKey, sectionRows: typeof computedRows, startRow: number) => {
      aoa.push([]);
      aoa.push(['No.', 'Group', 'Periode', 'Termin', 'Pagu', 'Pajak', 'After Pajak', 'Lainnya', 'Nilai Pagu Digunakan', 'Realisasi', 'Balance']);
      sectionRows.forEach((row) => {
        aoa.push([
          row.no,
          row.groupKey,
          row.period,
          row.termin,
          row.pagu,
          row.pajak,
          row.afterPajak,
          row.lainnya,
          row.nilaiPaguDigunakan,
          row.realisasi,
          row.balance,
        ]);
      });
      const total = totals[title];
      aoa.push(['Total', '', '', '', total.pagu, total.pajak, total.afterPajak, total.lainnya, total.nilaiPaguDigunakan, total.realisasi, total.balance]);

      return startRow + sectionRows.length + 3;
    };

    aoa.push([`MONITORING PAGU ANGGARAN ${selectedYear}`]);
    let currentRow = 2;
    currentRow = pushSection('R2', groupedRows.R2, currentRow);
    currentRow = pushSection('R4', groupedRows.R4, currentRow + 1);

    aoa.push([]);
    aoa.push(['Penjelasan']);
    aoa.push(['', 'Kolom Pagu = input manual']);
    aoa.push(['', 'Kolom Pajak = input manual']);
    aoa.push(['', 'Kolom After Pajak = Pagu - Pajak']);
    aoa.push(['', 'Kolom Lainnya = input manual']);
    aoa.push(['', 'Kolom Nilai Pagu Digunakan = After Pajak - Lainnya']);
    aoa.push(['', 'Kolom Realisasi = otomatis dari estimasi per bulan']);
    aoa.push(['', `Catatan: Realisasi Termin 1 R2 & R4 dihitung dari estimasi Januari-Maret ${selectedYear}`]);
    aoa.push(['', 'Kolom Balance = Nilai Pagu Digunakan - Realisasi']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 10 },
      { wch: 22 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monitoring Pagu');
    XLSX.writeFile(wb, `Monitoring_Pagu_Anggaran_${selectedYear}.xlsx`);
  }

  const renderDesktopTable = (groupKey: GroupKey) => {
    const groupRows = groupedRows[groupKey];
    const total = totals[groupKey];
    return (
      <div className="hidden md:block rounded-md border overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-100">
            <TableRow>
              <TableHead className="w-[60px]">No.</TableHead>
              <TableHead className="w-[90px]">Group</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead className="w-[110px]">Termin</TableHead>
              <TableHead className="text-right">Pagu</TableHead>
              <TableHead className="text-right">Pajak</TableHead>
              <TableHead className="text-right">After Pajak</TableHead>
              <TableHead className="text-right">Lainnya</TableHead>
              <TableHead className="text-right">Nilai Pagu Digunakan</TableHead>
              <TableHead className="text-right">Realisasi</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.no}</TableCell>
                <TableCell className="font-medium">{row.groupKey}</TableCell>
                <TableCell>{row.period}</TableCell>
                <TableCell>{row.termin}</TableCell>
                <TableCell className="text-right">
                  {canEdit ? (
                    <Input
                      type="number"
                      value={String(row.pagu || '')}
                      onChange={(e) => updateNumericCell(row.id, 'pagu', e.target.value)}
                      className="h-8 text-right"
                    />
                  ) : (
                    formatCurrency(row.pagu)
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canEdit ? (
                    <Input
                      type="number"
                      value={String(row.pajak || '')}
                      onChange={(e) => updateNumericCell(row.id, 'pajak', e.target.value)}
                      className="h-8 text-right"
                    />
                  ) : (
                    formatCurrency(row.pajak)
                  )}
                </TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(row.afterPajak)}</TableCell>
                <TableCell className="text-right">
                  {canEdit ? (
                    <Input
                      type="number"
                      value={String(row.lainnya || '')}
                      onChange={(e) => updateNumericCell(row.id, 'lainnya', e.target.value)}
                      className="h-8 text-right"
                    />
                  ) : (
                    formatCurrency(row.lainnya)
                  )}
                </TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(row.nilaiPaguDigunakan)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.realisasi)}</TableCell>
                <TableCell className={`text-right font-bold ${row.balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatCurrency(row.balance)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-slate-50 font-bold">
              <TableCell colSpan={4}>Total {groupKey}</TableCell>
              <TableCell className="text-right">{formatCurrency(total.pagu)}</TableCell>
              <TableCell className="text-right">{formatCurrency(total.pajak)}</TableCell>
              <TableCell className="text-right">{formatCurrency(total.afterPajak)}</TableCell>
              <TableCell className="text-right">{formatCurrency(total.lainnya)}</TableCell>
              <TableCell className="text-right">{formatCurrency(total.nilaiPaguDigunakan)}</TableCell>
              <TableCell className="text-right">{formatCurrency(total.realisasi)}</TableCell>
              <TableCell className={`text-right ${total.balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatCurrency(total.balance)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderMobileCards = (groupKey: GroupKey) => {
    const groupRows = groupedRows[groupKey];
    const total = totals[groupKey];
    return (
      <div className="space-y-3 md:hidden">
        {groupRows.map((row) => (
          <div key={row.id} className="rounded-lg border bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{row.termin}</div>
                <div className="text-xs text-slate-500">{row.period}</div>
              </div>
              <div className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {row.groupKey}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs text-slate-500">Pagu</div>
                {canEdit ? (
                  <Input type="number" value={String(row.pagu || '')} onChange={(e) => updateNumericCell(row.id, 'pagu', e.target.value)} className="mt-1 h-9 text-right" />
                ) : (
                  <div className="mt-1 text-sm font-medium">{formatCurrency(row.pagu)}</div>
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500">Pajak</div>
                {canEdit ? (
                  <Input type="number" value={String(row.pajak || '')} onChange={(e) => updateNumericCell(row.id, 'pajak', e.target.value)} className="mt-1 h-9 text-right" />
                ) : (
                  <div className="mt-1 text-sm font-medium">{formatCurrency(row.pajak)}</div>
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500">After Pajak</div>
                <div className="mt-1 text-sm font-medium">{formatCurrency(row.afterPajak)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Lainnya</div>
                {canEdit ? (
                  <Input type="number" value={String(row.lainnya || '')} onChange={(e) => updateNumericCell(row.id, 'lainnya', e.target.value)} className="mt-1 h-9 text-right" />
                ) : (
                  <div className="mt-1 text-sm font-medium">{formatCurrency(row.lainnya)}</div>
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500">Nilai Pagu Digunakan</div>
                <div className="mt-1 text-sm font-medium">{formatCurrency(row.nilaiPaguDigunakan)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Realisasi</div>
                <div className="mt-1 text-sm font-medium">{formatCurrency(row.realisasi)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Balance</div>
                <div className={`mt-1 text-sm font-semibold ${row.balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatCurrency(row.balance)}
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="rounded-lg border bg-slate-50 p-4 space-y-2">
          <div className="text-sm font-semibold">Total {groupKey}</div>
          <div className="grid grid-cols-1 gap-1 text-sm">
            <div>Pagu: <span className="font-medium">{formatCurrency(total.pagu)}</span></div>
            <div>Pajak: <span className="font-medium">{formatCurrency(total.pajak)}</span></div>
            <div>After Pajak: <span className="font-medium">{formatCurrency(total.afterPajak)}</span></div>
            <div>Lainnya: <span className="font-medium">{formatCurrency(total.lainnya)}</span></div>
            <div>Nilai Pagu Digunakan: <span className="font-medium">{formatCurrency(total.nilaiPaguDigunakan)}</span></div>
            <div>Realisasi: <span className="font-medium">{formatCurrency(total.realisasi)}</span></div>
            <div>Balance: <span className={`font-semibold ${total.balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(total.balance)}</span></div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Monitoring Pagu Anggaran</h2>
          <p className="text-sm text-slate-500 mt-1">
            Rumus: `After Pajak = Pagu - Pajak`, `Nilai Pagu Digunakan = After Pajak - Lainnya`, `Balance = Nilai Pagu Digunakan - Realisasi`.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="number"
            value={String(selectedYear)}
            onChange={(e) => setSelectedYear(Number(parseNumber(e.target.value)) || currentYear)}
            className="w-28"
          />
          <Button variant="outline" onClick={() => { void loadSheet(); void loadRealisasi(); }} disabled={loadingSheet || loadingRealisasi}>
            <RefreshCw className={`mr-2 h-4 w-4 ${(loadingSheet || loadingRealisasi) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={saveSheet} disabled={!canEdit || saving || !dbReady}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Catatan Perhitungan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>Kolom `Pagu`, `Pajak`, dan `Lainnya` diinput manual.</p>
          <p>Kolom `Realisasi` otomatis diambil dari total estimasi `jasa + part` berdasarkan `entry_date`.</p>
          <p>Termin 1 untuk `R2` dan `R4` dijumlah dari estimasi `Januari–Maret {selectedYear}`.</p>
        </CardContent>
      </Card>

      {(loadingSheet || loadingRealisasi) ? (
        <Card>
          <CardContent className="py-8 text-sm text-slate-500">
            Memuat data monitoring pagu...
          </CardContent>
        </Card>
      ) : (
        <>
          {(['R2', 'R4'] as const).map((groupKey) => (
            <Card key={groupKey}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Group {groupKey}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderMobileCards(groupKey)}
                {renderDesktopTable(groupKey)}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
