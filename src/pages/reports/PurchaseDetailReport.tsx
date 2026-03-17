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
import { toast } from 'sonner';

export default function PurchaseDetailReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    fetchData();
  }, [dateRange, supplierFilter]);

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers(data || []);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const statusFilter = ['ISSUED', 'RECEIVED_FULL', 'RECEIVED_PART'];

      const { data: posWithDate, error: posWithDateErr } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          po_date,
          created_at,
          status,
          supplier_id,
          work_order_id,
          suppliers (name, id)
        `)
        .in('status', statusFilter)
        .order('created_at', { ascending: false });

      const { data: posNoDate, error: posNoDateErr } = posWithDateErr
        ? await supabase
            .from('purchase_orders')
            .select(`
              id,
              po_number,
              created_at,
              status,
              supplier_id,
              work_order_id,
              suppliers (name, id)
            `)
            .in('status', statusFilter)
            .order('created_at', { ascending: false })
        : { data: null, error: null };

      if (posWithDateErr && posNoDateErr) throw posNoDateErr;

      let purchaseOrders: any[] = (posWithDateErr ? posNoDate : posWithDate) || [];

      purchaseOrders = purchaseOrders.filter((po: any) => {
        const rawDate = po.po_date || (po.created_at ? String(po.created_at).slice(0, 10) : '');
        if (!rawDate) return false;
        if (rawDate < dateRange.start || rawDate > dateRange.end) return false;
        if (supplierFilter !== 'ALL' && po.suppliers?.id !== supplierFilter) return false;
        return true;
      });

      const poMap = new Map(purchaseOrders.map((po: any) => [po.id, po]));
      const poIds = Array.from(poMap.keys());

      if (poIds.length === 0) {
        setData([]);
        return;
      }

      const { data: itemsRaw, error: itemsErr } = await supabase
        .from('purchase_order_items')
        .select(`
          po_id,
          quantity,
          unit_price,
          total_price,
          goods (name, item_code, unit)
        `)
        .in('po_id', poIds);

      if (itemsErr) throw itemsErr;

      let items = (itemsRaw || []).map((item: any) => ({
        ...item,
        purchase_orders: poMap.get(item.po_id) || null,
      }));

      items = items.filter((item: any) => item.purchase_orders);

      const woIds = Array.from(
        new Set(
          items
            .map((item: any) => item.purchase_orders?.work_order_id)
            .filter(Boolean)
        )
      );

      if (woIds.length > 0) {
        const { data: woData, error: woErr } = await supabase
          .from('work_orders')
          .select(`
            id,
            wo_number,
            vehicle_entries (
              id,
              vehicles (license_plate, brand_type, vehicle_type)
            )
          `)
          .in('id', woIds);

        if (woErr) throw woErr;

        const woMap = new Map((woData || []).map((w: any) => [w.id, w]));
        items = items.map((item: any) => ({
          ...item,
          purchase_orders: {
            ...item.purchase_orders,
            work_orders: item.purchase_orders?.work_order_id ? (woMap.get(item.purchase_orders.work_order_id) || null) : null
          }
        }));
      } else {
        items = items.map((item: any) => ({
          ...item,
          purchase_orders: { ...item.purchase_orders, work_orders: null }
        }));
      }

      setData(items);
    } catch (error) {
      const msg =
        (error as any)?.message
          ? String((error as any).message)
          : (error as any)?.error_description
            ? String((error as any).error_description)
            : 'Terjadi kesalahan.';
      console.error('Error fetching Purchase Details:', error);
      toast.error(`Gagal memuat laporan rincian pembelian: ${msg}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter(item => {
    const q = search.toLowerCase();
    const goodsName = String(item.goods?.name || '').toLowerCase();
    const poNumber = String(item.purchase_orders?.po_number || '').toLowerCase();
    const supplierName = String(item.purchase_orders?.suppliers?.name || '').toLowerCase();
    return goodsName.includes(q) || poNumber.includes(q) || supplierName.includes(q);
  });

  const totalAmount = filteredData.reduce((sum, item) => sum + (item.total_price || 0), 0);

  const exportToExcel = () => {
    const flattenData = filteredData.map(item => ({
      'No. PO': item.purchase_orders?.po_number,
      'Tanggal': formatDate(item.purchase_orders?.po_date),
      'Supplier': item.purchase_orders?.suppliers?.name,
      'No. WO': item.purchase_orders?.work_orders?.wo_number || '',
      'Nopol / Kendaraan': item.purchase_orders?.work_orders?.vehicle_entries?.vehicles
        ? `${item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || ''} - ${item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || ''}`.trim()
        : '',
      'Kode Barang': item.goods?.item_code,
      'Nama Barang': item.goods?.name,
      'Qty': item.quantity,
      'Satuan': item.goods?.unit,
      'Harga Satuan': item.unit_price,
      'Total Harga': item.total_price
    }));

    const ws = XLSX.utils.json_to_sheet(flattenData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rincian Pembelian");
    XLSX.writeFile(wb, `Rincian_Pembelian_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Laporan Rincian Pembelian</h2>
        <div className="flex flex-wrap gap-2">
           <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm">
              <Calendar className="h-4 w-4 text-gray-500 ml-2" />
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
              <span className="text-gray-400 font-medium">-</span>
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
           </div>
           <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Supplier</SelectItem>
              {suppliers.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
           <Button variant="outline" onClick={exportToExcel}><Download className="mr-2 h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Nilai Pembelian</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalAmount)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Jumlah Item Barang</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{filteredData.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Daftar Barang Dibeli</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari Barang / PO / Supplier..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>No. PO</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>No. WO</TableHead>
                <TableHead>Nopol / Kendaraan</TableHead>
                <TableHead>Nama Barang</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Harga Satuan</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredData.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{formatDate(item.purchase_orders?.po_date)}</TableCell>
                    <TableCell className="font-medium">{item.purchase_orders?.po_number}</TableCell>
                    <TableCell>{item.purchase_orders?.suppliers?.name}</TableCell>
                    <TableCell className="font-medium text-indigo-700">
                      {item.purchase_orders?.work_orders?.wo_number || '-'}
                    </TableCell>
                    <TableCell>
                      {item.purchase_orders?.work_orders?.vehicle_entries?.vehicles
                        ? `${item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'} - ${item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '-'}`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.goods?.name}</div>
                      <div className="text-xs text-gray-500">{item.goods?.item_code}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.quantity} <span className="text-xs text-gray-500">{item.goods?.unit}</span>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(item.total_price)}</TableCell>
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
