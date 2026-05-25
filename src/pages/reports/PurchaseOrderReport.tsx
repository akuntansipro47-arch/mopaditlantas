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

export default function PurchaseOrderReport() {
  // The throw new Error line for testing has been removed.
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
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
  }, [dateRange, statusFilter, supplierFilter]);

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers(data || []);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const startDate = String(dateRange.start || '');
      const endDate = String(dateRange.end || '');
      const startTs = startDate ? `${startDate}T00:00:00` : '';
      const endTs = endDate ? `${endDate}T23:59:59.999` : '';

      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (name),
          work_orders (wo_number),
          items:purchase_order_items (
            quantity,
            unit_price,
            total_price,
            goods (name, item_code, unit)
          )
        `)
        .order('created_at', { ascending: false });

      if (startDate && endDate) {
        query = query.or(
          `and(po_date.gte.${startDate},po_date.lte.${endDate}),and(po_date.is.null,created_at.gte.${startTs},created_at.lte.${endTs})`
        );
      } else if (startDate) {
        query = query.or(`po_date.gte.${startDate},and(po_date.is.null,created_at.gte.${startTs})`);
      } else if (endDate) {
        query = query.or(`po_date.lte.${endDate},and(po_date.is.null,created_at.lte.${endTs})`);
      }

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      if (supplierFilter !== 'ALL') {
        query = query.eq('supplier_id', supplierFilter);
      }

      const { data: result, error } = await query;
      if (error) throw error;
      setData(result || []);
    } catch (error) {
      console.error('Error fetching PO report:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter(item => 
    item.po_number.toLowerCase().includes(search.toLowerCase()) ||
    item.suppliers?.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = filteredData.reduce((sum, item) => sum + (item.total_amount || 0), 0);

  const exportToExcel = () => {
    const flattenData = filteredData.flatMap(po => 
      po.items.map((item: any) => ({
        'No. PO': po.po_number,
        'No. WO': po.work_orders?.wo_number,
        'Tanggal': formatDate(po.po_date),
        'Supplier': po.suppliers?.name,
        'Status': po.status,
        'Kode Barang': item.goods?.item_code,
        'Nama Barang': item.goods?.name,
        'Qty': item.quantity,
        'Satuan': item.goods?.unit,
        'Harga Satuan': item.unit_price,
        'Total Harga': item.total_price
      }))
    );

    const ws = XLSX.utils.json_to_sheet(flattenData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Pembelian");
    XLSX.writeFile(wb, `Laporan_Pembelian_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Laporan Pembelian (PO)</h2>
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
           <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-10">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ISSUED">Issued</SelectItem>
              <SelectItem value="RECEIVED_PART">Diterima Sebagian</SelectItem>
              <SelectItem value="RECEIVED_FULL">Diterima Penuh</SelectItem>
              <SelectItem value="RETURNED_FULL">Retur Penuh</SelectItem>
              <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
           <Button variant="outline" onClick={exportToExcel}><Download className="mr-2 h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Pembelian</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalAmount)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Jumlah Transaksi</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{filteredData.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Rincian Transaksi</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari No PO / Supplier..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. PO</TableHead>
                <TableHead>No. WO</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Umur PO</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredData.map((po) => {
                  const effectiveDateStr = String(po?.po_date || '').trim() || String(po?.created_at || '').split('T')[0];
                  const effectiveTs = Date.parse(effectiveDateStr);
                  const ageDays =
                    Number.isFinite(effectiveTs) && !Number.isNaN(effectiveTs)
                      ? Math.max(0, Math.floor((Date.now() - effectiveTs) / 86400000))
                      : 0;
                  const isOverdueIssued = String(po?.status || '') === 'ISSUED' && ageDays > 3;
                  return (
                  <TableRow key={po.id} className={isOverdueIssued ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{po.work_orders?.wo_number}</TableCell>
                    <TableCell>{formatDate(po.po_date || po.created_at)}</TableCell>
                    <TableCell>{String(po?.status || '') === 'ISSUED' ? `${ageDays} hari` : '-'}</TableCell>
                    <TableCell>{po.suppliers?.name}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-semibold 
                        ${po.status === 'RECEIVED_FULL' ? 'bg-green-100 text-green-800' : 
                          po.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                        {po.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(po.total_amount)}</TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
