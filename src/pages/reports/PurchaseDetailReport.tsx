import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { addDays, format, parseISO } from 'date-fns';
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
  const [jobTypesMap, setJobTypesMap] = useState<Record<string, { job_name: string; job_group: string | null; job_code?: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [receivedQtyMap, setReceivedQtyMap] = useState<Record<string, number>>({});
  const [returnedQtyMap, setReturnedQtyMap] = useState<Record<string, number>>({});
  const [paymentStatusLabelMap, setPaymentStatusLabelMap] = useState<Record<string, string>>({});
  const pageSize = 200;
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [dateRange, supplierFilter]);

  useEffect(() => {
    fetchData();
  }, [dateRange, supplierFilter, page]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      fetchData();
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers(data || []);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const startDate = String(dateRange.start || '');
      const endDate = String(dateRange.end || '');
      const endExclusive = endDate ? format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd') : '';
      const hasSearch = String(search || '').trim().length > 0;
      const from = hasSearch ? 0 : (page - 1) * pageSize;
      const to = hasSearch ? 4999 : page * pageSize - 1;

      let query = supabase
        .from('purchase_orders')
        .select(
          `
            id,
            po_number,
            po_date,
            created_at,
            status,
            supplier_id,
            suppliers (name, id),
            work_orders (
              id,
              wo_number,
              vehicle_entries (
                service_group,
                vehicles (license_plate, brand_type, vehicle_type)
              )
            )
          `,
          { count: 'exact' }
        )
        .order('po_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (startDate && endDate) {
        query = query.or(
          `and(po_date.gte.${startDate},po_date.lte.${endDate}),and(po_date.is.null,created_at.gte.${startDate},created_at.lt.${endExclusive})`
        );
      } else if (startDate) {
        query = query.or(`po_date.gte.${startDate},and(po_date.is.null,created_at.gte.${startDate})`);
      } else if (endDate) {
        query = query.or(`po_date.lte.${endDate},and(po_date.is.null,created_at.lt.${endExclusive})`);
      }
      if (supplierFilter !== 'ALL') query = query.eq('supplier_id', supplierFilter);
      query = query.neq('status', 'CANCELLED');

      const { data: pos, error, count } = await query;
      if (error) throw error;

      setTotalRows(Number(count || 0));

      const poRows = (pos as any[]) || [];
      const flatten: any[] = [];
      const poIds: string[] = [];
      const nextPaymentLabelMap: Record<string, string> = {};
      const nextReturnedMap: Record<string, number> = {};

      poRows.forEach((po: any) => {
        const poId = String(po?.id || '');
        if (!poId) return;
        poIds.push(poId);
      });

      const [itemsRes, invoicesRes, returnsRes] = await Promise.all([
        poIds.length
          ? supabase
              .from('purchase_order_items')
              .select(
                `
                po_id,
                line_type,
                job_type_id,
                service_name,
                quantity,
                unit_price,
                total_price,
                goods (id, name, item_code, unit, item_type)
              `
              )
              .in('po_id', poIds)
          : Promise.resolve({ data: [], error: null } as any),
        poIds.length ? supabase.from('purchase_invoices').select('po_id, status').in('po_id', poIds) : Promise.resolve({ data: [], error: null } as any),
        poIds.length ? supabase.from('purchase_returns').select('id, po_id').in('po_id', poIds) : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (returnsRes.error) throw returnsRes.error;

      const itemsByPo = new Map<string, any[]>();
      ((itemsRes.data as any[]) || []).forEach((it: any) => {
        const poId = String(it?.po_id || '');
        if (!poId) return;
        const arr = itemsByPo.get(poId) || [];
        arr.push(it);
        itemsByPo.set(poId, arr);
      });

      const invoicesByPo = new Map<string, string[]>();
      ((invoicesRes.data as any[]) || []).forEach((inv: any) => {
        const poId = String(inv?.po_id || '');
        const st = String(inv?.status || '').toUpperCase();
        if (!poId) return;
        const arr = invoicesByPo.get(poId) || [];
        if (st) arr.push(st);
        invoicesByPo.set(poId, arr);
      });

      const returns = (returnsRes.data as any[]) || [];
      const returnIdToPoId = new Map<string, string>();
      const returnIds: string[] = [];
      returns.forEach((r: any) => {
        const rid = String(r?.id || '');
        const poId = String(r?.po_id || '');
        if (!rid || !poId) return;
        returnIdToPoId.set(rid, poId);
        returnIds.push(rid);
      });

      if (returnIds.length > 0) {
        const { data: retItems, error: retItemErr } = await supabase
          .from('purchase_return_items')
          .select('return_id, goods_id, quantity_returned')
          .in('return_id', returnIds);
        if (retItemErr) throw retItemErr;
        (retItems || []).forEach((it: any) => {
          const rid = String(it?.return_id || '');
          const poId = String(returnIdToPoId.get(rid) || '');
          const gid = String(it?.goods_id || '');
          const qty = Number(it?.quantity_returned || 0);
          if (!poId || !gid || !Number.isFinite(qty) || qty === 0) return;
          const key = `${poId}:${gid}`;
          nextReturnedMap[key] = (nextReturnedMap[key] || 0) + qty;
        });
      }

      poRows.forEach((po: any) => {
        const poId = String(po?.id || '');
        if (!poId) return;

        const invStatuses = invoicesByPo.get(poId) || [];
        let statusBayar = 'Belum Ditagih';
        if (invStatuses.includes('PAID')) statusBayar = 'Lunas';
        else if (invStatuses.includes('PARTIAL')) statusBayar = 'Bayar Sebagian';
        else if (invStatuses.length > 0) statusBayar = 'Belum Lunas';
        nextPaymentLabelMap[poId] = statusBayar;

        const items = itemsByPo.get(poId) || [];
        if (items.length === 0) {
          flatten.push({
            po_id: poId,
            line_type: '',
            job_type_id: '',
            service_name: '',
            quantity: 0,
            unit_price: 0,
            total_price: 0,
            goods: null,
            purchase_orders: po,
          });
          return;
        }

        items.forEach((it: any) => {
          flatten.push({ ...it, purchase_orders: po });
        });
      });

      setPaymentStatusLabelMap(nextPaymentLabelMap);
      setReturnedQtyMap(nextReturnedMap);

      const jobTypeIds = Array.from(new Set(flatten.map((it: any) => String(it.job_type_id || '').trim()).filter(Boolean)));
      if (jobTypeIds.length > 0) {
        let jobTypes: any[] = [];
        const attempt1 = await supabase
          .from('job_types')
          .select('id, job_name, job_group, job_code')
          .in('id', jobTypeIds);
        if (!attempt1.error) {
          jobTypes = (attempt1.data as any[]) || [];
        } else {
          const attempt2 = await supabase
            .from('job_types')
            .select('id, job_name, job_group')
            .in('id', jobTypeIds);
          if (attempt2.error) throw attempt2.error;
          jobTypes = (attempt2.data as any[]) || [];
        }

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

      const nextReceivedMap: Record<string, number> = {};
      if (poIds.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < poIds.length; i += chunkSize) {
          const chunk = poIds.slice(i, i + chunkSize);
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
            .in('po_id', chunk);
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
      }

      setReceivedQtyMap(nextReceivedMap);
      setData(flatten);
    } catch (error) {
      console.error('Error fetching Purchase Details:', error);
      toast.error('Gagal memuat rincian pembelian: ' + String((error as any)?.message || error));
      setData([]);
      setReceivedQtyMap({});
      setReturnedQtyMap({});
      setPaymentStatusLabelMap({});
      setTotalRows(0);
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
    if (item.goods?.name) return item.goods.name;
    if (Number(item.quantity || 0) === 0 && Number(item.unit_price || 0) === 0 && Number(item.total_price || 0) === 0) return '(Tidak ada item)';
    return '';
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
    const poId = String(item.purchase_orders?.id || item.po_id || '');
    const gid = String(item.goods?.id || '');
    return poId && gid ? `${poId}:${gid}` : '';
  };

  const getReceivedQty = (item: any) => {
    if (isJasa(item)) return Number(item.quantity || 0);
    const key = receivedKey(item);
    return key ? Number(receivedQtyMap[key] || 0) : 0;
  };

  const getReturnedQty = (item: any) => {
    if (isJasa(item)) return 0;
    const poId = String(item.purchase_orders?.id || item.po_id || '');
    const gid = String(item.goods?.id || '');
    if (!poId || !gid) return 0;
    const key = `${poId}:${gid}`;
    return Number(returnedQtyMap[key] || 0);
  };

  const getPaymentStatusLabel = (item: any) => {
    const poId = String(item.purchase_orders?.id || item.po_id || '');
    return poId ? String(paymentStatusLabelMap[poId] || 'Belum Ditagih') : 'Belum Ditagih';
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
  const hasSearch = String(search || '').trim().length > 0;
  const totalPages = hasSearch ? 1 : Math.max(1, Math.ceil(totalRows / pageSize));

  const exportToExcel = () => {
    const flattenData = filteredData.map(item => ({
      'No. PO': item.purchase_orders?.po_number,
      'Tanggal': formatDate(item.purchase_orders?.po_date || item.purchase_orders?.created_at),
      'Supplier': item.purchase_orders?.suppliers?.name,
      'Status PO': item.purchase_orders?.status,
      'Status Bayar': getPaymentStatusLabel(item),
      'No. WO': item.purchase_orders?.work_orders?.wo_number || '-',
      'Group': getVehicleGroupLabel(item),
      'Nopol': item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '-',
      'Nama Kendaraan': item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '-',
      'Tipe': getItemTypeLabel(item),
      'Kode Barang': getItemCode(item),
      'Nama Barang': getItemName(item),
      'Qty': item.quantity,
      'Qty Diterima': getReceivedQty(item),
      'Qty Retur': getReturnedQty(item),
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
                <TableHead>Status PO</TableHead>
                <TableHead>Pembayaran</TableHead>
                <TableHead>No. WO</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Kendaraan</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Nama Barang</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-center">Diterima</TableHead>
                <TableHead className="text-center">Retur</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Harga Satuan</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={16} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredData.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{formatDate(item.purchase_orders?.po_date || item.purchase_orders?.created_at)}</TableCell>
                    <TableCell className="font-medium">{item.purchase_orders?.po_number}</TableCell>
                    <TableCell>{item.purchase_orders?.suppliers?.name}</TableCell>
                    <TableCell>{String(item.purchase_orders?.status || '-')}</TableCell>
                    <TableCell>{getPaymentStatusLabel(item)}</TableCell>
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
                    <TableCell className="text-center">
                      {getReturnedQty(item)} <span className="text-xs text-gray-500">{getUnitLabel(item)}</span>
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

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="text-sm text-muted-foreground">
              {String(search || '').trim()
                ? `Mode pencarian: menampilkan ${filteredData.length} baris (ambil max 5000 PO)`
                : `Menampilkan ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalRows)} dari ${totalRows} PO`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={loading || hasSearch || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Sebelumnya
              </Button>
              <div className="text-sm">
                Halaman {page} / {totalPages}
              </div>
              <Button
                variant="outline"
                disabled={loading || hasSearch || page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
