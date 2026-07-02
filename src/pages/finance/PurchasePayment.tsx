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
import { logActivity } from '@/lib/activityLog';

export default function PurchasePayment() {
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [dateFilter, setDateFilter] = useState({
    // Default: tahun berjalan (biar tagihan lama tetap muncul, tidak hilang karena filter bulanan)
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isPayOpen, setIsPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [originalPaymentAmount, setOriginalPaymentAmount] = useState(0);

  const [paymentData, setPaymentData] = useState({
    amount: '0',
    transfer_fee: '0',
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

  async function resolveApAccount() {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .or('account_name.ilike.%hutang usaha%,account_name.ilike.%hutang dagang%')
      .limit(1)
      .maybeSingle();
    if (data) {
      setApAccount(data);
      return data;
    }
    const { data: data2 } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('sub_category', 'HUTANG')
      .eq('account_type', 'DETAIL')
      .limit(1)
      .maybeSingle();
    if (data2) setApAccount(data2);
    return data2 || null;
  }

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
            .select('id, po_number, supplier_id, total_amount, created_at, status')
            .in('status', ['RECEIVED_FULL', 'RECEIVED_PART']);
        
        if (!pos || pos.length === 0) {
            toast.info("Tidak ada PO yang perlu disinkronisasi.");
            return;
        }

        const { data: invoices, error: invErr } = await supabase
            .from('purchase_invoices')
            .select('id, po_id, total_amount, paid_amount, status');
        if (invErr) throw invErr;
        
        const invoiceByPoId = new Map<string, any>();
        (invoices || []).forEach((inv: any) => {
          const k = String(inv?.po_id || '').trim();
          if (k) invoiceByPoId.set(k, inv);
        });
        const existingPoIds = new Set(Array.from(invoiceByPoId.keys()));

        const missingPos = pos.filter(p => !existingPoIds.has(p.id));
        const needFixTotals = pos
          .filter((p: any) => {
            const inv = invoiceByPoId.get(String(p.id));
            if (!inv) return false;
            const poStatus = String(p?.status || '').toUpperCase();
            if (poStatus !== 'RECEIVED_FULL') return false;
            const poTotal = Number(p?.total_amount || 0);
            const invTotal = Number(inv?.total_amount || 0);
            return poTotal > 0 && Math.abs(poTotal - invTotal) > 0.5;
          })
          .map((p: any) => ({ po: p, inv: invoiceByPoId.get(String(p.id)) }));

        if (missingPos.length === 0 && needFixTotals.length === 0) {
            toast.success("Semua data sudah sinkron.");
            void logActivity({
              action: 'SYNC_AP_INVOICES',
              module: 'PURCHASE_PAYMENT',
              details: 'Sinkron tagihan: tidak ada data baru',
              meta: { created_count: 0, updated_count: 0 },
            });
            return;
        }

        // Ambil tanggal receipt terbaru per PO (kalau ada), supaya invoice_date lebih akurat dan mudah dicari di filter.
        const receiptDateByPoId = new Map<string, string>();
        const missingPoIds = missingPos.map((p: any) => p.id).filter(Boolean);
        if (missingPoIds.length > 0) {
          const { data: receipts, error: rErr } = await supabase
            .from('goods_receipts')
            .select('po_id, receipt_date')
            .in('po_id', missingPoIds)
            .order('receipt_date', { ascending: false });
          if (rErr) throw rErr;
          (receipts || []).forEach((r: any) => {
            const poId = String(r?.po_id || '').trim();
            const dt = String(r?.receipt_date || '').trim();
            if (!poId || !dt) return;
            if (!receiptDateByPoId.has(poId)) receiptDateByPoId.set(poId, dt);
          });
        }

        const newInvoices = missingPos.map((p: any) => {
          const poId = String(p.id || '').trim();
          const baseDate = receiptDateByPoId.get(poId) || new Date(p.created_at).toISOString().split('T')[0];
          const due = new Date(new Date(baseDate).setDate(new Date(baseDate).getDate() + 30)).toISOString().split('T')[0];
          return {
          invoice_number: `INV-${p.po_number}`,
          po_id: p.id,
          supplier_id: p.supplier_id,
          invoice_date: baseDate,
          due_date: due,
          total_amount: p.total_amount,
          status: 'UNPAID'
          };
        });

        if (newInvoices.length > 0) {
          const { error } = await supabase.from('purchase_invoices').insert(newInvoices);
          if (error) throw error;
        }

        let updatedCount = 0;
        for (const row of needFixTotals) {
          const poTotal = Number(row.po?.total_amount || 0);
          const paid = Number(row.inv?.paid_amount || 0);
          const nextStatus = paid >= poTotal ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
          const { error: upErr } = await supabase
            .from('purchase_invoices')
            .update({ total_amount: poTotal, status: nextStatus })
            .eq('id', row.inv.id);
          if (upErr) throw upErr;
          updatedCount += 1;
        }

        const msgParts: string[] = [];
        if (newInvoices.length > 0) msgParts.push(`buat ${newInvoices.length} tagihan`);
        if (updatedCount > 0) msgParts.push(`perbaiki total ${updatedCount} tagihan`);
        toast.success(`Sinkronisasi selesai: ${msgParts.join(', ')}`);
        void logActivity({
          action: 'SYNC_AP_INVOICES',
          module: 'PURCHASE_PAYMENT',
          details: `Sinkron tagihan: buat ${newInvoices.length} tagihan, update ${updatedCount} tagihan`,
          meta: { created_count: newInvoices.length, updated_count: updatedCount },
        });
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
            status,
            work_orders (
              wo_number,
              vehicle_entries (
                vehicles (license_plate, brand_type)
              )
            )
          )
        `)
        .in('purchase_orders.status', ['RECEIVED_FULL', 'RECEIVED_PART', 'RETURNED_FULL', 'RETURNED_PART'])
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
                    id,
                    invoice_number,
                    total_amount,
                    paid_amount,
                    status,
                    purchase_orders (
                      po_number,
                      status,
                      work_orders (
                        wo_number,
                        vehicle_entries (
                          vehicles (license_plate, brand_type)
                        )
                      )
                    ),
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
      amount: String(Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)),
      transfer_fee: '0',
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
          amount: String(Number(payment.amount || 0)),
          transfer_fee: String(Number(payment.transfer_fee || 0)),
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
      void logActivity({
        action: 'AP_PAYMENT_DELETE',
        module: 'PURCHASE_PAYMENT',
        entity_type: 'purchase_payments',
        entity_id: String(payment.id),
        details: `Batalkan pembayaran ${invoice.invoice_number}`,
        meta: {
          payment_id: payment.id,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount: Number(payment.amount || 0),
          payment_date: payment.payment_date || null,
        },
      });
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
      const poStatus = String(selectedInvoice.purchase_orders?.status || '').toUpperCase();
      if (poStatus.startsWith('RETURNED')) {
        toast.error("Tidak dapat memproses pembayaran. PO terkait sudah diretur.");
        setIsPayOpen(false);
        setLoading(false);
        return;
      }

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

      const ap = apAccount || (await resolveApAccount());
      if (!ap?.id) {
        toast.error("Akun Hutang Usaha (AP) belum diset. Mohon set COA Hutang Usaha.");
        return;
      }

      const createJournal = async (ref: string) => {
        const cashOut = amount + transferFee;
        const { data: entry, error: entryError } = await supabase
          .from('journal_entries')
          .insert([{
            entry_date: paymentData.payment_date,
            voucher_no: `PAY-${selectedInvoice.invoice_number}-${Date.now().toString().slice(-4)}`,
            description: `Pembayaran Hutang ${selectedInvoice.invoice_number} (${selectedInvoice.suppliers?.name || ''}) - ${paymentData.notes}`,
            entry_type: 'PAYMENT',
            total_amount: cashOut,
            reference: ref,
          }])
          .select()
          .single();
        if (entryError) throw entryError;
        if (!entry?.id) throw new Error('Gagal membuat jurnal pembayaran (header).');

        const itemsPayload: any[] = [
          {
            journal_entry_id: entry.id,
            account_id: ap.id,
            debit: amount,
            credit: 0,
            description: 'Pelunasan Hutang',
          },
        ];

        if (transferFee > 0 && paymentData.fee_account_id) {
          itemsPayload.push({
            journal_entry_id: entry.id,
            account_id: paymentData.fee_account_id,
            debit: transferFee,
            credit: 0,
            description: 'Biaya Admin/Transfer',
          });
        }

        itemsPayload.push({
          journal_entry_id: entry.id,
          account_id: paymentData.payment_account_id,
          debit: 0,
          credit: cashOut,
          description: 'Pengeluaran Kas/Bank',
        });

        try {
          const { error: itemsErr } = await supabase.from('journal_entry_items').insert(itemsPayload);
          if (itemsErr) throw itemsErr;
        } catch (e) {
          // Cleanup bila gagal insert item jurnal agar tidak ada jurnal "yatim"
          await supabase.from('journal_entries').delete().eq('id', entry.id);
          throw e;
        }
        return entry.id as string;
      };

      let paymentId = editingPaymentId;

      if (editingPaymentId) {
          const tempRef = `${editingPaymentId}:tmp:${Date.now().toString().slice(-6)}`;
          const newJournalId = await createJournal(tempRef);

          const adjustedPaidAmount = currentPaid - originalPaymentAmount + amount;
          const newStatus = adjustedPaidAmount >= selectedInvoice.total_amount ? 'PAID' : 'PARTIAL';

          const [{ error: updateError }, { error: invErr }, { error: delOldErr }] = await Promise.all([
            supabase
              .from('purchase_payments')
              .update({
                amount: amount,
                transfer_fee: transferFee,
                fee_account_id: paymentData.fee_account_id || null,
                payment_date: paymentData.payment_date,
                payment_method: paymentData.payment_method,
                payment_account_id: paymentData.payment_account_id,
                notes: paymentData.notes,
              })
              .eq('id', editingPaymentId),
            supabase
              .from('purchase_invoices')
              .update({ paid_amount: adjustedPaidAmount, status: newStatus })
              .eq('id', selectedInvoice.id),
            supabase.from('journal_entries').delete().eq('reference', editingPaymentId),
          ]);

          if (updateError) throw updateError;
          if (invErr) throw invErr;
          if (delOldErr) throw delOldErr;

          const { error: refErr } = await supabase.from('journal_entries').update({ reference: editingPaymentId }).eq('id', newJournalId);
          if (refErr) throw refErr;
          
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

          try {
            await createJournal(paymentId);
          } catch (e: any) {
            await supabase.from('purchase_payments').delete().eq('id', paymentId);
            throw e;
          }

          const { error: invErr } = await supabase
            .from('purchase_invoices')
            .update({ paid_amount: newPaidAmount, status: newStatus })
            .eq('id', selectedInvoice.id);
          if (invErr) throw invErr;
      }

      toast.success(editingPaymentId ? "Pembayaran berhasil diperbarui" : "Pembayaran berhasil diproses");
      void logActivity({
        action: editingPaymentId ? 'AP_PAYMENT_UPDATE' : 'AP_PAYMENT_CREATE',
        module: 'PURCHASE_PAYMENT',
        entity_type: 'purchase_payments',
        entity_id: String(paymentId || ''),
        details: `${editingPaymentId ? 'Update' : 'Create'} pembayaran ${String(selectedInvoice?.invoice_number || '').trim()}`.trim(),
        meta: {
          payment_id: paymentId,
          invoice_id: selectedInvoice?.id || null,
          invoice_number: selectedInvoice?.invoice_number || null,
          supplier_name: selectedInvoice?.suppliers?.name || null,
          amount: Number(amount || 0),
          transfer_fee: Number(transferFee || 0),
          payment_account_id: paymentData.payment_account_id || null,
          fee_account_id: paymentData.fee_account_id || null,
          payment_date: paymentData.payment_date,
          method: paymentData.payment_method,
        },
      });
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
    const q = String(search || '').toLowerCase();
    const invPlate = String(inv.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '').toLowerCase();
    const invVehicleName = String(inv.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '').toLowerCase();
    const matchSearch =
      String(inv.invoice_number || '').toLowerCase().includes(q) ||
      String(inv.purchase_orders?.po_number || '').toLowerCase().includes(q) ||
      String(inv.suppliers?.name || '').toLowerCase().includes(q) ||
      invPlate.includes(q) ||
      invVehicleName.includes(q);
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
    const plate = String(pay.purchase_invoices?.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '').toLowerCase();
    const vehicleName = String(pay.purchase_invoices?.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '').toLowerCase();
    return invoiceNo.includes(q) || supplierName.includes(q) || poNo.includes(q) || plate.includes(q) || vehicleName.includes(q);
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
              placeholder="Cari No. Tagihan / No. PO / Supplier / Nopol / Nama Kendaraan..."
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
                      <TableHead>No. PO</TableHead>
                      <TableHead>Kendaraan</TableHead>
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
                        <TableCell colSpan={11} className="text-center">Memuat data...</TableCell>
                      </TableRow>
                    ) : filteredInvoices.map(invoice => (
                      <TableRow key={invoice.id}>
                        <TableCell>{invoice.invoice_number}</TableCell>
                        <TableCell>{invoice.purchase_orders?.po_number}</TableCell>
                        <TableCell>
                          <div className="font-medium">{invoice.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'}</div>
                          <div className="text-xs text-gray-500">{invoice.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '-'}</div>
                        </TableCell>
                        <TableCell>{invoice.suppliers?.name}</TableCell>
                        <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                        <TableCell>{formatDate(invoice.due_date)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.total_amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.paid_amount)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(invoice.total_amount - invoice.paid_amount)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            String(invoice.purchase_orders?.status || '').toUpperCase().startsWith('RETURNED') ? 'bg-gray-200 text-gray-800' :
                            invoice.status === 'PAID' ? 'bg-green-200 text-green-800' :
                            invoice.status === 'PARTIAL' ? 'bg-yellow-200 text-yellow-800' :
                            'bg-red-200 text-red-800'
                          }`}>
                            {String(invoice.purchase_orders?.status || '').toUpperCase().startsWith('RETURNED') ? 'DIRETUR' : invoice.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            onClick={() => handlePayClick(invoice)} 
                            disabled={invoice.status === 'PAID' || String(invoice.purchase_orders?.status || '').toUpperCase().startsWith('RETURNED')}
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
                  placeholder="Cari No. Tagihan / No. PO / Supplier / Nopol / Nama Kendaraan..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="mb-4"
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tgl. Bayar</TableHead>
                      <TableHead>No. Tagihan</TableHead>
                      <TableHead>No. PO</TableHead>
                      <TableHead>Kendaraan</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Akun Pembayar</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center">Memuat data...</TableCell>
                      </TableRow>
                    ) : filteredPaymentHistory.map(payment => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatDate(payment.payment_date)}</TableCell>
                        <TableCell>{payment.purchase_invoices?.invoice_number}</TableCell>
                        <TableCell>{payment.purchase_invoices?.purchase_orders?.po_number}</TableCell>
                        <TableCell>
                          <div className="font-medium">{payment.purchase_invoices?.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'}</div>
                          <div className="text-xs text-gray-500">{payment.purchase_invoices?.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '-'}</div>
                        </TableCell>
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
                <Input
                  id="amount"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={paymentData.amount}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setPaymentData({ ...paymentData, amount: digits });
                  }}
                  className="col-span-3"
                />
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
                <Input
                  id="transfer_fee"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={paymentData.transfer_fee}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setPaymentData({ ...paymentData, transfer_fee: digits });
                  }}
                  className="col-span-3"
                />
              </div>
              {Number(paymentData.transfer_fee || 0) > 0 && (
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
