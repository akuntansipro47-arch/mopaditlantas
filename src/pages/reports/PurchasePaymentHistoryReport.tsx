import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Calendar as CalendarIcon, Download, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function PurchasePaymentHistoryReport() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [journalByPaymentId, setJournalByPaymentId] = useState<Record<string, boolean>>({});
  const [syncingBank, setSyncingBank] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  async function fetchApAccount() {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .or('account_name.ilike.%hutang usaha%,account_name.ilike.%hutang dagang%,account_name.ilike.%accounts payable%,account_code.like.21%')
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) return data;
    const { data: data2 } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('sub_category', 'HUTANG')
      .eq('account_type', 'DETAIL')
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data2 || null;
  }

  async function fetchJournalMap(paymentIds: string[]) {
    try {
      if (paymentIds.length === 0) {
        setJournalByPaymentId({});
        return;
      }
      const { data: rows, error } = await supabase
        .from('journal_entries')
        .select('reference, entry_type')
        .eq('entry_type', 'PAYMENT')
        .in('reference', paymentIds);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      (rows || []).forEach((r: any) => {
        const ref = String(r.reference || '').trim();
        if (!ref) return;
        map[ref] = true;
      });
      setJournalByPaymentId(map);
    } catch {
      setJournalByPaymentId({});
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('purchase_payments')
        .select(`
          id,
          payment_date,
          amount,
          transfer_fee,
          fee_account_id,
          payment_method,
          notes,
          created_at,
          payment_account_id,
          purchase_invoices (
            id,
            invoice_number,
            invoice_date,
            due_date,
            total_amount,
            purchase_orders (po_number),
            suppliers (name)
          ),
          payment_account:chart_of_accounts!purchase_payments_payment_account_id_fkey (account_code, account_name),
          fee_account:chart_of_accounts!purchase_payments_fee_account_id_fkey (account_code, account_name)
        `)
        .gte('payment_date', dateRange.start)
        .lte('payment_date', dateRange.end)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setData(rows || []);
      await fetchJournalMap((rows || []).map((r: any) => String(r.id || '')).filter(Boolean));
      setSyncNote('');
    } catch (e: any) {
      toast.error('Gagal memuat laporan: ' + (e?.message || 'Unknown error'));
      setData([]);
      setJournalByPaymentId({});
      setSyncNote('');
    } finally {
      setLoading(false);
    }
  }

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((p: any) => {
      const inv = p.purchase_invoices;
      const invoiceNo = String(inv?.invoice_number || '').toLowerCase();
      const poNo = String(inv?.purchase_orders?.po_number || '').toLowerCase();
      const supplier = String(inv?.suppliers?.name || '').toLowerCase();
      const account = String(p.payment_account?.account_name || '').toLowerCase();
      const notes = String(p.notes || '').toLowerCase();
      return (
        invoiceNo.includes(q) ||
        poNo.includes(q) ||
        supplier.includes(q) ||
        account.includes(q) ||
        notes.includes(q)
      );
    });
  }, [data, search]);

  const missingBankCount = useMemo(() => {
    return filteredData.reduce((acc: number, p: any) => {
      const id = String(p.id || '');
      if (!id) return acc;
      return journalByPaymentId[id] ? acc : acc + 1;
    }, 0);
  }, [filteredData, journalByPaymentId]);

  const totalAmount = filteredData.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  const exportToExcel = () => {
    const exportData = filteredData.map((p: any) => {
      const inv = p.purchase_invoices;
      return {
        'Tanggal Bayar': formatDate(p.payment_date),
        'No. Invoice': inv?.invoice_number || '-',
        'No. PO': inv?.purchase_orders?.po_number || '-',
        'Supplier': inv?.suppliers?.name || '-',
        'Akun Pembayar': p.payment_account ? `${p.payment_account.account_code} - ${p.payment_account.account_name}` : '-',
        'Metode': p.payment_method || '-',
        'Jumlah': Number(p.amount) || 0,
        'Catatan': p.notes || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Pembayaran');
    XLSX.writeFile(wb, `Laporan_Riwayat_Pembayaran_Hutang_${dateRange.start}_sd_${dateRange.end}.xlsx`);
  };

  const syncToBank = async () => {
    const payments = filteredData as any[];
    const missing = payments.filter((p) => !journalByPaymentId[String(p.id || '')]);
    if (missing.length === 0) {
      toast.success('Semua transaksi sudah tercatat di Bank.');
      setSyncNote('Semua transaksi pada filter ini sudah tercatat di Bank.');
      return;
    }
    setSyncingBank(true);
    try {
      toast.success(`Menyinkronkan ke Bank: ${missing.length} transaksi...`);
      setSyncNote(`Menyinkronkan ke Bank: ${missing.length} transaksi...`);
      const ap = await fetchApAccount();
      if (!ap?.id) {
        toast.error('Akun Hutang Usaha (AP) belum ditemukan. Mohon set COA Hutang Usaha.');
        setSyncNote('Gagal: Akun Hutang Usaha (AP) belum ditemukan.');
        return;
      }

      let created = 0;
      const skipped: string[] = [];

      for (const p of missing) {
        const payId = String(p.id || '');
        const inv = p.purchase_invoices || {};
        const invoiceNumber = String(inv.invoice_number || '');
        const supplier = String(inv.suppliers?.name || '');
        const bankAccId = String(p.payment_account_id || '');
        const amount = Number(p.amount || 0);
        const fee = Math.max(0, Number(p.transfer_fee || 0));
        const cashOut = amount + fee;

        if (!payId || !bankAccId || cashOut <= 0) {
          skipped.push(invoiceNumber || payId || '-');
          continue;
        }

        const { data: exists } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('entry_type', 'PAYMENT')
          .eq('reference', payId)
          .limit(1)
          .maybeSingle();
        if (exists?.id) {
          created += 0;
          continue;
        }

        const { data: entry, error: entryError } = await supabase
          .from('journal_entries')
          .insert([{
            entry_date: p.payment_date,
            voucher_no: `PAY-${invoiceNumber || payId}-${Date.now().toString().slice(-4)}`,
            description: `Pembayaran Hutang ${invoiceNumber}${supplier ? ` (${supplier})` : ''}${p.notes ? ` - ${p.notes}` : ''}`.trim(),
            entry_type: 'PAYMENT',
            total_amount: cashOut,
            reference: payId,
          }])
          .select()
          .single();
        if (entryError) throw entryError;

        const itemsPayload: any[] = [
          {
            journal_entry_id: entry.id,
            account_id: ap.id,
            debit: amount,
            credit: 0,
            description: 'Pelunasan Hutang',
          },
        ];
        if (fee > 0 && p.fee_account_id) {
          itemsPayload.push({
            journal_entry_id: entry.id,
            account_id: p.fee_account_id,
            debit: fee,
            credit: 0,
            description: 'Biaya Admin/Transfer',
          });
        }
        itemsPayload.push({
          journal_entry_id: entry.id,
          account_id: bankAccId,
          debit: 0,
          credit: cashOut,
          description: 'Pengeluaran Kas/Bank',
        });

        const { error: itemsErr } = await supabase.from('journal_entry_items').insert(itemsPayload);
        if (itemsErr) throw itemsErr;
        created += 1;
      }

      await fetchJournalMap((data || []).map((r: any) => String(r.id || '')).filter(Boolean));
      toast.success(`Sinkronisasi Bank selesai. Dibuat jurnal: ${created}${skipped.length ? `, dilewati: ${skipped.length}` : ''}`);
      setSyncNote(`Sinkronisasi selesai. Dibuat jurnal: ${created}${skipped.length ? `, dilewati: ${skipped.length}` : ''}`);
      if (skipped.length) {
        toast.error(`Dilewati (data kurang lengkap): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}`);
      }
    } catch (e: any) {
      toast.error('Gagal sinkronkan ke Bank: ' + String(e?.message || e));
      setSyncNote('Gagal sinkronkan ke Bank: ' + String(e?.message || e));
    } finally {
      setSyncingBank(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Laporan Riwayat Pembayaran Hutang</h2>
          <p className="text-muted-foreground">Daftar transaksi pembayaran hutang supplier per periode.</p>
          <p className="text-xs text-blue-600 font-medium mt-1">Total Data: {filteredData.length} transaksi</p>
          {filteredData.length > 0 && (
            <p className="text-xs text-amber-700 font-medium mt-1">Belum tercatat di Bank: {missingBankCount}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} disabled={filteredData.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" onClick={syncToBank} disabled={filteredData.length === 0 || syncingBank}>
            {syncingBank ? 'Menyinkronkan...' : 'Sinkronkan Bank'}
          </Button>
        </div>
      </div>
      {syncNote && (
        <div className="text-xs text-slate-600">{syncNote}</div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalAmount)}</div>
            <p className="text-xs text-slate-500">Sesuai filter</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Periode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold text-slate-900">{formatDate(dateRange.start)} s/d {formatDate(dateRange.end)}</div>
            <p className="text-xs text-slate-500">Tanggal bayar</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Jumlah Transaksi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{filteredData.length}</div>
            <p className="text-xs text-slate-500">Pembayaran hutang</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md border-slate-200">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg">Rincian Pembayaran</CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <Input type="date" className="w-auto bg-white" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                <span className="text-sm text-slate-500">s/d</span>
                <Input type="date" className="w-auto bg-white" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
              </div>
              <div className="relative w-72">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari invoice / PO / supplier..."
                  className="pl-8 bg-white"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-semibold text-slate-700">Tgl Pembayaran</TableHead>
                <TableHead className="font-semibold text-slate-700">No. Invoice</TableHead>
                <TableHead className="font-semibold text-slate-700">No. PO</TableHead>
                <TableHead className="font-semibold text-slate-700">Supplier</TableHead>
                <TableHead className="font-semibold text-slate-700">Akun Pembayar</TableHead>
                <TableHead className="font-semibold text-slate-700">Bank</TableHead>
                <TableHead className="font-semibold text-slate-700">Metode</TableHead>
                <TableHead className="text-right font-semibold text-slate-700">Jumlah</TableHead>
                <TableHead className="font-semibold text-slate-700">Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Memuat data...</TableCell></TableRow>
              ) : filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Tidak ada data ditemukan.</TableCell></TableRow>
              ) : (
                filteredData.map((p: any) => {
                  const inv = p.purchase_invoices;
                  const hasBank = Boolean(journalByPaymentId[String(p.id || '')]);
                  return (
                    <TableRow key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="text-sm">{formatDate(p.payment_date)}</TableCell>
                      <TableCell className="font-mono text-xs">{inv?.invoice_number || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{inv?.purchase_orders?.po_number || '-'}</TableCell>
                      <TableCell className="text-sm">{inv?.suppliers?.name || '-'}</TableCell>
                      <TableCell className="text-sm">{p.payment_account ? `${p.payment_account.account_code} - ${p.payment_account.account_name}` : '-'}</TableCell>
                      <TableCell className="text-sm">
                        <span className={hasBank ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                          {hasBank ? 'OK' : 'Belum'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{p.payment_method || '-'}</TableCell>
                      <TableCell className="text-right font-bold text-slate-900">{formatCurrency(p.amount || 0)}</TableCell>
                      <TableCell className="text-sm">{p.notes || '-'}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
