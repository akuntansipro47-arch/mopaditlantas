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
import { Search, RefreshCw, Calendar as CalendarIcon, Printer } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
              description: item.description || item.journal_entries.description,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Buku Besar (General Ledger)</h2>
        <Button variant="outline" onClick={() => window.print()} className="print:hidden">
            <Printer className="mr-2 h-4 w-4" /> Cetak
        </Button>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="pb-3 print:hidden">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
