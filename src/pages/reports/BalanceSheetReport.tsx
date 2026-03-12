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

export default function BalanceSheetReport() {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>({
      assets: [],
      liabilities: [],
      equity: [],
      currentEarnings: 0
  });
  
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchReport();
  }, []);

  async function fetchReport() {
    setLoading(true);
    try {
        // 1. Fetch Chart of Accounts (Assets, Liabilities, Equity)
        // Filter by Category OR Account Code prefix (1, 2, 3)
        const { data: accounts, error: accError } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code, account_name, category, sub_category, balance_type, account_type')
            .order('account_code');
        
        if (accError) throw accError;

        // Filter relevant accounts (Aktiva/Passiva/Modal OR Code 1/2/3)
        const relevantAccounts = accounts.filter((acc: any) => {
            const code = acc.account_code || '';
            return (
                ['AKTIVA', 'KEWAJIBAN', 'EKUITAS', 'MODAL', 'PASSIVA'].includes(acc.category) ||
                code.startsWith('1') || 
                code.startsWith('2') || 
                code.startsWith('3')
            );
        });

        // 2. Fetch Journal Entries up to Report Date
        // To calculate balance: Sum(Debit) - Sum(Credit) based on normal balance
        const { data: journals, error: jError } = await supabase
            .from('journal_entry_items')
            .select(`
                debit, credit, account_id,
                journal_entries!inner (entry_date)
            `)
            .lte('journal_entries.entry_date', reportDate);
            
        if (jError) throw jError;

        // 3. Calculate Account Balances
        const balances: Record<string, number> = {};
        
        journals?.forEach((j: any) => {
            if (!balances[j.account_id]) balances[j.account_id] = 0;
            balances[j.account_id] += (j.debit || 0) - (j.credit || 0);
        });

        // 4. Calculate Current Earnings (Laba Tahun Berjalan)
        // Revenue - Expenses (All time up to date, assuming no closing entries yet)
        // If there are closing entries, they would have moved to Retained Earnings.
        // For simplicity, let's calculate dynamic earnings from Income Statement accounts.
        
        const { data: incomeJournals } = await supabase
            .from('journal_entry_items')
            .select(`
                debit, credit, 
                account:chart_of_accounts!inner (category)
            `)
            .in('account.category', ['PENDAPATAN', 'HPP', 'BEBAN']) // P&L Accounts
            // .gte('journal_entries.entry_date', startOfYear) // Usually Current Year Earnings
            // But for total Retained Earnings (if never closed), we might need all time?
            // Let's assume we want "Current Year Earnings" + "Retained Earnings" (Equity).
            // If user hasn't done "Close Year", then Retained Earnings account is 0, and we show all as Current Earnings.
            .lte('journal_entries.entry_date', reportDate) as any;
            
        let currentEarnings = 0;
        incomeJournals?.forEach((j: any) => {
            const cat = j.account.category;
            if (cat === 'PENDAPATAN') {
                currentEarnings += (j.credit - j.debit); // Revenue is Credit
            } else {
                currentEarnings -= (j.debit - j.credit); // Expense is Debit
            }
        });

        // 5. Map to Report Structure
        const assets: any[] = [];
        const liabilities: any[] = [];
        const equity: any[] = [];

        // Sort by code length descending to handle rollup (children before parents)
        // Actually, we can just iterate top-down and sum children?
        // Let's do a simple recursive sum for Headers.
        
        const getBalance = (accId: string, accCode: string): number => {
            if (!accCode) return 0; // Guard against empty code
            
            // If Detail, return calculated balance from journals
            if (balances[accId] !== undefined) return balances[accId];
            
            // Sum all DETAIL accounts that start with this prefix
            const descendants = relevantAccounts.filter((a: any) => 
                a.account_type === 'DETAIL' &&
                (a.account_code || '').startsWith(accCode)
            );
            
            let total = 0;
            descendants.forEach((d: any) => {
                total += (balances[d.id] || 0);
            });
            return total;
        };

        relevantAccounts.forEach((acc: any) => {
            // Calculate Balance
            let bal = 0;
            const code = acc.account_code || '';
            
            if (acc.account_type === 'DETAIL') {
                bal = balances[acc.id] || 0;
            } else {
                // Header: Sum descendants
                bal = getBalance(acc.id, code);
            }
            
            // Adjust based on Category/Code for display
            // Assets (1): Normal Debit (Positive)
            // Liabilities (2): Normal Credit (Negative) -> Flip to Positive
            // Equity (3): Normal Credit -> Flip
            
            const isAsset = ['AKTIVA', 'ASSETS'].includes(acc.category) || code.startsWith('1');
            
            if (!isAsset) {
                bal = -bal; 
            }

            if (Math.abs(bal) > 0.01) { // Only show non-zero
                const item = { ...acc, balance: bal };
                
                if (isAsset) assets.push(item);
                else if (['KEWAJIBAN', 'PASSIVA', 'LIABILITIES'].includes(acc.category) || code.startsWith('2')) liabilities.push(item);
                else if (['EKUITAS', 'MODAL', 'EQUITY'].includes(acc.category) || code.startsWith('3')) equity.push(item);
            }
        });

        setReportData({
            assets,
            liabilities,
            equity,
            currentEarnings
        });

    } catch (error: any) {
        toast.error("Gagal memuat neraca: " + error.message);
    } finally {
        setLoading(false);
    }
  }

  const sumTotal = (items: any[]) => items.reduce((acc, curr) => acc + curr.balance, 0);

  const totalAssets = sumTotal(reportData.assets);
  const totalLiabilities = sumTotal(reportData.liabilities);
  const totalEquity = sumTotal(reportData.equity) + reportData.currentEarnings;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Laporan Neraca (Balance Sheet)</h2>
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
                <h1 className="text-xl font-bold">LAPORAN NERACA (BALANCE SHEET)</h1>
                <p className="text-sm text-gray-600">
                    Per Tanggal: {formatDate(reportDate)}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* LEFT SIDE: ASSETS (AKTIVA) */}
                <div className="space-y-4">
                    <h3 className="font-bold bg-blue-100 p-2 text-blue-800 uppercase border-l-4 border-blue-500">
                        AKTIVA (ASSETS)
                    </h3>
                    
                    {/* Group by Sub Category if needed, for now flat list */}
                    <Table>
                        <TableBody>
                            {reportData.assets.length === 0 ? (
                                <TableRow><TableCell className="italic text-gray-500">Tidak ada data</TableCell></TableRow>
                            ) : (
                                reportData.assets.map((item: any, idx: number) => (
                                    <TableRow key={idx} className={item.account_type === 'HEADER' ? 'bg-slate-50 font-semibold' : ''}>
                                        <TableCell>
                                            <div className="font-medium" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_name}
                                            </div>
                                            <div className="text-xs text-gray-500" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_code}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.account_type === 'HEADER' ? '' : formatCurrency(item.balance)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    <div className="flex justify-between items-center p-3 bg-slate-100 font-bold border-t-2 border-slate-300">
                        <span>TOTAL AKTIVA</span>
                        <span>{formatCurrency(totalAssets)}</span>
                    </div>
                </div>

                {/* RIGHT SIDE: LIABILITIES & EQUITY (PASSIVA) */}
                <div className="space-y-8">
                    {/* LIABILITIES */}
                    <div className="space-y-4">
                        <h3 className="font-bold bg-red-100 p-2 text-red-800 uppercase border-l-4 border-red-500">
                            KEWAJIBAN (LIABILITIES)
                        </h3>
                        <Table>
                            <TableBody>
                                {reportData.liabilities.length === 0 ? (
                                    <TableRow><TableCell className="italic text-gray-500">Tidak ada data</TableCell></TableRow>
                                ) : (
                                    reportData.liabilities.map((item: any, idx: number) => (
                                        <TableRow key={idx} className={item.account_type === 'HEADER' ? 'bg-slate-50 font-semibold' : ''}>
                                        <TableCell>
                                            <div className="font-medium" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_name}
                                            </div>
                                            <div className="text-xs text-gray-500" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_code}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.account_type === 'HEADER' ? '' : formatCurrency(item.balance)}
                                        </TableCell>
                                    </TableRow>
                                    ))
                                )}
                                <TableRow className="font-bold bg-slate-50">
                                    <TableCell>Total Kewajiban</TableCell>
                                    <TableCell className="text-right">{formatCurrency(totalLiabilities)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>

                    {/* EQUITY */}
                    <div className="space-y-4">
                        <h3 className="font-bold bg-green-100 p-2 text-green-800 uppercase border-l-4 border-green-500">
                            MODAL (EQUITY)
                        </h3>
                        <Table>
                            <TableBody>
                                {reportData.equity.map((item: any, idx: number) => (
                                    <TableRow key={idx} className={item.account_type === 'HEADER' ? 'bg-slate-50 font-semibold' : ''}>
                                        <TableCell>
                                            <div className="font-medium" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_name}
                                            </div>
                                            <div className="text-xs text-gray-500" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_code}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.account_type === 'HEADER' ? '' : formatCurrency(item.balance)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {/* Current Earnings */}
                                <TableRow>
                                    <TableCell className="font-medium text-blue-700">Laba Tahun Berjalan</TableCell>
                                    <TableCell className="text-right font-medium text-blue-700">{formatCurrency(reportData.currentEarnings)}</TableCell>
                                </TableRow>
                                <TableRow className="font-bold bg-slate-50">
                                    <TableCell>Total Modal</TableCell>
                                    <TableCell className="text-right">{formatCurrency(totalEquity)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>

                    {/* TOTAL PASSIVA */}
                    <div className="flex justify-between items-center p-3 bg-slate-100 font-bold border-t-2 border-slate-300 mt-4">
                        <span>TOTAL PASSIVA (KEWAJIBAN + MODAL)</span>
                        <span>{formatCurrency(totalLiabilities + totalEquity)}</span>
                    </div>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
