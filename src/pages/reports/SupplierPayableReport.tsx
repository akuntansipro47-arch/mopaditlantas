import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Printer, RefreshCw, Download, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function SupplierPayableReport() {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [grandOverdue, setGrandOverdue] = useState(0);
  
  // Filter "As of Date" (Sampai Tanggal)
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [minRemaining, setMinRemaining] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchReport();
  }, [reportDate]);

  const diffDays = (a: Date, b: Date) => {
    const ms = 24 * 60 * 60 * 1000;
    const da = new Date(a);
    const db = new Date(b);
    da.setHours(0, 0, 0, 0);
    db.setHours(0, 0, 0, 0);
    return Math.floor((da.getTime() - db.getTime()) / ms);
  };

  const getAgingBucket = (daysOverdue: number) => {
    if (daysOverdue <= 0) return 'Belum Jatuh Tempo';
    if (daysOverdue <= 30) return '1-30';
    if (daysOverdue <= 60) return '31-60';
    if (daysOverdue <= 90) return '61-90';
    return '>90';
  };

  async function fetchReport() {
    setLoading(true);
    try {
        // 1. Get Invoices created on or before reportDate
        const { data: invoices, error: invError } = await supabase
            .from('purchase_invoices')
            .select(`
                id, invoice_number, invoice_date, due_date, total_amount, status,
                supplier:suppliers (id, name),
                purchase_orders!inner (po_number, status)
            `)
            .lte('invoice_date', reportDate)
            .in('purchase_orders.status', ['RECEIVED_FULL', 'RECEIVED_PART'])
            .order('invoice_date', { ascending: true });
        
        if (invError) throw invError;

        // 2. Get Payments made on or before reportDate
        const invoiceIds = (invoices || []).map((i: any) => i.id).filter(Boolean);
        const { data: payments, error: payError } = invoiceIds.length === 0
          ? { data: [], error: null }
          : await supabase
              .from('purchase_payments')
              .select('invoice_id, amount, payment_date')
              .in('invoice_id', invoiceIds)
              .lte('payment_date', reportDate);
        
        if (payError) throw payError;

        // 3. Process Data
        const supplierMap: Record<string, any> = {};
        let totalAll = 0;
        let totalOverdue = 0;
        const paymentByInvoice: Record<string, { paid: number; last_payment_date: string | null }> = {};

        (payments || []).forEach((p: any) => {
          const id = p.invoice_id;
          if (!id) return;
          const amt = Number(p.amount || 0);
          const d = p.payment_date ? String(p.payment_date) : null;
          if (!paymentByInvoice[id]) paymentByInvoice[id] = { paid: 0, last_payment_date: null };
          paymentByInvoice[id].paid += amt;
          if (d && (!paymentByInvoice[id].last_payment_date || d > paymentByInvoice[id].last_payment_date)) {
            paymentByInvoice[id].last_payment_date = d;
          }
        });

        invoices?.forEach((inv: any) => {
            const paid = paymentByInvoice[inv.id]?.paid || 0;
            const lastPaymentDate = paymentByInvoice[inv.id]?.last_payment_date || null;
            const remaining = (inv.total_amount || 0) - paid;

            const asOf = new Date(reportDate);
            const due = inv.due_date ? new Date(inv.due_date) : null;
            const daysOverdue = due ? Math.max(0, diffDays(asOf, due)) : 0;
            const bucket = due ? getAgingBucket(daysOverdue) : '-';
            const isOverdue = due ? asOf > due : false;

            if (remaining > Math.max(0, Number(minRemaining || 0))) {
                const supplierId = inv.supplier?.id || 'unknown';
                const supplierName = inv.supplier?.name || 'Unknown Supplier';

                if (!supplierMap[supplierId]) {
                    supplierMap[supplierId] = {
                        id: supplierId,
                        name: supplierName,
                        invoices: [],
                        total_debt: 0,
                        total_overdue: 0
                    };
                }

                supplierMap[supplierId].invoices.push({
                    ...inv,
                    paid_as_of_date: paid,
                    remaining_balance: remaining,
                    last_payment_date: lastPaymentDate,
                    days_overdue: daysOverdue,
                    aging_bucket: bucket,
                    is_overdue: isOverdue
                });
                supplierMap[supplierId].total_debt += remaining;
                totalAll += remaining;
                if (isOverdue) {
                  supplierMap[supplierId].total_overdue += remaining;
                  totalOverdue += remaining;
                }
            }
        });

        // Convert to array and sort by Supplier Name
        const result = Object.values(supplierMap)
          .map((s: any) => ({
            ...s,
            invoices: (s.invoices || []).sort((a: any, b: any) => String(a.due_date || '').localeCompare(String(b.due_date || ''))),
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        
        setReportData(result);
        setGrandTotal(totalAll);
        setGrandOverdue(totalOverdue);

    } catch (error: any) {
        toast.error("Gagal memuat laporan: " + error.message);
    } finally {
        setLoading(false);
    }
  }

  const filteredSuppliers = reportData
    .map((supplier: any) => {
      const query = search.trim().toLowerCase();
      if (!query) return supplier;
      const supplierMatch = String(supplier.name || '').toLowerCase().includes(query);
      const invoices = (supplier.invoices || []).filter((inv: any) => {
        const invoiceNo = String(inv.invoice_number || '').toLowerCase();
        const poNo = String(inv.purchase_orders?.po_number || '').toLowerCase();
        return supplierMatch || invoiceNo.includes(query) || poNo.includes(query);
      });
      return { ...supplier, invoices };
    })
    .filter((supplier: any) => (supplier.invoices || []).length > 0);

  const filteredGrandTotal = filteredSuppliers.reduce((sum: number, s: any) => sum + (s.total_debt || 0), 0);
  const filteredGrandOverdue = filteredSuppliers.reduce((sum: number, s: any) => sum + (s.total_overdue || 0), 0);
  const supplierCount = filteredSuppliers.length;
  const invoiceCount = filteredSuppliers.reduce((sum: number, s: any) => sum + (s.invoices?.length || 0), 0);

  const exportToExcel = () => {
    // Flatten data for Excel
    const flattenData: any[] = [];
    
    filteredSuppliers.forEach(supplier => {
        // Supplier Header Row (Optional, or just include supplier name in every row)
        // Let's include supplier name in every row for easier filtering in Excel
        supplier.invoices.forEach((inv: any) => {
            flattenData.push({
                'Supplier': supplier.name,
                'No. Invoice': inv.invoice_number,
                'No. PO': inv.purchase_orders?.po_number || '-',
                'Tanggal Invoice': formatDate(inv.invoice_date),
                'Jatuh Tempo': formatDate(inv.due_date),
                'Overdue (Hari)': inv.days_overdue || 0,
                'Aging': inv.aging_bucket || '-',
                'Pembayaran Terakhir': inv.last_payment_date ? formatDate(inv.last_payment_date) : '-',
                'Total Tagihan': inv.total_amount,
                'Dibayar (s/d Tgl)': inv.paid_as_of_date,
                'Sisa Hutang': inv.remaining_balance
            });
        });
        // Add Subtotal Row? Maybe cleaner without for data processing, 
        // but user might want it. Let's stick to clean data for Pivot Tables.
    });

    const ws = XLSX.utils.json_to_sheet(flattenData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sisa Hutang Supplier");
    XLSX.writeFile(wb, `Laporan_Hutang_Supplier_Per_${reportDate}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Hutang Supplier</h2>
        <div className="flex gap-2">
            <Button variant="outline" onClick={exportToExcel} className="print:hidden">
                <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="print:hidden">
                <Printer className="mr-2 h-4 w-4" /> Cetak
            </Button>
            <Button onClick={fetchReport} disabled={loading} className="print:hidden">
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="pb-3 print:hidden">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border w-fit">
                    <span className="text-sm font-medium">Per Tanggal:</span>
                    <Input 
                        type="date" 
                        className="w-auto h-8 bg-white" 
                        value={reportDate}
                        onChange={e => setReportDate(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border w-fit">
                    <span className="text-sm font-medium">Min Sisa:</span>
                    <Input
                        type="number"
                        className="w-[140px] h-8 bg-white"
                        value={minRemaining}
                        onChange={e => setMinRemaining(Number(e.target.value))}
                    />
                </div>
                <div className="relative w-72 ml-auto">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari supplier / invoice / PO..."
                        className="pl-8 bg-white"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>
        </CardHeader>
        
        <CardContent>
            {/* Header for Print */}
            <div className="mb-6 text-center">
                <h1 className="text-xl font-bold">LAPORAN SISA HUTANG SUPPLIER</h1>
                <p className="text-sm text-gray-600">
                    Per Tanggal: {formatDate(reportDate)}
                </p>
            </div>

            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 print:hidden">
                    <div className="p-3 rounded-md border bg-white">
                        <div className="text-xs text-slate-500">Total Hutang</div>
                        <div className="text-lg font-bold text-slate-900">{formatCurrency(filteredGrandTotal)}</div>
                    </div>
                    <div className="p-3 rounded-md border bg-white">
                        <div className="text-xs text-slate-500">Total Jatuh Tempo</div>
                        <div className="text-lg font-bold text-red-700">{formatCurrency(filteredGrandOverdue)}</div>
                    </div>
                    <div className="p-3 rounded-md border bg-white">
                        <div className="text-xs text-slate-500">Jumlah Supplier</div>
                        <div className="text-lg font-bold text-slate-900">{supplierCount}</div>
                    </div>
                    <div className="p-3 rounded-md border bg-white">
                        <div className="text-xs text-slate-500">Jumlah Invoice</div>
                        <div className="text-lg font-bold text-slate-900">{invoiceCount}</div>
                    </div>
                </div>

                {filteredSuppliers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 italic">Tidak ada hutang tersisa per tanggal ini.</div>
                ) : (
                    filteredSuppliers.map((supplier: any) => (
                        <div key={supplier.id} className="break-inside-avoid">
                            <div className="bg-slate-100 p-2 font-bold flex justify-between items-center border-b border-slate-300">
                                <span>{supplier.name}</span>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs text-slate-600">Overdue: <span className="font-bold text-red-700">{formatCurrency(supplier.total_overdue || 0)}</span></span>
                                    <span>Total: {formatCurrency(supplier.total_debt)}</span>
                                </div>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow className="text-xs uppercase bg-slate-50">
                                        <TableHead>No. Invoice</TableHead>
                                        <TableHead>No. PO</TableHead>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Jatuh Tempo</TableHead>
                                        <TableHead>Aging</TableHead>
                                        <TableHead>Pembayaran Terakhir</TableHead>
                                        <TableHead className="text-right">Total Tagihan</TableHead>
                                        <TableHead className="text-right">Dibayar (s/d Tgl)</TableHead>
                                        <TableHead className="text-right">Sisa Hutang</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {supplier.invoices.map((inv: any) => (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                                            <TableCell className="font-mono text-xs">{inv.purchase_orders?.po_number || '-'}</TableCell>
                                            <TableCell className="text-xs">{formatDate(inv.invoice_date)}</TableCell>
                                            <TableCell className={`text-xs ${inv.is_overdue ? 'text-red-600 font-bold' : ''}`}>{formatDate(inv.due_date)}</TableCell>
                                            <TableCell className="text-xs">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                    inv.aging_bucket === 'Belum Jatuh Tempo' ? 'bg-slate-50 text-slate-700 border-slate-200' :
                                                    inv.aging_bucket === '1-30' ? 'bg-yellow-50 text-yellow-800 border-yellow-200' :
                                                    inv.aging_bucket === '31-60' ? 'bg-orange-50 text-orange-800 border-orange-200' :
                                                    inv.aging_bucket === '61-90' ? 'bg-red-50 text-red-800 border-red-200' :
                                                    inv.aging_bucket === '>90' ? 'bg-red-100 text-red-900 border-red-200' :
                                                    'bg-slate-50 text-slate-700 border-slate-200'
                                                }`}>
                                                    {inv.aging_bucket}{inv.days_overdue ? ` (${inv.days_overdue}h)` : ''}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-xs">{inv.last_payment_date ? formatDate(inv.last_payment_date) : '-'}</TableCell>
                                            <TableCell className="text-right text-xs">{formatCurrency(inv.total_amount)}</TableCell>
                                            <TableCell className="text-right text-xs text-green-600">{formatCurrency(inv.paid_as_of_date)}</TableCell>
                                            <TableCell className="text-right text-xs font-bold text-red-600">{formatCurrency(inv.remaining_balance)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ))
                )}

                <div className="flex justify-between items-center p-4 bg-red-50 font-bold text-red-900 border border-red-200 text-lg rounded-md mt-8 break-inside-avoid">
                    <span>GRAND TOTAL HUTANG USAHA</span>
                    <span>{formatCurrency(filteredGrandTotal)}</span>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
