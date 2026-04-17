import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/DatePickerWithRange';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { Loader2, FileDown } from 'lucide-react';

type ReportData = {
  id: number;
  tgl: string;
  no_po: string;
  supplier: string | null;
  kendaraan_nopol: string;
  no_wo: string;
  tipe: string;
  nama_barang: string | null;
  qty: number;
  diterima: number;
  status_bayar: string;
  harga_satuan: number;
  total: number;
};

export default function PurchaseOrderDetailReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  async function fetchData() {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Silakan pilih rentang tanggal terlebih dahulu.');
      return;
    }

    // Fetch data from Supabase
    setLoading(true);
    setData([]);

    try {
      const startDate = format(dateRange.from, 'yyyy-MM-dd');
      const endDate = format(dateRange.to, 'yyyy-MM-dd');

      // 1. Fetch relevant PO IDs first based on date range
      const { data: poIdsData, error: poIdsError } = await supabase
        .from('purchase_orders')
        .select('id')
        .gte('po_date', startDate)
        .lte('po_date', endDate);

      if (poIdsError) throw poIdsError;

      if (!poIdsData || poIdsData.length === 0) {
        setData([]);
        toast.info('Tidak ada data PO ditemukan untuk rentang tanggal yang dipilih.');
        setLoading(false);
        return;
      }

      const poIds = poIdsData.map(po => po.id);

      // 2. Fetch PO Items with related data using the fetched PO IDs
      const { data: poItems, error: poItemsError } = await supabase
        .from('purchase_order_items')
        .select(`
          id,
          quantity,
          unit_price,
          total_price,
          goods ( name ),
          purchase_orders!inner (
            id,
            po_date,
            po_number,
            suppliers ( name ),
            work_orders (
              wo_number,
              vehicle_entries (
                vehicles ( license_plate, brand_type )
              )
            )
          )
        `)
        .in('po_id', poIds)
        .order('po_date', { foreignTable: 'purchase_orders', ascending: false });

      if (poItemsError) throw poItemsError;

      if (!poItems || poItems.length === 0) {
        setData([]);
        toast.info('Tidak ada item pembelian yang ditemukan untuk PO dalam rentang tanggal ini.');
        setLoading(false);
        return;
      }

      const poItemIds = poItems.map(item => item.id);

      // 3. Fetch received quantities
      const { data: receiptItems, error: receiptError } = await supabase
        .from('good_receipt_items')
        .select('purchase_order_item_id, quantity')
        .in('purchase_order_item_id', poItemIds);

      if (receiptError) throw receiptError;

      const receivedQtyMap = new Map<number, number>();
      receiptItems?.forEach(item => {
        const currentQty = receivedQtyMap.get(item.purchase_order_item_id) || 0;
        receivedQtyMap.set(item.purchase_order_item_id, currentQty + item.quantity);
      });

      // 4. Fetch payment status from invoices
      const { data: invoices, error: invoiceError } = await supabase
        .from('purchase_invoices')
        .select('po_id, status')
        .in('po_id', poIds);

      if (invoiceError) throw invoiceError;

      const paymentStatusMap = new Map<number, string>();
      invoices?.forEach(inv => {
        paymentStatusMap.set(inv.po_id, inv.status);
      });

      // 4. Combine all data
      const combinedData = poItems.map(item => {
        const po = item.purchase_orders;
        if (!po) return null;

        const vehicle = po.work_orders?.vehicle_entries?.vehicles;
        const nopol = vehicle ? `${vehicle.brand_type} / ${vehicle.license_plate}` : 'Stok Gudang';
        const paymentStatus = paymentStatusMap.get(po.id);

        let statusBayar = 'Belum Ditagih';
        if (paymentStatus === 'PAID') {
          statusBayar = 'Lunas';
        } else if (paymentStatus === 'PARTIAL') {
          statusBayar = 'Bayar Sebagian';
        } else if (paymentStatus) { // UNPAID, OVERDUE
          statusBayar = 'Belum Lunas';
        }

        return {
          id: item.id,
          tgl: po.po_date,
          no_po: po.po_number,
          supplier: po.suppliers?.name || '-',
          kendaraan_nopol: nopol,
          no_wo: po.work_orders?.wo_number || '-',
          nama_barang: item.goods?.name || '-',
          qty: item.quantity,
          diterima: receivedQtyMap.get(item.id) || 0,
          status_bayar: statusBayar,
          harga_satuan: item.unit_price,
          total: item.total_price,
        };
      }).filter(Boolean) as ReportData[];

      setData(combinedData);
    } catch (error: any) {
      console.error("Error fetching detailed PO report:", error);
      toast.error('Gagal memuat laporan: ' + error.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  const handleExport = () => {
    if (data.length === 0) {
      toast.warning('Tidak ada data untuk diekspor.');
      return;
    }

    const formattedData = data.map(item => ({
      'Tanggal': format(parseISO(item.tgl), 'dd-MM-yyyy'),
      'No. PO': item.no_po,
      'Supplier': item.supplier,
      'Kendaraan/Nopol': item.kendaraan_nopol,
      'No. WO': item.no_wo,
      'Tipe': item.tipe,
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

    // Auto-fit columns
    const colWidths = Object.keys(formattedData[0]).map(key => ({
      wch: Math.max(key.length, ...formattedData.map(row => String(row[key as keyof typeof row]).length)) + 2
    }));
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, 'Laporan_Rincian_Pembelian_Detail.xlsx');
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
            <DatePickerWithRange date={dateRange} setDate={setDateRange} className="w-full sm:w-auto" />
            <Button onClick={fetchData} disabled={loading} className="w-full sm:w-auto">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tampilkan
            </Button>
            <Button onClick={handleExport} variant="outline" disabled={data.length === 0} className="w-full sm:w-auto">
              <FileDown className="mr-2 h-4 w-4" />
              Ekspor
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Tgl</TableHead>
                    <TableHead>No. PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Kendaraan/Nopol</TableHead>
                    <TableHead>No. WO</TableHead>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Diterima</TableHead>
                    <TableHead>Status Bayar</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length > 0 ? (
                    data.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{format(parseISO(item.tgl), 'dd-MM-yy', { locale: localeID })}</TableCell>
                        <TableCell>{item.no_po}</TableCell>
                        <TableCell>{item.supplier}</TableCell>
                        <TableCell>{item.kendaraan_nopol}</TableCell>
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