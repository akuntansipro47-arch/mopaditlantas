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
import { Printer, RefreshCw } from 'lucide-react';

export default function SupplierPayableReport() {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  
  // Filter "As of Date" (Sampai Tanggal)
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchReport();
  }, []);

  async function fetchReport() {
    setLoading(true);
    try {
        // 1. Get Invoices created on or before reportDate
        const { data: invoices, error: invError } = await supabase
            .from('purchase_invoices')
            .select(`
                id, invoice_number, invoice_date, due_date, total_amount,
                supplier:suppliers (id, name)
            `)
            .lte('invoice_date', reportDate)
            .order('invoice_date', { ascending: true });
        
        if (invError) throw invError;

        // 2. Get Payments made on or before reportDate
        const { data: payments, error: payError } = await supabase
            .from('purchase_payments')
            .select('invoice_id, amount, payment_date')
            .lte('payment_date', reportDate);
        
        if (payError) throw payError;

        // 3. Process Data
        const supplierMap: Record<string, any> = {};
        let totalAll = 0;

        invoices?.forEach((inv: any) => {
            // Calculate Paid Amount for this invoice as of reportDate
            const paid = payments
                ?.filter((p: any) => p.invoice_id === inv.id)
                .reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0;
            
            const remaining = (inv.total_amount || 0) - paid;

            // Only show if there is remaining debt OR if user wants to see history? 
            // Usually "Sisa Hutang" report only shows outstanding.
            // But if we want a full statement, we might show 0 balance too.
            // Let's show only if remaining > 100 (small tolerance) to avoid float issues
            // OR if user wants to see unpaid invoices.
            
            if (remaining > 100) {
                const supplierId = inv.supplier?.id || 'unknown';
                const supplierName = inv.supplier?.name || 'Unknown Supplier';

                if (!supplierMap[supplierId]) {
                    supplierMap[supplierId] = {
                        id: supplierId,
                        name: supplierName,
                        invoices: [],
                        total_debt: 0
                    };
                }

                supplierMap[supplierId].invoices.push({
                    ...inv,
                    paid_as_of_date: paid,
                    remaining_balance: remaining
                });
                supplierMap[supplierId].total_debt += remaining;
                totalAll += remaining;
            }
        });

        // Convert to array and sort by Supplier Name
        const result = Object.values(supplierMap).sort((a: any, b: any) => a.name.localeCompare(b.name));
        
        setReportData(result);
        setGrandTotal(totalAll);

    } catch (error: any) {
        toast.error("Gagal memuat laporan: " + error.message);
    } finally {
        setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Ringkasan Hutang Supplier</h2>
        <div className="flex gap-2">
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
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border w-fit">
                <span className="text-sm font-medium">Per Tanggal:</span>
                <Input 
                    type="date" 
                    className="w-auto h-8 bg-white" 
                    value={reportDate}
                    onChange={e => setReportDate(e.target.value)}
                />
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
                {reportData.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 italic">Tidak ada hutang tersisa per tanggal ini.</div>
                ) : (
                    reportData.map((supplier: any) => (
                        <div key={supplier.id} className="break-inside-avoid">
                            <div className="bg-slate-100 p-2 font-bold flex justify-between items-center border-b border-slate-300">
                                <span>{supplier.name}</span>
                                <span>Total: {formatCurrency(supplier.total_debt)}</span>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow className="text-xs uppercase bg-slate-50">
                                        <TableHead>No. Invoice</TableHead>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Jatuh Tempo</TableHead>
                                        <TableHead className="text-right">Total Tagihan</TableHead>
                                        <TableHead className="text-right">Dibayar (s/d Tgl)</TableHead>
                                        <TableHead className="text-right">Sisa Hutang</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {supplier.invoices.map((inv: any) => (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                                            <TableCell className="text-xs">{formatDate(inv.invoice_date)}</TableCell>
                                            <TableCell className="text-xs">{formatDate(inv.due_date)}</TableCell>
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
                    <span>{formatCurrency(grandTotal)}</span>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
