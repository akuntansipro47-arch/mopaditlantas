import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Printer, Calendar as CalendarIcon, RefreshCw } from 'lucide-react';

export default function ProfitLossReport() {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>({
      revenue: [],
      cogs: [],
      expenses: [],
      other_revenue: [],
      other_expenses: []
  });
  
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchReport();
  }, []);

  async function fetchReport() {
    setLoading(true);
    try {
        // Fetch all journal items within period linked to Income/Expense accounts
        const { data, error } = await supabase
            .from('journal_entry_items')
            .select(`
                debit, credit,
                account:chart_of_accounts (
                    id, account_code, account_name, category, sub_category
                ),
                journal_entries!inner (entry_date)
            `)
            .gte('journal_entries.entry_date', dateFilter.startDate)
            .lte('journal_entries.entry_date', dateFilter.endDate);

        if (error) throw error;

        // Grouping
        const grouped: any = {
            revenue: {},
            cogs: {},
            expenses: {},
            other_revenue: {},
            other_expenses: {}
        };

        data?.forEach((item: any) => {
            const cat = item.account.category;
            const sub = item.account.sub_category;
            const accId = item.account.id;
            const accCode = item.account.account_code || '';
            const accName = `${accCode} - ${item.account.account_name}`;
            
            let groupKey = '';
            let amount = 0;

            // Logic Filter based on Category OR Account Code Prefix
            // 4: Revenue, 5: COGS, 6: Expenses, 7: Other Income/Expense (or 8,9 depending on convention)
            
            if (cat === 'PENDAPATAN' || accCode.startsWith('4')) {
                if (sub === 'PENDAPATAN_LAINNYA' || accCode.startsWith('42') || accCode.startsWith('71')) { 
                     // Convention: 71 often Other Income, or just sub category check
                     groupKey = 'other_revenue';
                } else {
                     groupKey = 'revenue';
                }
                amount = (item.credit || 0) - (item.debit || 0);
            } else if (cat === 'HPP' || accCode.startsWith('5')) {
                groupKey = 'cogs';
                amount = (item.debit || 0) - (item.credit || 0);
            } else if (cat === 'BEBAN' || accCode.startsWith('6')) {
                if (sub === 'BEBAN_LAINNYA') groupKey = 'other_expenses';
                else groupKey = 'expenses';
                amount = (item.debit || 0) - (item.credit || 0);
            } else if (accCode.startsWith('7') || accCode.startsWith('8') || accCode.startsWith('9')) {
                // Catch-all for Other Income/Expenses if not categorized properly
                // Let's assume 7 is Other Income/Expense. Need to check Debit/Credit balance?
                // Usually 7 is Other Income, 8 Other Expense, 9 Tax.
                // Let's rely on Debit vs Credit dominance if category is unknown.
                const net = (item.credit || 0) - (item.debit || 0);
                if (net > 0) {
                    groupKey = 'other_revenue';
                    amount = net;
                } else {
                    groupKey = 'other_expenses';
                    amount = -net;
                }
            } else {
                return; // Skip Assets (1), Liabilities (2), Equity (3)
            }

            if (groupKey && !grouped[groupKey][accId]) {
                grouped[groupKey][accId] = { name: accName, amount: 0 };
            }
            if (groupKey) grouped[groupKey][accId].amount += amount;
        });

        // Convert to arrays
        const result = {
            revenue: Object.values(grouped.revenue),
            cogs: Object.values(grouped.cogs),
            expenses: Object.values(grouped.expenses),
            other_revenue: Object.values(grouped.other_revenue),
            other_expenses: Object.values(grouped.other_expenses),
        };

        setReportData(result);

    } catch (error: any) {
        toast.error("Gagal memuat laporan: " + error.message);
    } finally {
        setLoading(false);
    }
  }

  const sumTotal = (items: any[]) => items.reduce((acc, curr) => acc + curr.amount, 0);

  const totalRevenue = sumTotal(reportData.revenue);
  const totalCOGS = sumTotal(reportData.cogs);
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpenses = sumTotal(reportData.expenses);
  const operatingProfit = grossProfit - totalExpenses;
  const totalOtherRevenue = sumTotal(reportData.other_revenue);
  const totalOtherExpenses = sumTotal(reportData.other_expenses);
  const netProfit = operatingProfit + totalOtherRevenue - totalOtherExpenses;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Laporan Laba Rugi</h2>
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
                <span className="text-sm font-medium">Periode:</span>
                <Input 
                    type="date" 
                    className="w-auto h-8 bg-white" 
                    value={dateFilter.startDate}
                    onChange={e => setDateFilter({...dateFilter, startDate: e.target.value})}
                />
                <span className="text-gray-400">-</span>
                <Input 
                    type="date" 
                    className="w-auto h-8 bg-white" 
                    value={dateFilter.endDate}
                    onChange={e => setDateFilter({...dateFilter, endDate: e.target.value})}
                />
            </div>
        </CardHeader>
        
        <CardContent>
            {/* Header for Print */}
            <div className="mb-6 text-center">
                <h1 className="text-xl font-bold">LAPORAN LABA RUGI</h1>
                <p className="text-sm text-gray-600">
                    Periode: {formatDate(dateFilter.startDate)} s/d {formatDate(dateFilter.endDate)}
                </p>
            </div>

            <div className="space-y-4 text-sm">
                {/* REVENUE */}
                <div>
                    <h3 className="font-bold bg-slate-100 p-2 uppercase">Pendapatan Usaha</h3>
                    <Table>
                        <TableBody>
                            {reportData.revenue.length === 0 ? (
                                <TableRow><TableCell className="italic text-gray-500">Tidak ada pendapatan</TableCell></TableRow>
                            ) : (
                                reportData.revenue.map((item: any, idx: number) => (
                                    <TableRow key={idx}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                            <TableRow className="font-bold border-t-2">
                                <TableCell>Total Pendapatan</TableCell>
                                <TableCell className="text-right">{formatCurrency(totalRevenue)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* COGS */}
                <div>
                    <h3 className="font-bold bg-slate-100 p-2 uppercase">Harga Pokok Penjualan (HPP)</h3>
                    <Table>
                        <TableBody>
                            {reportData.cogs.length === 0 ? (
                                <TableRow><TableCell className="italic text-gray-500">Tidak ada HPP</TableCell></TableRow>
                            ) : (
                                reportData.cogs.map((item: any, idx: number) => (
                                    <TableRow key={idx}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                            <TableRow className="font-bold border-t-2">
                                <TableCell>Total HPP</TableCell>
                                <TableCell className="text-right">{formatCurrency(totalCOGS)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* GROSS PROFIT */}
                <div className="flex justify-between items-center p-2 bg-blue-50 font-bold text-blue-800 border-y border-blue-200">
                    <span>LABA KOTOR</span>
                    <span>{formatCurrency(grossProfit)}</span>
                </div>

                {/* EXPENSES */}
                <div>
                    <h3 className="font-bold bg-slate-100 p-2 uppercase">Beban Operasional</h3>
                    <Table>
                        <TableBody>
                            {reportData.expenses.length === 0 ? (
                                <TableRow><TableCell className="italic text-gray-500">Tidak ada beban</TableCell></TableRow>
                            ) : (
                                reportData.expenses.map((item: any, idx: number) => (
                                    <TableRow key={idx}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                            <TableRow className="font-bold border-t-2">
                                <TableCell>Total Beban</TableCell>
                                <TableCell className="text-right">{formatCurrency(totalExpenses)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* OPERATING PROFIT */}
                <div className="flex justify-between items-center p-2 bg-slate-100 font-bold border-y border-slate-300">
                    <span>LABA OPERASIONAL</span>
                    <span>{formatCurrency(operatingProfit)}</span>
                </div>

                {/* OTHER INCOME/EXPENSES */}
                {(reportData.other_revenue.length > 0 || reportData.other_expenses.length > 0) && (
                    <div>
                        <h3 className="font-bold bg-slate-100 p-2 uppercase">Pendapatan & Beban Lainnya</h3>
                        <Table>
                            <TableBody>
                                {reportData.other_revenue.map((item: any, idx: number) => (
                                    <TableRow key={`or-${idx}`}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right text-green-600">+{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))}
                                {reportData.other_expenses.map((item: any, idx: number) => (
                                    <TableRow key={`oe-${idx}`}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right text-red-600">-{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* NET PROFIT */}
                <div className="flex justify-between items-center p-4 bg-emerald-100 font-bold text-emerald-900 border border-emerald-300 text-lg rounded-md mt-4">
                    <span>LABA BERSIH (NET PROFIT)</span>
                    <span>{formatCurrency(netProfit)}</span>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
