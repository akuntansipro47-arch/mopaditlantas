import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { subDays, format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { id as localeID } from 'date-fns/locale';
import { Loader2, FileDown, Calendar, Search } from 'lucide-react';

type ReportData = {
  id: number;
  tgl: string;
  no_po: string;
  supplier: string | null;
  kendaraan: string;
  nopol: string;
  no_wo: string;
  nama_barang: string | null;
  qty: number;
  diterima: number;
  status_bayar: string;
  harga_satuan: number;
  total: number;
};

function normalizeText(input: unknown) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesSearch(row: ReportData, rawQuery: string) {
  const q = normalizeText(rawQuery);
  if (!q) return true;

  const tokens = q.split(' ').filter(Boolean);
  const haystack = normalizeText(
    [
      row.no_po,
      row.supplier,
      row.kendaraan,
      row.nopol,
      row.no_wo,
      row.nama_barang,
    ].filter(Boolean).join(' ')
  );

  return tokens.every(t => haystack.includes(t));
}

export default function PurchaseOrderDetailReport() {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<ReportData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const ITEMS_PER_PAGE = 50;
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip initial mount, user will click button to load first.
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const handler = setTimeout(() => {
      fetchData(1);
    }, 500); // Debounce search input

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  async function fetchData(page = 1) {
    if (!dateRange?.start || !dateRange?.end) {
      toast.error('Silakan pilih rentang tanggal terlebih dahulu.');
      return;
    }

    const hasSearch = normalizeText(searchQuery).length > 0;
    setLoading(true);
    setCurrentPage(hasSearch ? 1 : page);
    if (page === 1) {
      setData([]);
      setTotalPages(0);
    }

    try {
      const startDate = dateRange.start;
      const endDate = dateRange.end;
      const startTs = `${startDate}T00:00:00`;
      const endTs = `${endDate}T23:59:59.999`;

      const from = hasSearch ? 0 : (page - 1) * ITEMS_PER_PAGE;
      const to = hasSearch ? 4999 : from + ITEMS_PER_PAGE - 1;

      // 1. Main query for PO Items, POs, Suppliers, and Goods
      let poQuery = supabase
        .from('purchase_order_items')
        .select(`
          *,
          purchase_orders!inner(*, suppliers:supplier_id(name)),
          goods(name)
        `, { count: 'exact' })
        .or(
          `and(po_date.gte.${startDate},po_date.lte.${endDate}),and(po_date.is.null,created_at.gte.${startTs},created_at.lte.${endTs})`,
          { foreignTable: 'purchase_orders' }
        )
        .order('po_date', { foreignTable: 'purchase_orders', ascending: false })
        .order('created_at', { foreignTable: 'purchase_orders', ascending: false })
        .range(from, to);

      const { data: poItems, error: poError, count: totalCount } = await poQuery;

      if (poError) throw poError;

      if (page === 1) {
        if (hasSearch) {
          setTotalPages(1);
        } else {
        setTotalPages(totalCount ? Math.ceil(totalCount / ITEMS_PER_PAGE) : 0);
        }
      }

      if (!poItems || poItems.length === 0) {
        if (page === 1) {
          setData([]);
          toast.info('Tidak ada data ditemukan untuk rentang tanggal yang dipilih.');
        }
        setLoading(false);
        return;
      }

      const poIds = [...new Set(poItems.map(item => item.purchase_orders.id))];
      const workOrderIds = [...new Set(poItems.map(item => item.purchase_orders.work_order_id).filter(Boolean))];

      // 2. Fetch related data in parallel
      const [
        { data: receipts, error: receiptError },
        { data: invoices, error: invoiceError },
        { data: workOrdersResult, error: woError }
      ] = await Promise.all([
        supabase.from('goods_receipts').select('po_id, items:goods_receipt_items(goods_id, quantity_received)').in('po_id', poIds),
        supabase.from('purchase_invoices').select('po_id, status').in('po_id', poIds),
        supabase.from('work_orders').select('id, wo_number, vehicle_entries(vehicles(id, license_plate, brand_type))').in('id', workOrderIds)
      ]);

      if (receiptError) throw receiptError;
      if (invoiceError) throw invoiceError;
      if (woError) throw woError;
      
      // 3. Create maps for efficient data lookup
      const receivedQtyMap = new Map<string, number>();
      receipts?.forEach(receipt => {
        if (!receipt.po_id) return;
        receipt.items.forEach(item => {
          const key = `${receipt.po_id}-${item.goods_id}`;
          receivedQtyMap.set(key, (receivedQtyMap.get(key) || 0) + item.quantity_received);
        });
      });

      const paymentStatusMap = new Map<number, string>();
      invoices?.forEach(inv => paymentStatusMap.set(inv.po_id, inv.status));

      const workOrderMap = new Map(workOrdersResult?.map(wo => [wo.id, wo]));

      // 4. Combine all data
      const combinedData = poItems.map(item => {
        const po = item.purchase_orders;
        if (!po) return null;

        const workOrder = (po.work_order_id ? workOrderMap.get(po.work_order_id) : null) as any;
        const ve = Array.isArray((workOrder as any)?.vehicle_entries) ? (workOrder as any).vehicle_entries[0] : (workOrder as any)?.vehicle_entries;
        const vehicle = Array.isArray(ve?.vehicles) ? ve.vehicles[0] : ve?.vehicles;
        const paymentStatus = paymentStatusMap.get(po.id);

        let statusBayar = 'Belum Ditagih';
        if (paymentStatus === 'PAID') statusBayar = 'Lunas';
        else if (paymentStatus === 'PARTIAL') statusBayar = 'Bayar Sebagian';
        else if (paymentStatus) statusBayar = 'Belum Lunas';

        const receivedQty = receivedQtyMap.get(`${po.id}-${item.goods_id}`) || 0;

        return {
          id: item.id,
          tgl: po.po_date || po.created_at,
          no_po: po.po_number,
          supplier: po.suppliers?.name || '-',
          kendaraan: vehicle?.brand_type || '-',
          nopol: vehicle?.license_plate || '-',
          no_wo: workOrder?.wo_number || '-',
          nama_barang: item.goods?.name || '-',
          qty: item.quantity,
          diterima: receivedQty,
          status_bayar: statusBayar,
          harga_satuan: item.unit_price,
          total: item.total_price,
        };
      }).filter(Boolean) as ReportData[];

      // Search filtering is now more comprehensive and done on the client-side
      const finalData = combinedData.filter(d => matchesSearch(d, searchQuery));

      setData(finalData);
    } catch (error: any) {
      console.error("Error fetching detailed PO report:", error);
      toast.error('Gagal memuat laporan: ' + error.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllDataForExport() {
    if (!dateRange?.start || !dateRange?.end) {
      toast.error('Silakan pilih rentang tanggal terlebih dahulu.');
      return null;
    }
  
    try {
      let poQuery = supabase
        .from('purchase_order_items')
        .select(`
          *,
          purchase_orders!inner(*, suppliers:supplier_id(name)),
          goods(name)
        `)
        .or(
          `and(po_date.gte.${dateRange.start},po_date.lte.${dateRange.end}),and(po_date.is.null,created_at.gte.${dateRange.start}T00:00:00,created_at.lte.${dateRange.end}T23:59:59.999)`,
          { foreignTable: 'purchase_orders' }
        )
        .order('po_date', { foreignTable: 'purchase_orders', ascending: false })
        .order('created_at', { foreignTable: 'purchase_orders', ascending: false });

      const { data: poItems, error: poError } = await poQuery;
  
      if (poError) throw poError;
      if (!poItems || poItems.length === 0) return [];
  
      const poIds = [...new Set(poItems.map(item => item.purchase_orders.id))];
      const workOrderIds = [...new Set(poItems.map(item => item.purchase_orders.work_order_id).filter(Boolean))];

      const [
        { data: receipts, error: receiptError },
        { data: invoices, error: invoiceError },
        { data: workOrdersResult, error: woError }
      ] = await Promise.all([
        supabase.from('goods_receipts').select('po_id, items:goods_receipt_items(goods_id, quantity_received)').in('po_id', poIds),
        supabase.from('purchase_invoices').select('po_id, status').in('po_id', poIds),
        supabase.from('work_orders').select('id, wo_number, vehicle_entries(vehicles(id, license_plate, brand_type))').in('id', workOrderIds)
      ]);

      if (receiptError) throw receiptError;
      if (invoiceError) throw invoiceError;
      if (woError) throw woError;

      const receivedQtyMap = new Map<string, number>();
      receipts?.forEach(receipt => {
        if (!receipt.po_id) return;
        receipt.items.forEach(item => {
          const key = `${receipt.po_id}-${item.goods_id}`;
          receivedQtyMap.set(key, (receivedQtyMap.get(key) || 0) + item.quantity_received);
        });
      });

      const paymentStatusMap = new Map<number, string>();
      invoices?.forEach(inv => paymentStatusMap.set(inv.po_id, inv.status));

      const workOrderMap = new Map(workOrdersResult?.map(wo => [wo.id, wo]));

      const combinedData = poItems.map(item => {
        const po = item.purchase_orders;
        if (!po) return null;

        const workOrder = (po.work_order_id ? workOrderMap.get(po.work_order_id) : null) as any;
        const ve = Array.isArray((workOrder as any)?.vehicle_entries) ? (workOrder as any).vehicle_entries[0] : (workOrder as any)?.vehicle_entries;
        const vehicle = Array.isArray(ve?.vehicles) ? ve.vehicles[0] : ve?.vehicles;
        const paymentStatus = paymentStatusMap.get(po.id);

        let statusBayar = 'Belum Ditagih';
        if (paymentStatus === 'PAID') statusBayar = 'Lunas';
        else if (paymentStatus === 'PARTIAL') statusBayar = 'Bayar Sebagian';
        else if (paymentStatus) statusBayar = 'Belum Lunas';

        const receivedQty = receivedQtyMap.get(`${po.id}-${item.goods_id}`) || 0;

        return {
          id: item.id,
          tgl: po.po_date || po.created_at,
          no_po: po.po_number,
          supplier: po.suppliers?.name || '-',
          kendaraan: vehicle?.brand_type || '-',
          nopol: vehicle?.license_plate || '-',
          no_wo: workOrder?.wo_number || '-',
          nama_barang: item.goods?.name || '-',
          qty: item.quantity,
          diterima: receivedQty,
          status_bayar: statusBayar,
          harga_satuan: item.unit_price,
          total: item.total_price,
        };
      }).filter(Boolean) as ReportData[];

      const finalData = combinedData.filter(d => matchesSearch(d, searchQuery));
  
      return finalData;
    } catch (error: any) {
      console.error("Error fetching all data for export:", error);
      toast.error('Gagal mengambil data untuk ekspor: ' + error.message);
      return null;
    }
  }

  const handleExport = async () => {
    if (data.length === 0 && totalPages === 0) {
      toast.warning('Tidak ada data untuk diekspor pada rentang tanggal ini.');
      return;
    }

    setExporting(true);
    toast.info('Mempersiapkan data untuk ekspor... Ini mungkin memakan waktu beberapa saat.');

    const allData = await fetchAllDataForExport();

    if (allData === null) {
      setExporting(false);
      return;
    }

    if (allData.length === 0) {
        toast.warning('Tidak ada data untuk diekspor.');
        setExporting(false);
        return;
    }

    const formattedData = allData.map(item => ({
      'Tgl': format(parseISO(item.tgl), 'dd-MM-yyyy'),
      'No. PO': item.no_po,
      'Supplier': item.supplier,
      'Kendaraan': item.kendaraan,
      'Nopol': item.nopol,
      'No. WO': item.no_wo,
      'Nama Barang': item.nama_barang,
      'Qty': item.qty,
      'Diterima': item.diterima,
      'Status Bayar': item.status_bayar,
      'Harga Satuan': item.harga_satuan,
      'Total': item.total,
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rincian Pembelian Detail');

    const colWidths = Object.keys(formattedData[0]).map(key => ({
      wch: Math.max(key.length, ...formattedData.map(row => String(row[key as keyof typeof row]).length)) + 2
    }));
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, 'Laporan_Rincian_Pembelian_Detail_Lengkap.xlsx');
    setExporting(false);
  };

  const totalPembelian = useMemo(() => {
    return data.reduce((acc, item) => acc + item.total, 0);
  }, [data]);

  return (
    <Card className="animate-in fade-in duration-500">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">Laporan Rincian Pembelian (Detail)</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Menampilkan semua item dari setiap Purchase Order.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
            <Button onClick={handleExport} variant="outline" disabled={exporting || (data.length === 0 && totalPages === 0)} className="w-full sm:w-auto">
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Ekspor Semua
            </Button>
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-2 mt-4">
          <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm flex-grow">
             <Calendar className="h-4 w-4 text-gray-500 ml-2" />
             <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
             <span className="text-gray-400 font-medium">-</span>
             <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
          </div>
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Cari nopol, po, wo, kendaraan, barang, supplier..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Button onClick={() => fetchData(1)} disabled={loading} className="w-full md:w-auto">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Tampilkan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && currentPage === 1 ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 text-sm text-muted-foreground">
              <div>
                Hasil: {data.length} baris{normalizeText(searchQuery).length > 0 ? ' (mode pencarian, ambil max 5000 baris)' : ''}
              </div>
              <div className="sm:text-right">Tanggal PO: {dateRange.start} s/d {dateRange.end}</div>
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[100px]">Tgl</TableHead>
                    <TableHead className="min-w-[150px]">No. PO</TableHead>
                    <TableHead className="min-w-[200px]">Supplier</TableHead>
                    <TableHead className="min-w-[150px]">Kendaraan</TableHead>
                    <TableHead className="min-w-[120px]">Nopol</TableHead>
                    <TableHead className="min-w-[150px]">No. WO</TableHead>
                    <TableHead className="min-w-[250px]">Nama Barang</TableHead>
                    <TableHead className="w-[80px] text-right">Qty</TableHead>
                    <TableHead className="w-[80px] text-right">Diterima</TableHead>
                    <TableHead className="w-[120px]">Status Bayar</TableHead>
                    <TableHead className="w-[150px] text-right">Harga Satuan</TableHead>
                    <TableHead className="w-[150px] text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length > 0 ? (
                    data.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{format(parseISO(item.tgl), 'dd-MM-yy', { locale: localeID })}</TableCell>
                        <TableCell>{item.no_po}</TableCell>
                        <TableCell>{item.supplier}</TableCell>
                        <TableCell>{item.kendaraan}</TableCell>
                        <TableCell>{item.nopol}</TableCell>
                        <TableCell>{item.no_wo}</TableCell>
                        <TableCell>{item.nama_barang}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell className="text-right">{item.diterima}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            item.status_bayar === 'Lunas' ? 'bg-green-100 text-green-800' :
                            item.status_bayar === 'Bayar Sebagian' ? 'bg-yellow-100 text-yellow-800' :
                            item.status_bayar === 'Belum Lunas' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {item.status_bayar}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(item.harga_satuan)}</TableCell>
                        <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(item.total)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center h-24">
                        Tidak ada data.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchData(currentPage - 1)}
                    disabled={currentPage <= 1 || loading}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchData(currentPage + 1)}
                    disabled={currentPage >= totalPages || loading}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
            {data.length > 0 && (
              <div className="flex justify-end mt-4">
                <div className="text-right font-bold">
                  <div className="text-sm text-muted-foreground">Total Pembelian</div>
                  <div className="text-xl">
                    Rp {new Intl.NumberFormat('id-ID').format(totalPembelian)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
