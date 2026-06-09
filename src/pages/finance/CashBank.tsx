import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Search, Plus, Trash2, Save, RefreshCw, Calendar as CalendarIcon, Pencil } from 'lucide-react';
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRealtimeRefetch } from '@/hooks/useRealtimeRefetch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button as UIButton } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { logActivity } from '@/lib/activityLog';

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
  amount: string;
  memo: string;
};

export default function CashBank() {
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
    { id: '1', account_id: '', amount: '', memo: '' }
  ]);

  // --- Payment State ---
  const [paymentHeader, setPaymentHeader] = useState({
    payment_from: '', // Account ID
    voucher_no: '',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });
  const [paymentItems, setPaymentItems] = useState<JournalEntryItem[]>([
    { id: '1', account_id: '', amount: '', memo: '' }
  ]);

  // --- History State ---
  const [history, setHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'DEPOSIT' | 'PAYMENT'>('ALL');
  const [historyDateRange, setHistoryDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'DEPOSIT' | 'PAYMENT' | null>(null);

  useEffect(() => {
    (async () => {
      const nextAccounts = await fetchAccounts();
      await fetchHistory(nextAccounts);
    })();
  }, []);

  useEffect(() => {
    if (activeTab !== 'history') return;
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, historyDateRange.start, historyDateRange.end, historyTypeFilter]);

  useEffect(() => {
    const onFocus = () => fetchAccounts();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useRealtimeRefetch({
    tables: ['chart_of_accounts'],
    onRefetch: fetchAccounts,
  });

  async function fetchAccounts() {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('account_type', 'DETAIL') // Only detail accounts
        .order('account_code');
      
      if (error) throw error;
      setAccounts(data || []);
      return data || [];
    } catch (error: any) {
      toast.error('Gagal memuat akun: ' + error.message);
      return [];
    }
  }

  async function fetchHistory(nextAccounts?: COA[]) {
    setLoading(true);
    try {
      const sourceAccounts = Array.isArray(nextAccounts) ? nextAccounts : accounts;
      const cashBankIds = sourceAccounts
        .filter((a) =>
          a.sub_category === 'AKTIVA_LANCAR' &&
          (String(a.account_name || '').toLowerCase().includes('kas') || String(a.account_name || '').toLowerCase().includes('bank'))
        )
        .map((a) => a.id)
        .filter(Boolean);

      let query = supabase
        .from('journal_entries')
        .select(`
          *,
          cb:journal_entry_items!inner (
             account_id
          ),
          items:journal_entry_items (
             account_id,
             debit, credit,
             description,
             account:chart_of_accounts (account_name, account_code)
          )
        `)
        .order('entry_date', { ascending: false });

      if (historyDateRange.start) query = query.gte('entry_date', historyDateRange.start);
      if (historyDateRange.end) query = query.lte('entry_date', historyDateRange.end);
      if (cashBankIds.length > 0) query = query.in('cb.account_id', cashBankIds);

      const { data, error } = await query;

      if (error) throw error;
      const cashBankIdSet = new Set(cashBankIds);
      const normalized = (data || []).map((row: any) => {
        const items = Array.isArray(row.items) ? row.items : [];
        const cashItems = items.filter((i: any) => cashBankIdSet.has(String(i.account_id)));
        const cashDebit = cashItems.reduce((acc: number, i: any) => acc + Number(i.debit || 0), 0);
        const cashCredit = cashItems.reduce((acc: number, i: any) => acc + Number(i.credit || 0), 0);
        const derivedType =
          cashDebit > cashCredit ? 'DEPOSIT' : cashCredit > cashDebit ? 'PAYMENT' : String(row.entry_type || '').trim() || null;
        return {
          ...row,
          cash_type: derivedType,
        };
      });
      setHistory(normalized);
    } catch (error: any) {
      // Ignore table not found error initially if migration hasn't run
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const filteredHistory = history.filter((t: any) => {
    if (historyTypeFilter !== 'ALL' && String(t.cash_type || '') !== historyTypeFilter) return false;
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    const voucher = String(t.voucher_no || '').toLowerCase();
    const desc = String(t.description || '').toLowerCase();
    const type = String(t.cash_type || t.entry_type || '').toLowerCase();
    const amt = String(t.total_amount ?? '').toLowerCase();
    const items = Array.isArray(t.items) ? t.items : [];
    const itemText = items
      .map((i: any) => {
        const a = i.account || {};
        const code = String(a.account_code || '').toLowerCase();
        const name = String(a.account_name || '').toLowerCase();
        const memo = String(i.description || '').toLowerCase();
        return `${code} ${name} ${memo}`.trim();
      })
      .join(' ');
    return (
      voucher.includes(q) ||
      desc.includes(q) ||
      type.includes(q) ||
      amt.includes(q) ||
      itemText.includes(q)
    );
  });

  const resetDepositForm = () => {
    setDepositHeader({
      deposit_to: '',
      voucher_no: '',
      date: new Date().toISOString().split('T')[0],
      memo: ''
    });
    setDepositItems([{ id: '1', account_id: '', amount: '', memo: '' }]);
  };

  const resetPaymentForm = () => {
    setPaymentHeader({
      payment_from: '',
      voucher_no: '',
      date: new Date().toISOString().split('T')[0],
      memo: ''
    });
    setPaymentItems([{ id: '1', account_id: '', amount: '', memo: '' }]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingType(null);
    resetDepositForm();
    resetPaymentForm();
    setActiveTab('history');
  };

  const handleEditHistory = async (id: string) => {
    setLoading(true);
    try {
      const { data: entry, error } = await supabase
        .from('journal_entries')
        .select(`
          id,
          entry_date,
          voucher_no,
          description,
          entry_type,
          total_amount,
          items:journal_entry_items (
            account_id,
            debit,
            credit,
            description
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      const items = Array.isArray((entry as any).items) ? (entry as any).items : [];
      const entryType = String((entry as any).entry_type || '').toUpperCase();
      const entryDate = String((entry as any).entry_date || new Date().toISOString().split('T')[0]);
      const voucherNo = String((entry as any).voucher_no || '');
      const memo = String((entry as any).description || '');

      setEditingId(String((entry as any).id));

      if (entryType === 'DEPOSIT') {
        setEditingType('DEPOSIT');
        const main = items
          .filter((i: any) => Number(i.debit || 0) > 0 && Number(i.credit || 0) <= 0)
          .sort((a: any, b: any) => Number(b.debit || 0) - Number(a.debit || 0))[0];
        const details = items.filter((i: any) => Number(i.credit || 0) > 0);
        setDepositHeader({
          deposit_to: String(main?.account_id || ''),
          voucher_no: voucherNo,
          date: entryDate,
          memo: memo,
        });
        setDepositItems(
          details.length > 0
            ? details.map((i: any, idx: number) => ({
                id: `${idx + 1}`,
                account_id: String(i.account_id || ''),
                amount: String(Number(i.credit || 0) || ''),
                memo: String(i.description || memo || ''),
              }))
            : [{ id: '1', account_id: '', amount: '', memo: '' }]
        );
        setActiveTab('deposit');
        return;
      }

      if (entryType === 'PAYMENT') {
        setEditingType('PAYMENT');
        const main = items
          .filter((i: any) => Number(i.credit || 0) > 0 && Number(i.debit || 0) <= 0)
          .sort((a: any, b: any) => Number(b.credit || 0) - Number(a.credit || 0))[0];
        const details = items.filter((i: any) => Number(i.debit || 0) > 0);
        setPaymentHeader({
          payment_from: String(main?.account_id || ''),
          voucher_no: voucherNo,
          date: entryDate,
          memo: memo,
        });
        setPaymentItems(
          details.length > 0
            ? details.map((i: any, idx: number) => ({
                id: `${idx + 1}`,
                account_id: String(i.account_id || ''),
                amount: String(Number(i.debit || 0) || ''),
                memo: String(i.description || memo || ''),
              }))
            : [{ id: '1', account_id: '', amount: '', memo: '' }]
        );
        setActiveTab('payment');
        return;
      }

      toast.error(`Tipe jurnal ${entryType} belum didukung untuk edit dari Kas/Bank.`);
      setEditingId(null);
      setEditingType(null);
    } catch (e: any) {
      toast.error('Gagal memuat data untuk edit: ' + String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('Hapus transaksi ini?')) return;
    setLoading(true);
    try {
      await supabase.from('journal_entry_items').delete().eq('journal_entry_id', id);
      const { error } = await supabase.from('journal_entries').delete().eq('id', id);
      if (error) throw error;
      if (editingId === id) cancelEdit();
      toast.success('Transaksi dihapus');
      {
        const row = history.find((x: any) => String(x.id) === String(id)) as any;
        const voucherNo = String(row?.voucher_no || '').trim() || null;
        const entryType = String(row?.entry_type || '').trim() || null;
        const totalAmount = Number(row?.total_amount || 0);
        void logActivity({
          action: 'CASHBANK_DELETE',
          module: 'CASH_BANK',
          entity_type: 'journal_entries',
          entity_id: String(id),
          details: `Hapus transaksi ${voucherNo || id}`,
          meta: { journal_entry_id: id, voucher_no: voucherNo, entry_type: entryType, total_amount: totalAmount > 0 ? totalAmount : null },
        });
      }
      fetchHistory();
    } catch (e: any) {
      toast.error('Gagal menghapus: ' + String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Filter Accounts
  // Cash/Bank only for Header
  const cashBankAccounts = accounts.filter(a => 
    a.sub_category === 'AKTIVA_LANCAR' && 
    (a.account_name.toLowerCase().includes('kas') || a.account_name.toLowerCase().includes('bank'))
  );
  
  // All accounts for Detail
  const allAccounts = accounts;

  const normalizeNumericOnly = (value: string) => {
    const cleaned = String(value || '').replace(/[^\d]/g, '');
    return cleaned;
  };

  const getAccountLabel = (accountId: string) => {
    const a = accounts.find((x) => x.id === accountId);
    if (!a) return '';
    return `${a.account_code} - ${a.account_name}`;
  };

  const AccountPicker = ({
    value,
    onChange,
    list,
    placeholder,
    triggerClassName,
  }: {
    value: string;
    onChange: (id: string) => void;
    list: COA[];
    placeholder: string;
    triggerClassName?: string;
  }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return list;
      return list.filter((a) => {
        const code = String(a.account_code || '').toLowerCase();
        const name = String(a.account_name || '').toLowerCase();
        return code.includes(q) || name.includes(q);
      });
    }, [list, query]);

    const label = value ? getAccountLabel(value) : '';

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <UIButton
            type="button"
            variant="outline"
            className={cn("w-full justify-between font-normal", !label && "text-muted-foreground", triggerClassName)}
          >
            <span className="truncate">{label || placeholder}</span>
            <Search className="ml-2 h-4 w-4 shrink-0 opacity-60" />
          </UIButton>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[420px]" align="start">
          <Command>
            <CommandInput placeholder="Cari akun..." value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>Akun tidak ditemukan.</CommandEmpty>
              <CommandGroup heading="Daftar Akun">
                {filtered.slice(0, 80).map((a) => (
                  <CommandItem
                    key={a.id}
                    onSelect={() => {
                      onChange(a.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className="flex flex-col items-start py-2"
                  >
                    <span className="font-medium text-sm">{a.account_code} - {a.account_name}</span>
                    <span className="text-xs text-muted-foreground">{a.category} • {a.sub_category}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  // --- Deposit Logic ---
  const addDepositItem = () => {
    setDepositItems([...depositItems, { id: Math.random().toString(), account_id: '', amount: '', memo: '' }]);
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
      const isEditingDeposit = Boolean(editingId) && editingType === 'DEPOSIT';
      const voucherNo = depositHeader.voucher_no || `DEP-${Date.now().toString().slice(-6)}`;

      let entryId = '';
      if (isEditingDeposit) {
        entryId = String(editingId);
        const { error: updErr } = await supabase
          .from('journal_entries')
          .update({
            entry_date: depositHeader.date,
            voucher_no: voucherNo,
            description: depositHeader.memo,
            entry_type: 'DEPOSIT',
            total_amount: depositTotal
          })
          .eq('id', entryId);
        if (updErr) throw updErr;
        await supabase.from('journal_entry_items').delete().eq('journal_entry_id', entryId);
      } else {
        const { data: entry, error: entryError } = await supabase
          .from('journal_entries')
          .insert([{
            entry_date: depositHeader.date,
            voucher_no: voucherNo,
            description: depositHeader.memo,
            entry_type: 'DEPOSIT',
            total_amount: depositTotal
          }])
          .select()
          .single();
        if (entryError) throw entryError;
        entryId = String((entry as any).id);
      }

      // 2. Create Items
      const itemsPayload = [];
      
      // A. DEBIT (Deposit To Account) - Total Amount
      itemsPayload.push({
        journal_entry_id: entryId,
        account_id: depositHeader.deposit_to,
        debit: depositTotal,
        credit: 0,
        description: depositHeader.memo
      });

      // B. CREDIT (Detail Accounts)
      depositItems.forEach(item => {
        itemsPayload.push({
          journal_entry_id: entryId,
          account_id: item.account_id,
          debit: 0,
          credit: Number(item.amount) || 0,
          description: item.memo || depositHeader.memo
        });
      });

      const { error: itemsError } = await supabase
        .from('journal_entry_items')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      toast.success(isEditingDeposit ? 'Penerimaan berhasil diperbarui' : 'Penerimaan berhasil disimpan');
      void logActivity({
        action: isEditingDeposit ? 'CASHBANK_DEPOSIT_UPDATE' : 'CASHBANK_DEPOSIT_CREATE',
        module: 'CASH_BANK',
        entity_type: 'journal_entries',
        entity_id: String(entryId),
        details: `${isEditingDeposit ? 'Update' : 'Create'} penerimaan ${voucherNo}`,
        meta: {
          journal_entry_id: entryId,
          voucher_no: voucherNo,
          entry_type: 'DEPOSIT',
          total_amount: depositTotal,
          account_to: depositHeader.deposit_to,
          date: depositHeader.date,
        },
      });
      setEditingId(null);
      setEditingType(null);
      resetDepositForm();
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
    setPaymentItems([...paymentItems, { id: Math.random().toString(), account_id: '', amount: '', memo: '' }]);
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
      const isEditingPayment = Boolean(editingId) && editingType === 'PAYMENT';
      const voucherNo = paymentHeader.voucher_no || `PAY-${Date.now().toString().slice(-6)}`;

      let entryId = '';
      if (isEditingPayment) {
        entryId = String(editingId);
        const { error: updErr } = await supabase
          .from('journal_entries')
          .update({
            entry_date: paymentHeader.date,
            voucher_no: voucherNo,
            description: paymentHeader.memo,
            entry_type: 'PAYMENT',
            total_amount: paymentTotal
          })
          .eq('id', entryId);
        if (updErr) throw updErr;
        await supabase.from('journal_entry_items').delete().eq('journal_entry_id', entryId);
      } else {
        const { data: entry, error: entryError } = await supabase
          .from('journal_entries')
          .insert([{
            entry_date: paymentHeader.date,
            voucher_no: voucherNo,
            description: paymentHeader.memo,
            entry_type: 'PAYMENT',
            total_amount: paymentTotal
          }])
          .select()
          .single();
        if (entryError) throw entryError;
        entryId = String((entry as any).id);
      }

      // 2. Create Items
      const itemsPayload = [];
      
      // A. CREDIT (Payment From Account) - Total Amount
      itemsPayload.push({
        journal_entry_id: entryId,
        account_id: paymentHeader.payment_from,
        debit: 0,
        credit: paymentTotal,
        description: paymentHeader.memo
      });

      // B. DEBIT (Detail Accounts - Expenses etc)
      paymentItems.forEach(item => {
        itemsPayload.push({
          journal_entry_id: entryId,
          account_id: item.account_id,
          debit: Number(item.amount) || 0,
          credit: 0,
          description: item.memo || paymentHeader.memo
        });
      });

      const { error: itemsError } = await supabase
        .from('journal_entry_items')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      toast.success(isEditingPayment ? 'Pengeluaran berhasil diperbarui' : 'Pengeluaran berhasil disimpan');
      void logActivity({
        action: isEditingPayment ? 'CASHBANK_PAYMENT_UPDATE' : 'CASHBANK_PAYMENT_CREATE',
        module: 'CASH_BANK',
        entity_type: 'journal_entries',
        entity_id: String(entryId),
        details: `${isEditingPayment ? 'Update' : 'Create'} pengeluaran ${voucherNo}`,
        meta: {
          journal_entry_id: entryId,
          voucher_no: voucherNo,
          entry_type: 'PAYMENT',
          total_amount: paymentTotal,
          account_from: paymentHeader.payment_from,
          date: paymentHeader.date,
        },
      });
      setEditingId(null);
      setEditingType(null);
      resetPaymentForm();
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
        <h2 className="text-3xl font-bold tracking-tight">Kas & Bank</h2>
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
             History Kas/Bank
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
                  <AccountPicker
                    value={depositHeader.deposit_to}
                    onChange={(v) => setDepositHeader({ ...depositHeader, deposit_to: v })}
                    list={cashBankAccounts}
                    placeholder="Pilih Akun Kas/Bank..."
                    triggerClassName="bg-white border-green-200"
                  />
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
                                    <AccountPicker
                                      value={item.account_id}
                                      onChange={(v) => updateDepositItem(item.id, 'account_id', v)}
                                      list={allAccounts}
                                      placeholder="Pilih Akun..."
                                      triggerClassName="h-9"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="text"
                                        inputMode="numeric"
                                        value={item.amount || ''} 
                                        onChange={e => updateDepositItem(item.id, 'amount', normalizeNumericOnly(e.target.value))}
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (editingId && editingType === 'DEPOSIT') return cancelEdit();
                      resetDepositForm();
                    }}
                  >
                    Batal
                  </Button>
                  <Button onClick={handleSaveDeposit} disabled={loading} className="bg-green-600 hover:bg-green-700 min-w-[150px]">
                      {loading ? 'Menyimpan...' : (editingId && editingType === 'DEPOSIT' ? 'Update Penerimaan' : 'Simpan Penerimaan')}
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
                  <AccountPicker
                    value={paymentHeader.payment_from}
                    onChange={(v) => setPaymentHeader({ ...paymentHeader, payment_from: v })}
                    list={cashBankAccounts}
                    placeholder="Pilih Akun Kas/Bank..."
                    triggerClassName="bg-white border-red-200"
                  />
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
                                    <AccountPicker
                                      value={item.account_id}
                                      onChange={(v) => updatePaymentItem(item.id, 'account_id', v)}
                                      list={allAccounts}
                                      placeholder="Pilih Akun..."
                                      triggerClassName="h-9"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="text"
                                        inputMode="numeric"
                                        value={item.amount || ''} 
                                        onChange={e => updatePaymentItem(item.id, 'amount', normalizeNumericOnly(e.target.value))}
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (editingId && editingType === 'PAYMENT') return cancelEdit();
                      resetPaymentForm();
                    }}
                  >
                    Batal
                  </Button>
                  <Button onClick={handleSavePayment} disabled={loading} className="bg-red-600 hover:bg-red-700 min-w-[150px]">
                      {loading ? 'Menyimpan...' : (editingId && editingType === 'PAYMENT' ? 'Update Pengeluaran' : 'Simpan Pengeluaran')}
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
                        <CardTitle>History Kas/Bank</CardTitle>
                        <Button variant="outline" size="sm" onClick={fetchHistory}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-end gap-3 mb-4">
                      <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm">
                        <CalendarIcon className="h-4 w-4 text-gray-500 ml-2" />
                        <Input
                          type="date"
                          className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer"
                          value={historyDateRange.start}
                          onChange={(e) => setHistoryDateRange({ ...historyDateRange, start: e.target.value })}
                        />
                        <span className="text-gray-400 font-medium">-</span>
                        <Input
                          type="date"
                          className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer"
                          value={historyDateRange.end}
                          onChange={(e) => setHistoryDateRange({ ...historyDateRange, end: e.target.value })}
                        />
                      </div>
                      <div className="relative w-72">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Cari voucher/keterangan/akun..."
                          className="pl-8"
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                        />
                      </div>
                      <div className="w-44">
                        <Label htmlFor="history-type-filter" className="sr-only">Filter Tipe</Label>
                        <select
                          id="history-type-filter"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={historyTypeFilter}
                          onChange={(e) => setHistoryTypeFilter(e.target.value as 'ALL' | 'DEPOSIT' | 'PAYMENT')}
                        >
                          <option value="ALL">Semua Tipe</option>
                          <option value="DEPOSIT">Penerimaan</option>
                          <option value="PAYMENT">Pengeluaran</option>
                        </select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchHistory}
                        disabled={loading}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" /> Terapkan
                      </Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>No. Voucher</TableHead>
                                <TableHead>Tipe</TableHead>
                                <TableHead>Keterangan</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Detail Akun</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredHistory.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center py-8">Belum ada transaksi.</TableCell></TableRow>
                            ) : (
                                filteredHistory.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell>{formatDate(t.entry_date)}</TableCell>
                                        <TableCell className="font-mono text-xs">{t.voucher_no}</TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${String(t.cash_type || t.entry_type) === 'DEPOSIT' ? 'bg-green-100 text-green-800' : String(t.cash_type || t.entry_type) === 'PAYMENT' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {String(t.cash_type || t.entry_type || '')}
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
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEditHistory(String(t.id))}
                                                disabled={loading}
                                              >
                                                <Pencil className="h-4 w-4 mr-2" /> Edit
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="text-red-600 border-red-200 hover:bg-red-50"
                                                onClick={() => handleDeleteHistory(String(t.id))}
                                                disabled={loading}
                                              >
                                                <Trash2 className="h-4 w-4 mr-2" /> Hapus
                                              </Button>
                                            </div>
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
