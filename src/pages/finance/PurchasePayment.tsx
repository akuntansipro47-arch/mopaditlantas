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
import { Search, Wallet, RefreshCw, Edit, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtimeRefetch } from '@/hooks/useRealtimeRefetch';

export default function PurchasePayment() {
  // Trigger deployment update
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Filters
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, UNPAID, PARTIAL, PAID

  // Payment Dialog
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [originalPaymentAmount, setOriginalPaymentAmount] = useState(0);

  const [paymentData, setPaymentData] = useState({
    amount: 0,
    transfer_fee: 0,
    fee_account_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'TRANSFER',
    payment_account_id: '', 
    notes: ''
  });

  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [apAccount, setApAccount] = useState<any>(null); // Accounts Payable (Hutang Usaha)

  useEffect(() => {
    fetchInvoices();
    fetchCashBankAccounts();
    fetchExpenseAccounts();
    fetchApAccount();
  }, []);

  useEffect(() => {
    if (!isPayOpen) return;
    fetchCashBankAccounts();
    fetchExpenseAccounts();
    fetchApAccount();
  }, [isPayOpen]);

  useEffect(() => {
    const onFocus = () => {
      fetchCashBankAccounts();
      fetchExpenseAccounts();
      fetchApAccount();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useRealtimeRefetch({
    tables: ['chart_of_accounts'],
    onRefetch: () => {
      fetchCashBankAccounts();
      fetchExpenseAccounts();
      fetchApAccount();
    },
  });

  useEffect(() => {
    if (activeTab === 'history') {
        fetchPaymentHistory();
    }
  }, [activeTab, dateFilter]);

  async function fetchApAccount() {
    try {
        // Find ACCOUNT (Detail) that is Accounts Payable
        // Strategy: 
        // 1. Check account_type='DETAIL' AND (name contains 'Hutang Usaha' or 'Hutang Dagang')
        // 2. Or sub_category='HUTANG' AND account_type='DETAIL'
        
        const { data } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code, account_name')
            .eq('account_type', 'DETAIL')
            .or('account_name.ilike.%hutang usaha%,account_name.ilike.%hutang dagang%')
            .limit(1)
            .maybeSingle();
        
        if (data) {
            setApAccount(data);
        } else {
            // Fallback: any detail account in HUTANG subcategory
            const { data: data2 } = await supabase
                .from('chart_of_accounts')
                .select('id, account_code, account_name')
                .eq('sub_category', 'HUTANG')
                .eq('account_type', 'DETAIL')
                .limit(1)
                .maybeSingle();
            if (data2) setApAccount(data2);
        }
    } catch (e) {
        console.error("Error fetching AP account", e);
    }
  }

  async function fetchCashBankAccounts() {
    try {
        const { data } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code, account_name, sub_category, category')
            .eq('account_type', 'DETAIL')
            .eq('category', 'AKTIVA')
            .order('account_code');
        
        // Filter in JS to be safe: Must be AKTIVA LANCAR or name contains kas/bank
        const filtered = data?.filter(a => 
            a.sub_category === 'AKTIVA_LANCAR' || 
            a.account_name.toLowerCase().includes('kas') || 
            a.account_name.toLowerCase().includes('bank')
        ) || [];

        setCashBankAccounts(filtered);
    } catch (error) {
        console.error("Error fetching accounts:", error);
    }
  }

  async function fetchExpenseAccounts() {
    try {
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, category, sub_category')
        .eq('account_type', 'DETAIL')
        .order('account_code');

      const filtered =
        data?.filter((a) => {
          const cat = String(a.category || '').toUpperCase();
          const code = String(a.account_code || '').trim();
          const name = String(a.account_name || '').toLowerCase();
          return (
            code.startsWith('5') ||
            code.startsWith('6') ||
            cat.includes('HPP') ||
            cat.includes('BEBAN') ||
            cat.includes('BIAYA') ||
            name.includes('hpp') ||
            name.includes('beban') ||
            name.includes('biaya') ||
            name.includes('admin') ||
            name.includes('transfer') ||
            name.includes('ongkir') ||
            name.includes('kirim')
          );
        }) || [];

      setExpenseAccounts(filtered);
    } catch (error) {
      console.error('Error fetching expense accounts:', error);
    }
  }

  async function handleSyncInvoices() {
    setIsSyncing(true);
    try {
        // 1. Get all RECEIVED_FULL or RECEIVED_PART POs
        const { data: pos } = await supabase
            .from('purchase_orders')
            .select('id, po_number, supplier_id, total_amount, created_at')
            .in('status', ['RECEIVED_FULL', 'RECEIVED_PART']);
        
        if (!pos || pos.length === 0) {
            toast.info("Tidak ada PO yang perlu disinkronisasi.");
            return;
        }

        // 2. Get all existing Invoices
        const { data: invoices } = await supabase
            .from('purchase_invoices')
            .select('po_id');
        
        const existingPoIds = new Set(invoices?.map(inv => inv.po_id));

        // 3. Find missing
        const missingPos = pos.filter(p => !existingPoIds.has(p.id));

        if (missingPos.length === 0) {
            toast.success("Semua data sudah sinkron.");
            return;
        }

        // 4. Create missing invoices
        const newInvoices = missingPos.map(p => ({
            invoice_number: `INV-${p.po_number}`,
            po_id: p.id,
            supplier_id: p.supplier_id,
            invoice_date: new Date(p.created_at).toISOString().split('T')[0],
            due_date: new Date(new Date(p.created_at).setDate(new Date(p.created_at).getDate() + 30)).toISOString().split('T')[0],
            total_amount: p.total_amount,
            status: 'UNPAID'
        }));

        const { error } = await supabase.from('purchase_invoices').insert(newInvoices);
        if (error) throw error;

        toast.success(`Berhasil membuat ${newInvoices.length} tagihan baru dari PO lama.`);
        fetchInvoices();

    } catch (error: any) {
        toast.error("Gagal sinkronisasi: " + error.message);
    } finally {
        setIsSyncing(false);
    }
  }

  async function fetchInvoices() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select(`
          *,
          suppliers (name),
          purchase_orders!inner (
            po_number,
            status
          )
        `)
        .in('purchase_orders.status', ['RECEIVED_FULL', 'RECEIVED_PART', 'RETUR'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data tagihan: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPaymentHistory() {
      setLoading(true);
      try {
          const { data, error } = await supabase
            .from('purchase_payments')
            .select(`
                *,
                purchase_invoices (
                    invoice_number,
                    purchase_orders (po_number),
                    suppliers (name)
                ),
                payment_account:chart_of_accounts!purchase_payments_payment_account_id_fkey (account_name),
                fee_account:chart_of_accounts!purchase_payments_fee_account_id_fkey (account_name)
            `)
            .gte('payment_date', dateFilter.startDate)
            .lte('payment_date', dateFilter.endDate)
            .order('payment_date', { ascending: false });
          
          if (error) throw error;
          setPaymentHistory(data || []);
      } catch (e: any) {
          toast.error("Gagal mengambil riwayat pembayaran: " + e.message);
      } finally {
          setLoading(false);
      }
  }

  const handlePayClick = (invoice: any) => {
    setSelectedInvoice(invoice);
    setEditingPaymentId(null);
    setEditingPayment(null);
    setOriginalPaymentAmount(0);
    setPaymentData({
      amount: invoice.total_amount - (invoice.paid_amount || 0), // Default full pay
      transfer_fee: 0,
      fee_account_id: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'TRANSFER',
      payment_account_id: '',
      notes: ''
    });
    setIsPayOpen(true);
  };

  const handleEditClick = (payment: any) => {
      setEditingPaymentId(payment.id);
      setEditingPayment(payment);
      setSelectedInvoice(payment.purchase_invoices);
      setOriginalPaymentAmount(payment.amount);
      setPaymentData({
          amount: payment.amount,
          transfer_fee: Number(payment.transfer_fee || 0),
          fee_account_id: payment.fee_account_id || '',
          payment_date: payment.payment_date,
          payment_method: payment.payment_method,
          payment_account_id: payment.payment_account_id || '',
          notes: payment.notes || ''
      });
      setIsPayOpen(true);
  }

  const handleCancelPayment = async (payment: any) => {
    if (!payment?.id || !payment?.invoice_id) return;
    const ok = window.confirm('Batalkan pembayaran ini? Data pembayaran dan jurnal akan dihapus, dan tagihan akan dikoreksi.');
    if (!ok) return;

    setLoading(true);
    try {
      const { data: invoice, error: invError } = await supabase
        .from('purchase_invoices')
        .select('id, total_amount, paid_amount, invoice_number')
        .eq('id', payment.invoice_id)
        .single();

      if (invError) throw invError;

      const paymentAmount = Number(payment.amount || 0);
      const currentPaid = Number(invoice.paid_amount || 0);
      const totalAmount = Number(invoice.total_amount || 0);
      const newPaid = Math.max(0, currentPaid - paymentAmount);
      const newStatus = newPaid >= totalAmount ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

      const { error: updErr } = await supabase
        .from('purchase_invoices')
        .update({ paid_amount: newPaid, status: newStatus })
        .eq('id', invoice.id);

      if (updErr) throw updErr;

      const { error: jErr } = await supabase
        .from('journal_entries')
        .delete()
        .eq('reference', payment.id);

      if (jErr) throw jErr;

      const { error: delErr } = await supabase
        .from('purchase_payments')
        .delete()
        .eq('id', payment.id);

      if (delErr) throw delErr;

      toast.success(`Pembayaran ${invoice.invoice_number} berhasil dibatalkan`);
      setIsPayOpen(false);
      setEditingPaymentId(null);
      setEditingPayment(null);
      setSelectedInvoice(null);

      fetchInvoices();
      if (activeTab === 'history') fetchPaymentHistory();
    } catch (e: any) {
      toast.error('Gagal membatalkan pembayaran: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedInvoice) return;
    setLoading(true);
    try {
      const amount = Number(paymentData.amount);
      const transferFee = Math.max(0, Number(paymentData.transfer_fee || 0));
      if (amount <= 0) {
        toast.error("Jumlah pembayaran harus lebih dari 0");
        return;
      }
      
      // Validation for Overpayment
      // If editing: Available space = (Total - Paid) + OriginalPayment
      const currentPaid = selectedInvoice.paid_amount || 0;
      const availableSpace = editingPaymentId 
        ? (selectedInvoice.total_amount - currentPaid + originalPaymentAmount)
        : (selectedInvoice.total_amount - currentPaid);

      if (amount > availableSpace + 100) { // +100 tolerance for rounding
        toast.error("Pembayaran melebihi sisa tagihan!");
        return;
      }

      if (!paymentData.payment_account_id) {
          toast.error("Mohon pilih Akun Kas/Bank Pembayar");
          return;
      }

      if (transferFee > 0 && !paymentData.fee_account_id) {
        toast.error("Mohon pilih Akun Biaya Admin/Transfer");
        return;
      }

      let paymentId = editingPaymentId;

      if (editingPaymentId) {
          // --- UPDATE EXISTING PAYMENT ---
          const { error: updateError } = await supabase
            .from('purchase_payments')
            .update({
                amount: amount,
                transfer_fee: transferFee,
                fee_account_id: paymentData.fee_account_id || null,
                payment_date: paymentData.payment_date,
                payment_method: paymentData.payment_method,
                payment_account_id: paymentData.payment_account_id,
                notes: paymentData.notes
            })
            .eq('id', editingPaymentId);
          
          if (updateError) throw updateError;

          // Revert old payment from Invoice Paid Amount
          const adjustedPaidAmount = currentPaid - originalPaymentAmount + amount;
          const newStatus = adjustedPaidAmount >= selectedInvoice.total_amount ? 'PAID' : 'PARTIAL';

          await supabase
            .from('purchase_invoices')
            .update({ paid_amount: adjustedPaidAmount, status: newStatus })
            .eq('id', selectedInvoice.id);
            
          // Update Journal Entry (Delete old by reference and create new, or update)
          // Easiest is delete by reference and recreate
          await supabase.from('journal_entries').delete().eq('reference', editingPaymentId);
          
      } else {
          // --- CREATE NEW PAYMENT ---
          const { data: newPay, error: payError } = await supabase
            .from('purchase_payments')
            .insert([{
                invoice_id: selectedInvoice.id,
                payment_date: paymentData.payment_date,
                amount: amount,
                transfer_fee: transferFee,
                fee_account_id: paymentData.fee_account_id || null,
                payment_method: paymentData.payment_method,
                payment_account_id: paymentData.payment_account_id,
                notes: paymentData.notes
            }])
            .select()
            .single();
          
          if (payError) throw payError;
          paymentId = newPay.id;

          // Update Invoice
          const newPaidAmount = currentPaid + amount;
          const newStatus = newPaidAmount >= selectedInvoice.total_amount ? 'PAID' : 'PARTIAL';
          await supabase
            .from('purchase_invoices')
            .update({ paid_amount: newPaidAmount, status: newStatus })
            .eq('id', selectedInvoice.id);
      }

      // --- CREATE JOURNAL ENTRY (GL) ---
      // Dr: Hutang Usaha
      // Dr: Biaya Admin/Transfer (jika ada)
      // Cr: Kas/Bank
      if (apAccount && paymentData.payment_account_id && paymentId) {
          const cashOut = amount + transferFee;
          const { data: entry, error: entryError } = await supabase
            .from('journal_entries')
            .insert([{
                entry_date: paymentData.payment_date,
                voucher_no: `PAY-${selectedInvoice.invoice_number}-${Date.now().toString().slice(-4)}`,
                description: `Pembayaran Hutang ${selectedInvoice.invoice_number} (${selectedInvoice.suppliers?.name || ''}) - ${paymentData.notes}`,
                entry_type: 'PAYMENT',
                total_amount: cashOut,
                reference: paymentId // Link to payment
            }])
            .select()
            .single();
        
         if (!entryError && entry) {
             const itemsPayload: any[] = [
                 {
                     journal_entry_id: entry.id,
                     account_id: apAccount.id, // Hutang Usaha
                     debit: amount,
                     credit: 0,
                     description: 'Pelunasan Hutang'
                 },
             ];

             if (transferFee > 0 && paymentData.fee_account_id) {
               itemsPayload.push({
                 journal_entry_id: entry.id,
                 account_id: paymentData.fee_account_id,
                 debit: transferFee,
                 credit: 0,
                 description: 'Biaya Admin/Transfer'
               });
             }

             itemsPayload.push({
               journal_entry_id: entry.id,
               account_id: paymentData.payment_account_id, // Kas/Bank
               debit: 0,
               credit: cashOut,
               description: 'Pengeluaran Kas/Bank'
             });

             await supabase.from('journal_entry_items').insert(itemsPayload);
         }
      }

      toast.success(editingPaymentId ? "Pembayaran berhasil diperbarui" : "Pembayaran berhasil diproses");
      setIsPayOpen(false);
      fetchInvoices();
      if (activeTab === 'history') fetchPaymentHistory();

    } catch (error: any) {
      toast.error("Gagal memproses pembayaran: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchSearch = inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
                        inv.suppliers?.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' ? true : inv.status === statusFilter;
    
    // Date filter for Invoices (Usually based on Invoice Date or Due Date)
    // Here let's use Invoice Date
    const invDate = new Date(inv.invoice_date);
    const start = new Date(dateFilter.startDate);
    const end = new Date(dateFilter.endDate);
    const matchDate = invDate >= start && invDate <= end;

    return matchSearch && matchStatus && matchDate;
  });

  const filteredPaymentHistory = paymentHistory.filter((pay) => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    const invoiceNo = String(pay.purchase_invoices?.invoice_number || '').toLowerCase();
    const supplierName = String(pay.purchase_invoices?.suppliers?.name || '').toLowerCase();
    const poNo = String(pay.purchase_invoices?.purchase_orders?.po_number || '').toLowerCase();
    return invoiceNo.includes(q) || supplierName.includes(q) || poNo.includes(q);
  });

  const [isAccountSelectOpen, setIsAccountSelectOpen] = useState(false); // For custom dialog
  const [isFeeAccountSelectOpen, setIsFeeAccountSelectOpen] = useState(false);

  async function trackSpecificInvoice(invoiceNumber: string) {
    toast.info(`Mencari data untuk invoice: ${invoiceNumber}...`);
    
    // 1. Find the invoice (simplified query to avoid 406 error)
    const { data: invoice, error: invError } = await supabase
      .from('purchase_invoices')
      .select('*, suppliers(name)') // Temporarily removed purchase_orders(*)
      .eq('invoice_number', invoiceNumber)
      .single();

    if (invError || !invoice) {
      toast.error(`Invoice ${invoiceNumber} tidak ditemukan.`);
      console.error('Error finding invoice:', invError);
      return;
    }

    console.log('--- DATA INVOICE ---');
    console.log(invoice);
    toast.success('Data Invoice ditemukan, cek konsol (F12).');

    // Let's try to get PO info in a separate query
    if (invoice.po_id) {
        const { data: po, error: poError } = await supabase
            .from('purchase_orders')
            .select('*')
            .eq('id', invoice.po_id)
            .single();
        
        if (po) {
            console.log('--- DATA PO TERKAIT (dari query terpisah) ---');
            console.log(po);
        } else {
            console.error('Gagal mengambil data PO terkait:', poError);
        }
    }


    // 2. Find related payments
    const { data: payments, error: payError } = await supabase
      .from('purchase_payments')
      .select('*')
      .eq('invoice_id', invoice.id);

    if (payError) {
      toast.error('Gagal mencari data pembayaran terkait.');
      console.error('Error finding payments:', payError);
      return;
    }

    if (payments.length === 0) {
      toast.warning('Tidak ditemukan data pembayaran untuk invoice ini di tabel purchase_payments.');
    } else {
      console.log('--- DATA PEMBAYARAN TERKAIT ---');
      console.log(payments);
      toast.success(`${payments.length} data pembayaran ditemukan, cek konsol (F12).`);
    }
  }
  const [feeAccountSearch, setFeeAccountSearch] = useState('');

  const handleDeleteInvoice = async (invoiceId: string) => {
      const ok = window.confirm('Anda yakin ingin menghapus tagihan ini? Data pembayaran dan jurnal terkait (jika ada) juga akan terhapus.');
      if (!ok) return;

      setLoading(true);
      try {
          // 1. Check if there are payments
          const { data: payments } = await supabase.from('purchase_payments').select('id, journal_entry_id').eq('invoice_id', invoiceId);
          
          if (payments && payments.length > 0) {
              // Delete journals
              const journalIds = payments.map(p => p.journal_entry_id).filter(Boolean);
              if (journalIds.length > 0) {
                  await supabase.from('journal_entry_items').delete().in('journal_entry_id', journalIds);
                  await supabase.from('journal_entries').delete().in('id', journalIds);
              }
              // Delete payments
              await supabase.from('purchase_payments').delete().eq('invoice_id', invoiceId);
          }

          // 2. Delete invoice items (if any, though in this app it might be empty/non-existent table)
          try { await supabase.from('purchase_invoice_items').delete().eq('invoice_id', invoiceId); } catch(e) {}

          // 3. Delete invoice
          const { error } = await supabase.from('purchase_invoices').delete().eq('id', invoiceId);
          if (error) throw error;

          toast.success("Tagihan berhasil dihapus.");
          fetchInvoices();
      } catch (error: any) {
          toast.error("Gagal menghapus tagihan: " + error.message);
      } finally {
          setLoading(false);
      }
  };

  const handleSelectAccount = (acc: any) => {
    setPaymentData({...paymentData, payment_account_id: acc.id});
    setIsAccountSelectOpen(false);
  };

  const handleSelectFeeAccount = (acc: any) => {
    setPaymentData({ ...paymentData, fee_account_id: acc.id });
    setIsFeeAccountSelectOpen(false);
    setFeeAccountSearch('');
  };
  
  // Custom Table Selector for Account
  const AccountSelector = () => (
      <Dialog open={isAccountSelectOpen} onOpenChange={setIsAccountSelectOpen}>
          <DialogContent className="max-w-3xl">
              <DialogHeader>
                  <DialogTitle>Pilih Akun Kas/Bank Pembayar</DialogTitle>
                  <DialogDescription>
                    Pilih akun dari daftar Aktiva Lancar / Kas & Bank di bawah ini.
                  </DialogDescription>
              </DialogHeader>
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
                        {cashBankAccounts.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center py-8">Tidak ada akun Kas/Bank ditemukan.</TableCell></TableRow>
                        ) : (
                            cashBankAccounts.map(acc => (
                                <TableRow key={acc.id} className="cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => handleSelectAccount(acc)}>
                                    <TableCell className="font-mono font-bold text-blue-700">{acc.account_code}</TableCell>
                                    <TableCell className="font-medium">{acc.account_name}</TableCell>
                                    <TableCell className="text-xs text-gray-500">
                                        <span className="bg-slate-100 px-2 py-1 rounded border">
                                            {acc.sub_category?.replace('_', ' ')}
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
          </DialogContent>
      </Dialog>
  );

  const filteredExpenseAccounts = expenseAccounts.filter((a) => {
    const q = feeAccountSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      String(a.account_code || '').toLowerCase().includes(q) ||
      String(a.account_name || '').toLowerCase().includes(q)
    );
  });

  const FeeAccountSelector = () => (
    <Dialog open={isFeeAccountSelectOpen} onOpenChange={setIsFeeAccountSelectOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pilih Akun Biaya Admin/Transfer</DialogTitle>
          <DialogDescription>
            Pilih akun beban untuk mencatat biaya admin/transfer bank.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari kode atau nama akun..."
            className="pl-8"
            value={feeAccountSearch}
            onChange={(e) => setFeeAccountSearch(e.target.value)}
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
              {filteredExpenseAccounts.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Tidak ada akun ditemukan.</TableCell></TableRow>
              ) : (
                filteredExpenseAccounts.map((acc) => (
                  <TableRow key={acc.id} className="cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => handleSelectFeeAccount(acc)}>
                    <TableCell className="font-mono font-bold text-blue-700">{acc.account_code}</TableCell>
                    <TableCell className="font-medium">{acc.account_name}</TableCell>
                    <TableCell className="text-xs text-gray-500">
                      <span className="bg-slate-100 px-2 py-1 rounded border">
                        {String(acc.category || '').toUpperCase()} {acc.sub_category ? `- ${String(acc.sub_category).replace('_', ' ')}` : ''}
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
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
        {AccountSelector()}
        {FeeAccountSelector()}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Pembayaran Pembelian & Hutang</h2>
        <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => trackSpecificInvoice('INV-1775104628401')}
              className="bg-yellow-400 hover:bg-yellow-500 text-black"
            >
              Track INV-1775104628401
            </Button>
            <Button variant="outline" onClick={handleSyncInvoices} disabled={isSyncing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                Sinkronisasi Tagihan PO
            </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
              <TabsTrigger value="invoices">Tagihan (Invoices)</TabsTrigger>
              <TabsTrigger value="history">Riwayat Pembayaran</TabsTrigger>
          </TabsList>
          
          <div className="my-4 flex flex-col md:flex-row gap-4 items-end md:items-center bg-slate-50 p-4 rounded-lg border">
              <div className="space-y-1">
                  <Label>Filter Tanggal</Label>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={dateFilter.startDate} onChange={e => setDateFilter({...dateFilter, startDate: e.target.value})} className="bg-white" />
                    <span>-</span>
                    <Input type="date" value={dateFilter.endDate} onChange={e => setDateFilter({...dateFilter, endDate: e.target.value})} className="bg-white" />
                  </div>
              </div>
              
              {activeTab === 'invoices' && (
                  <div className="space-y-1 min-w-[200px]">
                      <Label>Status</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="bg-white">
                              <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="ALL">Semua Status</SelectItem>
                              <SelectItem value="UNPAID">Belum Bayar (Unpaid)</SelectItem>
                              <SelectItem value="PARTIAL">Sebagian (Partial)</SelectItem>
                              <SelectItem value="PAID">Lunas (Paid)</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
              )}
          </div>

          <TabsContent value="invoices">
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex justify-between">
                        <CardTitle>Daftar Tagihan Supplier</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Cari Invoice / Supplier..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>No. Invoice</TableHead>
                                <TableHead>No. PO</TableHead>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>Jatuh Tempo</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Total Tagihan</TableHead>
                                <TableHead>Sudah Dibayar</TableHead>
                                <TableHead>Sisa</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredInvoices.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="text-center py-8">Tidak ada tagihan sesuai filter.</TableCell></TableRow>
                            ) : (
                                filteredInvoices.map(inv => {
                                    const remaining = inv.total_amount - (inv.paid_amount || 0);
                                    return (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                                            <TableCell className="text-slate-600">{inv.purchase_orders?.po_number || '-'}</TableCell>
                                            <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                                            <TableCell className={new Date(inv.due_date) < new Date() && inv.status !== 'PAID' ? 'text-red-600 font-bold' : ''}>
                                                {formatDate(inv.due_date)}
                                            </TableCell>
                                            <TableCell>{inv.suppliers?.name}</TableCell>
                                            <TableCell>{formatCurrency(inv.total_amount)}</TableCell>
                                            <TableCell className="text-green-600">{formatCurrency(inv.paid_amount || 0)}</TableCell>
                                            <TableCell className="font-bold text-red-600">{formatCurrency(remaining)}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded text-xs font-semibold 
                                                    ${inv.status === 'PAID' ? 'bg-green-100 text-green-800' : 
                                                    inv.status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                                    {inv.status === 'PAID' ? 'LUNAS' : inv.status === 'PARTIAL' ? 'SEBAGIAN' : 'BELUM BAYAR'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    {inv.status !== 'PAID' && (
                                                        <Button size="sm" onClick={() => handlePayClick(inv)}>
                                                            <Wallet className="mr-2 h-4 w-4" /> Bayar
                                                        </Button>
                                                    )}
                                                    <Button variant="destructive" size="sm" onClick={() => handleDeleteInvoice(inv.id)}>
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="history">
              <Card>
                  <CardHeader>
                      <div className="flex justify-between">
                          <CardTitle>Riwayat Pembayaran</CardTitle>
                          <div className="relative w-72">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Cari Invoice / PO / Supplier..."
                                className="pl-8"
                                value={historySearch}
                                onChange={e => setHistorySearch(e.target.value)}
                              />
                          </div>
                      </div>
                  </CardHeader>
                  <CardContent>
                      <Table>
                          <TableHeader>
                              <TableRow>
                                  <TableHead>Tanggal Bayar</TableHead>
                                  <TableHead>No. Invoice</TableHead>
                                  <TableHead>No. PO</TableHead>
                                  <TableHead>Supplier</TableHead>
                                  <TableHead>Akun Pembayar</TableHead>
                                  <TableHead>Jumlah Bayar</TableHead>
                                  <TableHead>Biaya Admin</TableHead>
                                  <TableHead>Catatan</TableHead>
                                  <TableHead className="text-right">Aksi</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {filteredPaymentHistory.length === 0 ? (
                                  <TableRow><TableCell colSpan={9} className="text-center py-8">Belum ada riwayat pembayaran.</TableCell></TableRow>
                              ) : (
                                  filteredPaymentHistory.map(pay => (
                                      <TableRow key={pay.id}>
                                          <TableCell>{formatDate(pay.payment_date)}</TableCell>
                                          <TableCell className="font-mono">{pay.purchase_invoices?.invoice_number}</TableCell>
                                          <TableCell className="font-mono text-slate-600">{pay.purchase_invoices?.purchase_orders?.po_number || '-'}</TableCell>
                                          <TableCell>{pay.purchase_invoices?.suppliers?.name}</TableCell>
                                          <TableCell>{pay.payment_account?.account_name || '-'}</TableCell>
                                          <TableCell className="font-bold">{formatCurrency(pay.amount)}</TableCell>
                                          <TableCell className="font-semibold text-slate-600">{formatCurrency(pay.transfer_fee || 0)}</TableCell>
                                          <TableCell>{pay.notes}</TableCell>
                                          <TableCell className="text-right">
                                              <div className="flex justify-end gap-2">
                                                  <Button variant="outline" size="sm" onClick={() => handleEditClick(pay)}>
                                                      <Edit className="h-4 w-4 mr-2" /> Edit
                                                  </Button>
                                                  <Button variant="destructive" size="sm" onClick={() => handleCancelPayment(pay)} disabled={loading}>
                                                      <X className="h-4 w-4 mr-2" /> Batal Bayar
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

      <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{editingPaymentId ? 'Edit Pembayaran' : 'Proses Pembayaran'}</DialogTitle>
                <DialogDescription>
                    {editingPaymentId ? 'Koreksi pembayaran untuk' : 'Pembayaran untuk'} Invoice: <b>{selectedInvoice?.invoice_number}</b><br/>
                    Supplier: {selectedInvoice?.suppliers?.name}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label>Jumlah Bayar</Label>
                    <Input 
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={String(paymentData.amount ?? '')}
                        onChange={e => {
                          const digits = String(e.target.value || '').replace(/[^0-9]/g, '');
                          setPaymentData({ ...paymentData, amount: digits ? Number(digits) : 0 });
                        }}
                    />
                    <p className="text-xs text-gray-500">
                        Sisa Tagihan: {formatCurrency(
                            editingPaymentId 
                            ? (selectedInvoice?.total_amount - (selectedInvoice?.paid_amount || 0) + originalPaymentAmount)
                            : (selectedInvoice ? selectedInvoice.total_amount - (selectedInvoice.paid_amount || 0) : 0)
                        )}
                    </p>
                </div>
                <div className="space-y-2">
                    <Label>Biaya Admin / Transfer (Opsional)</Label>
                    <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={String(paymentData.transfer_fee ?? '')}
                        onChange={e => {
                          const digits = String(e.target.value || '').replace(/[^0-9]/g, '');
                          setPaymentData({ ...paymentData, transfer_fee: digits ? Number(digits) : 0 });
                        }}
                    />
                    <p className="text-xs text-gray-500">
                      Total Keluar Kas/Bank: {formatCurrency(Number(paymentData.amount || 0) + Number(paymentData.transfer_fee || 0))}
                    </p>
                </div>
                <div className="space-y-2">
                    <Label>Tanggal Bayar</Label>
                    <Input type="date" value={paymentData.payment_date} onChange={e => setPaymentData({...paymentData, payment_date: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label>Kas/Bank Pembayar</Label>
                    <div className="flex gap-2">
                        <Input 
                            readOnly 
                            value={cashBankAccounts.find(a => a.id === paymentData.payment_account_id)?.account_code || ''} 
                            placeholder="Kode Akun"
                            className="w-[120px] bg-gray-50 font-mono font-bold"
                        />
                        <Input 
                            readOnly 
                            value={cashBankAccounts.find(a => a.id === paymentData.payment_account_id)?.account_name || ''} 
                            placeholder="Nama Akun (Klik Pilih)"
                            className="flex-1 bg-gray-50 cursor-pointer"
                            onClick={() => setIsAccountSelectOpen(true)}
                        />
                        <Button variant="outline" onClick={() => setIsAccountSelectOpen(true)}>Pilih</Button>
                    </div>
                    {!apAccount && (
                        <p className="text-xs text-red-500 mt-1">
                            Warning: Akun 'Hutang Usaha' tidak ditemukan di COA. Jurnal mungkin tidak lengkap.
                        </p>
                    )}
                </div>
                {Number(paymentData.transfer_fee || 0) > 0 && (
                  <div className="space-y-2">
                      <Label>Akun Biaya (Admin/Ongkir)</Label>
                      <div className="flex gap-2">
                          <Input 
                              readOnly 
                              value={expenseAccounts.find(a => a.id === paymentData.fee_account_id)?.account_code || ''} 
                              placeholder="Kode Akun"
                              className="w-[120px] bg-gray-50 font-mono font-bold"
                          />
                          <Input 
                              readOnly 
                              value={expenseAccounts.find(a => a.id === paymentData.fee_account_id)?.account_name || ''} 
                              placeholder="Nama Akun (Klik Pilih)"
                              className="flex-1 bg-gray-50 cursor-pointer"
                              onClick={() => setIsFeeAccountSelectOpen(true)}
                          />
                          <Button variant="outline" onClick={() => setIsFeeAccountSelectOpen(true)}>Pilih</Button>
                      </div>
                  </div>
                )}
                <div className="space-y-2">
                    <Label>Catatan</Label>
                    <Input value={paymentData.notes} onChange={e => setPaymentData({...paymentData, notes: e.target.value})} placeholder="Ref Transfer, dll..." />
                </div>
            </div>
            <DialogFooter>
                {editingPaymentId && editingPayment && (
                    <Button variant="destructive" onClick={() => handleCancelPayment(editingPayment)} disabled={loading}>
                        <X className="h-4 w-4 mr-2" /> Batalkan Pembayaran
                    </Button>
                )}
                <Button variant="outline" onClick={() => setIsPayOpen(false)}>Batal</Button>
                <Button onClick={handleProcessPayment} disabled={loading}>{loading ? 'Memproses...' : (editingPaymentId ? 'Simpan Perubahan' : 'Bayar Sekarang')}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}