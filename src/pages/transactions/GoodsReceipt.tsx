import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, PackageCheck, CheckCircle2, Printer, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";

type PO = Database['public']['Tables']['purchase_orders']['Row'];
type POItem = Database['public']['Tables']['purchase_order_items']['Row'];
type Goods = Database['public']['Tables']['goods']['Row'];
type GoodsReceiptRow = Database['public']['Tables']['goods_receipts']['Row'];

type POItemWithDetails = POItem & {
  goods: Goods | null;
  job_types?: { job_name: string | null; job_group: string | null; hpp?: number | null } | null;
};

type POWithDetails = PO & {
  suppliers: { name: string } | null;
  items: POItemWithDetails[];
};

type GoodsReceiptWithDetails = GoodsReceiptRow & {
    purchase_orders: (PO & {
      suppliers: { name: string } | null;
      work_orders: {
        wo_number: string | null;
        vehicle_entries: {
          vehicles: { license_plate: string | null; brand_type: string | null } | null;
        } | null;
      } | null;
    }) | null;
    items: (Database['public']['Tables']['goods_receipt_items']['Row'] & { goods: Goods | null })[];
};

export default function GoodsReceipt() {
  const [pos, setPos] = useState<POWithDetails[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceiptWithDetails[]>([]); // History State
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedPO, setSelectedPO] = useState<POWithDetails | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Receipt State
  const [receiptData, setReceiptData] = useState({
    receipt_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Partial Receive State
  const [receivedHistory, setReceivedHistory] = useState<Record<string, number>>({});
  const [receivingItems, setReceivingItems] = useState<Record<string, number>>({});

  // Filter State
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of current month
    endDate: new Date().toISOString().split('T')[0] // Today
  });

  useEffect(() => {
    fetchOpenPOs();
  }, []);

  useEffect(() => {
    fetchReceiptHistory();
  }, [dateFilter, historySearch]);

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

  const fetchAccountByCode = async (accountCode: string) => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_code', accountCode)
      .eq('account_type', 'DETAIL')
      .limit(1)
      .maybeSingle();
    return data || null;
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

  const postJournalForReceipt = async (args: {
    receiptId: string;
    receiptNumber: string;
    receiptDate: string;
    poNumber?: string | null;
    receiptAmountByGoodsId: Record<string, number>;
    totalAmount: number;
  }) => {
    const {
      receiptId,
      receiptNumber,
      receiptDate,
      poNumber,
      receiptAmountByGoodsId,
      totalAmount,
    } = args;

    const goodsIds = Object.keys(receiptAmountByGoodsId).filter(Boolean);
    if (goodsIds.length === 0 || totalAmount <= 0) return;

    const { data: goodsRows, error: goodsErr } = await supabase
      .from('goods')
      .select('id, item_type')
      .in('id', goodsIds);
    if (goodsErr) throw goodsErr;

    const goodsTypeById = new Map<string, string>();
    (goodsRows || []).forEach((g: any) => {
      goodsTypeById.set(String(g.id), String(g.item_type || ''));
    });

    const apAcc = await fetchApAccount();
    if (!apAcc) {
      toast.error('Jurnal GR tidak dibuat: Akun Hutang Usaha tidak ditemukan di COA.');
      return;
    }

    const anyPersediaan = goodsIds.some((gid) => String(goodsTypeById.get(gid) || '').toUpperCase() === 'PERSEDIAAN');
    const persAcc = anyPersediaan ? await fetchPersediaanAccount() : null;
    if (anyPersediaan && !persAcc) {
      toast.error('Jurnal GR tidak lengkap: Akun Persediaan tidak ditemukan di COA.');
    }

    const debitByAccountId: Record<string, number> = {};
    for (const [gid, amount] of Object.entries(receiptAmountByGoodsId)) {
      const amt = Number(amount || 0);
      if (!amt) continue;
      const gType = String(goodsTypeById.get(gid) || '').toUpperCase();
      const code = accountCodeByGoodsType(gType);
      let acc: any = null;

      if (gType === 'PERSEDIAAN') {
        acc = persAcc;
        if (!acc) continue;
      } else if (code) {
        acc = await fetchAccountByCode(code);
        if (!acc) {
          const label =
            gType === 'PERALATAN_WORKSHOP'
              ? 'peralatan workshop'
              : gType === 'INVENTARIS_KANTOR'
                ? 'inventaris kantor'
                : gType === 'FURNITURE'
                  ? 'furniture'
                  : gType === 'PERLENGKAPAN'
                    ? 'perlengkapan'
                    : '';
          acc = label ? await fetchAccountByName(label) : null;
        }
      } else {
        continue;
      }

      if (!acc) continue;
      debitByAccountId[String(acc.id)] = (debitByAccountId[String(acc.id)] || 0) + amt;
    }

    const debitLines = Object.entries(debitByAccountId).filter(([, v]) => Number(v || 0) !== 0);
    if (debitLines.length === 0) return;

    await supabase.from('journal_entries').delete().eq('reference', receiptId);

    const { data: entry, error: entryErr } = await supabase
      .from('journal_entries')
      .insert([{
        entry_date: receiptDate,
        voucher_no: `GR-${receiptNumber}`,
        description: `Penerimaan Barang ${receiptNumber}${poNumber ? ` (PO ${poNumber})` : ''}`,
        entry_type: 'JOURNAL',
        total_amount: totalAmount,
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
      credit: totalAmount,
      description: 'Hutang Usaha',
    });

    const { error: itemsErr2 } = await supabase.from('journal_entry_items').insert(itemsPayload);
    if (itemsErr2) throw itemsErr2;
  };

  const fetchServiceExpenseAccount = async () => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .eq('category', 'HPP')
      .or('account_name.ilike.%jasa%,account_name.ilike.%service%')
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) return data;

    const { data: data2 } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .or('account_name.ilike.%beban jasa%,account_name.ilike.%jasa%,account_name.ilike.%service%')
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data2) return data2;

    const { data: data3 } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .eq('category', 'HPP')
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data3 || null;
  };

  const syncJournalFromHistory = async () => {
    if (!confirm('Sinkronisasi jurnal untuk semua penerimaan di periode ini? Ini hanya akan membuat jurnal yang belum ada.')) return;
    setLoading(true);
    try {
      const targets = filteredReceipts;
      if (!targets || targets.length === 0) {
        toast.info('Tidak ada data penerimaan pada periode ini.');
        return;
      }

      const receiptIds = targets.map((r: any) => r.id).filter(Boolean);
      const { data: existing } = await supabase
        .from('journal_entries')
        .select('reference')
        .in('reference', receiptIds);
      const existingRef = new Set((existing || []).map((x: any) => String(x.reference || '')));

      const poIds = Array.from(new Set(targets.map((r: any) => String(r.po_id || '')).filter(Boolean)));
      const amountByReceiptId = new Map<string, { receiptAmountByGoodsId: Record<string, number>; total: number }>();

      for (const poId of poIds) {
        const { data: poItems } = await supabase
          .from('purchase_order_items')
          .select('goods_id, quantity, unit_price, created_at')
          .eq('po_id', poId)
          .order('created_at', { ascending: true });

        const poItemsByGoods: Record<string, any[]> = {};
        (poItems || []).forEach((it: any) => {
          if (!it.goods_id) return;
          const gid = String(it.goods_id);
          if (!poItemsByGoods[gid]) poItemsByGoods[gid] = [];
          poItemsByGoods[gid].push(it);
        });

        const { data: poReceipts } = await supabase
          .from('goods_receipts')
          .select(`
            id,
            receipt_date,
            created_at,
            items:goods_receipt_items (goods_id, quantity_received)
          `)
          .eq('po_id', poId)
          .order('receipt_date', { ascending: true })
          .order('created_at', { ascending: true });

        const historyByGoods: Record<string, number> = {};

        (poReceipts || []).forEach((r: any) => {
          const receiptAmountByGoodsId: Record<string, number> = {};
          let total = 0;
          const items = Array.isArray(r.items) ? r.items : [];
          items.forEach((it: any) => {
            const gid = String(it.goods_id || '');
            const qty = Number(it.quantity_received || 0);
            if (!gid || qty <= 0) return;

            let remainingToPrice = qty;
            let currentHistory = Number(historyByGoods[gid] || 0);
            const lines = poItemsByGoods[gid] || [];

            for (const line of lines) {
              if (remainingToPrice <= 0) break;
              const lineQty = Number(line.quantity || 0);
              const linePrice = Number(line.unit_price || 0);
              const usedByHistory = Math.min(lineQty, currentHistory);
              currentHistory -= usedByHistory;
              const availableInLine = lineQty - usedByHistory;
              if (availableInLine > 0) {
                const take = Math.min(remainingToPrice, availableInLine);
                const amt = take * linePrice;
                total += amt;
                receiptAmountByGoodsId[gid] = (receiptAmountByGoodsId[gid] || 0) + amt;
                remainingToPrice -= take;
              }
            }

            historyByGoods[gid] = (historyByGoods[gid] || 0) + qty;
          });

          amountByReceiptId.set(String(r.id), { receiptAmountByGoodsId, total });
        });
      }

      let created = 0;
      let skipped = 0;

      for (const r of targets) {
        const rid = String((r as any).id || '');
        if (!rid) continue;
        if (existingRef.has(rid)) {
          skipped++;
          continue;
        }
        const calc = amountByReceiptId.get(rid);
        if (!calc || calc.total <= 0) {
          skipped++;
          continue;
        }
        await postJournalForReceipt({
          receiptId: rid,
          receiptNumber: String((r as any).receipt_number || ''),
          receiptDate: String((r as any).receipt_date || ''),
          poNumber: (r as any).purchase_orders?.po_number || null,
          receiptAmountByGoodsId: calc.receiptAmountByGoodsId,
          totalAmount: calc.total,
        });
        created++;
      }

      toast.success(`Sinkron jurnal selesai. Dibuat: ${created}, dilewati: ${skipped}`);
    } catch (e: any) {
      toast.error('Gagal sinkron jurnal: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  async function fetchOpenPOs() {
    setLoading(true);
    try {
      // Fetch POs that are ISSUED or RECEIVED_PART
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (name),
          purchase_returns (id),
          items:purchase_order_items (
            *,
            goods (name, unit, item_code),
            job_types (job_name, job_group, hpp)
          )
        `)
        .in('status', ['ISSUED', 'RECEIVED_PART'])
        .neq('status', 'RETURNED_FULL')
        .neq('status', 'CANCELLED')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPos(data as any || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data PO: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleCancelReceipt = async (receipt: GoodsReceiptWithDetails) => {
    console.log('--- MEMULAI PROSES PEMBATALAN (VERSI 2.0) ---');
    console.log('Receipt yang akan dibatalkan:', receipt);
    if (!receipt || !receipt.po_id) {
        toast.error('Pembatalan gagal: Informasi PO tidak lengkap pada data penerimaan.');
        console.log('--- PROSES GAGAL: Receipt is null/undefined atau po_id tidak ada ---');
        return;
    }

    const allItemsAreJasa = receipt.items.every(item => item.goods?.item_type?.toUpperCase() === 'JASA' || item.goods?.item_type?.toUpperCase() === 'SERVICE');
    if (!allItemsAreJasa) {
      toast.error('Pembatalan gagal.', { description: 'Fitur ini hanya untuk penerimaan yang seluruhnya berisi JASA.' });
      return;
    }

    const { data: invoices, error: invoiceError } = await supabase
      .from('purchase_invoices')
      .select('id, status, paid_amount')
      .eq('goods_receipt_id', receipt.id);

    if (invoiceError) {
      toast.error('Gagal memeriksa invoice: ' + invoiceError.message);
      return;
    }

    if (invoices && invoices.length > 0) {
      const paidInvoice = invoices.find(inv => (inv.paid_amount || 0) > 0);
      if (paidInvoice) {
        toast.error('Pembatalan gagal.', { description: `Penerimaan ini sudah ditagih (Invoice) dan sudah ada pembayaran.` });
        return;
      }
      toast.error('Pembatalan gagal.', { description: 'Penerimaan ini sudah dibuatkan invoice. Hapus invoice terlebih dahulu.' });
      return;
    }

    const isConfirmed = await new Promise((resolve) => {
        toast(
            "Konfirmasi Pembatalan",
            {
                description: `Anda yakin ingin membatalkan penerimaan ${receipt.receipt_number}? Ini akan membuat catatan retur dan mengembalikan status PO ke 'ISSUED'.`,
                action: {
                    label: "Ya, Batalkan & Retur",
                    onClick: () => resolve(true),
                },
                onDismiss: () => resolve(false),
                onAutoClose: () => resolve(false),
            }
        );
    });

    if (!isConfirmed) {
        toast.info('Pembatalan dibatalkan oleh pengguna.');
        return;
    }

    setLoading(true);
    console.log('Memulai transaksi pembatalan & retur...');
    try {
        // 1. Create a purchase_returns header
        console.log('Membuat header purchase_returns untuk PO ID:', receipt.po_id);
        const totalReturnValue = receipt.items.reduce((sum, item) => {
            const price = item.unit_price || 0;
            const qty = item.quantity_received || 0;
            return sum + (price * qty);
        }, 0);

        const { data: returnHeader, error: returnHeaderError } = await supabase
            .from('purchase_returns')
            .insert({
                po_id: receipt.po_id,
                return_date: new Date().toISOString().split('T')[0],
                return_number: `RT-CANCEL-${receipt.receipt_number}`,
                settlement_type: 'NONE', // For Jasa cancellation, no monetary settlement
                notes: `Pembatalan otomatis untuk penerimaan jasa ${receipt.receipt_number}`,
                settlement_amount: totalReturnValue,
            })
            .select()
            .single();

        if (returnHeaderError) throw new Error(`Gagal membuat header retur: ${returnHeaderError.message}`);
        console.log('Header retur berhasil dibuat:', returnHeader);

        // 2. Create purchase_return_items
        const returnItemsPayload = receipt.items.map(item => ({
            return_id: returnHeader.id,
            goods_id: item.goods_id,
            quantity_returned: item.quantity_received,
            unit_price: item.unit_price,
            total_price: (item.unit_price || 0) * (item.quantity_received || 0),
        }));

        console.log('Membuat item retur:', returnItemsPayload);
        const { error: returnItemsError } = await supabase
            .from('purchase_return_items')
            .insert(returnItemsPayload);

        if (returnItemsError) throw new Error(`Gagal membuat item retur: ${returnItemsError.message}`);
        console.log('Item retur berhasil dibuat.');

        // 3. Delete the original receipt items and header
        console.log('Menghapus item dari goods_receipt_items dengan receipt_id:', receipt.id);
        const { error: itemDeleteError } = await supabase.from('goods_receipt_items').delete().eq('receipt_id', receipt.id);
        if (itemDeleteError) throw new Error(`Gagal menghapus item penerimaan lama: ${itemDeleteError.message}`);

        console.log('Menghapus header goods_receipts dengan ID:', receipt.id);
        const { error: headerDeleteError } = await supabase.from('goods_receipts').delete().eq('id', receipt.id);
        if (headerDeleteError) throw new Error(`Gagal menghapus header penerimaan lama: ${headerDeleteError.message}`);
        console.log('Penerimaan lama berhasil dihapus.');

        // 4. Update PO status to ISSUED
        console.log('Memperbarui status PO menjadi ISSUED untuk PO ID:', receipt.po_id);
        const { error: poUpdateError } = await supabase
            .from('purchase_orders')
            .update({ status: 'ISSUED' })
            .eq('id', receipt.po_id);

        if (poUpdateError) throw new Error(`Gagal memperbarui status PO: ${poUpdateError.message}`);
        console.log('Status PO berhasil diperbarui.');

        // 5. Refresh data
        toast.success('Penerimaan berhasil dibatalkan.', {
            description: 'Catatan retur dibuat dan status PO telah dikembalikan ke "ISSUED".'
        });
        console.log('--- PROSES PEMBATALAN & RETUR SUKSES ---');
        fetchReceiptHistory();
        fetchOpenPOs();

    } catch (error: any) {
        toast.error('Pembatalan Gagal', { description: error.message });
        console.error('--- PROSES PEMBATALAN & RETUR GAGAL TOTAL ---', error);
    } finally {
        setLoading(false);
    }
  };
      fetchOpenPOs(); // Refresh the open POs list

    } catch (error: any) {
      console.error('Terjadi kesalahan fatal saat pembatalan:', error);
      toast.error('Terjadi kesalahan saat pembatalan: ' + error.message);
      console.log('--- PROSES PEMBATALAN GAGAL TOTAL ---');
    } finally {
      setLoading(false);
    }
  };

  async function fetchReceiptHistory() {
    setLoading(true);
    try {
      let query = supabase
        .from('goods_receipts')
        .select(`
          id,
          receipt_number,
          receipt_date,
          notes,
          created_at,
          po_id,
          purchase_orders (
            po_number,
            suppliers (name),
            work_orders (
              wo_number,
              vehicle_entries (
                vehicles ( license_plate, brand_type )
              )
            )
          ),
          items:goods_receipt_items (
            *,
            goods (
              id,
              name,
              item_type
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (dateFilter.startDate) {
        query = query.gte('receipt_date', dateFilter.startDate);
      }
      if (dateFilter.endDate) {
        query = query.lte('receipt_date', dateFilter.endDate);
      }

      // Add search filter logic
      if (historySearch) {
        query = query.ilike('receipt_number', `%${historySearch}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setReceipts(data as any || []);
    } catch (error: any) {
      toast.error('Gagal mengambil riwayat penerimaan: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectPO = async (po: POWithDetails) => {
    setSelectedPO(po);
    setReceiptData({
      receipt_date: new Date().toISOString().split('T')[0],
      notes: '',
    });

    try {
      const { data: freshItems } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          goods (name, unit, item_code),
          job_types (job_name, job_group, hpp)
        `)
        .eq('po_id', po.id);
      if (freshItems) {
        setSelectedPO((prev) => (prev && prev.id === po.id ? ({ ...prev, items: freshItems as any } as any) : prev));
      }
    } catch {
    }
    
    // Fetch previously received quantities for this PO
    const { data: existingReceipts } = await supabase
      .from('goods_receipts')
      .select('id, items:goods_receipt_items(goods_id, quantity_received)')
      .eq('po_id', po.id);

    const history: Record<string, number> = {};
    if (existingReceipts) {
      existingReceipts.forEach((r: any) => {
        r.items.forEach((i: any) => {
          if (i.goods_id) {
            history[i.goods_id] = (history[i.goods_id] || 0) + i.quantity_received;
          }
        });
      });
    }
    setReceivedHistory(history);

    // Initialize receiving items with remaining quantity
    const initialReceiving: Record<string, number> = {};
    po.items.forEach(item => {
      if (item.goods_id) {
        // Calculate total ordered for this goods_id (handle duplicate items in PO if any)
        const totalOrdered = po.items
          .filter(i => i.goods_id === item.goods_id)
          .reduce((sum, i) => sum + i.quantity, 0);
        
        const alreadyReceived = history[item.goods_id] || 0;
        const remaining = Math.max(0, totalOrdered - alreadyReceived);
        
        // Distribute remaining among items (simple approach: first item gets all remaining, others 0)
        // Better approach: Since we iterate, check if we already processed this goods_id
        if (initialReceiving[item.goods_id] === undefined) {
             initialReceiving[item.goods_id] = remaining;
        }
      }
    });
    setReceivingItems(initialReceiving);
    
    setIsDialogOpen(true);
  };

  const handleReceive = async () => {
    if (!selectedPO) return;
    setLoading(true);

    try {
      // 1. Validate & Prepare Items
      const itemsToReceive: { goods_id: string; quantity: number }[] = [];
      let totalReceiptAmount = 0;
      const receiptAmountByGoodsId: Record<string, number> = {};

      // Group PO items by goods_id to handle pricing (FIFO strategy)
      const poItemsByGoods: Record<string, typeof selectedPO.items> = {};
      selectedPO.items.forEach(item => {
        if (item.goods_id) {
            if (!poItemsByGoods[item.goods_id]) poItemsByGoods[item.goods_id] = [];
            poItemsByGoods[item.goods_id].push(item);
        }
      });

      // Check what needs to be received
      for (const [goodsId, qty] of Object.entries(receivingItems)) {
        if (qty > 0) {
            itemsToReceive.push({ goods_id: goodsId, quantity: qty });

            // Calculate Price for Invoice (FIFO from PO lines)
            let remainingToPrice = qty;
            let currentHistory = receivedHistory[goodsId] || 0;
            
            // Sort PO items (e.g. by created_at or just array order)
            const lines = poItemsByGoods[goodsId] || [];
            
            for (const line of lines) {
                if (remainingToPrice <= 0) break;
                
                const lineQty = line.quantity;
                const linePrice = line.unit_price || 0;
                
                // How much of this line is already used by history?
                const usedByHistory = Math.min(lineQty, currentHistory);
                currentHistory -= usedByHistory; // Consume history
                
                const availableInLine = lineQty - usedByHistory;
                
                if (availableInLine > 0) {
                    const take = Math.min(remainingToPrice, availableInLine);
                    totalReceiptAmount += take * linePrice;
                    receiptAmountByGoodsId[goodsId] = (receiptAmountByGoodsId[goodsId] || 0) + (take * linePrice);
                    remainingToPrice -= take;
                }
            }
        }
      }

      if (itemsToReceive.length === 0) {
        const hasGoodsLines = (selectedPO.items || []).some((it: any) => Boolean(it.goods_id));
        if (hasGoodsLines) {
          toast.error('Tidak ada barang yang diterima (Qty 0).');
          setLoading(false);
          return;
        }

        const closeAmount = Number((selectedPO as any).total_amount || 0);
        if (!(closeAmount > 0)) {
          toast.error('Tidak ada barang yang diterima (Qty 0).');
          setLoading(false);
          return;
        }

        const { data: newReceipt, error: receiptError } = await supabase
          .from('goods_receipts')
          .insert([{
            receipt_number: `GR-${Date.now()}`,
            po_id: selectedPO.id,
            receipt_date: receiptData.receipt_date,
            notes: receiptData.notes,
            received_by: 'Admin'
          }])
          .select()
          .single();
        if (receiptError) throw receiptError;

        await supabase
          .from('purchase_orders')
          .update({ status: 'RECEIVED_FULL' as any })
          .eq('id', selectedPO.id);

        {
          const { error: invoiceError } = await supabase
            .from('purchase_invoices')
            .insert([{
              invoice_number: `INV-${Date.now()}`,
              po_id: selectedPO.id,
              supplier_id: selectedPO.supplier_id,
              invoice_date: receiptData.receipt_date,
              due_date: new Date(new Date(receiptData.receipt_date).setDate(new Date(receiptData.receipt_date).getDate() + 30)).toISOString().split('T')[0],
              total_amount: closeAmount,
              status: 'UNPAID'
            }]);

          if (invoiceError) {
            console.error('Failed to create invoice:', invoiceError);
            toast.error('Close PO sukses TAPI gagal membuat Tagihan otomatis: ' + invoiceError.message);
          }
        }

        try {
          const apAcc = await fetchApAccount();
          const svcAcc = await fetchServiceExpenseAccount();
          if (!apAcc) {
            toast.error('Jurnal close PO tidak dibuat: Akun Hutang Usaha tidak ditemukan di COA.');
          } else if (!svcAcc) {
            toast.error('Jurnal close PO tidak dibuat: Akun Beban/HPP Jasa tidak ditemukan di COA.');
          } else {
            await supabase.from('journal_entries').delete().eq('reference', newReceipt.id);
            const { data: entry, error: entryErr } = await supabase
              .from('journal_entries')
              .insert([{
                entry_date: receiptData.receipt_date,
                voucher_no: String((newReceipt as any).receipt_number || ''),
                description: `Penerimaan Jasa ${String((newReceipt as any).receipt_number || '')}${selectedPO.po_number ? ` (PO ${selectedPO.po_number})` : ''}`,
                entry_type: 'JOURNAL',
                total_amount: closeAmount,
                reference: newReceipt.id,
              }])
              .select()
              .single();
            if (entryErr) throw entryErr;

            const itemsPayload: any[] = [
              {
                journal_entry_id: entry.id,
                account_id: svcAcc.id,
                debit: closeAmount,
                credit: 0,
                description: 'Penerimaan Jasa',
              },
              {
                journal_entry_id: entry.id,
                account_id: apAcc.id,
                debit: 0,
                credit: closeAmount,
                description: 'Hutang Usaha',
              },
            ];
            const { error: itemsErr } = await supabase.from('journal_entry_items').insert(itemsPayload);
            if (itemsErr) throw itemsErr;
          }
        } catch (e: any) {
          console.error('Gagal membuat jurnal close PO:', e);
          toast.error('Close PO sukses, tapi gagal membuat jurnal: ' + (e?.message || 'Unknown error'));
        }

        toast.success('PO jasa berhasil di-close dan hutang dicatat.');
        setIsDialogOpen(false);
        fetchOpenPOs();
        fetchReceiptHistory();
        return;
      }

      // 2. Create Goods Receipt Header
      const { data: newReceipt, error: receiptError } = await supabase
        .from('goods_receipts')
        .insert([{
          receipt_number: `GR-${Date.now()}`,
          po_id: selectedPO.id,
          receipt_date: receiptData.receipt_date,
          notes: receiptData.notes,
          received_by: 'Admin'
        }])
        .select()
        .single();
      
      if (receiptError) throw receiptError;

      // 3. Insert Goods Receipt Items & Update Stock
      const receiptItemsPayload = itemsToReceive.map(item => ({
        receipt_id: newReceipt.id,
        goods_id: item.goods_id,
        quantity_received: item.quantity,
        notes: ''
      }));

      const { error: itemsError } = await supabase
        .from('goods_receipt_items')
        .insert(receiptItemsPayload);

      if (itemsError) throw itemsError;

      // Update Stock
      for (const item of itemsToReceive) {
           const { data: currentGood } = await supabase
             .from('goods')
             .select('current_stock')
             .eq('id', item.goods_id)
             .single();
            
           if (currentGood) {
             await supabase
               .from('goods')
               .update({ current_stock: (currentGood.current_stock || 0) + item.quantity })
               .eq('id', item.goods_id);
           }
      }

      // 4. Update PO Status
      // Check if ALL items are fully received
      let isFull = true;
      const allGoodsIds = new Set(selectedPO.items.map(i => i.goods_id).filter(id => id !== null) as string[]);
      
      for (const goodsId of allGoodsIds) {
          const totalOrdered = selectedPO.items
            .filter(i => i.goods_id === goodsId)
            .reduce((sum, i) => sum + i.quantity, 0);
          
          const history = receivedHistory[goodsId] || 0;
          const current = receivingItems[goodsId] || 0;
          
          if ((history + current) < totalOrdered) {
              isFull = false;
              break;
          }
      }

      const newStatus = isFull ? 'RECEIVED_FULL' : 'RECEIVED_PART';

      await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', selectedPO.id);

      // 5. Auto-Create Purchase Invoice (Hutang Dagang)
      // Only for the amount received in THIS receipt
      if (totalReceiptAmount > 0) {
          const { error: invoiceError } = await supabase
            .from('purchase_invoices')
            .insert([{
              invoice_number: `INV-${Date.now()}`,
              po_id: selectedPO.id,
              supplier_id: selectedPO.supplier_id,
              invoice_date: receiptData.receipt_date,
              due_date: new Date(new Date(receiptData.receipt_date).setDate(new Date(receiptData.receipt_date).getDate() + 30)).toISOString().split('T')[0],
              total_amount: totalReceiptAmount,
              status: 'UNPAID'
            }]);

          if (invoiceError) {
            console.error("Failed to create invoice:", invoiceError);
            toast.error("Penerimaan sukses TAPI Gagal membuat Tagihan otomatis: " + invoiceError.message);
          } else {
            toast.success(`Penerimaan Partial berhasil! Status PO: ${newStatus}`);
          }
      } else {
          toast.success(`Penerimaan Partial berhasil! Status PO: ${newStatus}`);
      }

      if (totalReceiptAmount > 0) {
        try {
          await postJournalForReceipt({
            receiptId: newReceipt.id,
            receiptNumber: String(newReceipt.receipt_number || ''),
            receiptDate: receiptData.receipt_date,
            poNumber: selectedPO.po_number,
            receiptAmountByGoodsId,
            totalAmount: totalReceiptAmount,
          });
        } catch (e: any) {
          console.error('Gagal membuat jurnal GR:', e);
          toast.error('Penerimaan sukses, tapi gagal membuat jurnal: ' + (e?.message || 'Unknown error'));
        }
      }

      setIsDialogOpen(false);
      fetchOpenPOs();
      fetchReceiptHistory();
    } catch (error: any) {
      toast.error('Gagal memproses penerimaan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredPOs = pos.filter(p => 
    p.status !== 'RETURNED_FULL' &&
    p.status !== 'CANCELLED' &&
    !(Array.isArray((p as any).purchase_returns) && (p as any).purchase_returns.length > 0) &&
    (
      p.po_number.toLowerCase().includes(search.toLowerCase()) ||
      p.suppliers?.name.toLowerCase().includes(search.toLowerCase())
    )
  );

  const filteredReceipts = receipts.filter(r => 
    r.receipt_number.toLowerCase().includes(historySearch.toLowerCase()) ||
    r.purchase_orders?.po_number.toLowerCase().includes(historySearch.toLowerCase()) ||
    r.purchase_orders?.suppliers?.name.toLowerCase().includes(historySearch.toLowerCase()) ||
    (r.purchase_orders?.work_orders?.wo_number || '').toLowerCase().includes(historySearch.toLowerCase()) ||
    (r.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '').toLowerCase().includes(historySearch.toLowerCase()) ||
    (r.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '').toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Penerimaan Barang</h2>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between">
            <CardTitle>Daftar PO (Menunggu Penerimaan)</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari No. PO / Supplier..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. PO</TableHead>
                  <TableHead>Tanggal PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Tipe Pengadaan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Item</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPOs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center h-24">Tidak ada PO yang perlu diterima.</TableCell></TableRow>
                ) : (
                  filteredPOs.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.po_number}</TableCell>
                      <TableCell>{formatDate(item.created_at)}</TableCell>
                      <TableCell>{item.suppliers?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={item.work_order_id ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-700 border-slate-200'}>
                          {item.work_order_id ? 'Project' : 'Stock'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'ISSUED' ? 'default' : 'secondary'}>
                          {item.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.items?.length || 0} Item</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleSelectPO(item)}>
                          <PackageCheck className="h-4 w-4 mr-1" /> Proses Terima
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* History Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center mb-4">
             <CardTitle>Riwayat Penerimaan (History)</CardTitle>
             <div className="flex gap-2 items-center">
                <Button variant="outline" size="sm" onClick={syncJournalFromHistory} disabled={loading}>
                  Sync Jurnal
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Periode:</span>
                  <Input 
                    type="date" 
                    className="w-36 h-8 text-xs"
                    value={dateFilter.startDate} 
                    onChange={(e) => setDateFilter({...dateFilter, startDate: e.target.value})} 
                  />
                  <span className="text-sm text-gray-500">s/d</span>
                  <Input 
                    type="date" 
                    className="w-36 h-8 text-xs"
                    value={dateFilter.endDate} 
                    onChange={(e) => setDateFilter({...dateFilter, endDate: e.target.value})} 
                  />
                </div>
                <div className="relative w-64 ml-4">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cari No. Receipt / PO..." className="pl-8 h-9" value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
                </div>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Receipt</TableHead>
                  <TableHead>Tanggal Terima</TableHead>
                  <TableHead>No. PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>No. WO</TableHead>
                  <TableHead>Kendaraan</TableHead>
                  <TableHead>Item Diterima</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceipts.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center h-24">Tidak ada riwayat penerimaan pada periode ini.</TableCell></TableRow>
                ) : (
                  filteredReceipts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.receipt_number}</TableCell>
                      <TableCell>{formatDate(item.receipt_date)}</TableCell>
                      <TableCell>{item.purchase_orders?.po_number}</TableCell>
                      <TableCell>{item.purchase_orders?.suppliers?.name}</TableCell>
                      <TableCell>{item.purchase_orders?.work_orders?.wo_number || '-'}</TableCell>
                      <TableCell>
                        <div className="font-medium">{item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'}</div>
                        <div className="text-xs text-gray-500">{item.purchase_orders?.work_orders?.vehicle_entries?.vehicles?.brand_type || '-'}</div>
                      </TableCell>
                      <TableCell>{item.items.length} Item</TableCell>
                      <TableCell>{item.notes || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex space-x-2 justify-end">
                          <Button variant="outline" size="icon" onClick={() => toast.info('Print belum tersedia')}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => toast.info('Lihat detail belum tersedia')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleCancelReceipt(item)}>
                            Batalkan
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Penerimaan */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Proses Penerimaan Barang</DialogTitle>
            <DialogDescription>
              Konfirmasi penerimaan barang untuk PO: <b>{selectedPO?.po_number}</b>
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tanggal Terima</Label>
                  <Input type="date" value={receiptData.receipt_date} onChange={(e) => setReceiptData({...receiptData, receipt_date: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Catatan</Label>
                  <Input value={receiptData.notes} onChange={(e) => setReceiptData({...receiptData, notes: e.target.value})} placeholder="No. Surat Jalan dll..." />
                </div>
             </div>

             <div className="border rounded-md p-4 bg-slate-50 max-h-[300px] overflow-y-auto">
                {(() => {
                  const items = (selectedPO?.items || []) as any[];
                  const goodsIds = Array.from(new Set(items.map((i) => i.goods_id))).filter(Boolean);
                  const jasaLines = items.filter((i) => {
                    const lt = String(i?.line_type || '').toUpperCase();
                    return lt === 'JASA' || (!i?.goods_id && (i?.service_name || i?.job_type_id));
                  });

                  if (goodsIds.length === 0 && jasaLines.length > 0) {
                    return (
                      <>
                        <Label className="mb-2 block font-semibold">Rincian Jasa (Close PO)</Label>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nama Jasa</TableHead>
                              <TableHead className="w-24 text-center">Qty</TableHead>
                              <TableHead className="w-40 text-right">Harga</TableHead>
                              <TableHead className="w-44 text-right">Subtotal</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {jasaLines.map((it, idx) => {
                              const name =
                                String(it?.service_name || '').trim() ||
                                String(it?.job_types?.job_name || '').trim() ||
                                'Jasa';
                              const qty = Number(it?.quantity || 0);
                              const unit = Number(it?.unit_price || 0);
                              const sub = qty * unit;
                              return (
                                <TableRow key={String(it?.id || idx)}>
                                  <TableCell>
                                    <div className="font-medium">{name}</div>
                                    <div className="text-xs text-muted-foreground">{String(it?.job_types?.job_group || '')}</div>
                                  </TableCell>
                                  <TableCell className="text-center">{qty}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(unit)}</TableCell>
                                  <TableCell className="text-right font-bold">{formatCurrency(sub)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </>
                    );
                  }

                  return (
                    <>
                      <Label className="mb-2 block font-semibold">Rincian Barang (Partial Receiving)</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Barang</TableHead>
                      <TableHead>Total PO</TableHead>
                      <TableHead>Sudah Diterima</TableHead>
                      <TableHead>Sisa</TableHead>
                      <TableHead className="w-32">Terima Sekarang</TableHead>
                      <TableHead>Satuan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO && goodsIds.map((goodsId: any) => {
                       if (!goodsId) return null;
                       const item = selectedPO.items.find(i => i.goods_id === goodsId);
                       if (!item) return null;

                       const totalOrdered = selectedPO.items
                         .filter(i => i.goods_id === goodsId)
                         .reduce((sum, i) => sum + i.quantity, 0);
                       
                       const alreadyReceived = receivedHistory[goodsId] || 0;
                       const remaining = Math.max(0, totalOrdered - alreadyReceived);
                       const receivingNow = receivingItems[goodsId] ?? 0;

                       return (
                         <TableRow key={goodsId}>
                           <TableCell>
                             <div className="font-medium">{item.goods?.name}</div>
                             <div className="text-xs text-muted-foreground">{item.goods?.item_code}</div>
                           </TableCell>
                           <TableCell>{totalOrdered}</TableCell>
                           <TableCell>{alreadyReceived}</TableCell>
                           <TableCell>{remaining}</TableCell>
                           <TableCell>
                             <Input 
                               type="text"
                               className="h-8 w-24 text-center"
                               value={receivingNow === 0 ? '' : receivingNow} 
                               placeholder="0"
                               onChange={(e) => {
                                 const valStr = e.target.value;
                                 if (valStr === '' || /^\d+$/.test(valStr)) {
                                     const val = valStr === '' ? 0 : parseInt(valStr);
                                     // Prevent user from entering more than remaining
                                     if (val <= remaining) {
                                         setReceivingItems(prev => ({...prev, [goodsId]: val}));
                                     }
                                 }
                               }}
                             />
                           </TableCell>
                           <TableCell>{item.goods?.unit}</TableCell>
                         </TableRow>
                       );
                    })}
                  </TableBody>
                </Table>
                    </>
                  );
                })()}
             </div>
             
             <div className="flex items-center space-x-2 text-sm text-blue-700 bg-blue-50 p-3 rounded-md">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {(() => {
                    const items = (selectedPO?.items || []) as any[];
                    const hasGoods = items.some((i) => Boolean(i?.goods_id));
                    return hasGoods
                      ? 'Pastikan jumlah yang diterima sesuai dengan fisik barang. Status PO akan otomatis menjadi "RECEIVED PART" atau "RECEIVED FULL".'
                      : 'PO berisi JASA (tanpa stok). Proses ini akan menutup PO dan mencatat hutang serta jurnal HPP Jasa.';
                  })()}
                </span>
             </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button onClick={handleReceive} disabled={loading}>
              {(() => {
                if (loading) return 'Memproses...';
                const items = (selectedPO?.items || []) as any[];
                const hasGoods = items.some((i) => Boolean(i?.goods_id));
                return hasGoods ? 'Konfirmasi Terima Barang' : 'Close PO Jasa';
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}