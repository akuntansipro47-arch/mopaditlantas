import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Download, TrendingUp, DollarSign, Package } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

export default function InventoryValueReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Fetch Goods
      const { data: goods, error: goodsError } = await supabase
        .from('goods')
        .select('*')
        .order('name');
      
      if (goodsError) throw goodsError;

      // 2. Fetch Latest Received PO Items for Pricing
      // Strategy: Ambil PO item dari PO yang sudah diterima (PART/FULL), lalu ambil harga terakhir per barang.
      const { data: poItems, error: poError } = await supabase
        .from('purchase_order_items')
        .select(`
          goods_id,
          unit_price,
          created_at,
          purchase_orders!inner (status, po_date)
        `)
        .in('purchase_orders.status', ['RECEIVED_PART', 'RECEIVED_FULL'])
        .order('po_date', { foreignTable: 'purchase_orders', ascending: false })
        .order('created_at', { ascending: false });

      if (poError) throw poError;

      // Create a map of goods_id -> latest_price
      const priceMap = new Map();
      poItems?.forEach(item => {
        const price = Number((item as any).unit_price) || 0;
        if (!priceMap.has(item.goods_id) && price > 0) {
          priceMap.set(item.goods_id, price);
        }
      });

      // 3. Combine Data
      const reportData = goods.map(item => {
        const costPrice = priceMap.get(item.id) || 0;
        const totalValue = (item.current_stock || 0) * costPrice;
        
        return {
          ...item,
          cost_price: costPrice,
          total_value: totalValue,
          price_source: priceMap.has(item.id) ? 'PO Diterima Terakhir' : 'N/A'
        };
      });

      // Sort by Total Value Desc
      reportData.sort((a, b) => b.total_value - a.total_value);

      setData(reportData);
    } catch (error: any) {
      console.error('Error fetching Inventory Value:', error);
      toast.error('Gagal mengambil data: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.item_code.toLowerCase().includes(search.toLowerCase())
  );

  const totalAssetValue = filteredData.reduce((sum, item) => sum + item.total_value, 0);
  const totalItems = filteredData.length;
  const totalStockCount = filteredData.reduce((sum, item) => sum + (item.current_stock || 0), 0);

  const exportToExcel = () => {
    const exportData = filteredData.map(item => ({
      'Kode Barang': item.item_code,
      'Nama Barang': item.name,
      'Kategori': item.item_type,
      'Stok Saat Ini': item.current_stock,
      'Satuan': item.unit,
      'Harga Beli Terakhir': item.cost_price,
      'Nilai Persediaan': item.total_value,
      'Sumber Harga': item.price_source
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nilai Persediaan");
    XLSX.writeFile(wb, `Laporan_Nilai_Persediaan_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Laporan Nilai Persediaan</h2>
          <p className="text-sm text-slate-500">Valuasi stok barang berdasarkan harga pembelian terakhir.</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" onClick={exportToExcel} className="shadow-sm">
             <Download className="mr-2 h-4 w-4" /> Export Excel
           </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Nilai Aset</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalAssetValue)}</div>
            <p className="text-xs text-slate-500">Estimasi nilai stok saat ini</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Item Barang</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{totalItems}</div>
            <p className="text-xs text-slate-500">Jenis barang terdaftar</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Fisik Stok</CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{totalStockCount.toLocaleString()}</div>
            <p className="text-xs text-slate-500">Unit barang tersedia</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md border-slate-200">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Rincian Valuasi</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Cari Nama / Kode Barang..." 
                className="pl-8 bg-white" 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-semibold text-slate-700">Kode</TableHead>
                <TableHead className="font-semibold text-slate-700">Nama Barang</TableHead>
                <TableHead className="font-semibold text-slate-700">Kategori</TableHead>
                <TableHead className="text-center font-semibold text-slate-700">Stok Fisik</TableHead>
                <TableHead className="text-right font-semibold text-slate-700">Harga Beli (Est)</TableHead>
                <TableHead className="text-right font-semibold text-slate-700">Total Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Tidak ada data ditemukan.</TableCell></TableRow>
              ) : (
                filteredData.map((item) => (
                  <TableRow key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="font-medium text-slate-600">{item.item_code}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.unit}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-xs">
                        {item.item_type?.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-bold text-slate-700">{item.current_stock}</TableCell>
                    <TableCell className="text-right text-slate-600">
                      {formatCurrency(item.cost_price)}
                      {item.price_source === 'N/A' && <span className="text-red-400 ml-1 text-[10px]">(0)</span>}
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-600">{formatCurrency(item.total_value)}</TableCell>
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

// Simple Badge component if not imported
function Badge({ children, className, variant }: any) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className} ${variant === 'outline' ? 'border-slate-200 text-slate-500' : 'bg-primary text-primary-foreground'}`}>
      {children}
    </span>
  )
}
