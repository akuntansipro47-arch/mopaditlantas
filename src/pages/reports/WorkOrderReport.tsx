import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Calendar, Search } from 'lucide-react';
import { formatCurrency, formatDate, matchesFreeSearch } from '@/lib/utils';
import { getWorkOrderStatusBadgeClass, getWorkOrderStatusLabel, isWorkOrderActive, isWorkOrderDone, isWorkOrderCancelled, normalizeWorkOrderStatus } from '@/lib/workOrderRules';
import * as XLSX from 'xlsx';

export default function WorkOrderReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Start of Year
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, [dateRange, statusFilter]);

  async function fetchData() {
    setLoading(true);
    try {
      let query = supabase
        .from('work_orders')
        .select(`
          *,
          mechanics (name),
          vehicle_entries (
            nota_dinas_number,
            service_group,
            vehicle_entry_jobs (
              estimated_price,
              job_types (selling_price)
            ),
            vehicle_entry_spareparts (
              qty,
              estimated_price,
              value_only
            ),
            vehicles (license_plate, brand_type, vehicle_type)
          ),
          billings:work_order_billings (
            item_type,
            item_name,
            qty,
            unit_price,
            total_price,
            is_info_only
          )
        `)
        .gte('work_date', dateRange.start)
        .lte('work_date', dateRange.end)
        .order('work_date', { ascending: false });

      if (statusFilter === 'ACTIVE') {
        query = query.in('status', ['OPEN', 'IN_PROGRESS']);
      } else if (statusFilter === 'ARCHIVED') {
        query = query.in('status', ['COMPLETED', 'CLOSED']);
      } else if (statusFilter !== 'ALL') {
        if (statusFilter === 'COMPLETED') {
             query = query.in('status', ['COMPLETED', 'CLOSED']);
        } else {
             query = query.eq('status', statusFilter);
        }
      }

      const { data: result, error } = await query;
      
      if (error) {
          console.error("Supabase Error:", error);
          throw error;
      }
      
      const resultRows = Array.isArray(result) ? result : [];
      const woIds = resultRows.map((row: any) => row.id).filter(Boolean);
      const poPartTotalByWo: Record<string, number> = {};

      if (woIds.length > 0) {
        const { data: poItems } = await supabase
          .from('purchase_order_items')
          .select('line_type, quantity, unit_price, purchase_orders!inner(work_order_id, status)')
          .in('purchase_orders.work_order_id', woIds)
          .not('unit_price', 'is', null);

        (poItems || []).forEach((item: any) => {
          const woId = String(item.purchase_orders?.work_order_id || '').trim();
          const poStatus = normalizeWorkOrderStatus(item.purchase_orders?.status);
          const lineType = String(item.line_type || 'PART').toUpperCase();
          const qty = Number(item.quantity || 0);
          const unitPrice = Number(item.unit_price || 0);
          if (!woId || lineType === 'JASA' || qty <= 0 || unitPrice <= 0) return;
          if (poStatus === 'CANCELLED') return;
          poPartTotalByWo[woId] = (poPartTotalByWo[woId] || 0) + (qty * unitPrice);
        });
      }

      setData(resultRows.map((row: any) => ({ ...row, po_part_total: poPartTotalByWo[String(row.id)] || 0 })));
    } catch (error) {
      console.error('Error fetching WO report:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter((item) =>
    matchesFreeSearch(search, [
      item.wo_number,
      item.work_date,
      item.status,
      item.mechanics?.name,
      item.vehicle_entries?.nota_dinas_number,
      item.vehicle_entries?.service_group,
      item.vehicle_entries?.vehicles?.license_plate,
      item.vehicle_entries?.vehicles?.brand_type,
      getVehicleGroupLabel(item),
    ])
  );

    const getJobEstimate = (j: any) => {
      const epRaw = (j as any)?.estimated_price;
      const ep = Number(epRaw);
      const sp = Number(j?.job_types?.selling_price || 0);
      if (Number.isFinite(ep) && ep > 0) return ep;
      if ((!Number.isFinite(ep) || epRaw === null || epRaw === undefined) && sp > 0) return sp;
      if (Number.isFinite(ep) && ep === 0 && sp > 0) return sp;
      return Number.isFinite(ep) ? ep : 0;
    };

  const calculateTotalEstimate = (wo: any) => {
    const jobs = Array.isArray(wo.vehicle_entries?.vehicle_entry_jobs) ? wo.vehicle_entries.vehicle_entry_jobs : [];
    const parts = Array.isArray(wo.vehicle_entries?.vehicle_entry_spareparts) ? wo.vehicle_entries.vehicle_entry_spareparts : [];

    const estJob = jobs.reduce((sum: number, j: any) => sum + getJobEstimate(j), 0);

    const estPart = parts.reduce((sum: number, p: any) => {
      if (Boolean(p?.value_only)) return sum;
      return sum + (Number(p?.estimated_price || 0) * Number(p?.qty || 0));
    }, 0);

    const totalEntryEstimate = estJob + estPart;
    if (totalEntryEstimate > 0) return totalEntryEstimate;

    if (wo.billings && wo.billings.length > 0) {
      return wo.billings
        .filter((b: any) => b.is_info_only === true)
        .reduce((sum: number, b: any) => sum + (Number(b.total_price || 0) || Number(b.unit_price || 0) * Number(b.qty || 0)), 0);
    }
    return 0;
  };

  const calculateTotalFinal = (wo: any) => {
      const status = normalizeWorkOrderStatus(wo.status);
      const totalEstimate = calculateTotalEstimate(wo);
      const jobs = Array.isArray(wo.vehicle_entries?.vehicle_entry_jobs) ? wo.vehicle_entries.vehicle_entry_jobs : [];
      const estJob = jobs.reduce((sum: number, j: any) => sum + getJobEstimate(j), 0);

      const bills = Array.isArray(wo.billings) ? wo.billings : [];
      const finalPartFromBilling = bills
        .filter((b: any) => b.is_info_only !== true && String(b.item_type || '').toUpperCase() === 'PART')
        .reduce((sum: number, b: any) => sum + (Number(b.total_price || 0) || Number(b.unit_price || 0) * Number(b.qty || 0)), 0);

      const actualPart = Number(wo.po_part_total || 0) > 0 ? Number(wo.po_part_total || 0) : finalPartFromBilling;

      if (isWorkOrderCancelled(status) || status === 'OPEN') return 0;
      if (status === 'IN_PROGRESS') return actualPart;
      if (isWorkOrderDone(status)) return estJob + (actualPart > 0 ? actualPart : Math.max(0, totalEstimate - estJob));
      return bills
        .filter((b: any) => b.is_info_only !== true)
        .reduce((sum: number, b: any) => sum + (Number(b.total_price || 0) || Number(b.unit_price || 0) * Number(b.qty || 0)), 0);
  };

  const getVehicleGroupLabel = (wo: any) => {
    const vehicleType = String(wo.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
    if (vehicleType.includes('R2 KECIL') || vehicleType.includes('R2_KECIL')) return 'R2 Kecil';
    if (vehicleType.includes('R2')) return 'R2';
    if (vehicleType.includes('R4')) return 'R4';
    
    // Fallback to service_group if vehicle_type is not specific enough
    const serviceGroup = String(wo.vehicle_entries?.service_group || '').toUpperCase();
    if (serviceGroup.includes('R2 KECIL') || serviceGroup.includes('R2_KECIL')) return 'R2 Kecil';
    if (serviceGroup.includes('R2')) return 'R2';
    if (serviceGroup.includes('R4')) return 'R4';

    return 'Lainnya';
  };

  const exportToExcel = () => {
    const dataForExport = filteredData.map(wo => ({
        'No. WO': wo.wo_number,
        'Tanggal': formatDate(wo.work_date),
        'Status': wo.status,
        'Mekanik': wo.mechanics?.name || '-',
        'No. Polisi': wo.vehicle_entries?.vehicles?.license_plate || '-',
        'Nama Kendaraan': wo.vehicle_entries?.vehicles?.brand_type || '-',
        'Group': getVehicleGroupLabel(wo),
        'Total Estimasi': calculateTotalEstimate(wo),
        'Total Biaya Final': calculateTotalFinal(wo),
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExport);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // No. WO
      { wch: 12 }, // Tanggal
      { wch: 15 }, // Status
      { wch: 20 }, // Mekanik
      { wch: 15 }, // No. Polisi
      { wch: 20 }, // Nama Kendaraan
      { wch: 10 }, // Group
      { wch: 18 }, // Total Estimasi
      { wch: 18 }, // Total Biaya Final
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan WO");
    XLSX.writeFile(wb, `Laporan_WO_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Laporan Work Order (WO)</h2>
        <div className="flex flex-wrap gap-2">
           <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm">
              <Calendar className="h-4 w-4 text-gray-500 ml-2" />
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
              <span className="text-gray-400 font-medium">-</span>
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
           </div>
           <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-10">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="ACTIVE">Aktif (Open / Progress)</SelectItem>
              <SelectItem value="ARCHIVED">Selesai / Ditutup (Arsip)</SelectItem>
              <SelectItem value="OPEN">Belum Mulai (Open)</SelectItem>
              <SelectItem value="IN_PROGRESS">Sedang Dikerjakan</SelectItem>
              <SelectItem value="COMPLETED">Selesai (Completed/Closed)</SelectItem>
              <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
           <Button variant="outline" onClick={exportToExcel}><Download className="mr-2 h-4 w-4" /> Export</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Rincian Work Order</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari bebas berdasarkan kolom laporan..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. WO</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>No. Polisi</TableHead>
                <TableHead>Nama Kendaraan</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Mekanik</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total Estimasi</TableHead>
                <TableHead className="text-right">Total Biaya Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredData.map((wo) => (
                  <TableRow key={wo.id}>
                    <TableCell className="font-medium">{wo.wo_number}</TableCell>
                    <TableCell>{formatDate(wo.work_date)}</TableCell>
                    <TableCell>{wo.vehicle_entries?.vehicles?.license_plate}</TableCell>
                    <TableCell>{wo.vehicle_entries?.vehicles?.brand_type}</TableCell>
                    <TableCell>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {getVehicleGroupLabel(wo)}
                      </span>
                    </TableCell>
                    <TableCell>{wo.mechanics?.name}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getWorkOrderStatusBadgeClass(wo.status)}`}>
                        {getWorkOrderStatusLabel(wo.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(calculateTotalEstimate(wo))}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(calculateTotalFinal(wo))}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
