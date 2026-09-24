import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FilePlus2, Loader2, Printer, Search, Wallet } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildInvoiceNumber,
  ensureSalesInvoiceForCompletedWorkOrder,
  formatLocalInvoiceDate,
  type CompletedWorkOrderInvoiceSource,
} from '@/lib/salesInvoice';

type CompletedWorkOrderOption = CompletedWorkOrderInvoiceSource;

type InvoiceFormState = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  customerName: string;
  vehicleLabel: string;
};

const EMPTY_INVOICE_FORM: InvoiceFormState = {
  invoiceNumber: '',
  invoiceDate: '',
  dueDate: '',
  totalAmount: 0,
  customerName: '',
  vehicleLabel: '',
};

function getWorkOrderEntry(workOrder: CompletedWorkOrderOption) {
  const entry = Array.isArray(workOrder.vehicle_entries)
    ? workOrder.vehicle_entries[0]
    : workOrder.vehicle_entries;
  return entry || null;
}

function getWorkOrderVehicle(workOrder: CompletedWorkOrderOption) {
  const entry = getWorkOrderEntry(workOrder);
  const vehicle = Array.isArray(entry?.vehicles) ? entry?.vehicles[0] : entry?.vehicles;
  return vehicle || null;
}

function getWorkOrderTotal(workOrder: CompletedWorkOrderOption): number {
  return (workOrder.work_order_billings || [])
    .filter((billing) => billing?.is_info_only !== true)
    .reduce((sum, billing) => sum + (Number(billing?.total_price || 0) || 0), 0);
}

function getWorkOrderCustomer(workOrder: CompletedWorkOrderOption): string {
  const vehicle = getWorkOrderVehicle(workOrder);
  return (
    String(vehicle?.owner_name || '').trim() ||
    [vehicle?.license_plate, vehicle?.brand_type].filter(Boolean).join(' - ') ||
    String(workOrder.wo_number || 'Umum')
  );
}

function getWorkOrderVehicleLabel(workOrder: CompletedWorkOrderOption): string {
  const vehicle = getWorkOrderVehicle(workOrder);
  return [vehicle?.license_plate, vehicle?.brand_type].filter(Boolean).join(' - ') || '-';
}

/** Migration 20260924 adds work_orders.completed_at; production may not have run it yet. */
function isMissingCompletedAtError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  const message = 'message' in error ? String((error as { message?: unknown }).message || '') : '';
  return code === '42703' || (/completed_at/i.test(message) && /does not exist/i.test(message));
}

