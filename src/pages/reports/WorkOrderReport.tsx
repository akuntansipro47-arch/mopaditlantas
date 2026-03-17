import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Calendar, Search } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function WorkOrderReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('ALL');
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
            vehicles (license_plate, brand_type, vehicle_type)
          ),
          billings:work_order_billings (
            item_type,
            item_name,
            qty,
            unit_price,
            total_price
          )
        `)
        .gte('work_date', dateRange.start)
        .lte('work_date', dateRange.end)
        .order('work_date', { ascending: false });

      if (statusFilter === 'ACTIVE') {
        // "Sedang Dikerjakan" means OPEN (Not Started) or IN_PROGRESS (Started)
        query = query.in('status', ['OPEN', 'IN_PROGRESS']);
      } else if (statusFilter === 'ARCHIVED') {
        // "Arsip" usually means COMPLETED or CLOSED
        query = query.in('status', ['COMPLETED', 'CLOSED']);
      } else if (statusFilter !== 'ALL') {
        // Specific status filter
        if (statusFilter === 'COMPLETED') {
             // For user convenience, "Selesai" often implies both COMPLETED and CLOSED
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
      
      setData(result || []);
    } catch (error) {
      console.error('Error fetching WO report:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter(item => 
    (item.wo_number && item.wo_number.toLowerCase().includes(search.toLowerCase())) ||
    (item.vehicle_entries?.vehicles?.license_plate && item.vehicle_entries.vehicles.license_plate.toLowerCase().includes(search.toLowerCase()))
  );

  const summaryByType = filteredData.reduce((acc: any, item: any) => {
    const vt = String(item.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
    const key =
      vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL') ? 'R2 Kecil' :
      vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL') ? 'R4' :
      vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR') ? 'R2' :
      'Lainnya';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const filteredByType = vehicleTypeFilter === 'ALL'
    ? filteredData
    : filteredData.filter((item: any) => {
        const vt = String(item.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
        if (vehicleTypeFilter === 'R2_KECIL') {
          return vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL');
        }
        if (vehicleTypeFilter === 'R4') {
          return vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL');
        }
        return vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR');
      });

  const calculateTotal = (wo: any) => {
      // If billings exist, use them. 
      if (wo.billings && wo.billings.length > 0) {
          return wo.billings.reduce((sum: number, b: any) => sum + (b.total_price || 0), 0);
      }
      // Fallback: If no billings (e.g. old data), use estimated cost if available? 
      // Or simply return 0.
      return 0;
  };

  const exportToExcel = () => {
    const flattenData = filteredByType.flatMap(wo => {
        // Handle cases with no billings gracefully
        const billings = wo.billings && wo.billings.length > 0 ? wo.billings : [{}];
        
        return billings.map((bill: any) => ({
            'No. WO': wo.wo_number,
            'Tanggal': formatDate(wo.work_date), // Changed from start_date to work_date
            'Status': wo.status,
            'Mekanik': wo.mechanics?.name || '-',
            'No. Polisi': wo.vehicle_entries?.vehicles?.license_plate || '-',
            'Merk/Type': wo.vehicle_entries?.vehicles?.brand_type || '-',
            'Jenis': wo.vehicle_entries?.vehicles?.vehicle_type || '-',
            'Group': wo.vehicle_entries?.service_group || '-',
            'Item Pekerjaan/Part': bill.item_name || '-',
            'Tipe': bill.item_type || '-',
            'Qty': bill.qty || 0,
            'Total Harga': bill.total_price || 0
        }));
    });

    const ws = XLSX.utils.json_to_sheet(flattenData);
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
          <Select value={vehicleTypeFilter} onValueChange={setVehicleTypeFilter}>
            <SelectTrigger className="w-[140px] h-10">
              <SelectValue placeholder="Jenis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Jenis</SelectItem>
              <SelectItem value="R4">R4</SelectItem>
              <SelectItem value="R2">R2</SelectItem>
              <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
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
              <Input placeholder="Cari No WO / Nopol..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <div className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">R4: {summaryByType['R4'] || 0}</div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">R2: {summaryByType['R2'] || 0}</div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">R2 Kecil: {summaryByType['R2 Kecil'] || 0}</div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. WO</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>No. Polisi</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Mekanik</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total Biaya</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredByType.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredByType.map((wo) => (
                  <TableRow key={wo.id}>
                    <TableCell className="font-medium">{wo.wo_number}</TableCell>
                    <TableCell>{formatDate(wo.work_date)}</TableCell>
                    <TableCell>{wo.vehicle_entries?.vehicles?.license_plate}</TableCell>
                    <TableCell className="font-semibold">{wo.vehicle_entries?.vehicles?.vehicle_type || '-'}</TableCell>
                    <TableCell>{wo.mechanics?.name}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-semibold 
                        ${wo.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {wo.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(calculateTotal(wo))}</TableCell>
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
