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
import { Search, Wallet, CheckCircle, RefreshCw } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function PurchasePayment() {
  // Trigger deployment update
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Payment Dialog
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'TRANSFER',
    payment_account_id: '', // New Field
    notes: ''
  });

  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([]);

  useEffect(() => {
    fetchInvoices();
    fetchCashBankAccounts();
  }, []);

  async function fetchCashBankAccounts() {
    try {
        const { data } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code, account_name')
            .eq('category', 'AKTIVA')
            .eq('sub_category', 'AKTIVA_LANCAR')
            .or('account_name.ilike.%kas%,account_name.ilike.%bank%'); // Filter Kas/Bank loosely
        
        setCashBankAccounts(data || []);
    } catch (error) {
        console.error("Error fetching accounts:", error);
    }
  }

  async function handleSyncInvoices() {
    setIsSyncing(true);
    try {
        // 1. Get all RECEIVED_FULL POs
        const { data: pos } = await supabase
            .from('purchase_orders')
            .select('id, po_number, supplier_id, total_amount, created_at')
            .eq('status', 'RECEIVED_FULL');
        
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
        .eq('purchase_orders.status', 'RECEIVED_FULL') // Only fully received POs
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data tagihan: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handlePayClick = (invoice: any) => {
    setSelectedInvoice(invoice);
    setPaymentData({
      amount: invoice.total_amount - (invoice.paid_amount || 0), // Default full pay
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'TRANSFER',
      notes: ''
    });
    setIsPayOpen(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedInvoice) return;
    setLoading(true);
    try {
      const amount = Number(paymentData.amount);
      if (amount <= 0) {
        toast.error("Jumlah pembayaran harus lebih dari 0");
        return;
      }
      
      const remaining = selectedInvoice.total_amount - (selectedInvoice.paid_amount || 0);
      if (amount > remaining) {
        toast.error("Pembayaran melebihi sisa tagihan!");
        return;
      }

      // 1. Create Payment Record
      const { error: payError } = await supabase
        .from('purchase_payments')
        .insert([{
            invoice_id: selectedInvoice.id,
            payment_date: paymentData.payment_date,
            amount: amount,
            payment_method: paymentData.payment_method,
            payment_account_id: paymentData.payment_account_id || null, // Save account ID
            notes: paymentData.notes
        }]);
      
      if (payError) throw payError;

      // 2. Update Invoice Paid Amount & Status
      const newPaidAmount = (selectedInvoice.paid_amount || 0) + amount;
      const newStatus = newPaidAmount >= selectedInvoice.total_amount ? 'PAID' : 'PARTIAL';

      await supabase
        .from('purchase_invoices')
        .update({
            paid_amount: newPaidAmount,
            status: newStatus
        })
        .eq('id', selectedInvoice.id);

      // 3. Create Cash/Bank Transaction (Expense)
      await supabase
        .from('cash_bank_transactions')
        .insert([{
            transaction_date: paymentData.payment_date,
            type: 'OUT',
            category: 'PEMBAYARAN_HUTANG',
            amount: amount,
            description: `Pembayaran Hutang Invoice ${selectedInvoice.invoice_number} (${selectedInvoice.suppliers?.name})`,
            ref_id: selectedInvoice.id // Or payment id if we had it returned
        }]);

      toast.success("Pembayaran berhasil diproses");
      setIsPayOpen(false);
      fetchInvoices();

    } catch (error: any) {
      toast.error("Gagal memproses pembayaran: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    inv.suppliers?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Pembayaran Pembelian (Hutang)</h2>
        <Button variant="outline" onClick={handleSyncInvoices} disabled={isSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Sinkronisasi Tagihan PO
        </Button>
      </div>

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
                        <TableRow><TableCell colSpan={9} className="text-center py-8">Tidak ada tagihan.</TableCell></TableRow>
                    ) : (
                        filteredInvoices.map(inv => {
                            const remaining = inv.total_amount - (inv.paid_amount || 0);
                            return (
                                <TableRow key={inv.id}>
                                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
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
                                        {inv.status !== 'PAID' && (
                                            <Button size="sm" onClick={() => handlePayClick(inv)}>
                                                <Wallet className="mr-2 h-4 w-4" /> Bayar
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

      <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Proses Pembayaran</DialogTitle>
                <DialogDescription>
                    Pembayaran untuk Invoice: <b>{selectedInvoice?.invoice_number}</b><br/>
                    Supplier: {selectedInvoice?.suppliers?.name}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label>Jumlah Bayar</Label>
                    <Input 
                        type="number" 
                        value={paymentData.amount} 
                        onChange={e => setPaymentData({...paymentData, amount: Number(e.target.value)})} 
                    />
                    <p className="text-xs text-gray-500">
                        Sisa Tagihan: {formatCurrency(selectedInvoice ? selectedInvoice.total_amount - (selectedInvoice.paid_amount || 0) : 0)}
                    </p>
                </div>
                <div className="space-y-2">
                    <Label>Tanggal Bayar</Label>
                    <Input type="date" value={paymentData.payment_date} onChange={e => setPaymentData({...paymentData, payment_date: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label>Kas/Bank Pembayar</Label>
                    <Select value={paymentData.payment_account_id} onValueChange={v => setPaymentData({...paymentData, payment_account_id: v})}>
                        <SelectTrigger><SelectValue placeholder="Pilih Akun Kas/Bank" /></SelectTrigger>
                        <SelectContent>
                            {cashBankAccounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Catatan</Label>
                    <Input value={paymentData.notes} onChange={e => setPaymentData({...paymentData, notes: e.target.value})} placeholder="Ref Transfer, dll..." />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsPayOpen(false)}>Batal</Button>
                <Button onClick={handleProcessPayment} disabled={loading}>{loading ? 'Memproses...' : 'Bayar Sekarang'}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
