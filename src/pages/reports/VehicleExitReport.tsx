import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { Calendar, Download, Printer, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';
import ReportPrintHeader from '@/components/reports/ReportPrintHeader';

export default function VehicleExitReport() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const getVehicleGroupLabel = (row: any) => {
    const sg = String(row.vehicle_entries?.service_group || '').toUpperCase();
    if (sg.includes('R2_KECIL') || sg.includes('R2 KECIL') || sg.includes('KECIL')) return 'R2 Kecil';
    if (sg.includes('R4')) return 'R4';
    if (sg.includes('R2')) return 'R2';
    const vt = String(row.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
    if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
    if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
    if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
    return '-';
  };

  const getVehicleGroupKey = (row: any) => {
    const label = getVehicleGroupLabel(row);
    if (label === 'R2') return 'R2';
    if (label === 'R4') return 'R4';
    if (label === 'R2 Kecil') return 'R2_KECIL';
    return '';
  };

  async function fetchData() {
    setLoading(true);
    try {
      const endIso = `${dateFilter.endDate}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id,
          wo_number,
          work_date,
          completed_at,
          status,
          mechanics (name),
          vehicle_entries (
            nota_dinas_number,
            service_group,
            vehicles (license_plate, brand_type, vehicle_type)
          )
        `)
        .in('status', ['COMPLETED', 'CLOSED'])
        .gte('completed_at', dateFilter.startDate)
        .lte('completed_at', endIso)
        .order('completed_at', { ascending: false });

      if (!error) {
        setRows(data || []);
        return;
      }

      const msg = String((error as any)?.message || '');
      if (!msg.toLowerCase().includes('completed_at')) {
        throw error;
      }

      const { data: fallback, error: fallbackError } = await supabase
        .from('work_orders')
        .select(`
          id,
          wo_number,
          work_date,
          status,
          mechanics (name),
          vehicle_entries (
            nota_dinas_number,
            service_group,
            vehicles (license_plate, brand_type, vehicle_type)
          )
        `)
        .in('status', ['COMPLETED', 'CLOSED'])
        .gte('work_date', dateFilter.startDate)
        .lte('work_date', dateFilter.endDate)
        .order('work_date', { ascending: false });

      if (fallbackError) throw fallbackError;
      setRows(fallback || []);
    } catch (e: any) {
      toast.error('Gagal mengambil data laporan: ' + (e?.message || 'Unknown error'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter((r: any) => {
      const matchGroup = groupFilter === 'ALL' ? true : getVehicleGroupKey(r) === groupFilter;
      if (!matchGroup) return false;
      if (!q) return true;
      const wo = String(r.wo_number || '').toLowerCase();
      const nopol = String(r.vehicle_entries?.vehicles?.license_plate || '').toLowerCase();
      const nota = String(r.vehicle_entries?.nota_dinas_number || '').toLowerCase();
      return wo.includes(q) || nopol.includes(q) || nota.includes(q);
    });
  }, [rows, search, groupFilter]);

  const handleExportExcel = () => {
    const dataToExport = filteredRows.map((r: any, idx: number) => ({
      No: idx + 1,
      'Tgl Keluar': formatDate(r.completed_at || r.work_date),
      'No. WO': r.wo_number || '-',
      'No. Nota Dinas': r.vehicle_entries?.nota_dinas_number || '-',
      'Nopol': r.vehicle_entries?.vehicles?.license_plate || '-',
      'Tipe Kendaraan': r.vehicle_entries?.vehicles?.brand_type || '-',
      'Group': getVehicleGroupLabel(r),
      'Mekanik': r.mechanics?.name || '-',
      'Status WO': r.status || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Unit Keluar');
    XLSX.writeFile(wb, `Laporan_Unit_Keluar_${dateFilter.startDate}_sd_${dateFilter.endDate}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Card className="w-full print:shadow-none print:border-none">
      <CardHeader className="print:hidden">
        <div className="flex justify-between items-center print:hidden">
          <div>
            <CardTitle>Laporan Unit Keluar</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Periode: {formatDate(dateFilter.startDate)} s/d {formatDate(dateFilter.endDate)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportExcel} disabled={filteredRows.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button variant="secondary" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mt-4 print:hidden bg-slate-50 p-4 rounded-lg items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Periode:</span>
            <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm">
              <Calendar className="h-4 w-4 text-gray-500 ml-2" />
              <Input
                type="date"
                className="w-36 border-0 p-0 h-9 focus-visible:ring-0 cursor-pointer"
                value={dateFilter.startDate}
                onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
              />
              <span className="text-slate-400 font-medium">-</span>
              <Input
                type="date"
                className="w-36 border-0 p-0 h-9 focus-visible:ring-0 cursor-pointer"
                value={dateFilter.endDate}
                onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Group:</span>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-[140px] bg-white h-8">
                <SelectValue placeholder="Semua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua</SelectItem>
                <SelectItem value="R2">R2</SelectItem>
                <SelectItem value="R4">R4</SelectItem>
                <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Cari No. WO / Nopol / Nota Dinas..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="print:p-0">
        <div className="hidden print:block mb-4">
          <ReportPrintHeader title="Laporan Unit Keluar" />
          <p className="text-sm text-muted-foreground mt-2">
            Periode: {formatDate(dateFilter.startDate)} s/d {formatDate(dateFilter.endDate)}
          </p>
        </div>

        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Tgl Keluar</TableHead>
                <TableHead>No. WO</TableHead>
                <TableHead>No. Nota Dinas</TableHead>
                <TableHead>Kendaraan</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Mekanik</TableHead>
                <TableHead className="text-right print:hidden">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24">
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24">
                    Tidak ada data.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{formatDate(r.completed_at || r.work_date)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.wo_number}</TableCell>
                    <TableCell className="font-mono text-xs">{r.vehicle_entries?.nota_dinas_number || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{r.vehicle_entries?.vehicles?.license_plate || '-'}</span>
                        <span className="text-xs text-muted-foreground">{r.vehicle_entries?.vehicles?.brand_type || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getVehicleGroupLabel(r)}</TableCell>
                    <TableCell>{r.mechanics?.name || '-'}</TableCell>
                    <TableCell className="text-right print:hidden">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/print/surat-jalan/${r.id}`, '_blank')}
                      >
                        <Printer className="h-4 w-4 mr-1" /> Surat Keluar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
