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
import { Search, Plus, Trash2, Save, RefreshCw, Calendar as CalendarIcon, Download, Upload, FileSpreadsheet } from 'lucide-react';
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import * as XLSX from 'xlsx';
import { useRealtimeRefetch } from '@/hooks/useRealtimeRefetch';
import { useAuth } from '@/context/AuthContext';
import { hasMenuAccess } from '@/lib/permissions';

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

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
  const { user } = useAuth();
  const canImportCashBank = hasMenuAccess(user, 'finance_cashbank_import');
  
  const [activeTab, setActiveTab] = useState('deposit');
  const [accounts, setAccounts] = useState<COA[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Import State ---
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'DEPOSIT' | 'PAYMENT' | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);

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
  const [historyFilter, setHistoryFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // --- Edit State ---
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- Account Search Modal State ---
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null); // To track which row is requesting account
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAccounts();
    fetchHistory();
  }, []); // Initial load

  useEffect(() => {
    const onFocus = () => fetchAccounts();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useRealtimeRefetch({
    tables: ['chart_of_accounts'],
    onRefetch: fetchAccounts,
  });

  useEffect(() => {
    fetchHistory();
  }, [historyFilter]); // Reload on filter change

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
             id,
             debit, credit, 
             account_id,
             description,
             account:chart_of_accounts (id, account_name, account_code)
          )
        `)
        .gte('entry_date', historyFilter.startDate)
        .lte('entry_date', historyFilter.endDate)
        .order('entry_date', { ascending: false })
        .order('voucher_no', { ascending: false });

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
    if (field === 'amount') {
      if (typeof value === 'string') {
        const normalizedValue = value.replace(/,/g, '.');
        if (/^[0-9]*\.?[0-9]*$/.test(normalizedValue)) {
          setDepositItems(depositItems.map(i => i.id === id ? { ...i, amount: normalizedValue as any } : i));
          return;
        } else if (value === '') {
          setDepositItems(depositItems.map(i => i.id === id ? { ...i, amount: 0 } : i));
          return;
        }
      }
    }
    setDepositItems(depositItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const depositTotal = depositItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const handleSaveDeposit = async () => {
    if (!depositHeader.deposit_to) return toast.error('Pilih akun Deposit To');
    if (depositTotal <= 0) return toast.error('Total amount harus lebih dari 0');
    if (depositItems.some(i => !i.account_id)) return toast.error('Lengkapi semua akun pada baris detail');

    setLoading(true);
    try {
      let entryId = editingId;

      if (editingId) {
        // UPDATE Existing Entry
        const { error: updateError } = await supabase
          .from('journal_entries')
          .update({
            entry_date: depositHeader.date,
            voucher_no: depositHeader.voucher_no,
            description: depositHeader.memo,
            entry_type: 'DEPOSIT',
            total_amount: depositTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingId);
        
        if (updateError) throw updateError;

        // Delete old items
        const { error: deleteError } = await supabase
          .from('journal_entry_items')
          .delete()
          .eq('journal_entry_id', editingId);
        
        if (deleteError) throw deleteError;

      } else {
        // INSERT New Entry
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
        entryId = entry.id;
      }

      // 2. Create Items (For both new and update)
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
          credit: item.amount,
          description: item.memo || depositHeader.memo
        });
      });

      const { error: itemsError } = await supabase
        .from('journal_entry_items')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      toast.success(editingId ? 'Transaksi berhasil diperbarui' : 'Penerimaan berhasil disimpan');
      // Reset
      setDepositHeader({ ...depositHeader, voucher_no: '', memo: '' });
      setDepositItems([{ id: '1', account_id: '', amount: 0, memo: '' }]);
      setEditingId(null);
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
    if (field === 'amount') {
      if (typeof value === 'string') {
        const normalizedValue = value.replace(/,/g, '.');
        if (/^[0-9]*\.?[0-9]*$/.test(normalizedValue)) {
          setPaymentItems(paymentItems.map(i => i.id === id ? { ...i, amount: normalizedValue as any } : i));
          return;
        } else if (value === '') {
          setPaymentItems(paymentItems.map(i => i.id === id ? { ...i, amount: 0 } : i));
          return;
        }
      }
    }
    setPaymentItems(paymentItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const paymentTotal = paymentItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const handleSavePayment = async () => {
    if (!paymentHeader.payment_from) return toast.error('Pilih akun Payment From');
    if (paymentTotal <= 0) return toast.error('Total amount harus lebih dari 0');
    if (paymentItems.some(i => !i.account_id)) return toast.error('Lengkapi semua akun pada baris detail');

    setLoading(true);
    try {
      let entryId = editingId;

      if (editingId) {
        // UPDATE Existing Entry
        const { error: updateError } = await supabase
          .from('journal_entries')
          .update({
            entry_date: paymentHeader.date,
            voucher_no: paymentHeader.voucher_no,
            description: paymentHeader.memo,
            entry_type: 'PAYMENT',
            total_amount: paymentTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingId);
        
        if (updateError) throw updateError;

        // Delete old items
        const { error: deleteError } = await supabase
          .from('journal_entry_items')
          .delete()
          .eq('journal_entry_id', editingId);
        
        if (deleteError) throw deleteError;

      } else {
        // INSERT New Entry
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
        entryId = entry.id;
      }

      // 2. Create Items (For both new and update)
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
          debit: item.amount,
          credit: 0,
          description: item.memo || paymentHeader.memo
        });
      });

      const { error: itemsError } = await supabase
        .from('journal_entry_items')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      toast.success(editingId ? 'Transaksi berhasil diperbarui' : 'Pengeluaran berhasil disimpan');
      // Reset
      setPaymentHeader({ ...paymentHeader, voucher_no: '', memo: '' });
      setPaymentItems([{ id: '1', account_id: '', amount: 0, memo: '' }]);
      setEditingId(null);
      fetchHistory();
      setActiveTab('history');

    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (entry: any) => {
    setEditingId(entry.id);
    
    // Identify Main Account and Split Items
    // For DEPOSIT: Main Account is DEBIT, Others are CREDIT
    // For PAYMENT: Main Account is CREDIT, Others are DEBIT
    
    if (entry.entry_type === 'DEPOSIT') {
        const mainItem = entry.items.find((i: any) => i.debit > 0); // Deposit To
        const otherItems = entry.items.filter((i: any) => i.credit > 0); // Source Accounts

        setDepositHeader({
            deposit_to: mainItem?.account_id || '',
            voucher_no: entry.voucher_no,
            date: entry.entry_date,
            memo: entry.description
        });

        setDepositItems(otherItems.map((i: any) => ({
            id: i.id || Math.random().toString(),
            account_id: i.account_id,
            amount: i.credit,
            memo: i.description
        })));

        setActiveTab('deposit');
    } else {
        const mainItem = entry.items.find((i: any) => i.credit > 0); // Payment From
        const otherItems = entry.items.filter((i: any) => i.debit > 0); // Expenses

        setPaymentHeader({
            payment_from: mainItem?.account_id || '',
            voucher_no: entry.voucher_no,
            date: entry.entry_date,
            memo: entry.description
        });

        setPaymentItems(otherItems.map((i: any) => ({
            id: i.id || Math.random().toString(),
            account_id: i.account_id,
            amount: i.debit,
            memo: i.description
        })));

        setActiveTab('payment');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setDepositHeader({ ...depositHeader, voucher_no: '', memo: '' });
    setDepositItems([{ id: '1', account_id: '', amount: 0, memo: '' }]);
    setPaymentHeader({ ...paymentHeader, voucher_no: '', memo: '' });
    setPaymentItems([{ id: '1', account_id: '', amount: 0, memo: '' }]);
    setActiveTab('history');
  };

  const handleAccountSelect = (account: COA) => {
    if (!activeRowId) return;

    if (activeTab === 'deposit') {
        updateDepositItem(activeRowId, 'account_id', account.id);
    } else {
        updatePaymentItem(activeRowId, 'account_id', account.id);
    }
    
    setIsSearchOpen(false);
    setActiveRowId(null);
    setSearchQuery('');
  };

  const openAccountSearch = (rowId: string) => {
    setActiveRowId(rowId);
    setSearchQuery('');
    setIsSearchOpen(true);
  };

  const exportHistoryToExcel = () => {
    if (filteredHistory.length === 0) return toast.error('Tidak ada data untuk diekspor');

    const rows = filteredHistory.map(t => ({
      'Tanggal': formatDate(t.entry_date),
      'No. Voucher': t.voucher_no || '-',
      'Tipe': t.entry_type || '-',
      'Keterangan': t.description || '',
      'Total Amount': t.total_amount || 0,
      'Detail Akun': t.items?.map((i: any) => 
        `${i.account?.account_code} - ${i.account?.account_name} (${formatCurrency(i.debit || i.credit)})`
      ).join('; ') || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Jurnal');
    XLSX.writeFile(
      wb,
      `Riwayat_Jurnal_Kas_Bank_${historyFilter.startDate}_sd_${historyFilter.endDate}.xlsx`
    );
  };

  // --- Import Functions ---
  const openImportModal = (type: 'DEPOSIT' | 'PAYMENT') => {
    if (!canImportCashBank) {
      toast.error('Anda tidak memiliki izin untuk melakukan import data.');
      return;
    }
    setImportType(type);
    setImportFile(null);
    setImportPreview([]);
    setIsImportModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('File harus berformat Excel (.xlsx atau .xls)');
      return;
    }

    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        setImportPreview(jsonData);
        toast.success(`Berhasil memuat ${jsonData.length} baris data`);
      } catch (error) {
        toast.error('Gagal membaca file Excel');
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadImportTemplate = () => {
    const templateData = importType === 'DEPOSIT' ? [
      {
        'Tanggal': '2024-01-15',
        'No. Voucher': 'DEP-001',
        'Kode Akun Kas/Bank': '1-1001',
        'Kode Akun Sumber': '4-1001',
        'Jumlah': 1000000,
        'Keterangan': 'Contoh penerimaan'
      }
    ] : [
      {
        'Tanggal': '2024-01-15',
        'No. Voucher': 'PAY-001',
        'Kode Akun Kas/Bank': '1-1001',
        'Kode Akun Biaya': '6-1001',
        'Jumlah': 500000,
        'Keterangan': 'Contoh pengeluaran'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `Template_Import_${importType === 'DEPOSIT' ? 'Penerimaan' : 'Pengeluaran'}.xlsx`);
  };

  const processImport = async () => {
    if (!importFile || importPreview.length === 0) {
      toast.error('Pilih file Excel terlebih dahulu');
      return;
    }

    if (!importType) return;

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const row of importPreview) {
        try {
          const entryDate = row['Tanggal'] || row['tanggal'] || row['Date'] || new Date().toISOString().split('T')[0];
          const voucherNo = row['No. Voucher'] || row['no_voucher'] || row['Voucher No'] || '';
          const cashBankCode = row['Kode Akun Kas/Bank'] || row['kode_akun_kas_bank'] || row['Cash Bank Account'] || '';
          const detailCode = importType === 'DEPOSIT' 
            ? (row['Kode Akun Sumber'] || row['kode_akun_sumber'] || row['Source Account'] || '')
            : (row['Kode Akun Biaya'] || row['kode_akun_biaya'] || row['Expense Account'] || '');
          const amount = parseFloat(row['Jumlah'] || row['jumlah'] || row['Amount'] || '0');
          const memo = row['Keterangan'] || row['keterangan'] || row['Description'] || '';

          if (!cashBankCode || !detailCode || amount <= 0) {
            errorCount++;
            continue;
          }

          const cashBankAccount = accounts.find(a => a.account_code === cashBankCode);
          const detailAccount = accounts.find(a => a.account_code === detailCode);

          if (!cashBankAccount || !detailAccount) {
            errorCount++;
            continue;
          }

          const { data: entry, error: entryError } = await supabase
            .from('journal_entries')
            .insert([{
              entry_date: entryDate,
              voucher_no: voucherNo || (importType === 'DEPOSIT' ? `DEP-${Date.now().toString().slice(-6)}` : `PAY-${Date.now().toString().slice(-6)}`),
              description: memo,
              entry_type: importType,
              total_amount: amount
            }])
            .select()
            .single();

          if (entryError) throw entryError;

          const itemsPayload = [];
          
          if (importType === 'DEPOSIT') {
            // DEBIT (Cash/Bank Account)
            itemsPayload.push({
              journal_entry_id: entry.id,
              account_id: cashBankAccount.id,
              debit: amount,
              credit: 0,
              description: memo
            });
            // CREDIT (Source Account)
            itemsPayload.push({
              journal_entry_id: entry.id,
              account_id: detailAccount.id,
              debit: 0,
              credit: amount,
              description: memo
            });
          } else {
            // CREDIT (Cash/Bank Account)
            itemsPayload.push({
              journal_entry_id: entry.id,
              account_id: cashBankAccount.id,
              debit: 0,
              credit: amount,
              description: memo
            });
            // DEBIT (Expense Account)
            itemsPayload.push({
              journal_entry_id: entry.id,
              account_id: detailAccount.id,
              debit: amount,
              credit: 0,
              description: memo
            });
          }

          const { error: itemsError } = await supabase
            .from('journal_entry_items')
            .insert(itemsPayload);

          if (itemsError) throw itemsError;

          successCount++;
        } catch (error) {
          errorCount++;
          console.error('Error importing row:', error);
        }
      }

      toast.success(`Import selesai: ${successCount} berhasil, ${errorCount} gagal`);
      setIsImportModalOpen(false);
      fetchHistory();
    } catch (error: any) {
      toast.error('Gagal melakukan import: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const filteredAccounts = allAccounts.filter(acc => 
    acc.account_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.account_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reusable Account Search Modal
  const AccountSearchModal = () => (
    <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>Pilih Akun</DialogTitle>
                <DialogDescription>Cari dan pilih akun untuk transaksi ini.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Cari Kode atau Nama Akun..." 
                        className="pl-8" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="max-h-[400px] overflow-auto border rounded-md">
                    <Table>
                        <TableHeader className="bg-slate-100 sticky top-0">
                            <TableRow>
                                <TableHead className="w-[120px] font-bold text-black">Kode Akun</TableHead>
                                <TableHead className="font-bold text-black">Nama Akun</TableHead>
                                <TableHead className="w-[150px] font-bold text-black">Kategori</TableHead>
                                <TableHead className="w-[80px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAccounts.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8">Tidak ada akun ditemukan.</TableCell></TableRow>
                            ) : (
                                filteredAccounts.map(acc => (
                                    <TableRow key={acc.id} className="cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => handleAccountSelect(acc)}>
                                        <TableCell className="font-mono font-bold text-blue-700">{acc.account_code}</TableCell>
                                        <TableCell className="font-medium">{acc.account_name}</TableCell>
                                        <TableCell className="text-xs text-gray-500">
                                            <span className="bg-slate-100 px-2 py-1 rounded border">
                                                {acc.category} - {acc.sub_category?.replace('_', ' ')}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-800">Pilih</Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </DialogContent>
    </Dialog>
  );

  // Import Modal
  const ImportModal = () => (
    <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import {importType === 'DEPOSIT' ? 'Penerimaan' : 'Pengeluaran'} dari Excel
          </DialogTitle>
          <DialogDescription>
            Import data transaksi {importType === 'DEPOSIT' ? 'penerimaan' : 'pengeluaran'} dari file Excel.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Template Download */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-blue-900 mb-1">Template Excel</h4>
                <p className="text-sm text-blue-700 mb-3">
                  Download template untuk format yang benar. Pastikan kode akun sesuai dengan data di sistem.
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={downloadImportTemplate}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template {importType === 'DEPOSIT' ? 'Penerimaan' : 'Pengeluaran'}
                </Button>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Upload File Excel</Label>
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isImporting}
                className="flex-1"
              />
              {importFile && (
                <div className="text-sm text-green-600 flex items-center gap-1">
                  <FileSpreadsheet className="h-4 w-4" />
                  {importFile.name}
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          {importPreview.length > 0 && (
            <div className="space-y-2">
              <Label>Preview Data ({importPreview.length} baris)</Label>
              <div className="border rounded-md max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader className="bg-slate-100 sticky top-0">
                    <TableRow>
                      {Object.keys(importPreview[0] || {}).map((key, idx) => (
                        <TableHead key={idx} className="font-semibold text-xs">
                          {key}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.slice(0, 10).map((row, idx) => (
                      <TableRow key={idx}>
                        {Object.values(row).map((value, cellIdx) => (
                          <TableCell key={cellIdx} className="text-xs">
                            {String(value)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {importPreview.length > 10 && (
                      <TableRow>
                        <TableCell colSpan={Object.keys(importPreview[0]).length} className="text-center text-xs text-gray-500">
                          ... dan {importPreview.length - 10} baris lainnya
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Account Codes Reference */}
          <div className="bg-slate-50 border rounded-lg p-4">
            <h4 className="font-semibold mb-2 text-sm">Referensi Kode Akun Kas/Bank:</h4>
            <div className="max-h-[150px] overflow-auto text-xs">
              {cashBankAccounts.map(acc => (
                <div key={acc.id} className="py-1 border-b last:border-0">
                  <span className="font-mono font-bold text-blue-700">{acc.account_code}</span>
                  <span className="ml-2">{acc.account_name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setIsImportModalOpen(false)}
            disabled={isImporting}
          >
            Batal
          </Button>
          <Button 
            onClick={processImport}
            disabled={!importFile || importPreview.length === 0 || isImporting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isImporting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import Data
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const filteredHistory = history.filter(t => {
    const search = historySearch.toLowerCase();
    return (
      (t.voucher_no?.toLowerCase() || '').includes(search) ||
      (t.description?.toLowerCase() || '').includes(search)
    );
  });

  return (
    <div className="space-y-6">
      {AccountSearchModal()}
      {ImportModal()}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Kas & Bank (Jurnal)</h2>
        {editingId && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-2 rounded flex items-center gap-4">
                <span>Sedang Mengedit Transaksi...</span>
                <Button size="sm" variant="destructive" onClick={handleCancelEdit}>Batal Edit</Button>
            </div>
        )}
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
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Penerimaan Kas/Bank</CardTitle>
                  <CardDescription>Catat penerimaan uang masuk (Deposit).</CardDescription>
                </div>
                {canImportCashBank && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => openImportModal('DEPOSIT')}
                    className="border-green-200 text-green-700 hover:bg-green-50"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import Excel
                  </Button>
                )}
              </div>
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
              <div className="border rounded-md flex flex-col h-[400px]">
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-100 sticky top-0 z-10 shadow-sm">
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
                                        <div className="flex gap-2">
                                            <Input 
                                                readOnly
                                                value={allAccounts.find(a => a.id === item.account_id)?.account_name || ''} 
                                                placeholder="Pilih Akun..."
                                                className="cursor-pointer bg-slate-50"
                                                onClick={() => openAccountSearch(item.id)}
                                            />
                                            <Button variant="outline" size="icon" onClick={() => openAccountSearch(item.id)}>
                                                <Search className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            type="text" 
                                            value={item.amount || ''} 
                                            onChange={e => updateDepositItem(item.id, 'amount', e.target.value)}
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
                </div>
                <div className="p-2 bg-slate-50 border-t shrink-0">
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
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Pengeluaran Kas/Bank</CardTitle>
                  <CardDescription>Catat pembayaran atau biaya keluar (Payment).</CardDescription>
                </div>
                {canImportCashBank && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => openImportModal('PAYMENT')}
                    className="border-red-200 text-red-700 hover:bg-red-50"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import Excel
                  </Button>
                )}
              </div>
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
              <div className="border rounded-md flex flex-col h-[400px]">
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-100 sticky top-0 z-10 shadow-sm">
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
                                        <div className="flex gap-2">
                                            <Input 
                                                readOnly
                                                value={allAccounts.find(a => a.id === item.account_id)?.account_name || ''} 
                                                placeholder="Pilih Akun..."
                                                className="cursor-pointer bg-slate-50"
                                                onClick={() => openAccountSearch(item.id)}
                                            />
                                            <Button variant="outline" size="icon" onClick={() => openAccountSearch(item.id)}>
                                                <Search className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            type="text" 
                                            value={item.amount || ''} 
                                            onChange={e => updatePaymentItem(item.id, 'amount', e.target.value)}
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
                </div>
                <div className="p-2 bg-slate-50 border-t shrink-0">
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
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <CardTitle>Riwayat Jurnal Kas/Bank</CardTitle>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={exportHistoryToExcel} disabled={history.length === 0}>
                                    <Download className="h-4 w-4 mr-2" /> Export Excel
                                </Button>
                                <Button variant="outline" size="sm" onClick={fetchHistory}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
                            </div>
                        </div>
                        <div className="flex flex-col md:flex-row gap-2">
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border flex-1">
                                <CalendarIcon className="h-4 w-4 text-gray-500" />
                                <Input 
                                    type="date" 
                                    className="w-auto h-8 bg-white" 
                                    value={historyFilter.startDate}
                                    onChange={e => setHistoryFilter({...historyFilter, startDate: e.target.value})}
                                />
                                <span className="text-gray-400">-</span>
                                <Input 
                                    type="date" 
                                    className="w-auto h-8 bg-white" 
                                    value={historyFilter.endDate}
                                    onChange={e => setHistoryFilter({...historyFilter, endDate: e.target.value})}
                                />
                            </div>
                            <div className="relative flex-1">
                                <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Cari No. Voucher atau Keterangan..."
                                    className="pl-8 h-12 bg-white"
                                    value={historySearch}
                                    onChange={(e) => setHistorySearch(e.target.value)}
                                />
                            </div>
                        </div>
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
                                <TableHead className="w-[80px]">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredHistory.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center py-8">Tidak ada transaksi ditemukan.</TableCell></TableRow>
                            ) : (
                                filteredHistory.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell>{formatDate(t.entry_date)}</TableCell>
                                        <TableCell className="font-mono text-xs">{t.voucher_no}</TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${t.entry_type === 'DEPOSIT' ? 'bg-green-100 text-green-800' : t.entry_type === 'PAYMENT' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {t.entry_type}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="whitespace-pre-wrap text-sm">{t.description}</div>
                                        </TableCell>
                                        <TableCell className="text-right font-bold">{formatCurrency(t.total_amount)}</TableCell>
                                        <TableCell className="text-xs text-gray-500">
                                            {t.items?.slice(0, 2).map((i: any, idx: number) => (
                                                <div key={idx}>{i.account?.account_code} - {i.account?.account_name} ({formatCurrency(i.debit || i.credit)})</div>
                                            ))}
                                            {t.items?.length > 2 && <div>...</div>}
                                        </TableCell>
                                        <TableCell>
                                            <Button variant="outline" size="sm" onClick={() => handleEdit(t)}>Edit</Button>
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
