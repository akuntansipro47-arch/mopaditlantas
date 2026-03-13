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
import { Printer, RefreshCw, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

import { useDemo } from '@/context/DemoDataContext';

export default function BalanceSheetReport() {
  const { isDemo, journals: demoJournals } = useDemo();
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
  }, [isDemo, demoJournals, reportDate]);

  async function fetchReport() {
    setLoading(true);
    try {
        // 1. Fetch Accounts
        let accounts: any[] = [];
        
        if (isDemo) {
            // Mock Accounts
            accounts = [
                { id: 'acc-kas', account_code: '1-1001', account_name: 'Kas Besar', category: 'AKTIVA', account_type: 'DETAIL' },
                { id: 'acc-piutang', account_code: '1-1100', account_name: 'Piutang Usaha', category: 'AKTIVA', account_type: 'DETAIL' },
                { id: 'acc-persediaan', account_code: '1-1200', account_name: 'Persediaan Barang', category: 'AKTIVA', account_type: 'DETAIL' },
                { id: 'acc-modal', account_code: '3-1000', account_name: 'Modal Pemilik', category: 'MODAL', account_type: 'DETAIL' },
                { id: 'acc-hutang', account_code: '2-1000', account_name: 'Hutang Usaha', category: 'KEWAJIBAN', account_type: 'DETAIL' },
            ];
        } else {
            const { data: sbAccounts, error: accError } = await supabase
                .from('chart_of_accounts')
                .select('id, account_code, account_name, category, sub_category, balance_type, account_type')
                .order('account_code');
            if (accError) throw accError;
            accounts = sbAccounts || [];
        }

        // Filter relevant accounts (Aktiva/Passiva/Modal OR Code 1/2/3)
        const relevantAccounts = accounts.filter((acc: any) => {
            const code = acc.account_code || '';
            return (
                ['AKTIVA', 'KEWAJIBAN', 'EKUITAS', 'MODAL', 'PASSIVA', 'ASSETS', 'LIABILITIES', 'EQUITY'].includes(acc.category) ||
                code.startsWith('1') || 
                code.startsWith('2') || 
                code.startsWith('3')
            );
        });

        // 2. Fetch Journals
        let journals: any[] = [];
        
        if (isDemo) {
            // Filter Demo Journals
            const filteredJournals = demoJournals.filter(j => j.date <= reportDate);
            journals = filteredJournals.flatMap(j => 
                j.items.map(i => ({
                    debit: i.debit,
                    credit: i.credit,
                    account_id: i.account_id,
                    journal_entries: { entry_date: j.date }
                }))
            );
        } else {
            const { data: sbJournals, error: jError } = await supabase
                .from('journal_entry_items')
                .select(`
                    debit, credit, account_id,
                    journal_entries!inner (entry_date)
                `)
                .lte('journal_entries.entry_date', reportDate);
            if (jError) throw jError;
            journals = sbJournals || [];
        }

        // 3. Calculate Balances
        const balances: Record<string, number> = {};
        journals?.forEach((j: any) => {
            if (!balances[j.account_id]) balances[j.account_id] = 0;
            balances[j.account_id] += (j.debit || 0) - (j.credit || 0);
        });

        // 4. Calculate Current Earnings
        let currentEarnings = 0;
        
        // Fetch Income Journals (Demo or Live)
        let incomeJournals: any[] = [];
        
        if (isDemo) {
             const filteredJournals = demoJournals.filter(j => j.date <= reportDate);
             incomeJournals = filteredJournals.flatMap(j => 
                j.items.filter(i => ['PENDAPATAN', 'HPP', 'BEBAN', 'PENJUALAN'].includes(i.category || '')).map(i => ({
                    debit: i.debit, 
                    credit: i.credit,
                    account: { category: i.category }
                }))
            );
        } else {
            const { data: sbIncome } = await supabase
                .from('journal_entry_items')
                .select(`
                    debit, credit, 
                    account:chart_of_accounts!inner (category)
                `)
                .in('account.category', ['PENDAPATAN', 'HPP', 'BEBAN', 'PENJUALAN'])
                .lte('journal_entries.entry_date', reportDate) as any;
            incomeJournals = sbIncome || [];
        }

        incomeJournals?.forEach((j: any) => {
            const cat = j.account.category;
            if (cat === 'PENDAPATAN' || cat === 'PENJUALAN') {
                currentEarnings += (j.credit - j.debit);
            } else {
                currentEarnings -= (j.debit - j.credit);
            }
        });

        // 5. Map to Report Structure
        const assets: any[] = [];
        const liabilities: any[] = [];
        const equity: any[] = [];

        const getBalance = (accId: string, accCode: string): number => {
            if (!accCode) return 0;
            if (balances[accId] !== undefined) return balances[accId];
            
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
            let bal = 0;
            const code = acc.account_code || '';
            
            if (acc.account_type === 'DETAIL') {
                bal = balances[acc.id] || 0;
            } else {
                bal = getBalance(acc.id, code);
            }
            
            const isAsset = ['AKTIVA', 'ASSETS'].includes(acc.category) || code.startsWith('1');
            
            if (!isAsset) {
                bal = -bal; 
            }

            if (Math.abs(bal) > 0.01) {
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

  const sumTotal = (items: any[]) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((acc, curr) => acc + (curr?.balance || 0), 0);
  };

  const totalAssets = sumTotal(reportData?.assets);
  const totalLiabilities = sumTotal(reportData?.liabilities);
  const totalEquity = sumTotal(reportData?.equity) + (reportData?.currentEarnings || 0);

  const exportToExcel = () => {
    // We'll create two columns: Left (Assets), Right (Liabilities + Equity)
    // Or just a simple list for Excel. Simple list is better for data.
    // Let's do a structured list: Assets, then Liabilities, then Equity.
    
    const rows: any[] = [];
    rows.push(['LAPORAN NERACA (BALANCE SHEET)']);
    rows.push([`Per Tanggal: ${formatDate(reportDate)}`]);
    rows.push(['']);
    
    rows.push(['AKTIVA (ASSETS)', '']);
    rows.push(['Kode Akun', 'Nama Akun', 'Saldo (Rp)']);
    (reportData?.assets || []).forEach((a: any) => rows.push([a.account_code, a.account_name, a.balance]));
    rows.push(['TOTAL AKTIVA', '', totalAssets]);
    rows.push(['']);

    rows.push(['KEWAJIBAN (LIABILITIES)', '']);
    rows.push(['Kode Akun', 'Nama Akun', 'Saldo (Rp)']);
    (reportData?.liabilities || []).forEach((l: any) => rows.push([l.account_code, l.account_name, l.balance]));
    rows.push(['TOTAL KEWAJIBAN', '', totalLiabilities]);
    rows.push(['']);

    rows.push(['MODAL (EQUITY)', '']);
    rows.push(['Kode Akun', 'Nama Akun', 'Saldo (Rp)']);
    (reportData?.equity || []).forEach((e: any) => rows.push([e.account_code, e.account_name, e.balance]));
    rows.push(['', 'Laba Tahun Berjalan', reportData?.currentEarnings || 0]);
    rows.push(['TOTAL MODAL', '', totalEquity]);
    rows.push(['']);

    rows.push(['TOTAL PASSIVA (KEWAJIBAN + MODAL)', '', totalLiabilities + totalEquity]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Neraca");
    XLSX.writeFile(wb, `Laporan_Neraca_Per_${reportDate}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Laporan Neraca (Balance Sheet)</h2>
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
