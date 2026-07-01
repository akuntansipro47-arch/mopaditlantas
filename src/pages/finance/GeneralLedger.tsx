import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Search, RefreshCw, Calendar as CalendarIcon, Printer, Download } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from 'xlsx';

export default function GeneralLedger() {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  
  // Filters
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Opening Balance
  const [openingBalance, setOpeningBalance] = useState(0);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      fetchLedger();
    }
  }, [selectedAccount, startDate, endDate]);

  async function fetchAccounts() {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, balance_type')
        .eq('account_type', 'DETAIL')
        .order('account_code');
      
      if (error) throw error;
      setAccounts(data || []);
      if (data && data.length > 0) {
        setSelectedAccount(data[0].id);
      }
    } catch (error: any) {
      toast.error('Gagal memuat akun: ' + error.message);
    }
  }

  async function fetchLedger() {
    setLoading(true);
    setTransactions([]);
    setOpeningBalance(0);

    try {
      const account = accounts.find(a => a.id === selectedAccount);
      if (!account) return;

      // 1. Calculate Opening Balance (Sum before StartDate)
      // Query items before start date
      const { data: prevItems, error: prevError } = await supabase
        .from('journal_entry_items')
        .select(`
           debit, credit,
           journal_entries!inner(entry_date)
        `)
        .eq('account_id', selectedAccount)
        .lt('journal_entries.entry_date', startDate);

      if (prevError) throw prevError;

      // Calculate Opening
      let openBal = 0;
      prevItems?.forEach((item: any) => {
          const debit = Number(item.debit) || 0;
          const credit = Number(item.credit) || 0;
          
          if (account.balance_type === 'DEBIT') {
              openBal += (debit - credit);
          } else {
              openBal += (credit - debit);
          }
      });
      setOpeningBalance(openBal);

      // 2. Fetch Transactions within Range
      const { data: currentItems, error: currError } = await supabase
        .from('journal_entry_items')
        .select(`
           id, debit, credit, description,
           journal_entries!inner(id, entry_date, voucher_no, description, entry_type)
        `)
        .eq('account_id', selectedAccount)
        .gte('journal_entries.entry_date', startDate)
        .lte('journal_entries.entry_date', endDate)
        .order('journal_entries(entry_date)', { ascending: true }); // Order by date ASC

      if (currError) throw currError;

      // Map and Calculate Running Balance
      let runningBalance = openBal;
      const mappedTransactions = currentItems?.map((item: any) => {
          const debit = Number(item.debit) || 0;
          const credit = Number(item.credit) || 0;
          
          if (account.balance_type === 'DEBIT') {
              runningBalance += (debit - credit);
          } else {
              runningBalance += (credit - debit);
          }

          return {
              id: item.id,
              date: item.journal_entries.entry_date,
              voucher_no: item.journal_entries.voucher_no,
              // Fix: Prefer header description if item description is too short/generic (e.g. "Pelunasan Hutang")
              description: (item.description && item.description.length > 20) 
                  ? item.description 
                  : (item.journal_entries.description || item.description),
              type: item.journal_entries.entry_type,
              debit,
              credit,
              balance: runningBalance
          };
      });

      setTransactions(mappedTransactions || []);

    } catch (error: any) {
      console.error(error);
      toast.error('Gagal memuat data buku besar');
    } finally {
      setLoading(false);
    }
  }

  const currentAccount = accounts.find(a => a.id === selectedAccount);
  const totalDebit = transactions.reduce((acc, curr) => acc + (Number(curr.debit) || 0), 0);
  const totalCredit = transactions.reduce((acc, curr) => acc + (Number(curr.credit) || 0), 0);
  const endingBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : openingBalance;

  const exportToExcel = () => {
    if (!currentAccount) return;

    const rows = [
      {
        'Tanggal': '',
        'No. Bukti': '',
        'Keterangan': `SALDO AWAL (${formatDate(startDate)})`,
        'Debit': 0,
        'Kredit': 0,
        'Saldo': openingBalance,
      },
      ...transactions.map((t: any) => ({
        'Tanggal': formatDate(t.date),
        'No. Bukti': t.voucher_no || '-',
        'Keterangan': t.description || '',
        'Debit': t.debit || 0,
        'Kredit': t.credit || 0,
        'Saldo': t.balance || 0,
      })),
      {
        'Tanggal': '',
        'No. Bukti': '',
        'Keterangan': 'TOTAL MUTASI & SALDO AKHIR',
        'Debit': transactions.reduce((acc, curr) => acc + curr.debit, 0),
        'Kredit': transactions.reduce((acc, curr) => acc + curr.credit, 0),
        'Saldo': transactions.length > 0 ? transactions[transactions.length - 1].balance : openingBalance,
      }
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buku Besar');
    XLSX.writeFile(
      wb,
      `Laporan_Buku_Besar_${currentAccount.account_code}_${startDate}_sd_${endDate}.xlsx`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Buku Besar (General Ledger)</h2>
          <p className="mt-1 text-sm text-slate-500 print:hidden">Ringkasan saldo dan mutasi akun kini lebih nyaman dibaca di tablet/HP.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={exportToExcel} disabled={!currentAccount || loading} className="print:hidden">
                <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="print:hidden">
                <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Saldo Awal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-slate-900">{formatCurrency(openingBalance)}</div>
            <p className="text-xs text-slate-500">Sebelum {formatDate(startDate)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Debit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-700">{formatCurrency(totalDebit)}</div>
            <p className="text-xs text-slate-500">Periode</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Kredit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-700">{formatCurrency(totalCredit)}</div>
            <p className="text-xs text-slate-500">Periode</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Saldo Akhir</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-blue-700">{formatCurrency(endingBalance)}</div>
            <p className="text-xs text-slate-500">Sampai {formatDate(endDate)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="pb-3 print:hidden">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Pilih Akun</label>
                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                        <SelectTrigger>
                            <SelectValue placeholder="Pilih Akun..." />
                        </SelectTrigger>
                        <SelectContent>
                            {accounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>
                                    {acc.account_code} - {acc.account_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Periode Mulai</label>
                    <div className="relative">
                        <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            type="date" 
                            className="pl-8" 
                            value={startDate} 
                            onChange={e => setStartDate(e.target.value)} 
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Periode Sampai</label>
                    <div className="relative">
                        <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            type="date" 
                            className="pl-8" 
                            value={endDate} 
                            onChange={e => setEndDate(e.target.value)} 
                        />
                    </div>
                </div>
            </div>
        </CardHeader>
        
        <CardContent>
            {/* Header for Print */}
            <div className="hidden print:block mb-6">
                <h1 className="text-xl font-bold text-center">LAPORAN BUKU BESAR</h1>
                <p className="text-center text-sm text-gray-600">
                    Periode: {formatDate(startDate)} s/d {formatDate(endDate)}
                </p>
                <div className="mt-4 border-b pb-2">
                    <p><strong>Kode Akun:</strong> {currentAccount?.account_code}</p>
                    <p><strong>Nama Akun:</strong> {currentAccount?.account_name}</p>
                </div>
            </div>

            <div className="rounded-md border print:border-black">
                <Table>
                    <TableHeader className="bg-slate-100 print:bg-gray-200">
                        <TableRow>
                            <TableHead className="w-[120px]">Tanggal</TableHead>
                            <TableHead className="w-[150px]">No. Bukti</TableHead>
                            <TableHead>Keterangan</TableHead>
                            <TableHead className="text-right w-[150px]">Debit</TableHead>
                            <TableHead className="text-right w-[150px]">Kredit</TableHead>
                            <TableHead className="text-right w-[150px] bg-slate-50 font-bold">Saldo</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {/* Opening Balance Row */}
                        <TableRow className="bg-yellow-50/50 font-medium">
                            <TableCell colSpan={3}>Saldo Awal</TableCell>
                            <TableCell className="text-right">-</TableCell>
                            <TableCell className="text-right">-</TableCell>
                            <TableCell className="text-right font-bold text-blue-700">
                                {formatCurrency(openingBalance)}
                            </TableCell>
                        </TableRow>

                        {loading ? (
                             <TableRow><TableCell colSpan={6} className="text-center py-8">Memuat data...</TableCell></TableRow>
                        ) : transactions.length === 0 ? (
                             <TableRow><TableCell colSpan={6} className="text-center py-8">Tidak ada transaksi pada periode ini.</TableCell></TableRow>
                        ) : (
                            transactions.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell>{formatDate(t.date)}</TableCell>
                                    <TableCell className="font-mono text-xs">{t.voucher_no}</TableCell>
                                    <TableCell>
                                        <div className="whitespace-pre-wrap text-sm">{t.description}</div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {t.debit > 0 ? formatCurrency(t.debit) : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {t.credit > 0 ? formatCurrency(t.credit) : '-'}
                                    </TableCell>
                                    <TableCell className="text-right font-bold bg-slate-50/50">
                                        {formatCurrency(t.balance)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                        
                        {/* Closing Balance Row */}
                        {!loading && transactions.length > 0 && (
                            <TableRow className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                <TableCell colSpan={3} className="text-right">Total Mutasi & Saldo Akhir</TableCell>
                                <TableCell className="text-right">
                                    {formatCurrency(transactions.reduce((acc, curr) => acc + curr.debit, 0))}
                                </TableCell>
                                <TableCell className="text-right">
                                    {formatCurrency(transactions.reduce((acc, curr) => acc + curr.credit, 0))}
                                </TableCell>
                                <TableCell className="text-right text-blue-700">
                                    {formatCurrency(transactions[transactions.length - 1]?.balance || openingBalance)}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
