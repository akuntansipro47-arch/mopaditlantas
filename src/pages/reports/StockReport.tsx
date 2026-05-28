import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Search } from 'lucide-react';
import { matchesFreeSearch } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function StockReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  useEffect(() => {
    fetchData();
  }, [typeFilter]);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Get Goods
      let query = supabase
        .from('goods')
        .select('*')
        .order('name', { ascending: true });

      if (typeFilter !== 'ALL') {
        query = query.eq('item_type', typeFilter);
      }

      const { data: goods, error: goodsError } = await query;
      if (goodsError) throw goodsError;

      // 2. Calculate In/Out/Initial
      // LOGIC FIX:
      // If no date filter is applied (meaning "All Time"), Initial Stock should logically be 0 (or whatever manual initial stock was set, but we don't have that field yet).
      // The previous logic was: Initial = Current - In + Out.
      // This logic is only valid if "In" and "Out" represent the ENTIRE history of the item.
      // If "In" and "Out" are partial (e.g. filtered by date), then Initial Balance = Balance at Start Date.
      
      // However, user complained about negative Initial Balance.
      // Example: Current = 10, In = 20, Out = 4.
      // Initial = 10 - 20 + 4 = -6.
      // This means the system thinks 20 items came in, 4 went out, but we only have 10 left.
      // Where did the other 6 go?
      // Possibilities:
      // 1. Data inconsistency (Manual stock adjustment in DB without recording transaction).
      // 2. Missing "Out" transactions (e.g. items used but not recorded in Goods Issue).
      
      // TO FIX for User:
      // Since we don't have a perfect ledger yet, we should NOT back-calculate Initial Stock if we are showing "All Time".
      // If showing "All Time", Initial Stock should be 0 (assuming we started from scratch).
      // BUT, if we assume the current stock is correct, and we want to show flow...
      
      // Let's implement a Date Filter to make this report meaningful.
      // If Date Filter is present:
      //   Initial = Stock at Start Date (Calculated by: Current - (In_After_Start) + (Out_After_Start))
      // If Date Filter is NOT present (All Time):
      //   Initial = 0 (Conceptually)
      //   Ending = Current Stock
      //   In = Total In
      //   Out = Total Out
      //   Discrepancy = Ending - (Initial + In - Out) -> This shows manual adjustments.
      
      // For now, to stop the confusion of negative initial stock without a date filter:
      // We will force Initial Stock to be 0 if we are looking at "All Time" view (which is the default now).
      // And we will show "Adjusment/Unknown" column if numbers don't match up.
      
      // Wait, user just wants it to not be negative.
      // If I set Initial = 0, then Ending should be In - Out.
      // If Current != In - Out, then there is a discrepancy.
      
      // Let's change the logic:
      // Fetch ALL transactions.
      const { data: receipts } = await supabase.from('goods_receipt_items').select('goods_id, quantity_received');
      const { data: issues } = await supabase.from('goods_issue_items').select('goods_id, quantity');

      const stockMap = goods?.map(item => {
        const totalIn = receipts?.filter(r => r.goods_id === item.id).reduce((sum, r) => sum + (r.quantity_received || 0), 0) || 0;
        const totalOut = issues?.filter(i => i.goods_id === item.id).reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
        
        // FIXED LOGIC v3: Pure Transactional Reporting
        // User requested to remove discrepancy/deficit columns if they are not from transactions.
        // We will show strictly: Initial (0) + In - Out = Ending.
        // We ignore the database 'current_stock' for this report to avoid confusion.
        
        const initialStock = 0; 
        const calculatedEndingStock = initialStock + totalIn - totalOut;
        
        // We still fetch real stock but we won't display it or the discrepancy
        const realStock = item.current_stock || 0;

        return {
          ...item,
          initial_stock: initialStock,
          total_in: totalIn,
          total_out: totalOut,
          ending_stock: calculatedEndingStock, // PURE CALCULATION
          real_stock: realStock 
        };
      });

      setData(stockMap || []);
    } catch (error) {
      console.error('Error fetching Stock report:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter((item) =>
    matchesFreeSearch(search, [
      item.item_code,
      item.name,
      item.item_type,
      item.unit,
      item.initial_stock,
      item.total_in,
      item.total_out,
      item.ending_stock,
    ])
  );

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.map(item => ({
      'Kode Barang': item.item_code,
      'Nama Barang': item.name,
      'Kategori': item.item_type,
      'Satuan': item.unit,
      'Saldo Awal': item.initial_stock,
      'Masuk (In)': item.total_in,
      'Keluar (Out)': item.total_out,
      'Saldo Akhir': item.ending_stock,
      'Harga Jual': item.selling_price || 0
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Stok");
    XLSX.writeFile(wb, `Laporan_Stok_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Laporan Stok Barang</h2>
        <div className="flex flex-wrap gap-2">
           <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Kategori</SelectItem>
              <SelectItem value="PERSEDIAAN">Persediaan</SelectItem>
              <SelectItem value="NON_PERSEDIAAN">Non Persediaan</SelectItem>
              <SelectItem value="ASET_AKTIVA_TETAP">Aset/Aktiva Tetap</SelectItem>
              <SelectItem value="PERALATAN_WORKSHOP">Peralatan Workshop</SelectItem>
              <SelectItem value="INVENTARIS_KANTOR">Inventaris Kantor</SelectItem>
              <SelectItem value="FURNITURE">Furniture</SelectItem>
              <SelectItem value="PERLENGKAPAN">Perlengkapan</SelectItem>
            </SelectContent>
          </Select>
           <Button variant="outline" onClick={exportToExcel}><Download className="mr-2 h-4 w-4" /> Export</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Stok Barang</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Cari bebas berdasarkan kolom laporan..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama Barang</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-center">Satuan</TableHead>
                <TableHead className="text-center bg-gray-50">Saldo Awal</TableHead>
                <TableHead className="text-center bg-green-50 text-green-700">Masuk (In)</TableHead>
                <TableHead className="text-center bg-red-50 text-red-700">Keluar (Out)</TableHead>
                <TableHead className="text-center font-bold bg-blue-50">Saldo Akhir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-gray-500">{item.item_code}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">
                        {item.item_type.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-xs uppercase text-gray-500">{item.unit}</TableCell>
                    <TableCell className="text-center text-gray-600 bg-gray-50">{item.initial_stock}</TableCell>
                    <TableCell className="text-center font-semibold text-green-600 bg-green-50">+{item.total_in}</TableCell>
                    <TableCell className="text-center font-semibold text-red-600 bg-red-50">-{item.total_out}</TableCell>
                    <TableCell className={`text-center font-bold bg-blue-50 ${item.ending_stock < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                      {item.ending_stock}
                    </TableCell>
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
