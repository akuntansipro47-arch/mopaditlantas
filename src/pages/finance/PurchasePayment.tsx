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
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [statusFilter, setStatusFilter] = useState('ALL');

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
  const [apAccount, setApAccount] = useState<any>(null);

  const [isAccountSelectOpen, setIsAccountSelectOpen] = useState(false);
  const [isFeeAccountSelectOpen, setIsFeeAccountSelectOpen] = useState(false);

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
        const { data: pos } = await supabase
            .from('purchase_orders')
            .select('id, po_number, supplier_id, total_amount, created_at')
            .in('status', ['RECEIVED_FULL', 'RECEIVED_PART']);
        
        if (!pos || pos.length === 0) {
            toast.info("Tidak ada PO yang perlu disinkronisasi.");
            return;
        }

        const { data: invoices } = await supabase
            .from('purchase_invoices')
            .select('po_id');
        
        const existingPoIds = new Set(invoices?.map(inv => inv.po_id));

        const missingPos = pos.filter(p => !existingPoIds.has(p.id));

        if (missingPos.length === 0) {
            toast.success("Semua data sudah sinkron.");
            return;
        }

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
      amount: invoice.total_amount - (invoice.paid_amount || 0),
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
      
      const currentPaid = selectedInvoice.paid_amount || 0;
      const availableSpace = editingPaymentId 
        ? (selectedInvoice.total_amount - currentPaid + originalPaymentAmount)
        : (selectedInvoice.total_amount - currentPaid);

      if (amount > availableSpace + 100) {
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

          const adjustedPaidAmount = currentPaid - originalPaymentAmount + amount;
          const newStatus = adjustedPaidAmount >= selectedInvoice.total_amount ? 'PAID' : 'PARTIAL';

          await supabase
            .from('purchase_invoices')
            .update({ paid_amount: adjustedPaidAmount, status: newStatus })
            .eq('id', selectedInvoice.id);
            
          await supabase.from('journal_entries').delete().eq('reference', editingPaymentId);
          
      } else {
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

          const newPaidAmount = currentPaid + amount;
          const newStatus = newPaidAmount >= selectedInvoice.total_amount ? 'PAID' : 'PARTIAL';
          await supabase
            .from('purchase_invoices')
            .update({ paid_amount: newPaidAmount, status: newStatus })
            .eq('id', selectedInvoice.id);
      }

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
                reference: paymentId
            }])
            .select()
            .single();
        
         if (!entryError && entry) {
             const itemsPayload: any[] = [
                 {
                     journal_entry_id: entry.id,
                     account_id: apAccount.id,
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
               account_id: paymentData.payment_account_id,
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

  return (
    <div className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Pembayaran Hutang Pembelian</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <Input 
              placeholder="Cari No. Tagihan / Supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:col-span-2"
            />
            <Input 
              type="date"
              value={dateFilter.startDate}
              onChange={(e) => setDateFilter(prev => ({...prev, startDate: e.target.value}))}
            />
            <Input 
              type="date"
              value={dateFilter.endDate}
              onChange={(e) => setDateFilter(prev => ({...prev, endDate: e.target.value}))}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="UNPAID">Belum Dibayar</SelectItem>
                <SelectItem value="PARTIAL">Dibayar Sebagian</SelectItem>
                <SelectItem value="PAID">Lunas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2 mb-4">
            <Button 
              variant="outline" 
              onClick={handleSyncInvoices} 
              disabled={isSyncing}
            >
              {isSyncing ? 'Menyinkronkan...' : <RefreshCw className="mr-2 h-4 w-4" />}
              Sinkronisasi Tagihan Lama
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="invoices">Daftar Tagihan</TabsTrigger>
              <TabsTrigger value="history">Riwayat Pembayaran</TabsTrigger>
            </TabsList>
            <TabsContent value="invoices">
              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nomor Tagihan</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Tgl. Tagihan</TableHead>
                      <TableHead>Jatuh Tempo</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Dibayar</TableHead>
                      <TableHead className="text-right">Sisa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center">Memuat data...</TableCell>
                      </TableRow>
                    ) : filteredInvoices.map(invoice => (
                      <TableRow key={invoice.id}>
                        <TableCell>{invoice.invoice_number}</TableCell>
                        <TableCell>{invoice.suppliers?.name}</TableCell>
                        <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                        <TableCell>{formatDate(invoice.due_date)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.total_amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.paid_amount)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(invoice.total_amount - invoice.paid_amount)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            invoice.status === 'PAID' ? 'bg-green-200 text-green-800' :
                            invoice.status === 'PARTIAL' ? 'bg-yellow-200 text-yellow-800' :
                            'bg-red-200 text-red-800'
                          }`}>
                            {invoice.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            onClick={() => handlePayClick(invoice)} 
                            disabled={invoice.status === 'PAID'}
                          >
                            <Wallet className="mr-2 h-4 w-4" /> Bayar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="history">
              <div className="mt-4">
                <Input 
                  placeholder="Cari di riwayat..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="mb-4"
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tgl. Bayar</TableHead>
                      <TableHead>No. Tagihan</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Akun Pembayar</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">Memuat data...</TableCell>
                      </TableRow>
                    ) : filteredPaymentHistory.map(payment => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatDate(payment.payment_date)}</TableCell>
                        <TableCell>{payment.purchase_invoices?.invoice_number}</TableCell>
                        <TableCell>{payment.purchase_invoices?.suppliers?.name}</TableCell>
                        <TableCell>{payment.payment_account?.account_name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditClick(payment)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleCancelPayment(payment)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {isPayOpen && (
        <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
          <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
              <DialogTitle>{editingPaymentId ? 'Edit Pembayaran' : 'Proses Pembayaran'}</DialogTitle>
              <DialogDescription>
                Tagihan: {selectedInvoice?.invoice_number} ({selectedInvoice?.suppliers?.name})
                <br />
                Sisa Tagihan: {formatCurrency(selectedInvoice?.total_amount - (selectedInvoice?.paid_amount || 0) + (editingPaymentId ? originalPaymentAmount : 0))}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="payment_date" className="text-right">Tgl. Bayar</Label>
                <Input id="payment_date" type="date" value={paymentData.payment_date} onChange={e => setPaymentData({...paymentData, payment_date: e.target.value})} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="amount" className="text-right">Jumlah Bayar</Label>
                <Input id="amount" type="number" value={paymentData.amount} onChange={e => setPaymentData({...paymentData, amount: Number(e.target.value)})} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="payment_account_id" className="text-right">Akun Pembayar</Label>
                <Select value={paymentData.payment_account_id} onValueChange={value => setPaymentData({...paymentData, payment_account_id: value})}>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Pilih Akun Kas/Bank" />
                    </SelectTrigger>
                    <SelectContent>
                        {cashBankAccounts.map(acc => (
                            <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="transfer_fee" className="text-right">Biaya Admin</Label>
                <Input id="transfer_fee" type="number" value={paymentData.transfer_fee} onChange={e => setPaymentData({...paymentData, transfer_fee: Number(e.target.value)})} className="col-span-3" />
              </div>
              {paymentData.transfer_fee > 0 && (
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="fee_account_id" className="text-right">Akun Biaya</Label>
                    <Select value={paymentData.fee_account_id} onValueChange={value => setPaymentData({...paymentData, fee_account_id: value})}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Pilih Akun Biaya" />
                        </SelectTrigger>
                        <SelectContent>
                            {expenseAccounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notes" className="text-right">Catatan</Label>
                <Input id="notes" value={paymentData.notes} onChange={e => setPaymentData({...paymentData, notes: e.target.value})} className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleProcessPayment} disabled={loading}>
                {loading ? 'Memproses...' : (editingPaymentId ? 'Simpan Perubahan' : 'Proses Pembayaran')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}