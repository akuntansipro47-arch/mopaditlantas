import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Calendar, Search, RefreshCw } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";

export default function GoodsReceiptReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [search, setSearch] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('ALL'); // Add Item Type Filter
  const [dateRange, setDateRange] = useState({
    start: '2024-01-01',
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchApAccount = async () => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .or('account_name.ilike.%hutang usaha%,account_name.ilike.%hutang dagang%')
      .limit(1)
      .maybeSingle();
    if (data) return data;
    const { data: data2 } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('sub_category', 'HUTANG')
      .eq('account_type', 'DETAIL')
      .limit(1)
      .maybeSingle();
    return data2 || null;
  };

  const fetchPersediaanAccount = async () => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .ilike('account_name', '%persediaan%')
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data || null;
  };

  const fetchAccountByCodePrefix = async (prefix: string) => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .ilike('account_code', `${prefix}%`)
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data || null;
  };

  const fetchAccountByName = async (nameLike: string) => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .ilike('account_name', `%${nameLike}%`)
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data || null;
  };

  const accountCodeByGoodsType = (t: string) => {
    const type = String(t || '').toUpperCase();
    if (type === 'PERALATAN_WORKSHOP') return '1400101';
    if (type === 'INVENTARIS_KANTOR') return '1400102';
    if (type === 'FURNITURE') return '1400103';
    if (type === 'PERLENGKAPAN') return '1400104';
    return null;
  };

  async function fetchData(customStart?: string, customEnd?: string) {
    setLoading(true);
    try {
      const start = customStart || dateRange.start;
      const end = customEnd || dateRange.end;

      // Fetch Goods Receipts that have POs (as requested)
      // We start from goods_receipts to capture "Stok Masuk" events
      const { data: result, error } = await supabase
        .from('goods_receipts')
        .select(`
          *,
          purchase_orders (
            id,
            po_number,
            po_date,
            suppliers (name),
            work_orders (wo_number),
            items:purchase_order_items (
              goods_id,
              unit_price,
              quantity,
              goods (name, item_code, unit)
            )
          ),
          items:goods_receipt_items (
            quantity_received,
            notes,
            goods (id, item_code, name, unit, item_type)
          )
        `)
        .gte('receipt_date', start)
        .lte('receipt_date', end)
        .order('receipt_date', { ascending: false });

      if (error) throw error;
      
      // Flatten the data for "Rincian" view
      const flatItems = (result || []).flatMap((receipt: any) => {
        // Handle case where items might be empty but we want to debug
        if (!receipt.items || receipt.items.length === 0) {
             // Fallback: Try to use PO items if receipt items are missing
             if (receipt.purchase_orders?.items && receipt.purchase_orders.items.length > 0) {
                 return receipt.purchase_orders.items.map((poItem: any) => ({
                    receipt_number: receipt.receipt_number,
                    receipt_date: receipt.receipt_date,
                    // received_by removed as it might not exist
                    po_number: receipt.purchase_orders?.po_number,
                    po_date: receipt.purchase_orders?.po_date,
                    supplier_name: receipt.purchase_orders?.suppliers?.name,
                    wo_number: receipt.purchase_orders?.work_orders?.wo_number,
                    quantity_received: poItem.quantity,
                    unit_price: poItem.unit_price,
                    goods: {
                        item_code: poItem.goods?.item_code || 'Unknown',
                        name: poItem.goods?.name || 'Item from PO',
                        unit: poItem.goods?.unit || 'Pcs',
                        item_type: poItem.goods?.item_type || 'LAINNYA'
                    },
                    notes: 'Tampil dari Data PO (Sinkronisasi)'
                 }));
             }
             return [];
        }

        return receipt.items.map((item: any) => ({
          ...item,
          receipt_id: receipt.id,
          receipt_number: receipt.receipt_number,
          receipt_date: receipt.receipt_date,
          // received_by removed
          po_id: receipt.purchase_orders?.id,
          po_number: receipt.purchase_orders?.po_number,
          po_date: receipt.purchase_orders?.po_date,
          supplier_name: receipt.purchase_orders?.suppliers?.name,
          wo_number: receipt.purchase_orders?.work_orders?.wo_number,
          // Find price from PO items
          unit_price: receipt.purchase_orders?.items?.find((pi: any) => pi.goods_id === item.goods?.id)?.unit_price || 0,
          item_type: item.goods?.item_type || 'LAINNYA',
          goods_id: item.goods?.id || null
        }));
      });

      setData(flatItems);
    } catch (error: any) {
      console.error('Error fetching Receipt report:', error);
      toast.error('Gagal mengambil laporan: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter(item => 
    (item.receipt_number.toLowerCase().includes(search.toLowerCase()) ||
    item.po_number?.toLowerCase().includes(search.toLowerCase()) ||
    item.goods?.name.toLowerCase().includes(search.toLowerCase()) ||
    item.supplier_name?.toLowerCase().includes(search.toLowerCase())) &&
    (itemTypeFilter === 'ALL' || item.goods?.item_type === itemTypeFilter)
  );

  // Calculate Summary per Item Type
  const summaryByType = filteredData.reduce((acc: any, item) => {
    const type = item.goods?.item_type || 'LAINNYA';
    const value = item.quantity_received * item.unit_price;
    // Only accumulate positive values (though receipts should be positive)
    // But user asked "jika nilai < 0 maka data tidak tampil" in summary cards
    // We filter at rendering, but good to be safe here too.
    if (!acc[type]) acc[type] = 0;
    acc[type] += value;
    return acc;
  }, {});

  const totalValue = filteredData.reduce((sum, item) => sum + (item.quantity_received * item.unit_price), 0);

  const syncJournalForReceipts = async () => {
    if (!confirm('Sinkronisasi jurnal untuk penerimaan barang pada periode ini? Jurnal yang sudah ada akan dibuat ulang.')) return;
    setPosting(true);
    try {
      const apAcc = await fetchApAccount();
      if (!apAcc) {
        toast.error('Akun Hutang Usaha tidak ditemukan di COA.');
        return;
      }

      const persAcc = await fetchPersediaanAccount();

      const byReceipt = new Map<string, any[]>();
      (filteredData || []).forEach((row: any) => {
        const rid = String(row.receipt_id || '');
        if (!rid) return;
        const prev = byReceipt.get(rid) || [];
        byReceipt.set(rid, [...prev, row]);
      });

      const receiptIds = Array.from(byReceipt.keys());
      if (receiptIds.length === 0) {
        toast.info('Tidak ada data penerimaan pada periode ini.');
        return;
      }

      let rebuilt = 0;
      let skipped = 0;

      for (const receiptId of receiptIds) {
        const rows = byReceipt.get(receiptId) || [];
        const debitByAccountId: Record<string, number> = {};
        let total = 0;

        for (const r of rows) {
          const qty = Number(r.quantity_received || 0);
          const unit = Number(r.unit_price || 0);
          const amt = qty * unit;
          if (!amt) continue;

          const itemType = String(r.goods?.item_type || r.item_type || '').toUpperCase();
          const code = accountCodeByGoodsType(itemType);
          let acc: any = null;

          if (itemType === 'PERSEDIAAN') {
            acc = persAcc;
            if (!acc) {
              skipped++;
              continue;
            }
          } else if (itemType === 'ASET_AKTIVA_TETAP') {
            acc = await fetchAccountByName('aktiva tetap');
          } else if (code) {
            acc = (await fetchAccountByCodePrefix(code)) || null;
          }

          if (!acc) {
            const fallbackName =
              itemType === 'PERALATAN_WORKSHOP'
                ? 'peralatan workshop'
                : itemType === 'INVENTARIS_KANTOR'
                  ? 'inventaris kantor'
                  : itemType === 'FURNITURE'
                    ? 'furniture'
                    : itemType === 'PERLENGKAPAN'
                      ? 'perlengkapan'
                      : '';
            acc = fallbackName ? await fetchAccountByName(fallbackName) : null;
          }

          if (!acc) {
            skipped++;
            continue;
          }

          const aid = String(acc.id);
          debitByAccountId[aid] = (debitByAccountId[aid] || 0) + amt;
          total += amt;
        }

        const debitLines = Object.entries(debitByAccountId).filter(([, v]) => Number(v || 0) !== 0);
        if (debitLines.length === 0 || total <= 0) {
          skipped++;
          continue;
        }

        await supabase.from('journal_entries').delete().eq('reference', receiptId);

        const first = rows[0] || {};
        const receiptDate = String(first.receipt_date || new Date().toISOString().split('T')[0]);
        const receiptNo = String(first.receipt_number || '').trim();
        const poNo = first.po_number ? String(first.po_number).trim() : '';

        const { data: entry, error: entryErr } = await supabase
          .from('journal_entries')
          .insert([{
            entry_date: receiptDate,
            voucher_no: `GR-${receiptNo}`,
            description: `Penerimaan Barang ${receiptNo}${poNo ? ` (PO ${poNo})` : ''}`,
            entry_type: 'JOURNAL',
            total_amount: total,
            reference: receiptId,
          }])
          .select()
          .single();
        if (entryErr) throw entryErr;

        const itemsPayload: any[] = debitLines.map(([accountId, amt]) => ({
          journal_entry_id: entry.id,
          account_id: accountId,
          debit: amt,
          credit: 0,
          description: 'Penerimaan Barang',
        }));
        itemsPayload.push({
          journal_entry_id: entry.id,
          account_id: apAcc.id,
          debit: 0,
          credit: total,
          description: 'Hutang Usaha',
        });
        const { error: itemsErr } = await supabase.from('journal_entry_items').insert(itemsPayload);
        if (itemsErr) throw itemsErr;

        rebuilt++;
      }

      toast.success(`Sinkron jurnal selesai. Dibuat ulang: ${rebuilt}, dilewati: ${skipped}`);
    } catch (e: any) {
      toast.error('Gagal sinkron jurnal: ' + (e?.message || 'Unknown error'));
    } finally {
      setPosting(false);
    }
  };

  const handleSyncLegacyData = async () => {
    if (!confirm('Fitur ini akan membuat data "Penerimaan Barang" otomatis untuk PO yang statusnya SUDAH DITERIMA tapi belum muncul di laporan ini.\n\nStok barang TIDAK akan ditambah lagi (asumsi stok sudah masuk).\n\nLanjutkan?')) {
      return;
    }

    setSyncing(true);
    try {
      // 0. Define wide date range for refresh (Start from Jan 2025)
      const wideStart = '2025-01-01';
      const wideEnd = new Date().toISOString().split('T')[0];
      
      // Update UI state too so the user sees the range changed
      setDateRange({
        start: wideStart,
        end: wideEnd
      });

      // 1. Get all RECEIVED POs
      const { data: receivedPOs, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          id, po_number, po_date, created_at,
          items:purchase_order_items (
            goods_id, quantity
          )
        `)
        .in('status', ['RECEIVED_FULL', 'RECEIVED_PART']);

      if (poError) throw poError;

      // 2. Get all existing Receipts
      // const { data: existingReceipts, error: receiptError } = await supabase
      //   .from('goods_receipts')
      //   .select('po_id');

      // if (receiptError) throw receiptError;

      // const existingPOIds = new Set(existingReceipts?.map(r => r.po_id));

      // 3. Filter POs that don't have receipts OR have empty receipts (failed sync)
      // Check receipts with 0 items
      const { data: emptyReceipts } = await supabase
        .from('goods_receipts')
        .select('id, po_id, items:goods_receipt_items(id)');
      
      const emptyReceiptIds = new Set(
        emptyReceipts?.filter((r: any) => !r.items || r.items.length === 0).map((r: any) => r.id)
      );

      // Delete empty receipts first to allow re-sync
      if (emptyReceiptIds.size > 0) {
        await supabase.from('goods_receipts').delete().in('id', Array.from(emptyReceiptIds));
      }

      // Re-fetch existing receipts after cleanup
      const { data: cleanReceipts } = await supabase.from('goods_receipts').select('po_id');
      const cleanPOIds = new Set(cleanReceipts?.map(r => r.po_id));

      const missingPOs = receivedPOs?.filter(po => !cleanPOIds.has(po.id)) || [];

      if (missingPOs.length === 0) {
        toast.info("Semua data PO sudah tersinkronisasi.");
        setSyncing(false);
        return;
      }

      let successCount = 0;

      // 4. Create Receipt for each missing PO
      for (const po of missingPOs) {
        // Create Header
        const { data: newReceipt, error: createError } = await supabase
          .from('goods_receipts')
          .insert([{
            receipt_number: `GR-AUTO-${po.po_number}`, // Mark as auto-generated
            po_id: po.id,
            receipt_date: po.po_date || po.created_at.split('T')[0], // Use PO date
            received_by: 'System Sync',
            notes: 'Otomatis digenerate dari PO yang sudah diterima'
          }])
          .select()
          .single();

        if (createError) {
          console.error(`Failed to sync PO ${po.po_number}:`, createError);
          continue;
        }

        // Create Items
        if (po.items && po.items.length > 0) {
          const itemsPayload = po.items.map((item: any) => ({
            receipt_id: newReceipt.id,
            goods_id: item.goods_id,
            quantity_received: item.quantity, // Assume full receipt
            notes: 'Auto sync'
          }));

          const { error: itemsError } = await supabase
            .from('goods_receipt_items')
            .insert(itemsPayload);
          
          if (itemsError) console.error(`Failed to sync items for PO ${po.po_number}`);
        }
        
        successCount++;
      }

      toast.success(`Berhasil sinkronisasi ${successCount} data PO lama.`);
      
      // Force fetch with the wide range we just defined
      await fetchData('2025-01-01', new Date().toISOString().split('T')[0]); 

    } catch (error: any) {
      toast.error("Gagal sinkronisasi: " + error.message);
    } finally {
      setSyncing(false);
    }
  };

  const exportToExcel = () => {
    const exportData = filteredData.map(item => ({
      'No. Penerimaan': item.receipt_number,
      'Tanggal Terima': formatDate(item.receipt_date),
      'No. PO': item.po_number,
      'Tanggal PO': formatDate(item.po_date),
      'No. WO': item.wo_number || '-',
      'Supplier': item.supplier_name,
      'Tipe Barang': item.goods?.item_type,
      'Kode Barang': item.goods?.item_code,
      'Nama Barang': item.goods?.name,
      'Qty Diterima': item.quantity_received,
      'Satuan': item.goods?.unit,
      'Harga Satuan (PO)': item.unit_price,
      'Total Nilai': item.quantity_received * item.unit_price,
      'Penerima': '-', // item.received_by removed
      'Catatan': item.notes
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rincian Penerimaan");
    XLSX.writeFile(wb, `Laporan_Penerimaan_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Laporan Penerimaan Barang</h2>
        <div className="flex flex-wrap gap-2">
           <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm">
              <Calendar className="h-4 w-4 text-gray-500 ml-2" />
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
              <span className="text-gray-400 font-medium">-</span>
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
           </div>
           
           <div className="flex items-center gap-2">
             <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
                <SelectTrigger className="w-[180px] bg-white h-10">
                    <SelectValue placeholder="Pilih Tipe Barang" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">Semua Tipe</SelectItem>
                    <SelectItem value="PERSEDIAAN">Persediaan</SelectItem>
                    <SelectItem value="NON_PERSEDIAAN">Non Persediaan</SelectItem>
                    <SelectItem value="ASET_AKTIVA_TETAP">Aset Tetap</SelectItem>
                    <SelectItem value="PERALATAN_WORKSHOP">Peralatan Workshop</SelectItem>
                    <SelectItem value="INVENTARIS_KANTOR">Inventaris Kantor</SelectItem>
                    <SelectItem value="FURNITURE">Furniture</SelectItem>
                    <SelectItem value="PERLENGKAPAN">Perlengkapan</SelectItem>
                </SelectContent>
             </Select>
           </div>

          <Button variant="outline" onClick={syncJournalForReceipts} disabled={posting || loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${posting ? 'animate-spin' : ''}`} />
            {posting ? 'Sync Jurnal...' : 'Sync Jurnal'}
          </Button>
           <Button variant="secondary" onClick={handleSyncLegacyData} disabled={syncing}>
             <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> 
             {syncing ? 'Syncing...' : 'Sinkronisasi Data Lama'}
           </Button>
           <Button variant="outline" onClick={exportToExcel}><Download className="mr-2 h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-slate-50 border-slate-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Total Nilai Penerimaan</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-slate-900">{formatCurrency(totalValue)}</div></CardContent>
        </Card>
        
        {Object.entries(summaryByType).map(([type, value]: [string, any]) => {
            if (value <= 0) return null; // Logic: Hide if value <= 0
            return (
                <Card key={type} className="bg-white border-slate-200">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">{type.replace(/_/g, ' ')}</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold text-blue-600">{formatCurrency(value)}</div></CardContent>
                </Card>
            );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Rincian Barang Masuk</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari Barang / PO / No. Terima..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal Terima</TableHead>
                <TableHead>No. Terima</TableHead>
                <TableHead>No. PO</TableHead>
                <TableHead>No. WO</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Nama Barang</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-center">Qty Masuk</TableHead>
                <TableHead className="text-right">Harga (PO)</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredData.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{formatDate(item.receipt_date)}</TableCell>
                    <TableCell className="font-medium">{item.receipt_number}</TableCell>
                    <TableCell>{item.po_number}</TableCell>
                    <TableCell>{item.wo_number || '-'}</TableCell>
                    <TableCell>{item.supplier_name}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.goods?.name}</div>
                      <div className="text-xs text-gray-500">{item.goods?.item_code}</div>
                    </TableCell>
                    <TableCell>
                        <span className="text-[10px] bg-slate-100 px-2 py-1 rounded">
                            {item.goods?.item_type?.replace(/_/g, ' ') || '-'}
                        </span>
                    </TableCell>
                    <TableCell className="text-center font-bold text-green-600">
                      {item.quantity_received} <span className="text-xs text-gray-500 font-normal">{item.goods?.unit}</span>
                    </TableCell>
                    <TableCell className="text-right text-gray-600">{formatCurrency(item.unit_price)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.quantity_received * item.unit_price)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}