export default function SalesInvoice() {
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isInvoiceFormOpen, setIsInvoiceFormOpen] = useState(false);
  const [isLoadingWorkOrders, setIsLoadingWorkOrders] = useState(false);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [workOrderSearch, setWorkOrderSearch] = useState('');
  const [completedWorkOrders, setCompletedWorkOrders] = useState<CompletedWorkOrderOption[]>([]);
  const [invoicedWorkOrderIds, setInvoicedWorkOrderIds] = useState<Set<string>>(new Set());
  const [completedAtMissing, setCompletedAtMissing] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<CompletedWorkOrderOption | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(EMPTY_INVOICE_FORM);
  
  // Filters
  const [dateFilter] = useState({
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
    void detectMissingCompletedAt();
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

  async function detectMissingCompletedAt() {
    try {
      const { error } = await supabase.from('work_orders').select('id, completed_at').limit(1);
      setCompletedAtMissing(isMissingCompletedAtError(error));
    } catch (error) {
      setCompletedAtMissing(isMissingCompletedAtError(error));
    }
  }

  function resetInvoiceForm() {
    setSelectedWorkOrder(null);
    setInvoiceForm(EMPTY_INVOICE_FORM);
    setWorkOrderSearch('');
    setCompletedWorkOrders([]);
    setInvoicedWorkOrderIds(new Set());
  }

  async function fetchCompletedWorkOrders() {
    setIsLoadingWorkOrders(true);
    try {
      const workOrderFields = `
        id, wo_number, work_date, completed_at, status, vehicle_entry_id,
        vehicle_entries (
          id,
          vehicle_id,
          vehicles (id, license_plate, brand_type, owner_name)
        ),
        work_order_billings (total_price, is_info_only)
      `;
      const workOrderFieldsWithoutCompletedAt = `
        id, wo_number, work_date, status, vehicle_entry_id,
        vehicle_entries (
          id,
          vehicle_id,
          vehicles (id, license_plate, brand_type, owner_name)
        ),
        work_order_billings (total_price, is_info_only)
      `;
      // Status legacy CLOSE/CLOSED tetap diambil sampai migration dijalankan.
      const completedStatuses = ['COMPLETED', 'CLOSED', 'CLOSE'];

      let workOrderResult: { data: unknown; error: unknown } = await supabase
        .from('work_orders')
        .select(workOrderFields)
        .in('status', completedStatuses)
        .order('completed_at', { ascending: false });

      if (workOrderResult.error && isMissingCompletedAtError(workOrderResult.error)) {
        // Fallback sampai migration menambahkan kolom completed_at.
        setCompletedAtMissing(true);
        workOrderResult = await supabase
          .from('work_orders')
          .select(workOrderFieldsWithoutCompletedAt)
          .in('status', completedStatuses)
          .order('work_date', { ascending: false });
      } else if (!workOrderResult.error) {
        setCompletedAtMissing(false);
      }

      const { data: workOrders, error: workOrderError } = workOrderResult;
      const { data: invoices, error: invoiceError } = await supabase
        .from('sales_invoices')
        .select('work_order_id');

      if (workOrderError) throw workOrderError;
      if (invoiceError) {
        console.warn('Gagal membaca daftar invoice:', invoiceError);
        toast.warning('Daftar invoice belum dapat dibaca, WO yang sudah diinvoice ditandai oleh database.');
      }

      const invoicedIds = new Set<string>(
        (invoices || []).map((invoice) => String(invoice.work_order_id || '')).filter(Boolean),
      );
      setCompletedWorkOrders((workOrders || []) as CompletedWorkOrderOption[]);
      setInvoicedWorkOrderIds(invoicedIds);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Gagal mengambil Work Order COMPLETED: ' + message);
    } finally {
      setIsLoadingWorkOrders(false);
    }
  }

  async function openInvoiceForm() {
    resetInvoiceForm();
    setIsInvoiceFormOpen(true);
    await fetchCompletedWorkOrders();
  }

  function selectWorkOrder(workOrder: CompletedWorkOrderOption) {
    if (invoicedWorkOrderIds.has(String(workOrder.id))) {
      toast.error(`${workOrder.wo_number} sudah memiliki invoice dan tidak dapat diproses ulang.`);
      return;
    }
    const invoiceDate = formatLocalInvoiceDate(workOrder.completed_at || workOrder.work_date);
    setSelectedWorkOrder(workOrder);
    setInvoiceForm({
      invoiceNumber: buildInvoiceNumber(workOrder.wo_number),
      invoiceDate,
      dueDate: invoiceDate,
      totalAmount: getWorkOrderTotal(workOrder),
      customerName: getWorkOrderCustomer(workOrder),
      vehicleLabel: getWorkOrderVehicleLabel(workOrder),
    });
  }

  async function handleSaveInvoice() {
    if (!selectedWorkOrder) {
      toast.error('Pilih Work Order COMPLETED terlebih dahulu.');
      return;
    }
    if (invoicedWorkOrderIds.has(String(selectedWorkOrder.id))) {
      toast.error(`${selectedWorkOrder.wo_number} sudah memiliki invoice.`);
      return;
    }
    if (!invoiceForm.invoiceNumber.trim()) {
      toast.error('Nomor invoice tidak boleh kosong.');
      return;
    }
    if (!invoiceForm.invoiceDate || !invoiceForm.dueDate) {
      toast.error('Tanggal invoice dan tanggal jatuh tempo wajib diisi.');
      return;
    }
    if (invoiceForm.dueDate < invoiceForm.invoiceDate) {
      toast.error('Tanggal jatuh tempo tidak boleh lebih awal dari tanggal invoice.');
      return;
    }
    if (invoiceForm.totalAmount <= 0) {
      toast.error('Rincian tagihan final WO belum tersedia.');
      return;
    }

    setIsSavingInvoice(true);
    try {
      const result = await ensureSalesInvoiceForCompletedWorkOrder(selectedWorkOrder, {
        invoiceNumber: invoiceForm.invoiceNumber,
        invoiceDate: invoiceForm.invoiceDate,
        dueDate: invoiceForm.dueDate,
      });
      toast.success(`Invoice ${result.invoice.invoice_number} berhasil dibuat.`);
      setIsInvoiceFormOpen(false);
      resetInvoiceForm();
      await fetchInvoices();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Gagal menyimpan invoice: ' + message);
    } finally {
      setIsSavingInvoice(false);
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
      const outstanding = Number(selectedInvoice.total_amount || 0) - Number(selectedInvoice.paid_amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error('Jumlah diterima harus lebih besar dari nol.');
        return;
      }
      if (amount > outstanding) {
        toast.error('Jumlah diterima tidak boleh melebihi sisa tagihan.');
        return;
      }

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
      const { error: invoiceUpdateError } = await supabase
        .from('sales_invoices')
        .update({ paid_amount: newPaidAmount, status: newStatus })
        .eq('id', selectedInvoice.id);
      if (invoiceUpdateError) throw invoiceUpdateError;

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

  const normalizedWorkOrderSearch = workOrderSearch.trim().toLowerCase();
  const filteredCompletedWorkOrders = completedWorkOrders.filter((workOrder) => {
    if (!normalizedWorkOrderSearch) return true;
    const vehicle = getWorkOrderVehicle(workOrder);
    return [workOrder.wo_number, vehicle?.license_plate, vehicle?.brand_type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedWorkOrderSearch));
  });
  const pendingInvoiceWorkOrderCount = completedWorkOrders.filter(
    (workOrder) => !invoicedWorkOrderIds.has(String(workOrder.id)),
  ).length;
  const invoicedWorkOrderCount = completedWorkOrders.length - pendingInvoiceWorkOrderCount;

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Invoice / Faktur Penjualan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pilih Work Order COMPLETED, lalu isi form invoice/faktur. Tanggal invoice	default mengikuti tanggal WO diproses selesai.
          </p>
        </div>
        <Button onClick={openInvoiceForm}>
            <FilePlus2 className="mr-2 h-4 w-4" />
            Buat Invoice
        </Button>
      </div>

      {completedAtMissing && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Migration database belum dijalankan.</p>
          <p className="mt-1">
            Kolom <code>work_orders.completed_at</code> belum ada, sehingga tanggal invoice sementara memakai
            tanggal kerja WO. Jalankan file{' '}
            <code>supabase/migrations/20260924_normalize_wo_status_and_sales_invoice.sql</code> pada SQL
            Editor Supabase agar tanggal selesai, status legacy, dan aturan invoice aktif.
          </p>
        </div>
      )}

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
                          <SelectItem value="PARTIAL">Sebagian</SelectItem>
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
                                                    ${inv.status === 'PAID' ? 'bg-green-100 text-green-800' : inv.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                                                    {inv.status === 'PAID' ? 'LUNAS' : inv.status === 'PARTIAL' ? 'SEBAGIAN' : 'BELUM LUNAS'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => window.open(`/print/invoice/${inv.id}`, '_blank')}
                                                    >
                                                        <Printer className="mr-2 h-4 w-4" /> Faktur
                                                    </Button>
                                                    {inv.status !== 'PAID' && remaining > 0 && (
                                                        <Button size="sm" onClick={() => handlePayClick(inv)}>
                                                            <Wallet className="mr-2 h-4 w-4" /> Terima
                                                        </Button>
                                                    )}
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

      <Dialog
        open={isInvoiceFormOpen}
        onOpenChange={(open) => {
          setIsInvoiceFormOpen(open);
          if (!open) resetInvoiceForm();
        }}
      >
        <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-3 sm:max-w-6xl sm:p-6">
          <DialogHeader>
            <DialogTitle>Buat Invoice / Faktur Penjualan</DialogTitle>
            <DialogDescription>
              Pilih Work Order berstatus COMPLETED, kemudian isi data invoice. Tanggal invoice otomatis memakai tanggal WO selesai.
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveInvoice();
            }}
          >
            <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
              <div className="flex min-h-0 flex-col rounded-lg border bg-slate-50/70 p-3">
                <div className="mb-3 space-y-2">
                  <Label className="font-semibold">1. Pilih No. Work Order</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="bg-white pl-8"
                      placeholder="Cari No. WO / Nopol / Kendaraan..."
                      value={workOrderSearch}
                      onChange={(event) => setWorkOrderSearch(event.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isLoadingWorkOrders
                      ? 'Memuat Work Order COMPLETED...'
                      : completedWorkOrders.length === 0
                        ? 'Belum ada Work Order berstatus COMPLETED.'
                        : `${pendingInvoiceWorkOrderCount} WO COMPLETED belum memiliki invoice${
                            invoicedWorkOrderCount > 0 ? ` · ${invoicedWorkOrderCount} sudah diinvoice` : ''
                          }.`}
                  </p>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {isLoadingWorkOrders ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Memuat Work Order...
                    </div>
                  ) : filteredCompletedWorkOrders.length === 0 ? (
                    <div className="rounded-md border border-dashed bg-white px-4 py-10 text-center text-sm text-muted-foreground">
                      {completedWorkOrders.length === 0
                        ? 'Belum ada Work Order berstatus COMPLETED.'
                        : 'Work Order tidak ditemukan.'}
                    </div>
                  ) : (
                    filteredCompletedWorkOrders.map((workOrder) => {
                      const isSelected = selectedWorkOrder?.id === workOrder.id;
                      const isInvoiced = invoicedWorkOrderIds.has(String(workOrder.id));
                      const total = getWorkOrderTotal(workOrder);
                      return (
                        <button
                          key={workOrder.id}
                          type="button"
                          disabled={isInvoiced}
                          onClick={() => selectWorkOrder(workOrder)}
                          className={`w-full rounded-lg border bg-white p-3 text-left transition-colors ${
                            isInvoiced
                              ? 'cursor-not-allowed border-slate-200 opacity-70'
                              : 'hover:border-blue-400 hover:bg-blue-50'
                          } ${isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">{workOrder.wo_number}</p>
                              <p className="text-sm text-slate-600">{getWorkOrderVehicleLabel(workOrder)}</p>
                            </div>
                            {isInvoiced ? (
                              <span className="whitespace-nowrap rounded bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700">
                                Sudah diinvoice
                              </span>
                            ) : (
                              <span className={`whitespace-nowrap rounded px-2 py-1 text-[10px] font-semibold ${
                                total > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {total > 0 ? formatCurrency(total) : 'Billing belum ada'}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>Selesai: {formatDate(workOrder.completed_at || workOrder.work_date)}</span>
                            <span className="font-medium text-emerald-700">COMPLETED</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto rounded-lg border p-4">
                {!selectedWorkOrder ? (
                  <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
                    <FilePlus2 className="mb-3 h-10 w-10 text-slate-300" />
                    <p className="font-medium text-slate-700">Pilih Work Order terlebih dahulu</p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      Data pelanggan, kendaraan, tanggal selesai, dan total tagihan akan terisi otomatis.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">2. Data Invoice / Faktur</h3>
                      <p className="text-xs text-muted-foreground">
                        Periksa kembali nomor dan tanggal sebelum menyimpan.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>No. Work Order</Label>
                        <Input value={selectedWorkOrder.wo_number} readOnly className="bg-slate-50" />
                      </div>
                      <div className="space-y-2">
                        <Label>Tanggal WO Selesai</Label>
                        <Input
                          value={formatDate(selectedWorkOrder.completed_at || selectedWorkOrder.work_date)}
                          readOnly
                          className="bg-slate-50"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Pelanggan</Label>
                        <Input value={invoiceForm.customerName} readOnly className="bg-slate-50" />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Kendaraan</Label>
                        <Input value={invoiceForm.vehicleLabel} readOnly className="bg-slate-50" />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="invoice-number">No. Invoice / Faktur</Label>
                        <Input
                          id="invoice-number"
                          maxLength={50}
                          value={invoiceForm.invoiceNumber}
                          onChange={(event) => setInvoiceForm((current) => ({
                            ...current,
                            invoiceNumber: event.target.value,
                          }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invoice-date">Tanggal Invoice / Faktur</Label>
                        <Input
                          id="invoice-date"
                          type="date"
                          value={invoiceForm.invoiceDate}
                          onChange={(event) => setInvoiceForm((current) => ({
                            ...current,
                            invoiceDate: event.target.value,
                          }))}
                          required
                        />
                        <p className="text-xs text-muted-foreground">Default: tanggal WO diproses COMPLETED.</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invoice-due-date">Jatuh Tempo</Label>
                        <Input
                          id="invoice-due-date"
                          type="date"
                          min={invoiceForm.invoiceDate || undefined}
                          value={invoiceForm.dueDate}
                          onChange={(event) => setInvoiceForm((current) => ({
                            ...current,
                            dueDate: event.target.value,
                          }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Total Tagihan Final</Label>
                        <Input value={formatCurrency(invoiceForm.totalAmount)} readOnly className="bg-slate-50" />
                      </div>
                      <div className="space-y-2">
                        <Label>Status Awal</Label>
                        <Input value="BELUM LUNAS" readOnly className="bg-slate-50" />
                      </div>
                    </div>

                    {invoiceForm.totalAmount <= 0 && (
                      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        Billing final WO masih kosong. Siapkan rincian final sebelum menyimpan invoice.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsInvoiceFormOpen(false);
                  resetInvoiceForm();
                }}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={!selectedWorkOrder || invoiceForm.totalAmount <= 0 || isSavingInvoice}
              >
                {isSavingInvoice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Simpan Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
