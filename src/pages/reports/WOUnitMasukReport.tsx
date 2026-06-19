import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Download, Printer, RefreshCw, Search } from 'lucide-react';
import ReportPrintHeader from '@/components/reports/ReportPrintHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function WOUnitMasukReport() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('semua');
  const [groupFilter, setGroupFilter] = useState('semua');
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchData();
  }, [dateFilter.startDate, dateFilter.endDate]);

  const getVehicleGroupLabel = (vehicleType: string | null | undefined) => {
    const vt = String(vehicleType || '').toUpperCase();
    if (vt === 'R4' || vt.includes('MOBIL')) return 'R4';
    if (vt === 'R2' || vt.includes('MOTOR')) return 'R2';
    if (vt.includes('R2_KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
    return '-';
  };

  async function fetchData() {
    setLoading(true);
    try {
      const { data: entries, error } = await supabase
        .from('vehicle_entries')
        .select(`
          id,
          entry_number,
          entry_date,
          service_group,
          status,
          nota_dinas_number,
          notes,
          vehicles (license_plate, brand_type, vehicle_type, owner_name),
          work_orders (id, wo_number, status, work_date, mechanic_id),
          vehicle_entry_jobs (
            id,
            job_type_id,
            notes,
            value_only,
            estimated_price,
            job_types (job_name, job_group, selling_price)
          ),
          vehicle_entry_spareparts (
            id,
            goods_id,
            item_name,
            qty,
            estimated_price,
            value_only
          )
        `)
        .gte('entry_date', dateFilter.startDate)
        .lte('entry_date', dateFilter.endDate)
        .order('entry_date', { ascending: false });

      if (error) throw error;

      const flattened: any[] = [];

      (entries || []).forEach((entry: any) => {
        const wo = Array.isArray(entry.work_orders) && entry.work_orders.length > 0
          ? entry.work_orders[0]
          : null;
        const vehicle = entry.vehicles || {};
        const group = getVehicleGroupLabel(vehicle.vehicle_type);

        // --- Baris: Informasi Utama Unit ---
        flattened.push({
          type: 'HEADER',
          id: entry.id,
          entry_number: entry.entry_number,
          entry_date: entry.entry_date,
          service_group: entry.service_group || '-',
          entry_status: entry.status,
          nota_dinas: entry.nota_dinas_number || '-',
          notes: entry.notes || '-',
          license_plate: vehicle.license_plate || '-',
          brand_type: vehicle.brand_type || '-',
          vehicle_type: group,
          owner_name: vehicle.owner_name || '-',
          wo_number: wo?.wo_number || '-',
          wo_status: wo?.status || '-',
          wo_date: wo?.work_date || '-',
        });

        // --- Baris: Estimasi Jasa ---
        const jobs = Array.isArray(entry.vehicle_entry_jobs) ? entry.vehicle_entry_jobs : [];
        jobs.forEach((j: any) => {
          const estPrice = Number(j.estimated_price || 0);
          const sellPrice = Number(j.job_types?.selling_price || 0);
          const unitPrice = estPrice > 0 ? estPrice : sellPrice;
          flattened.push({
            type: 'JOB',
            parent_id: entry.id,
            entry_number: entry.entry_number,
            entry_date: entry.entry_date,
            license_plate: vehicle.license_plate || '-',
            brand_type: vehicle.brand_type || '-',
            vehicle_type: group,
            wo_number: wo?.wo_number || '-',
            item_type: 'JASA',
            item_name: j.job_types?.job_name || 'Jasa',
            group_name: j.job_types?.job_group || '-',
            qty: 1,
            unit: 'Jasa',
            unit_price: unitPrice,
            total_price: unitPrice,
            notes: j.notes || '-',
          });
        });

        // --- Baris: Estimasi Sparepart ---
        const parts = Array.isArray(entry.vehicle_entry_spareparts) ? entry.vehicle_entry_spareparts : [];
        parts.forEach((p: any) => {
          const qty = Number(p.qty || 0);
          const unitPrice = Number(p.estimated_price || 0);
          flattened.push({
            type: 'PART',
            parent_id: entry.id,
            entry_number: entry.entry_number,
            entry_date: entry.entry_date,
            license_plate: vehicle.license_plate || '-',
            brand_type: vehicle.brand_type || '-',
            vehicle_type: group,
            wo_number: wo?.wo_number || '-',
            item_type: 'SPAREPART',
            item_name: p.item_name || '-',
            group_name: '-',
            qty,
            unit: '-',
            unit_price: unitPrice,
            total_price: unitPrice * qty,
            notes: '-',
          });
        });
      });

      setRows(flattened);
    } catch (e: any) {
      toast.error('Gagal memuat laporan: ' + e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = rows.filter((r) => {
    if (statusFilter !== 'semua') {
      const status = r.type === 'HEADER' ? r.entry_status : null;
      if (status !== statusFilter) return false;
    }
    if (groupFilter !== 'semua') {
      if (r.vehicle_type !== groupFilter) return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      r.entry_number, r.entry_date, r.license_plate, r.brand_type,
      r.vehicle_type, r.wo_number, r.item_name, r.group_name,
      r.service_group, r.nota_dinas, r.notes,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });

  const exportToExcel = () => {
    const exportData = filteredRows.map((r, idx) => ({
      'No': idx + 1,
      'Tanggal Entry': formatDate(r.entry_date),
      'No. Entry': r.entry_number,
      'No. WO': r.wo_number,
      'Status WO': r.wo_status || '-',
      'Nopol': r.license_plate,
      'Merk/Type': r.brand_type,
      'Group': r.vehicle_type,
      'Group Service': r.service_group,
      'Nota Dinas': r.nota_dinas,
      'Tipe': r.item_type,
      'Item': r.item_name,
      'Group Item': r.group_name,
      'Qty': r.qty,
      'Satuan': r.unit,
      'Harga': r.unit_price,
      'Total': r.total_price,
      'Keterangan': r.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detail WO Unit Masuk');
    XLSX.writeFile(wb, `Detail_WO_Unit_Masuk_${dateFilter.startDate}_sd_${dateFilter.endDate}.xlsx`);
  };

  const totals = filteredRows.reduce((acc, r) => {
    if (r.type !== 'HEADER') {
      acc.totalPrice += Number(r.total_price || 0);
    }
    return acc;
  }, { totalPrice: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Detail WO Unit Masuk</h2>
          <p className="text-muted-foreground">Detail lengkap unit masuk: informasi kendaraan, jasa, dan sparepart per entry.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} disabled={filteredRows.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Cetak
          </Button>
          <Button onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="pb-3 print:hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg">Filter</CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="w-auto bg-white"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                />
                <span className="text-sm text-slate-500">s/d</span>
                <Input
                  type="date"
                  className="w-auto bg-white"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] bg-white">
                  <SelectValue placeholder="Status Entry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Status</SelectItem>
                  <SelectItem value="OPEN">OPEN</SelectItem>
                  <SelectItem value="PROCESSED">PROCESSED</SelectItem>
                  <SelectItem value="CLOSED">CLOSED</SelectItem>
                </SelectContent>
              </Select>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger className="w-[140px] bg-white">
                  <SelectValue placeholder="Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Group</SelectItem>
                  <SelectItem value="R4">R4</SelectItem>
                  <SelectItem value="R2">R2</SelectItem>
                  <SelectItem value="R2 Kecil">R2 Kecil</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-72">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari entry / WO / nopol / item..."
                  className="pl-8 bg-white"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6">
            <ReportPrintHeader title="Detail WO Unit Masuk" periodStart={dateFilter.startDate} periodEnd={dateFilter.endDate} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 print:hidden">
              <div className="p-3 rounded-md border bg-white">
                <div className="text-xs text-slate-500">Total Unit</div>
                <div className="text-lg font-bold text-slate-900">
                  {new Set(filteredRows.filter(r => r.type === 'HEADER').map(r => r.id)).size}
                </div>
              </div>
              <div className="p-3 rounded-md border bg-white">
                <div className="text-xs text-slate-500">Total Estimasi</div>
                <div className="text-lg font-bold text-slate-900">{formatCurrency(totals.totalPrice)}</div>
              </div>
            </div>
          </div>

          <div className="border-t overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="w-[100px] font-semibold text-slate-700">Tanggal</TableHead>
                  <TableHead className="font-semibold text-slate-700">No. Entry</TableHead>
                  <TableHead className="font-semibold text-slate-700">No. WO</TableHead>
                  <TableHead className="font-semibold text-slate-700">Status WO</TableHead>
                  <TableHead className="font-semibold text-slate-700">Nopol</TableHead>
                  <TableHead className="font-semibold text-slate-700">Merk/Type</TableHead>
                  <TableHead className="font-semibold text-slate-700">Group</TableHead>
                  <TableHead className="font-semibold text-slate-700">Group Service</TableHead>
                  <TableHead className="font-semibold text-slate-700">Nota Dinas</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tipe</TableHead>
                  <TableHead className="font-semibold text-slate-700">Item</TableHead>
                  <TableHead className="font-semibold text-slate-700">Group Item</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Qty</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Satuan</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Harga</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Total</TableHead>
                  <TableHead className="font-semibold text-slate-700">Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={17} className="text-center py-12 text-muted-foreground">
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={17} className="text-center py-12 text-muted-foreground">
                      Tidak ada data ditemukan.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r, idx) => {
                    const isHeader = r.type === 'HEADER';
                    return (
                      <TableRow
                        key={`${r.parent_id || r.id}-${idx}`}
                        className={`
                          ${isHeader ? 'bg-blue-50 hover:bg-blue-100 font-semibold' : 'hover:bg-slate-50/80'}
                        `}
                      >
                        <TableCell className={`text-sm ${isHeader ? 'font-semibold' : ''}`}>
                          {isHeader ? (
                            <span className="font-bold">{formatDate(r.entry_date)}</span>
                          ) : (
                            formatDate(r.entry_date)
                          )}
                        </TableCell>
                        <TableCell className={`font-mono text-xs ${isHeader ? 'font-bold' : ''}`}>
                          {r.entry_number}
                        </TableCell>
                        <TableCell className={`font-mono text-xs ${isHeader ? 'font-bold' : ''}`}>
                          {r.wo_number}
                        </TableCell>
                        <TableCell>
                          {r.wo_number !== '-' ? (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              r.wo_status === 'CLOSED' ? 'bg-green-100 text-green-800' :
                              r.wo_status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' :
                              r.wo_status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {r.wo_status}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className={`text-sm ${isHeader ? 'font-bold' : ''}`}>
                          {r.license_plate}
                        </TableCell>
                        <TableCell className="text-sm">{r.brand_type}</TableCell>
                        <TableCell className="text-sm">{r.vehicle_type}</TableCell>
                        <TableCell className="text-sm">{r.service_group}</TableCell>
                        <TableCell className="text-xs">{r.nota_dinas}</TableCell>
                        <TableCell>
                          {r.type === 'HEADER' ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">HEADER</span>
                          ) : r.type === 'JOB' ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-800">JASA</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800">SPAREPART</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-sm ${isHeader ? 'font-bold' : ''}`}>
                          {r.item_name}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{r.group_name}</TableCell>
                        <TableCell className={`text-right font-semibold ${isHeader ? '' : ''}`}>
                          {r.qty}
                        </TableCell>
                        <TableCell className="text-right">{r.unit}</TableCell>
                        <TableCell className="text-right">
                          {r.unit_price > 0 ? formatCurrency(r.unit_price) : '-'}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${isHeader ? 'text-blue-700' : ''}`}>
                          {r.total_price > 0 ? formatCurrency(r.total_price) : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-[150px] truncate">
                          {r.notes}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
