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
import { Search, Plus, Trash2, Save, RefreshCw, Calendar as CalendarIcon } from 'lucide-react';
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// Types
type COA = {
  id: string;
  account_code: string;
  account_name: string;
  category: string;
  sub_category: string;
  balance_type: string;
};

type JournalEntryItem = {
  id: string; // temp id for UI key
  account_id: string;
  amount: number;
  memo: string;
};

export default function CashBankV2() {
  const [activeTab, setActiveTab] = useState('deposit');
  const [accounts, setAccounts] = useState<COA[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Deposit State ---
  const [depositHeader, setDepositHeader] = useState({
    deposit_to: '', // Account ID
    voucher_no: '',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });
  const [depositItems, setDepositItems] = useState<JournalEntryItem[]>([
    { id: '1', account_id: '', amount: 0, memo: '' }
  ]);

  // --- Payment State ---
  const [paymentHeader, setPaymentHeader] = useState({
    payment_from: '', // Account ID
    voucher_no: '',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });
  const [paymentItems, setPaymentItems] = useState<JournalEntryItem[]>([
    { id: '1', account_id: '', amount: 0, memo: '' }
  ]);

  // --- History State ---
  const [history, setHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    fetchAccounts();
    fetchHistory();
  }, []);

  async function fetchAccounts() {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('account_type', 'DETAIL') // Only detail accounts
        .order('account_code');
      
      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      toast.error('Gagal memuat akun: ' + error.message);
    }
  }

  async function fetchHistory() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select(`
          *,
          items:journal_entry_items (
             debit, credit, 
             account:chart_of_accounts (account_name, account_code)
          )
        `)
        .order('entry_date', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error: any) {
      // Ignore table not found error initially if migration hasn't run
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  // Filter Accounts
  // Cash/Bank only for Header
  const cashBankAccounts = accounts.filter(a => 
    a.sub_category === 'AKTIVA_LANCAR' && 
    (a.account_name.toLowerCase().includes('kas') || a.account_name.toLowerCase().includes('bank'))
  );
  
  // All accounts for Detail
  const allAccounts = accounts;

  // --- Deposit Logic ---
  const addDepositItem = () => {
    setDepositItems([...depositItems, { id: Math.random().toString(), account_id: '', amount: 0, memo: '' }]);
  };

  const removeDepositItem = (id: string) => {
    if (depositItems.length > 1) {
      setDepositItems(depositItems.filter(i => i.id !== id));
    }
  };

  const updateDepositItem = (id: string, field: keyof JournalEntryItem, value: any) => {
    setDepositItems(depositItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const depositTotal = depositItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const handleSaveDeposit = async () => {
    if (!depositHeader.deposit_to) return toast.error('Pilih akun Deposit To');
    if (depositTotal <= 0) return toast.error('Total amount harus lebih dari 0');
    if (depositItems.some(i => !i.account_id)) return toast.error('Lengkapi semua akun pada baris detail');

    setLoading(true);
    try {
      // 1. Create Header
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert([{
          entry_date: depositHeader.date,
          voucher_no: depositHeader.voucher_no || `DEP-${Date.now().toString().slice(-6)}`,
          description: depositHeader.memo,
          entry_type: 'DEPOSIT',
          total_amount: depositTotal
        }])
        .select()
        .single();

      if (entryError) throw entryError;

      // 2. Create Items
      const itemsPayload = [];
      
      // A. DEBIT (Deposit To Account) - Total Amount
      itemsPayload.push({
        journal_entry_id: entry.id,
        account_id: depositHeader.deposit_to,
        debit: depositTotal,
        credit: 0,
        description: depositHeader.memo
      });

      // B. CREDIT (Detail Accounts)
      depositItems.forEach(item => {
        itemsPayload.push({
          journal_entry_id: entry.id,
          account_id: item.account_id,
          debit: 0,
          credit: item.amount,
          description: item.memo || depositHeader.memo
        });
      });

      const { error: itemsError } = await supabase
        .from('journal_entry_items')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      toast.success('Penerimaan berhasil disimpan');
      // Reset
      setDepositHeader({ ...depositHeader, voucher_no: '', memo: '' });
      setDepositItems([{ id: '1', account_id: '', amount: 0, memo: '' }]);
      fetchHistory();
      setActiveTab('history');

    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Payment Logic ---
  const addPaymentItem = () => {
    setPaymentItems([...paymentItems, { id: Math.random().toString(), account_id: '', amount: 0, memo: '' }]);
  };

  const removePaymentItem = (id: string) => {
    if (paymentItems.length > 1) {
      setPaymentItems(paymentItems.filter(i => i.id !== id));
    }
  };

  const updatePaymentItem = (id: string, field: keyof JournalEntryItem, value: any) => {
    setPaymentItems(paymentItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const paymentTotal = paymentItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const handleSavePayment = async () => {
    if (!paymentHeader.payment_from) return toast.error('Pilih akun Payment From');
    if (paymentTotal <= 0) return toast.error('Total amount harus lebih dari 0');
    if (paymentItems.some(i => !i.account_id)) return toast.error('Lengkapi semua akun pada baris detail');

    setLoading(true);
    try {
      // 1. Create Header
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert([{
          entry_date: paymentHeader.date,
          voucher_no: paymentHeader.voucher_no || `PAY-${Date.now().toString().slice(-6)}`,
          description: paymentHeader.memo,
          entry_type: 'PAYMENT',
          total_amount: paymentTotal
        }])
        .select()
        .single();

      if (entryError) throw entryError;

      // 2. Create Items
      const itemsPayload = [];
      
      // A. CREDIT (Payment From Account) - Total Amount
      itemsPayload.push({
        journal_entry_id: entry.id,
        account_id: paymentHeader.payment_from,
        debit: 0,
        credit: paymentTotal,
        description: paymentHeader.memo
      });

      // B. DEBIT (Detail Accounts - Expenses etc)
      paymentItems.forEach(item => {
        itemsPayload.push({
          journal_entry_id: entry.id,
          account_id: item.account_id,
          debit: item.amount,
          credit: 0,
          description: item.memo || paymentHeader.memo
        });
      });

      const { error: itemsError } = await supabase
        .from('journal_entry_items')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      toast.success('Pengeluaran berhasil disimpan');
      // Reset
      setPaymentHeader({ ...paymentHeader, voucher_no: '', memo: '' });
      setPaymentItems([{ id: '1', account_id: '', amount: 0, memo: '' }]);
      fetchHistory();
      setActiveTab('history');

    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Kas & Bank (Jurnal)</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deposit" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800">
             Penerimaan (Deposit)
          </TabsTrigger>
          <TabsTrigger value="payment" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-800">
             Pengeluaran (Payment)
          </TabsTrigger>
          <TabsTrigger value="history">
             Riwayat Transaksi
          </TabsTrigger>
        </TabsList>

        {/* --- TAB 1: DEPOSIT --- */}
        <TabsContent value="deposit" className="space-y-4 mt-4">
          <Card className="border-t-4 border-t-green-500">
            <CardHeader>
              <CardTitle>Penerimaan Kas/Bank</CardTitle>
              <CardDescription>Catat penerimaan uang masuk (Deposit).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Header Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-50 rounded-lg border">
                <div className="space-y-2">
                  <Label>Deposit To (Masuk ke Akun)</Label>
                  <Select value={depositHeader.deposit_to} onValueChange={v => setDepositHeader({...depositHeader, deposit_to: v})}>
                    <SelectTrigger className="bg-white border-green-200">
                      <SelectValue placeholder="Pilih Akun Kas/Bank..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cashBankAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-green-600 font-medium">*Posisi: Debit (Bertambah)</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>No. Voucher</Label>
                        <Input 
                            value={depositHeader.voucher_no} 
                            onChange={e => setDepositHeader({...depositHeader, voucher_no: e.target.value})}
                            placeholder="Auto (Kosongkan)" 
                            className="bg-white"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Tanggal</Label>
                        <Input 
                            type="date" 
                            value={depositHeader.date} 
                            onChange={e => setDepositHeader({...depositHeader, date: e.target.value})}
                            className="bg-white"
                        />
                    </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                    <Label>Memo / Keterangan</Label>
                    <Textarea 
                        value={depositHeader.memo} 
                        onChange={e => setDepositHeader({...depositHeader, memo: e.target.value})}
                        placeholder="Keterangan transaksi..."
                        className="bg-white h-20"
                    />
                </div>
              </div>

              {/* Amount Display */}
              <div className="flex justify-between items-center bg-green-50 p-4 rounded-lg border border-green-100">
                  <span className="font-semibold text-green-800">Total Amount</span>
                  <span className="text-2xl font-bold text-green-700">{formatCurrency(depositTotal)}</span>
              </div>

              {/* Detail Table */}
              <div className="border rounded-md overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-100">
                        <TableRow>
                            <TableHead className="w-[40%]">Account No. (Sumber Dana)</TableHead>
                            <TableHead className="w-[30%]">Amount</TableHead>
                            <TableHead className="w-[25%]">Memo (Opsional)</TableHead>
                            <TableHead className="w-[5%]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {depositItems.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <Select value={item.account_id} onValueChange={v => updateDepositItem(item.id, 'account_id', v)}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Pilih Akun..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allAccounts.map(acc => (
                                                <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        value={item.amount || ''} 
                                        onChange={e => updateDepositItem(item.id, 'amount', parseFloat(e.target.value))}
                                        className="h-9 text-right"
                                        placeholder="0"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        value={item.memo} 
                                        onChange={e => updateDepositItem(item.id, 'memo', e.target.value)}
                                        className="h-9"
                                        placeholder="Keterangan..."
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" onClick={() => removeDepositItem(item.id)} className="text-red-500 hover:text-red-700 h-8 w-8">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <div className="p-2 bg-slate-50 border-t">
                    <Button variant="outline" size="sm" onClick={addDepositItem} className="text-green-600 border-green-200 hover:bg-green-50">
                        <Plus className="mr-2 h-3 w-3" /> Tambah Baris
                    </Button>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                  <Button variant="outline">Batal</Button>
                  <Button onClick={handleSaveDeposit} disabled={loading} className="bg-green-600 hover:bg-green-700 min-w-[150px]">
                      {loading ? 'Menyimpan...' : 'Simpan Penerimaan'}
                  </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB 2: PAYMENT --- */}
        <TabsContent value="payment" className="space-y-4 mt-4">
          <Card className="border-t-4 border-t-red-500">
            <CardHeader>
              <CardTitle>Pengeluaran Kas/Bank</CardTitle>
              <CardDescription>Catat pembayaran atau biaya keluar (Payment).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Header Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-50 rounded-lg border">
                <div className="space-y-2">
                  <Label>Payment From (Keluar dari Akun)</Label>
                  <Select value={paymentHeader.payment_from} onValueChange={v => setPaymentHeader({...paymentHeader, payment_from: v})}>
                    <SelectTrigger className="bg-white border-red-200">
                      <SelectValue placeholder="Pilih Akun Kas/Bank..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cashBankAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-red-600 font-medium">*Posisi: Kredit (Berkurang)</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>No. Voucher</Label>
                        <Input 
                            value={paymentHeader.voucher_no} 
                            onChange={e => setPaymentHeader({...paymentHeader, voucher_no: e.target.value})}
                            placeholder="Auto (Kosongkan)" 
                            className="bg-white"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Tanggal</Label>
                        <Input 
                            type="date" 
                            value={paymentHeader.date} 
                            onChange={e => setPaymentHeader({...paymentHeader, date: e.target.value})}
                            className="bg-white"
                        />
                    </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                    <Label>Memo / Keterangan</Label>
                    <Textarea 
                        value={paymentHeader.memo} 
                        onChange={e => setPaymentHeader({...paymentHeader, memo: e.target.value})}
                        placeholder="Keterangan transaksi..."
                        className="bg-white h-20"
                    />
                </div>
              </div>

              {/* Amount Display */}
              <div className="flex justify-between items-center bg-red-50 p-4 rounded-lg border border-red-100">
                  <span className="font-semibold text-red-800">Total Amount</span>
                  <span className="text-2xl font-bold text-red-700">{formatCurrency(paymentTotal)}</span>
              </div>

              {/* Detail Table */}
              <div className="border rounded-md overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-100">
                        <TableRow>
                            <TableHead className="w-[40%]">Account No. (Untuk Biaya/Bayar Apa)</TableHead>
                            <TableHead className="w-[30%]">Amount</TableHead>
                            <TableHead className="w-[25%]">Memo (Opsional)</TableHead>
                            <TableHead className="w-[5%]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paymentItems.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <Select value={item.account_id} onValueChange={v => updatePaymentItem(item.id, 'account_id', v)}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Pilih Akun..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allAccounts.map(acc => (
                                                <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        value={item.amount || ''} 
                                        onChange={e => updatePaymentItem(item.id, 'amount', parseFloat(e.target.value))}
                                        className="h-9 text-right"
                                        placeholder="0"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        value={item.memo} 
                                        onChange={e => updatePaymentItem(item.id, 'memo', e.target.value)}
                                        className="h-9"
                                        placeholder="Keterangan..."
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" onClick={() => removePaymentItem(item.id)} className="text-red-500 hover:text-red-700 h-8 w-8">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <div className="p-2 bg-slate-50 border-t">
                    <Button variant="outline" size="sm" onClick={addPaymentItem} className="text-red-600 border-red-200 hover:bg-red-50">
                        <Plus className="mr-2 h-3 w-3" /> Tambah Baris
                    </Button>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                  <Button variant="outline">Batal</Button>
                  <Button onClick={handleSavePayment} disabled={loading} className="bg-red-600 hover:bg-red-700 min-w-[150px]">
                      {loading ? 'Menyimpan...' : 'Simpan Pengeluaran'}
                  </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB 3: HISTORY --- */}
        <TabsContent value="history" className="space-y-4">
             <Card>
                <CardHeader className="pb-3">
                    <div className="flex justify-between items-center">
                        <CardTitle>Riwayat Jurnal Kas/Bank</CardTitle>
                        <Button variant="outline" size="sm" onClick={fetchHistory}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>No. Voucher</TableHead>
                                <TableHead>Tipe</TableHead>
                                <TableHead>Keterangan</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Detail Akun</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-8">Belum ada transaksi.</TableCell></TableRow>
                            ) : (
                                history.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell>{formatDate(t.entry_date)}</TableCell>
                                        <TableCell className="font-mono text-xs">{t.voucher_no}</TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${t.entry_type === 'DEPOSIT' ? 'bg-green-100 text-green-800' : t.entry_type === 'PAYMENT' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {t.entry_type}
                                            </span>
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate">{t.description}</TableCell>
                                        <TableCell className="text-right font-bold">{formatCurrency(t.total_amount)}</TableCell>
                                        <TableCell className="text-xs text-gray-500">
                                            {t.items?.slice(0, 2).map((i: any, idx: number) => (
                                                <div key={idx}>{i.account?.account_code} - {i.account?.account_name} ({formatCurrency(i.debit || i.credit)})</div>
                                            ))}
                                            {t.items?.length > 2 && <div>...</div>}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
             </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
