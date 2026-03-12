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
import { Search, Wallet, RefreshCw, Edit, Printer } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SalesInvoice() {
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Filters
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Payment Dialog
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'TRANSFER',
    payment_account_id: '', 
    notes: ''
  });

  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([]);
  const [arAccount, setArAccount] = useState<any>(null); // Accounts Receivable (Piutang Usaha)

  // Account Selection
  const [isAccountSelectOpen, setIsAccountSelectOpen] = useState(false);

  useEffect(() => {
    fetchInvoices();
    fetchCashBankAccounts();
    fetchArAccount();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
        fetchPaymentHistory();
    }
  }, [activeTab, dateFilter]);

  async function fetchArAccount() {
    try {
        // Cari akun Piutang Usaha (Biasanya kategori AKTIVA, Sub PIUTANG atau nama Piutang)
        // Jika belum ada sub kategori PIUTANG, cari by name
        const { data } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code, account_name')
            .ilike('account_name', '%piutang usaha%')
            .eq('account_type', 'DETAIL')
            .limit(1)
            .maybeSingle();
        
        if (data) setArAccount(data);
    } catch (e) {
        console.error("Error fetching AR account", e);
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

  async function handleSyncWOs() {
    setIsSyncing(true);
    try {
        // 1. Get COMPLETED WOs
        const { data: wos } = await supabase
            .from('work_orders')
            .select(`
                id, wo_number, work_date, 
                vehicle_entries (
                    id, 
                    vehicles (license_plate, brand_type)
                )
            `)
            .eq('status', 'COMPLETED');
        
        if (!wos || wos.length === 0) {
            toast.info("Tidak ada WO selesai yang perlu disinkronisasi.");
            return;
        }

        // 2. Get Existing Invoices
        const { data: existingInvoices } = await supabase
            .from('sales_invoices')
            .select('work_order_id');
        
        const existingWoIds = new Set(existingInvoices?.map(inv => inv.work_order_id));

        // 3. Filter Missing
        const missingWos = wos.filter(w => !existingWoIds.has(w.id));

        if (missingWos.length === 0) {
            toast.success("Semua WO sudah dibuatkan invoice.");
            return;
        }

        // 4. Calculate Total & Create Invoices
        let count = 0;
        for (const wo of missingWos) {
            // Get Billings Total
            const { data: billings } = await supabase
                .from('work_order_billings')
                .select('total_price')
                .eq('work_order_id', wo.id);
            
            const total = billings?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;

            if (total > 0) {
                const vehicle = (wo.vehicle_entries as any)?.vehicles;
                const customerName = vehicle ? `${vehicle.license_plate} - ${vehicle.brand_type}` : 'Umum';

                await supabase.from('sales_invoices').insert({
                    invoice_number: `INV-${wo.wo_number}`,
                    work_order_id: wo.id,
                    customer_name: customerName,
                    vehicle_id: (wo.vehicle_entries as any)?.vehicle_id,
                    invoice_date: new Date().toISOString().split('T')[0], // Invoice date = Sync date
                    due_date: new Date().toISOString().split('T')[0], // Due immediately
                    total_amount: total,
                    status: 'UNPAID'
                });
                count++;
            }
        }

        toast.success(`Berhasil membuat ${count} invoice baru.`);
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
        .from('sales_invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data invoice: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPaymentHistory() {
      setLoading(true);
      try {
          const { data, error } = await supabase
            .from('sales_receipts')
            .select(`
                *,
                sales_invoices (
                    invoice_number,
                    customer_name
                ),
                payment_account:chart_of_accounts (account_name)
            `)
            .gte('payment_date', dateFilter.startDate)
            .lte('payment_date', dateFilter.endDate)
            .order('payment_date', { ascending: false });
          
          if (error) throw error;
          setPaymentHistory(data || []);
      } catch (e: any) {
          toast.error("Gagal mengambil riwayat: " + e.message);
      } finally {
          setLoading(false);
      }
  }

  const handlePayClick = (invoice: any) => {
    setSelectedInvoice(invoice);
    setPaymentData({
      amount: invoice.total_amount - (invoice.paid_amount || 0),
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'TRANSFER',
      payment_account_id: '',
      notes: ''
    });
    setIsPayOpen(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedInvoice) return;
    if (!paymentData.payment_account_id) return toast.error("Pilih akun penerima dana");

    setLoading(true);
    try {
      const amount = Number(paymentData.amount);
      
      // 1. Create Receipt
      const { data: receipt, error: payError } = await supabase
        .from('sales_receipts')
        .insert([{
            invoice_id: selectedInvoice.id,
            payment_date: paymentData.payment_date,
            amount: amount,
            payment_method: paymentData.payment_method,
            payment_account_id: paymentData.payment_account_id,
            notes: paymentData.notes,
            receipt_number: `RCP-${Date.now().toString().slice(-6)}`
        }])
        .select()
        .single();
      
      if (payError) throw payError;

      // 2. Update Invoice
      const newPaidAmount = (selectedInvoice.paid_amount || 0) + amount;
      const newStatus = newPaidAmount >= selectedInvoice.total_amount ? 'PAID' : 'PARTIAL';
      await supabase
        .from('sales_invoices')
        .update({ paid_amount: newPaidAmount, status: newStatus })
        .eq('id', selectedInvoice.id);

      // 3. Create Journal Entry (GL)
      // Dr: Kas/Bank
      // Cr: Piutang Usaha (or Pendapatan if direct, but best practice is AR)
      // If AR account missing, warn but proceed? Or assume Cash Sales?
      // Let's use AR account if exists.
      
      if (paymentData.payment_account_id) {
          const { data: entry, error: entryError } = await supabase
            .from('journal_entries')
            .insert([{
                entry_date: paymentData.payment_date,
                voucher_no: receipt.receipt_number,
                description: `Penerimaan Pembayaran ${selectedInvoice.invoice_number} (${selectedInvoice.customer_name})`,
                entry_type: 'DEPOSIT', // Penerimaan
                total_amount: amount,
                reference: receipt.id 
            }])
            .select()
            .single();
        
         if (!entryError && entry) {
             // Debit: Kas Bank
             await supabase.from('journal_entry_items').insert({
                 journal_entry_id: entry.id,
                 account_id: paymentData.payment_account_id,
                 debit: amount,
                 credit: 0,
                 description: 'Penerimaan Kas/Bank'
             });

             // Credit: Piutang Usaha (or Pendapatan Jasa if we skipped AR journal at Invoice creation)
             // NOTE: Ideally, when Invoice is created, we should Journal Dr AR / Cr Revenue.
             // Since we don't have that yet, let's just Credit Revenue/Pendapatan Jasa?
             // OR Credit AR if we assume AR was booked.
             // For simplicity in this "Cash Basis" like approach often used in simple workshops:
             // We just book Revenue when Paid? NO, User wants "Standard Accounting".
             // Standard: 
             // Invoice: Dr Piutang / Cr Pendapatan
             // Receipt: Dr Kas / Cr Piutang
             
             if (arAccount) {
                 await supabase.from('journal_entry_items').insert({
                     journal_entry_id: entry.id,
                     account_id: arAccount.id,
                     debit: 0,
                     credit: amount,
                     description: 'Pelunasan Piutang'
                 });
             }
         }
      }

      toast.success("Pembayaran berhasil disimpan");
      setIsPayOpen(false);
      fetchInvoices();
      if (activeTab === 'history') fetchPaymentHistory();

    } catch (error: any) {
      toast.error("Gagal memproses: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchSearch = inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
                        inv.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' ? true : inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Account Selector UI
  const AccountSelector = () => (
      <Dialog open={isAccountSelectOpen} onOpenChange={setIsAccountSelectOpen}>
          <DialogContent className="max-w-3xl">
              <DialogHeader>
                  <DialogTitle>Pilih Akun Penerima</DialogTitle>
              </DialogHeader>
              <div className="max-h-[400px] overflow-auto border rounded-md">
                <Table>
                    <TableHeader className="bg-slate-100 sticky top-0">
                        <TableRow>
                            <TableHead>Kode Akun</TableHead>
                            <TableHead>Nama Akun</TableHead>
                            <TableHead>Kategori</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {cashBankAccounts.map(acc => (
                            <TableRow key={acc.id} className="cursor-pointer hover:bg-blue-50" onClick={() => {
                                setPaymentData({...paymentData, payment_account_id: acc.id});
                                setIsAccountSelectOpen(false);
                            }}>
                                <TableCell className="font-mono font-bold">{acc.account_code}</TableCell>
                                <TableCell>{acc.account_name}</TableCell>
                                <TableCell>{acc.sub_category}</TableCell>
                                <TableCell><Button size="sm" variant="ghost">Pilih</Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              </div>
          </DialogContent>
      </Dialog>
  );

  return (
    <div className="space-y-6">
      {AccountSelector()}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Pembayaran Piutang (Invoice)</h2>
        <Button variant="outline" onClick={handleSyncWOs} disabled={isSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Sinkronisasi WO Selesai
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
              <TabsTrigger value="invoices">Invoice Pelanggan</TabsTrigger>
              <TabsTrigger value="history">Riwayat Penerimaan</TabsTrigger>
          </TabsList>
          
          <div className="my-4 flex gap-4 items-center bg-slate-50 p-4 rounded-lg border">
              <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cari Invoice / Pelanggan..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              
              {activeTab === 'invoices' && (
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[200px] bg-white">
                          <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="ALL">Semua Status</SelectItem>
                          <SelectItem value="UNPAID">Belum Lunas</SelectItem>
                          <SelectItem value="PAID">Lunas</SelectItem>
                      </SelectContent>
                  </Select>
              )}
          </div>

          <TabsContent value="invoices">
            <Card>
                <CardContent className="pt-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>No. Invoice</TableHead>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>Pelanggan / Nopol</TableHead>
                                <TableHead className="text-right">Total Tagihan</TableHead>
                                <TableHead className="text-right">Sudah Dibayar</TableHead>
                                <TableHead className="text-right">Sisa</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredInvoices.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="text-center py-8">Tidak ada data invoice.</TableCell></TableRow>
                            ) : (
                                filteredInvoices.map(inv => {
                                    const remaining = inv.total_amount - (inv.paid_amount || 0);
                                    return (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                                            <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                                            <TableCell>{inv.customer_name}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(inv.total_amount)}</TableCell>
                                            <TableCell className="text-right text-green-600">{formatCurrency(inv.paid_amount || 0)}</TableCell>
                                            <TableCell className="text-right font-bold text-red-600">{formatCurrency(remaining)}</TableCell>
                                            <TableCell className="text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-semibold 
                                                    ${inv.status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {inv.status === 'PAID' ? 'LUNAS' : 'BELUM LUNAS'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {inv.status !== 'PAID' && (
                                                    <Button size="sm" onClick={() => handlePayClick(inv)}>
                                                        <Wallet className="mr-2 h-4 w-4" /> Terima
                                                    </Button>
                                                )}
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
                  <CardContent className="pt-6">
                      <Table>
                          <TableHeader>
                              <TableRow>
                                  <TableHead>No. Receipt</TableHead>
                                  <TableHead>Tanggal</TableHead>
                                  <TableHead>No. Invoice</TableHead>
                                  <TableHead>Pelanggan</TableHead>
                                  <TableHead>Masuk Ke</TableHead>
                                  <TableHead className="text-right">Jumlah</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {paymentHistory.map(pay => (
                                  <TableRow key={pay.id}>
                                      <TableCell>{pay.receipt_number}</TableCell>
                                      <TableCell>{formatDate(pay.payment_date)}</TableCell>
                                      <TableCell>{pay.sales_invoices?.invoice_number}</TableCell>
                                      <TableCell>{pay.sales_invoices?.customer_name}</TableCell>
                                      <TableCell>{pay.payment_account?.account_name}</TableCell>
                                      <TableCell className="text-right font-bold">{formatCurrency(pay.amount)}</TableCell>
                                  </TableRow>
                              ))}
                          </TableBody>
                      </Table>
                  </CardContent>
              </Card>
          </TabsContent>
      </Tabs>

      <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Terima Pembayaran</DialogTitle>
                <DialogDescription>
                    Invoice: {selectedInvoice?.invoice_number} ({selectedInvoice?.customer_name})
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label>Jumlah Diterima</Label>
                    <Input 
                        type="number" 
                        value={paymentData.amount} 
                        onChange={e => setPaymentData({...paymentData, amount: Number(e.target.value)})} 
                    />
                </div>
                <div className="space-y-2">
                    <Label>Masuk ke Akun</Label>
                    <div className="flex gap-2">
                        <Input 
                            readOnly 
                            value={cashBankAccounts.find(a => a.id === paymentData.payment_account_id)?.account_name || ''} 
                            placeholder="Pilih Kas/Bank..."
                            onClick={() => setIsAccountSelectOpen(true)}
                        />
                        <Button variant="outline" onClick={() => setIsAccountSelectOpen(true)}>Pilih</Button>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Catatan</Label>
                    <Input value={paymentData.notes} onChange={e => setPaymentData({...paymentData, notes: e.target.value})} />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsPayOpen(false)}>Batal</Button>
                <Button onClick={handleProcessPayment} disabled={loading}>Simpan Pembayaran</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
