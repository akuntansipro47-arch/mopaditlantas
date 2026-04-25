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

export default function PurchaseDetailReport() {
  const [data, setData] = useState<any[]>([]);
  const [jobTypesMap, setJobTypesMap] = useState<Record<string, { job_name: string; job_group: string | null; job_code?: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [receivedQtyMap, setReceivedQtyMap] = useState<Record<string, number>>({});
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
      // Fetch POs that are RECEIVED (Full or Part) to get the purchased items
      let query = supabase
        .from('purchase_order_items')
        .select(`
          line_type,
          job_type_id,
          service_name,
          quantity,
          unit_price,
          total_price,
          goods (id, name, item_code, unit, item_type),
          purchase_orders (
            id,
            po_number,
            po_date,
            status,
            suppliers (name, id),
            work_orders (
              id,
              wo_number,
              vehicle_entries (
                service_group,
                vehicles (license_plate, brand_type, vehicle_type)
              )
            )
          )
        `)
        // Filter by PO Date via the relationship
        // Note: filtering nested relations in Supabase can be tricky. 
        // We often have to filter on the parent. 
        // But here we start from items.
        // Let's try filtering on the join.
        .gte('purchase_orders.po_date', dateRange.start)
        .lte('purchase_orders.po_date', dateRange.end)
        .in('purchase_orders.status', ['RECEIVED_FULL', 'RECEIVED_PART']);

      const { data: result, error } = await query;
      
      if (error) throw error;

      // Client-side filtering for supplier since deep filtering is complex
      let items = result || [];
      
      // Filter out null purchase_orders (if inner join failed)
      items = items.filter((item: any) => item.purchase_orders);

      if (supplierFilter !== 'ALL') {
        items = items.filter((item: any) => item.purchase_orders.suppliers?.id === supplierFilter);
      }
      
      // Filter by date range (double check as Supabase nested filter might not apply strict INNER JOIN logic depending on setup)
      items = items.filter((item: any) => {
        const poDate = item.purchase_orders.po_date;
        return poDate >= dateRange.start && poDate <= dateRange.end;
      });

      const jobTypeIds = Array.from(
        new Set(
          (items || [])
            .map((it: any) => String(it.job_type_id || '').trim())
            .filter(Boolean)
        )
      );
      if (jobTypeIds.length > 0) {
        const { data: jobTypes, error: jobTypesErr } = await supabase
          .from('job_types')
          .select('id, job_name, job_group, job_code')
          .in('id', jobTypeIds);
        if (jobTypesErr) throw jobTypesErr;
        const next: Record<string, { job_name: string; job_group: string | null; job_code?: string | null }> = {};
        (jobTypes || []).forEach((jt: any) => {
          next[String(jt.id)] = {
            job_name: String(jt.job_name || '').trim(),
            job_group: jt.job_group ?? null,
            job_code: jt.job_code ?? null,
          };
        });
        setJobTypesMap(next);
      } else {
        setJobTypesMap({});
      }

      const poIds = Array.from(new Set(items.map((it: any) => String(it.purchase_orders?.id || '')).filter(Boolean)));
      const nextReceivedMap: Record<string, number> = {};
      if (poIds.length > 0) {
        const { data: receipts, error: receiptErr } = await supabase
          .from('goods_receipts')
          .select(`
            id,
            po_id,
            items:goods_receipt_items (
              goods_id,
              quantity_received
            )
          `)
          .in('po_id', poIds);
        if (receiptErr) throw receiptErr;

        (receipts || []).forEach((r: any) => {
          const poId = String(r.po_id || '');
          const its = Array.isArray(r.items) ? r.items : [];
          its.forEach((it: any) => {
            const gid = String(it.goods_id || '');
            const qty = Number(it.quantity_received || 0);
            if (!poId || !gid || qty <= 0) return;
            const key = `${poId}:${gid}`;
            nextReceivedMap[key] = (nextReceivedMap[key] || 0) + qty;
          });
        });
      }

      setReceivedQtyMap(nextReceivedMap);
      setData(items);
    } catch (error) {
      console.error('Error fetching Purchase Details:', error);
    } finally {
      setLoading(false);
    }
  }

  const isJasa = (item: any) => {
    const lt = String(item?.line_type || '').toUpperCase();
    if (lt === 'JASA') return true;
    const hasJobType = Boolean(String(item?.job_type_id || '').trim());
    if (hasJobType) return true;
    const hasServiceName = Boolean(String(item?.service_name || '').trim());
    return hasServiceName;
  };

  const getItemTypeLabel = (item: any) => {
    if (isJasa(item)) return 'JASA';
    return item.goods?.item_type || '-';
  };

  const getItemName = (item: any) => {
    if (isJasa(item)) {
      const jt = jobTypesMap[String(item.job_type_id || '')];
      return jt?.job_name || String(item.service_name || '').trim() || 'Jasa';
    }
    return item.goods?.name || '';
  };

  const getItemCode = (item: any) => {
    if (isJasa(item)) {
      const jt = jobTypesMap[String(item.job_type_id || '')];
      return jt?.job_code || '-';
    }
    return item.goods?.item_code || '';
  };

  const getUnitLabel = (item: any) => {
    if (isJasa(item)) return '';
    return item.goods?.unit || '';
  };

  const receivedKey = (item: any) => {
    if (isJasa(item)) return '';
    const poId = String(item.purchase_orders?.id || '');
    const gid = String(item.goods?.id || '');
    return poId && gid ? `${poId}:${gid}` : '';
  };

  const getReceivedQty = (item: any) => {
    if (isJasa(item)) return Number(item.quantity || 0);
    const key = receivedKey(item);
    return key ? Number(receivedQtyMap[key] || 0) : 0;
  };

  const getReceiveStatus = (item: any) => {
    if (isJasa(item)) return 'Sudah';
    const ordered = Number(item.quantity || 0);
    const received = getReceivedQty(item);
    if (ordered <= 0) return 'N/A';
    if (received <= 0) return 'Belum';
    if (received + 1e-9 < ordered) return 'Parsial';
    return 'Sudah';
  };

  const getVehicleGroupLabel = (item: any) => {
    const vt = String(item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
    if (vt.includes('R4') || vt.includes('MOBIL') || vt.includes('CAR') || vt.includes('PICKUP') || vt.includes('TRUCK')) return 'R4';
    if (vt.includes('R2') || vt.includes('MOTOR') || vt.includes('BIKE')) return 'R2';
    return '-';
  };

  const filteredData = data.filter(item => 
    getItemName(item).toLowerCase().includes(search.toLowerCase()) ||
    String(item.purchase_orders?.po_number || '').toLowerCase().includes(search.toLowerCase()) ||
    String(item.purchase_orders?.suppliers?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (item.purchase_orders?.work_orders?.wo_number || '').toLowerCase().includes(search.toLowerCase()) ||
    getVehicleGroupLabel(item).toLowerCase().includes(search.toLowerCase()) ||
    (item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '').toLowerCase().includes(search.toLowerCase()) ||
    (item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '').toLowerCase().includes(search.toLowerCase())
  );

  const getTotalPrice = (item: any) => {
    const tp = Number(item.total_price || 0);
    if (tp) return tp;
    return Number(item.quantity || 0) * Number(item.unit_price || 0);
  };

  const totalAmount = filteredData.reduce((sum, item) => sum + getTotalPrice(item), 0);
  const totalReceivedValue = filteredData.reduce((sum, item) => {
    const ordered = Number(item.quantity || 0);
    const received = getReceivedQty(item);
    const unit = Number(item.unit_price || 0);
    const qty = Math.min(ordered, received);
    return sum + qty * unit;
  }, 0);
  const totalDiff = totalAmount - totalReceivedValue;

  const exportToExcel = () => {
    const flattenData = filteredData.map(item => ({
      'No. PO': item.purchase_orders?.po_number,
      'Tanggal': formatDate(item.purchase_orders?.po_date),
      'Supplier': item.purchase_orders?.suppliers?.name,
      'No. WO': item.purchase_orders?.work_orders?.wo_number || '-',
      'Group': getVehicleGroupLabel(item),
      'Nopol': item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '-',
      'Nama Kendaraan': item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '-',
      'Tipe': getItemTypeLabel(item),
      'Kode Barang': getItemCode(item),
      'Nama Barang': getItemName(item),
      'Qty': item.quantity,
      'Qty Diterima': getReceivedQty(item),
      'Status Terima': getReceiveStatus(item),
      'Satuan': getUnitLabel(item),
      'Harga Satuan': item.unit_price,
      'Total Harga': getTotalPrice(item)
    }));

    const ws = XLSX.utils.json_to_sheet(flattenData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rincian Pembelian");
    XLSX.writeFile(wb, `Rincian_Pembelian_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Laporan Rincian Pembelian (Detail)</h2>
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
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Nilai Diterima</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalReceivedValue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Jumlah Item Barang</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{filteredData.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Selisih (PO - Terima)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalDiff)}</div></CardContent>
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
                <TableHead>Group</TableHead>
                <TableHead>Kendaraan</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Nama Barang</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-center">Diterima</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Harga Satuan</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredData.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{formatDate(item.purchase_orders?.po_date)}</TableCell>
                    <TableCell className="font-medium">{item.purchase_orders?.po_number}</TableCell>
                    <TableCell>{item.purchase_orders?.suppliers?.name}</TableCell>
                    <TableCell>{item.purchase_orders?.work_orders?.wo_number || '-'}</TableCell>
                    <TableCell>{getVehicleGroupLabel(item)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'}</div>
                      <div className="text-xs text-gray-500">{item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '-'}</div>
                    </TableCell>
                    <TableCell>{getItemTypeLabel(item)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{getItemName(item)}</div>
                      <div className="text-xs text-gray-500">{getItemCode(item)}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.quantity} <span className="text-xs text-gray-500">{getUnitLabel(item)}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {getReceivedQty(item)} <span className="text-xs text-gray-500">{getUnitLabel(item)}</span>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const s = getReceiveStatus(item);
                        const cls =
                          s === 'Sudah'
                            ? 'bg-green-100 text-green-800'
                            : s === 'Parsial'
                              ? 'bg-yellow-100 text-yellow-800'
                              : s === 'Belum'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-700';
                        return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{s}</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(getTotalPrice(item))}</TableCell>
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
