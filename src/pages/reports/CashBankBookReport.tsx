import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Calendar as CalendarIcon, Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';

type CashBankAccount = {
  id: string;
  account_code: string;
  account_name: string;
  balance_type: 'DEBIT' | 'CREDIT';
  sub_category: string | null;
};

export default function CashBankBookReport() {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) fetchLedger();
  }, [selectedAccount, startDate, endDate, accounts]);

  async function fetchAccounts() {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, balance_type, sub_category, account_type')
        .eq('account_type', 'DETAIL')
        .order('account_code');

      if (error) throw error;

      const list = (data || []).filter((a: any) => {
        const name = String(a.account_name || '').toLowerCase();
        return a.sub_category === 'AKTIVA_LANCAR' && (name.includes('kas') || name.includes('bank'));
      });

      setAccounts(list);
      if (list.length > 0) setSelectedAccount(list[0].id);
    } catch (e: any) {
      toast.error('Gagal memuat akun Kas/Bank: ' + (e?.message || 'Unknown error'));
    }
  }

  async function fetchLedger() {
    setLoading(true);
    setTransactions([]);
    setOpeningBalance(0);

    try {
      const account = accounts.find(a => a.id === selectedAccount);
      if (!account) return;

      const { data: prevItems, error: prevError } = await supabase
        .from('journal_entry_items')
        .select(`
          debit, credit,
          journal_entries!inner(entry_date)
        `)
        .eq('account_id', selectedAccount)
        .lt('journal_entries.entry_date', startDate);

      if (prevError) throw prevError;

      let openBal = 0;
      prevItems?.forEach((item: any) => {
        const debit = Number(item.debit) || 0;
        const credit = Number(item.credit) || 0;
        if (account.balance_type === 'DEBIT') openBal += (debit - credit);
        else openBal += (credit - debit);
      });
      setOpeningBalance(openBal);

      const { data: currentItems, error: currError } = await supabase
        .from('journal_entry_items')
        .select(`
          id, debit, credit, description,
          journal_entries!inner(id, entry_date, voucher_no, reference, description, entry_type)
        `)
        .eq('account_id', selectedAccount)
        .gte('journal_entries.entry_date', startDate)
        .lte('journal_entries.entry_date', endDate)
        .order('journal_entries(entry_date)', { ascending: true });

      if (currError) throw currError;

      let running = openBal;
      const mapped = (currentItems || []).map((item: any) => {
        const debit = Number(item.debit) || 0;
        const credit = Number(item.credit) || 0;
        if (account.balance_type === 'DEBIT') running += (debit - credit);
        else running += (credit - debit);

        const headerDesc = item.journal_entries?.description;
        const lineDesc = item.description;
        const desc = (lineDesc && String(lineDesc).trim().length > 20) ? lineDesc : (headerDesc || lineDesc || '');

        return {
          id: item.id,
          entry_date: item.journal_entries?.entry_date,
          voucher_no: item.journal_entries?.voucher_no,
          reference: item.journal_entries?.reference,
          entry_type: item.journal_entries?.entry_type,
          description: desc,
          debit,
          credit,
          balance: running,
        };
      });

      setTransactions(mapped);
    } catch (e: any) {
      toast.error('Gagal memuat buku kas/bank: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  const currentAccount = useMemo(() => accounts.find(a => a.id === selectedAccount), [accounts, selectedAccount]);
  const totalDebit = transactions.reduce((sum: number, t: any) => sum + (Number(t.debit) || 0), 0);
  const totalCredit = transactions.reduce((sum: number, t: any) => sum + (Number(t.credit) || 0), 0);
  const endingBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : openingBalance;

  const exportToExcel = () => {
    if (!currentAccount) return;
    const rows = [
      {
        'Tanggal': '',
        'No. Bukti': '',
        'Referensi': '',
        'Tipe': '',
        'Keterangan': `SALDO AWAL (${formatDate(startDate)})`,
        'Debit': 0,
        'Kredit': 0,
        'Saldo': openingBalance,
      },
      ...transactions.map((t: any) => ({
        'Tanggal': formatDate(t.entry_date),
        'No. Bukti': t.voucher_no || '-',
        'Referensi': t.reference || '-',
        'Tipe': t.entry_type || '-',
        'Keterangan': t.description || '',
        'Debit': t.debit || 0,
        'Kredit': t.credit || 0,
        'Saldo': t.balance || 0,
      })),
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buku Kas-Bank');
    XLSX.writeFile(
      wb,
      `Laporan_Buku_Kas_Bank_${currentAccount.account_code}_${startDate}_sd_${endDate}.xlsx`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Laporan Buku Bank / Kas</h2>
          <p className="text-muted-foreground">Mutasi Kas/Bank per akun, lengkap dengan saldo berjalan.</p>
          {currentAccount && (
            <p className="text-xs text-blue-600 font-medium mt-1">Akun: {currentAccount.account_code} - {currentAccount.account_name}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} disabled={!currentAccount}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Saldo Awal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-slate-900">{formatCurrency(openingBalance)}</div>
            <p className="text-xs text-slate-500">Sebelum {formatDate(startDate)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Debit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-700">{formatCurrency(totalDebit)}</div>
            <p className="text-xs text-slate-500">Periode</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Kredit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-700">{formatCurrency(totalCredit)}</div>
            <p className="text-xs text-slate-500">Periode</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Saldo Akhir</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-slate-900">{formatCurrency(endingBalance)}</div>
            <p className="text-xs text-slate-500">Sampai {formatDate(endDate)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md border-slate-200">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg">Mutasi</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full md:w-auto">
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="bg-white min-w-[280px]"><SelectValue placeholder="Pilih akun kas/bank" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.account_code} - {acc.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="date" className="pl-8 bg-white" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="relative">
                <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="date" className="pl-8 bg-white" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-semibold text-slate-700">Tanggal</TableHead>
                <TableHead className="font-semibold text-slate-700">No. Bukti</TableHead>
                <TableHead className="font-semibold text-slate-700">Referensi</TableHead>
                <TableHead className="font-semibold text-slate-700">Tipe</TableHead>
                <TableHead className="font-semibold text-slate-700">Keterangan</TableHead>
                <TableHead className="text-right font-semibold text-slate-700">Debit</TableHead>
                <TableHead className="text-right font-semibold text-slate-700">Kredit</TableHead>
                <TableHead className="text-right font-semibold text-slate-700">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Memuat data...</TableCell></TableRow>
              ) : !currentAccount ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Akun Kas/Bank tidak ditemukan.</TableCell></TableRow>
              ) : (
                <>
                  <TableRow className="bg-slate-50/60">
                    <TableCell className="text-sm">{formatDate(startDate)}</TableCell>
                    <TableCell className="text-xs text-slate-500">-</TableCell>
                    <TableCell className="text-xs text-slate-500">-</TableCell>
                    <TableCell className="text-xs text-slate-500">-</TableCell>
                    <TableCell className="text-sm font-semibold text-slate-700">Saldo Awal</TableCell>
                    <TableCell className="text-right text-slate-600">{formatCurrency(0)}</TableCell>
                    <TableCell className="text-right text-slate-600">{formatCurrency(0)}</TableCell>
                    <TableCell className="text-right font-bold text-slate-900">{formatCurrency(openingBalance)}</TableCell>
                  </TableRow>
                  {transactions.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Tidak ada transaksi di periode ini.</TableCell></TableRow>
                  ) : (
                    transactions.map((t: any) => (
                      <TableRow key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <TableCell className="text-sm">{formatDate(t.entry_date)}</TableCell>
                        <TableCell className="font-mono text-xs">{t.voucher_no || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{t.reference || '-'}</TableCell>
                        <TableCell className="text-xs">{t.entry_type || '-'}</TableCell>
                        <TableCell className="text-sm">{t.description || '-'}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700">{formatCurrency(t.debit || 0)}</TableCell>
                        <TableCell className="text-right font-semibold text-red-700">{formatCurrency(t.credit || 0)}</TableCell>
                        <TableCell className="text-right font-bold text-slate-900">{formatCurrency(t.balance || 0)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

