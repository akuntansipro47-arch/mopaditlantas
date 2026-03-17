import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Calendar, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from 'xlsx';

export default function GoodsIssueReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: result, error } = await supabase
        .from('goods_issues')
        .select(`
          *,
          work_orders (
            wo_number,
            vehicle_entries (
              nota_dinas_number,
              vehicles (license_plate, vehicle_type)
            )
          ),
          items:goods_issue_items (
            quantity,
            goods (item_code, name, unit)
          )
        `)
        .gte('issue_date', dateRange.start)
        .lte('issue_date', dateRange.end)
        .order('issue_date', { ascending: false });

      if (error) throw error;
      setData(result || []);
    } catch (error) {
      console.error('Error fetching Issue report:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter(item => 
    item.issue_number.toLowerCase().includes(search.toLowerCase()) ||
    item.work_orders?.wo_number.toLowerCase().includes(search.toLowerCase()) ||
    item.work_orders?.vehicle_entries?.vehicles?.license_plate.toLowerCase().includes(search.toLowerCase())
  );

  const summaryByType = filteredData.reduce((acc: any, item: any) => {
    const vt = String(item.work_orders?.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
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
        const vt = String(item.work_orders?.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
        if (vehicleTypeFilter === 'R2_KECIL') {
          return vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL');
        }
        if (vehicleTypeFilter === 'R4') {
          return vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL');
        }
        return vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR');
      });

  const exportToExcel = () => {
    const flattenData = filteredByType.flatMap(issue => 
      issue.items.map((item: any) => ({
        'No. Pengeluaran': issue.issue_number,
        'Tanggal': formatDate(issue.issue_date),
        'No. WO': issue.work_orders?.wo_number,
        'No. Polisi': issue.work_orders?.vehicle_entries?.vehicles?.license_plate,
        'Jenis': issue.work_orders?.vehicle_entries?.vehicles?.vehicle_type || '-',
        'Kode Barang': item.goods?.item_code,
        'Nama Barang': item.goods?.name,
        'Qty Keluar': item.quantity,
        'Satuan': item.goods?.unit
      }))
    );

    const ws = XLSX.utils.json_to_sheet(flattenData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Barang Keluar");
    XLSX.writeFile(wb, `Laporan_Barang_Keluar_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Laporan Barang Keluar</h2>
        <div className="flex flex-wrap gap-2">
           <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm">
              <Calendar className="h-4 w-4 text-gray-500 ml-2" />
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
              <span className="text-gray-400 font-medium">-</span>
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
           </div>
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
            <CardTitle>Rincian Pengeluaran</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari No Issue / WO / Nopol..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
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
                <TableHead>No. Transaksi</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>No. WO</TableHead>
                <TableHead>Kendaraan</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead className="text-center">Total Item</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredByType.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredByType.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.issue_number}</TableCell>
                    <TableCell>{formatDate(item.issue_date)}</TableCell>
                    <TableCell>{item.work_orders?.wo_number || '-'}</TableCell>
                    <TableCell>{item.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'}</TableCell>
                    <TableCell className="font-semibold">{item.work_orders?.vehicle_entries?.vehicles?.vehicle_type || '-'}</TableCell>
                    <TableCell className="text-center">{item.items?.length || 0}</TableCell>
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
