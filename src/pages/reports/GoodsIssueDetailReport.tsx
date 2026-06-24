import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Calendar, Search } from 'lucide-react';
import { formatCurrency, formatDate, matchesFreeSearch } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';

export default function GoodsIssueDetailReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const getVehicleGroupLabel = (serviceGroup: any, vehicleType: any) => {
    const sg = String(serviceGroup || '').toUpperCase();
    if (sg.includes('R2_KECIL') || sg.includes('R2 KECIL') || sg.includes('KECIL')) return 'R2 Kecil';
    if (sg.includes('R4')) return 'R4';
    if (sg.includes('R2')) return 'R2';
    const vt = String(vehicleType || '').toUpperCase();
    if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
    if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
    if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
    return '-';
  };

  const getGroupKeyFromLabel = (label: string) => {
    if (label === 'R2') return 'R2';
    if (label === 'R4') return 'R4';
    if (label === 'R2 Kecil') return 'R2_KECIL';
    return '';
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Fetch raw items
      const { data: rawItems, error } = await supabase
        .from('goods_issue_items')
        .select(`
          quantity,
          goods (item_code, name, unit),
          goods_issues (
            issue_number,
            issue_date,
            work_orders (
              wo_number,
              vehicle_entries (
                nota_dinas_number,
                service_group,
                vehicles (license_plate, brand_type, vehicle_type)
              )
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
          console.error("Supabase Error:", error);
          throw error;
      }
      
      console.log("Raw Items Fetched:", rawItems?.length); // Debug log

      // 2. Flatten and Filter in Memory
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);

      const flattened = (rawItems || [])
        .map((item: any) => {
            // Safety checks for nested objects
            const issue = item.goods_issues;
            const wo = issue?.work_orders;
            const vehicle = wo?.vehicle_entries?.vehicles;
            const good = item.goods;
            const groupLabel = getVehicleGroupLabel(wo?.vehicle_entries?.service_group, vehicle?.vehicle_type);

            return {
                tgl_keluar: issue?.issue_date,
                no_wo: wo?.wo_number || '-',
                nopol: vehicle?.license_plate || '-',
                merk_tipe: vehicle?.brand_type || '-',
                group: groupLabel,
                item_name: good?.name || '-',
                kode_barang: good?.item_code || '-',
                qty: item.quantity,
                satuan: good?.unit || '-',
                keterangan: issue?.notes || issue?.issue_number || '-' // notes may not exist in schema
            };
        })
        .filter(item => {
            // Only keep items that have a valid issue date within range
            if (!item.tgl_keluar) return false;
            const d = new Date(item.tgl_keluar);
            return d >= start && d <= end;
        });

      console.log("Filtered Items:", flattened.length); // Debug log
      setData(flattened);
    } catch (error) {
      console.error('Error fetching Issue Detail report:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter(item => {
    const matchSearch = matchesFreeSearch(search, [
      item.tgl_keluar,
      item.no_wo,
      item.nopol,
      item.merk_tipe,
      item.group,
      item.kode_barang,
      item.item_name,
      item.qty,
      item.satuan,
      item.keterangan,
    ]);
    const matchGroup = groupFilter === 'ALL' ? true : getGroupKeyFromLabel(item.group) === groupFilter;
    return matchSearch && matchGroup;
  });

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.map(item => ({
      'Tgl Keluar': formatDate(item.tgl_keluar),
      'No. WO': item.no_wo,
      'No. Polisi': item.nopol,
      'Merk/Tipe': item.merk_tipe,
      'Group': item.group,
      'Kode Barang': item.kode_barang,
      'Nama Item': item.item_name,
      'Qty': item.qty,
      'Satuan': item.satuan,
      'Keterangan': item.keterangan
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rincian Barang Keluar");
    XLSX.writeFile(wb, `Rincian_Barang_Keluar_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-2xl font-bold sm:text-3xl">Laporan Detail Barang Keluar</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
           <div className="flex flex-col gap-2 rounded-md border border-gray-300 bg-white p-2 shadow-sm sm:flex-row sm:items-center sm:gap-2 sm:p-1.5">
              <Calendar className="h-4 w-4 text-gray-500 ml-2" />
              <Input type="date" className="h-9 w-full cursor-pointer border-0 focus-visible:ring-0 sm:w-36" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
              <span className="text-gray-400 font-medium">-</span>
              <Input type="date" className="h-9 w-full cursor-pointer border-0 focus-visible:ring-0 sm:w-36" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
           </div>
           <Button variant="outline" onClick={exportToExcel}><Download className="mr-2 h-4 w-4" /> Export</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Daftar Item Keluar</CardTitle>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Group:</span>
                <Select value={groupFilter} onValueChange={setGroupFilter}>
                  <SelectTrigger className="w-full bg-white sm:w-[140px]"><SelectValue placeholder="Semua" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua</SelectItem>
                    <SelectItem value="R2">R2</SelectItem>
                    <SelectItem value="R4">R4</SelectItem>
                    <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari bebas berdasarkan kolom laporan..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tgl Keluar</TableHead>
                  <TableHead>No. WO</TableHead>
                  <TableHead>No. Polisi</TableHead>
                  <TableHead>Merk/Tipe</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Nama Item</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-center">Satuan</TableHead>
                  <TableHead>Keterangan/Sumber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{formatDate(item.tgl_keluar)}</TableCell>
                      <TableCell className="font-medium">{item.no_wo}</TableCell>
                      <TableCell>{item.nopol}</TableCell>
                      <TableCell>{item.merk_tipe}</TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {item.group}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                            <span>{item.item_name}</span>
                            <span className="text-[10px] text-gray-400">{item.kode_barang}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-bold">{item.qty}</TableCell>
                      <TableCell className="text-center text-xs text-gray-500">{item.satuan}</TableCell>
                      <TableCell className="text-xs text-gray-500 truncate max-w-[150px]">{item.keterangan}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
