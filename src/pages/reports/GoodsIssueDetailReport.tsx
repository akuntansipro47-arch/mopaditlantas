import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Calendar, Search } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function GoodsIssueDetailReport() {
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
      // 1. Fetch raw items
      const { data: rawItems, error } = await supabase
        .from('goods_issue_items')
        .select(`
          quantity,
          is_info_only,
          goods (item_code, name, unit),
          goods_issues (
            issue_number,
            issue_date,
            work_orders (
              wo_number,
              vehicle_entries (
                nota_dinas_number,
                vehicles (license_plate, brand_type)
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

            return {
                tgl_keluar: issue?.issue_date,
                no_wo: wo?.wo_number || '-',
                nopol: vehicle?.license_plate || '-',
                merk_tipe: vehicle?.brand_type || '-',
                item_name: good?.name || '-',
                kode_barang: good?.item_code || '-',
                qty: item.is_info_only ? 0 : item.quantity,
                real_qty: item.quantity, // Keep track of real qty for info
                is_info_only: item.is_info_only,
                satuan: good?.unit || '-',
                keterangan: issue?.notes || '-' 
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

  const filteredData = data.filter(item => 
    (item.nopol && item.nopol.toLowerCase().includes(search.toLowerCase())) ||
    (item.no_wo && item.no_wo.toLowerCase().includes(search.toLowerCase())) ||
    (item.item_name && item.item_name.toLowerCase().includes(search.toLowerCase()))
  );

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.map(item => ({
      'Tgl Keluar': formatDate(item.tgl_keluar),
      'No. WO': item.no_wo,
      'No. Polisi': item.nopol,
      'Merk/Tipe': item.merk_tipe,
      'Kode Barang': item.kode_barang,
      'Nama Item': item.item_name,
      'Qty': item.is_info_only ? 0 : item.qty,
      'Satuan': item.satuan,
      'Keterangan': item.is_info_only ? 'Info Only (+-)' : item.keterangan
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rincian Barang Keluar");
    XLSX.writeFile(wb, `Rincian_Barang_Keluar_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Laporan Detail Barang Keluar</h2>
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
            <CardTitle>Daftar Item Keluar</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari WO / Nopol / Item..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
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
                  <TableHead>Nama Item</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-center">Satuan</TableHead>
                  <TableHead>Keterangan/Sumber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{formatDate(item.tgl_keluar)}</TableCell>
                      <TableCell className="font-medium">{item.no_wo}</TableCell>
                      <TableCell>{item.nopol}</TableCell>
                      <TableCell>{item.merk_tipe}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                            <span>{item.item_name}</span>
                            <span className="text-[10px] text-gray-400">{item.kode_barang}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-bold">
                        {item.is_info_only ? (
                          <span className="text-gray-400">0</span>
                        ) : (
                          item.qty
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs text-gray-500">{item.satuan}</TableCell>
                      <TableCell className="text-xs text-gray-500 truncate max-w-[150px]">
                         {item.is_info_only ? (
                           <span className="text-blue-600 font-semibold italic">Info Only (+-)</span>
                         ) : (
                           item.keterangan
                         )}
                      </TableCell>
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
