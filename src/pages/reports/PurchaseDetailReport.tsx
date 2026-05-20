import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Calendar, Search } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

type PurchaseDetailRow = {
  total_count: number | null;
  po_id: string | null;
  po_number: string | null;
  po_date: string | null;
  po_created_at: string | null;
  po_status: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  work_order_id: string | null;
  wo_number: string | null;
  license_plate: string | null;
  vehicle_brand_type: string | null;
  vehicle_type: string | null;
  service_group: string | null;
  line_type: string | null;
  item_type: string | null;
  item_code: string | null;
  item_name: string | null;
  item_brand: string | null;
  unit: string | null;
  qty: number | null;
  unit_price: number | null;
  total_price: number | null;
  received_qty: number | null;
  returned_qty: number | null;
  payment_status_label: string | null;
};

export default function PurchaseDetailReport() {
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const pageSize = 200;
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    setPage(1);
  }, [dateRange, supplierFilter, debouncedSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 6,
  });

  const detailQuery = useQuery({
    queryKey: ['purchaseDetailReport', dateRange.start, dateRange.end, supplierFilter, debouncedSearch, page],
    queryFn: async () => {
      const p_start_date = dateRange.start || null;
      const p_end_date = dateRange.end || null;
      const p_supplier_id = supplierFilter === 'ALL' ? null : supplierFilter;
      const p_query = String(debouncedSearch || '').trim() || null;
      const p_limit = pageSize;
      const p_offset = (page - 1) * pageSize;

      const [{ data: summaryRows, error: summaryErr }, { data: rows, error: rowsErr }] = await Promise.all([
        supabase.rpc('purchase_detail_report_summary', {
          p_start_date,
          p_end_date,
          p_supplier_id,
          p_query,
        }),
        supabase.rpc('purchase_detail_report_rows', {
          p_start_date,
          p_end_date,
          p_supplier_id,
          p_query,
          p_limit,
          p_offset,
        }),
      ]);

      if (summaryErr) throw summaryErr;
      if (rowsErr) throw rowsErr;

      const summary = Array.isArray(summaryRows) ? (summaryRows[0] as any) : null;
      return {
        summary: {
          total_count: Number(summary?.total_count || 0),
          total_amount: Number(summary?.total_amount || 0),
          total_received_value: Number(summary?.total_received_value || 0),
          item_rows: Number(summary?.item_rows || 0),
        },
        rows: (rows as PurchaseDetailRow[]) || [],
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    if (suppliersQuery.error) toast.error('Gagal memuat supplier: ' + String((suppliersQuery.error as any)?.message || suppliersQuery.error));
  }, [suppliersQuery.error]);

  useEffect(() => {
    if (detailQuery.error) toast.error('Gagal memuat rincian pembelian: ' + String((detailQuery.error as any)?.message || detailQuery.error));
  }, [detailQuery.error]);

  const suppliers = suppliersQuery.data || [];
  const data = detailQuery.data?.rows || [];
  const totalRows = Number(detailQuery.data?.summary?.total_count || 0);
  const totalAmount = Number(detailQuery.data?.summary?.total_amount || 0);
  const totalReceivedValue = Number(detailQuery.data?.summary?.total_received_value || 0);
  const totalItems = Number(detailQuery.data?.summary?.item_rows || 0);
  const loading = suppliersQuery.isLoading || detailQuery.isLoading;
  const getVehicleGroupLabel = (row: PurchaseDetailRow) => {
    const sg = String(row.service_group || '').toUpperCase();
    if (sg.includes('R4')) return 'R4';
    if (sg.includes('R2')) return 'R2';
    const vt = String(row.vehicle_type || '').toUpperCase();
    if (vt.includes('R4') || vt.includes('MOBIL') || vt.includes('CAR') || vt.includes('PICKUP') || vt.includes('TRUCK')) return 'R4';
    if (vt.includes('R2') || vt.includes('MOTOR') || vt.includes('BIKE')) return 'R2';
    return '-';
  };

  const getReceiveStatus = (row: PurchaseDetailRow) => {
    const ordered = Number(row.qty || 0);
    const received = Number(row.received_qty || 0);
    if (ordered <= 0) return 'N/A';
    if (received <= 0) return 'Belum';
    if (received + 1e-9 < ordered) return 'Parsial';
    return 'Sudah';
  };

  const totalDiff = totalAmount - totalReceivedValue;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const exportToExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const p_start_date = dateRange.start || null;
      const p_end_date = dateRange.end || null;
      const p_supplier_id = supplierFilter === 'ALL' ? null : supplierFilter;
      const p_query = String(debouncedSearch || '').trim() || null;

      const exportLimit = 2000;
      const rowsAll: PurchaseDetailRow[] = [];
      let offset = 0;
      const maxRows = 50000;

      while (offset < totalRows && offset < maxRows) {
        const { data: rows, error } = await supabase.rpc('purchase_detail_report_rows', {
          p_start_date,
          p_end_date,
          p_supplier_id,
          p_query,
          p_limit: exportLimit,
          p_offset: offset,
        });
        if (error) throw error;
        const batch = (rows as PurchaseDetailRow[]) || [];
        rowsAll.push(...batch);
        if (batch.length < exportLimit) break;
        offset += exportLimit;
      }

      const flattenData = rowsAll.map((r) => ({
        'No. PO': r.po_number,
        'Tanggal': formatDate(r.po_date || r.po_created_at),
        'Supplier': r.supplier_name,
        'Status PO': r.po_status,
        'Status Bayar': r.payment_status_label,
        'No. WO': r.wo_number || '-',
        'Group': getVehicleGroupLabel(r),
        'Nopol': r.license_plate || '-',
        'Nama Kendaraan': r.vehicle_brand_type || '-',
        'Tipe': r.item_type || '-',
        'Kode Barang': r.item_code || '',
        'Nama Barang': r.item_name || '',
        'Merk/Tipe Barang': String(r.item_brand || '').trim(),
        'Qty': Number(r.qty || 0),
        'Qty Diterima': Number(r.received_qty || 0),
        'Qty Retur': Number(r.returned_qty || 0),
        'Status Terima': getReceiveStatus(r),
        'Satuan': r.unit || '',
        'Harga Satuan': Number(r.unit_price || 0),
        'Total Harga': Number(r.total_price || 0),
      }));

      const ws = XLSX.utils.json_to_sheet(flattenData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rincian Pembelian');
      XLSX.writeFile(wb, `Rincian_Pembelian_${dateRange.start}_${dateRange.end}.xlsx`);
    } catch (error) {
      toast.error('Gagal export: ' + String((error as any)?.message || error));
    } finally {
      setExporting(false);
    }
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
           <Button variant="outline" disabled={loading || exporting || totalRows === 0} onClick={exportToExcel}>
             <Download className="mr-2 h-4 w-4" /> Export
           </Button>
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
          <CardContent><div className="text-2xl font-bold">{totalItems}</div></CardContent>
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
              <Input placeholder="Cari bebas berdasarkan kolom laporan..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
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
              {data.length === 0 ? (
                <TableRow><TableCell colSpan={16} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                data.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{formatDate(item.po_date || item.po_created_at)}</TableCell>
                    <TableCell className="font-medium">{item.po_number}</TableCell>
                    <TableCell>{item.supplier_name}</TableCell>
                    <TableCell>{String(item.po_status || '-')}</TableCell>
                    <TableCell>{String(item.payment_status_label || 'Belum Ditagih')}</TableCell>
                    <TableCell>{item.wo_number || '-'}</TableCell>
                    <TableCell>{getVehicleGroupLabel(item)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.license_plate || '-'}</div>
                      <div className="text-xs text-gray-500">{item.vehicle_brand_type || '-'}</div>
                    </TableCell>
                    <TableCell>{item.item_type || '-'}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.item_name || ''}</div>
                      <div className="text-xs text-gray-500">
                        {(() => {
                          const code = String(item.item_code || '').trim();
                          const merk = String(item.item_brand || '').trim();
                          if (code && merk) return `${code} • ${merk}`;
                          if (merk) return merk;
                          return code;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {Number(item.qty || 0)} <span className="text-xs text-gray-500">{item.unit || ''}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {Number(item.received_qty || 0)} <span className="text-xs text-gray-500">{item.unit || ''}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {Number(item.returned_qty || 0)} <span className="text-xs text-gray-500">{item.unit || ''}</span>
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
                    <TableCell className="text-right">{formatCurrency(Number(item.unit_price || 0))}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(Number(item.total_price || 0))}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="text-sm text-muted-foreground">
              {totalRows === 0
                ? 'Tidak ada data'
                : `Menampilkan ${(page - 1) * pageSize + 1}-${Math.min((page - 1) * pageSize + data.length, totalRows)} dari ${totalRows} baris`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Sebelumnya
              </Button>
              <div className="text-sm">
                Halaman {page} / {totalPages}
              </div>
              <Button
                variant="outline"
                disabled={loading || page >= totalPages}
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
