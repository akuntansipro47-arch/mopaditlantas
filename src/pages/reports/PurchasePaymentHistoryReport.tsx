import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Calendar as CalendarIcon, Download, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function PurchasePaymentHistoryReport() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('purchase_payments')
        .select(`
          id,
          payment_date,
          amount,
          payment_method,
          notes,
          created_at,
          payment_account_id,
          purchase_invoices (
            id,
            invoice_number,
            invoice_date,
            due_date,
            total_amount,
            purchase_orders (po_number),
            suppliers (name)
          ),
          payment_account:chart_of_accounts!purchase_payments_payment_account_id_fkey (account_code, account_name),
          fee_account:chart_of_accounts!purchase_payments_fee_account_id_fkey (account_code, account_name)
        `)
        .gte('payment_date', dateRange.start)
        .lte('payment_date', dateRange.end)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setData(rows || []);
    } catch (e: any) {
      toast.error('Gagal memuat laporan: ' + (e?.message || 'Unknown error'));
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((p: any) => {
      const inv = p.purchase_invoices;
      const invoiceNo = String(inv?.invoice_number || '').toLowerCase();
      const poNo = String(inv?.purchase_orders?.po_number || '').toLowerCase();
      const supplier = String(inv?.suppliers?.name || '').toLowerCase();
      const account = String(p.payment_account?.account_name || '').toLowerCase();
      const notes = String(p.notes || '').toLowerCase();
      return (
        invoiceNo.includes(q) ||
        poNo.includes(q) ||
        supplier.includes(q) ||
        account.includes(q) ||
        notes.includes(q)
      );
    });
  }, [data, search]);

  const totalAmount = filteredData.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  const exportToExcel = () => {
    const exportData = filteredData.map((p: any) => {
      const inv = p.purchase_invoices;
      return {
        'Tanggal Bayar': formatDate(p.payment_date),
        'No. Invoice': inv?.invoice_number || '-',
        'No. PO': inv?.purchase_orders?.po_number || '-',
        'Supplier': inv?.suppliers?.name || '-',
        'Akun Pembayar': p.payment_account ? `${p.payment_account.account_code} - ${p.payment_account.account_name}` : '-',
        'Metode': p.payment_method || '-',
        'Jumlah': Number(p.amount) || 0,
        'Catatan': p.notes || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Pembayaran');
    XLSX.writeFile(wb, `Laporan_Riwayat_Pembayaran_Hutang_${dateRange.start}_sd_${dateRange.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Laporan Riwayat Pembayaran Hutang</h2>
          <p className="text-muted-foreground">Daftar transaksi pembayaran hutang supplier per periode.</p>
          <p className="text-xs text-blue-600 font-medium mt-1">Total Data: {filteredData.length} transaksi</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} disabled={filteredData.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalAmount)}</div>
            <p className="text-xs text-slate-500">Sesuai filter</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Periode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold text-slate-900">{formatDate(dateRange.start)} s/d {formatDate(dateRange.end)}</div>
            <p className="text-xs text-slate-500">Tanggal bayar</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Jumlah Transaksi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{filteredData.length}</div>
            <p className="text-xs text-slate-500">Pembayaran hutang</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md border-slate-200">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg">Rincian Pembayaran</CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <Input type="date" className="w-auto bg-white" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                <span className="text-sm text-slate-500">s/d</span>
                <Input type="date" className="w-auto bg-white" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
              </div>
              <div className="relative w-72">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari invoice / PO / supplier..."
                  className="pl-8 bg-white"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-semibold text-slate-700">Tgl Pembayaran</TableHead>
                <TableHead className="font-semibold text-slate-700">No. Invoice</TableHead>
                <TableHead className="font-semibold text-slate-700">No. PO</TableHead>
                <TableHead className="font-semibold text-slate-700">Supplier</TableHead>
                <TableHead className="font-semibold text-slate-700">Akun Pembayar</TableHead>
                <TableHead className="font-semibold text-slate-700">Metode</TableHead>
                <TableHead className="text-right font-semibold text-slate-700">Jumlah</TableHead>
                <TableHead className="font-semibold text-slate-700">Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Memuat data...</TableCell></TableRow>
              ) : filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Tidak ada data ditemukan.</TableCell></TableRow>
              ) : (
                filteredData.map((p: any) => {
                  const inv = p.purchase_invoices;
                  return (
                    <TableRow key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="text-sm">{formatDate(p.payment_date)}</TableCell>
                      <TableCell className="font-mono text-xs">{inv?.invoice_number || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{inv?.purchase_orders?.po_number || '-'}</TableCell>
                      <TableCell className="text-sm">{inv?.suppliers?.name || '-'}</TableCell>
                      <TableCell className="text-sm">{p.payment_account ? `${p.payment_account.account_code} - ${p.payment_account.account_name}` : '-'}</TableCell>
                      <TableCell className="text-sm">{p.payment_method || '-'}</TableCell>
                      <TableCell className="text-right font-bold text-slate-900">{formatCurrency(p.amount || 0)}</TableCell>
                      <TableCell className="text-sm">{p.notes || '-'}</TableCell>
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
