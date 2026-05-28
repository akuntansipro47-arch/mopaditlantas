import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Calendar, Search } from 'lucide-react';
import { formatDate, matchesFreeSearch } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function GoodsIssueReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
              vehicles (license_plate)
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

  const filteredData = data.filter((item) =>
    matchesFreeSearch(search, [
      item.issue_number,
      item.issue_date,
      item.work_orders?.wo_number,
      item.work_orders?.vehicle_entries?.vehicles?.license_plate,
      item.work_orders?.vehicle_entries?.nota_dinas_number,
      (item.items || []).map((x: any) => x.goods?.item_code).filter(Boolean).join(' '),
      (item.items || []).map((x: any) => x.goods?.name).filter(Boolean).join(' '),
      (item.items || []).reduce((sum: number, x: any) => sum + Number(x?.quantity || 0), 0),
      (item.items || []).length,
    ])
  );

  const exportToExcel = () => {
    const flattenData = filteredData.flatMap(issue => 
      issue.items.map((item: any) => ({
        'No. Pengeluaran': issue.issue_number,
        'Tanggal': formatDate(issue.issue_date),
        'No. WO': issue.work_orders?.wo_number,
        'No. Polisi': issue.work_orders?.vehicle_entries?.vehicles?.license_plate,
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
           <Button variant="outline" onClick={exportToExcel}><Download className="mr-2 h-4 w-4" /> Export</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Rincian Pengeluaran</CardTitle>
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
                <TableHead>No. Transaksi</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>No. WO</TableHead>
                <TableHead>Kendaraan</TableHead>
                <TableHead className="text-center">Total Item</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.issue_number}</TableCell>
                    <TableCell>{formatDate(item.issue_date)}</TableCell>
                    <TableCell>{item.work_orders?.wo_number || '-'}</TableCell>
                    <TableCell>{item.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'}</TableCell>
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
