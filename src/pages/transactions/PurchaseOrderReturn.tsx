import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, RotateCcw, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from '@/lib/utils';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ReturnLine = {
  goods_id: string;
  item_code: string;
  name: string;
  unit: string;
  item_type: string;
  ordered_qty: number;
  received_qty: number;
  returned_qty: number;
  available_qty: number;
  current_stock: number;
  unit_price: number;
  return_qty: number;
};

type ReturnHistoryItem = {
  id: string;
  return_number: string;
  return_date: string;
  notes: string | null;
  settlement_type: string | null;
  settlement_account_id: string | null;
  settlement_amount: number | null;
  created_at: string;
  items: Array<{
    goods_id: string;
    quantity_returned: number;
    unit_price: number;
    total_price: number;
    goods: {
      id: string;
      name: string | null;
      item_code: string | null;
      unit: string | null;
      item_type: string | null;
      current_stock: number | null;
    } | null;
  }>;
};

type EditReturnLine = {
  goods_id: string;
  item_code: string;
  name: string;
  unit: string;
  item_type: string;
  unit_price: number;
  original_qty: number;
  max_qty: number;
  return_qty: number;
};

export default function PurchaseOrderReturn() {
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [returnNotes, setReturnNotes] = useState('');
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [returnMode, setReturnMode] = useState<'PARTIAL' | 'FULL'>('PARTIAL');
  const [settlementType, setSettlementType] = useState<'REFUND' | 'DEPOSIT' | 'AP_DEDUCT'>('REFUND');
  const [settlementAccountId, setSettlementAccountId] = useState<string>('');
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);
  const [returnHistory, setReturnHistory] = useState<ReturnHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingReturn, setEditingReturn] = useState<ReturnHistoryItem | null>(null);
  const [editDate, setEditDate] = useState(new Date().toISOString().split('T')[0]);
  const [editNotes, setEditNotes] = useState('');
  const [editSettlementType, setEditSettlementType] = useState<'REFUND' | 'DEPOSIT' | 'AP_DEDUCT'>('REFUND');
  const [editSettlementAccountId, setEditSettlementAccountId] = useState<string>('');
  const [editLines, setEditLines] = useState<EditReturnLine[]>([]);
  const [isEditProcessing, setIsEditProcessing] = useState(false);

  // Date Filter State (Default to current month)
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchCompletedPOs();
  }, [dateFilter]);

  useEffect(() => {
    const loadCoa = async () => {
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('account_type', 'DETAIL')
        .order('account_code', { ascending: true });
      setCoaAccounts((data as any[]) || []);
    };
    loadCoa();
  }, []);

  useEffect(() => {
    if (!isConfirmOpen) return;
    if (returnMode !== 'FULL') return;
    setReturnLines((prev) =>
      (prev || []).map((l) => ({ ...l, return_qty: Number(l.available_qty || 0) }))
    );
  }, [returnMode, isConfirmOpen]);

  const getPoPaymentInfo = (po: any) => {
    const inv = (po as any)?.purchase_invoices;
    const invoices = Array.isArray(inv) ? inv : inv ? [inv] : [];
    if (invoices.length === 0) {
      return { status: 'NO_INVOICE' as const, total: 0, paid: 0, reason: 'Belum ada invoice' };
    }
    const total = invoices.reduce((sum: number, x: any) => sum + Number(x?.total_amount || 0), 0);
    const paid = invoices.reduce((sum: number, x: any) => sum + Number(x?.paid_amount || 0), 0);
    if (paid <= 0.009) return { status: 'UNPAID' as const, total, paid, reason: '' };
    if (total > 0 && paid + 0.01 < total) return { status: 'PARTIAL' as const, total, paid, reason: '' };
    return { status: 'PAID' as const, total, paid, reason: '' };
  };

  const getDefaultApAccountId = () => {
    const byCode = (code: string) => coaAccounts.find((a: any) => String(a.account_code || '') === code)?.id;
    const byNameIncludes = (s: string) =>
      coaAccounts.find((a: any) => String(a.account_name || '').toLowerCase().includes(s))?.id;
    return (
      byCode('2100201') ||
      byNameIncludes('hutang usaha') ||
      byNameIncludes('hutang') ||
      coaAccounts.find((a: any) => String(a.account_code || '').startsWith('21'))?.id ||
      ''
    );
  };

  async function fetchCompletedPOs() {
    setLoading(true);
    try {
      // Fetch POs that are fully received or partially received within date range
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          po_date,
          status,
          suppliers (name),
          purchase_invoices (id, status, total_amount, paid_amount)
        `)
        .in('status', ['RECEIVED_FULL', 'RECEIVED_PART', 'RETURNED_FULL'])
        .gte('po_date', dateFilter.startDate)
        .lte('po_date', dateFilter.endDate)
        .order('po_date', { ascending: false });

      if (error) throw error;
      setPos(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data PO: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const receivedKey = (goodsId: string) => String(goodsId || '');

  const isServiceType = (itemType: unknown) => {
    const t = String(itemType || '').toUpperCase();
    return t === 'JASA' || t === 'SERVICE';
  };

  const loadReturnHistory = async (poId: string) => {
    if (!poId) return;
    setIsHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_returns')
        .select(`
          id,
          return_number,
          return_date,
          notes,
          settlement_type,
          settlement_account_id,
          settlement_amount,
          created_at,
          items:purchase_return_items(
            goods_id,
            quantity_returned,
            unit_price,
            total_price,
            goods:goods_id(id, name, item_code, unit, item_type, current_stock)
          )
        `)
        .eq('po_id', poId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReturnHistory((data as any[]) || []);
    } catch (e: any) {
      setReturnHistory([]);
      toast.error('Gagal memuat riwayat retur: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const computeEditMaxQtyByGoods = async (poId: string, returnId: string) => {
    const { data: receipts, error: rErr } = await supabase
      .from('goods_receipts')
      .select('items:goods_receipt_items(goods_id, quantity_received)')
      .eq('po_id', poId);
    if (rErr) throw rErr;
    const receivedByGoods = new Map<string, number>();
    (receipts || []).forEach((r: any) => (r.items || []).forEach((it: any) => {
      if (it.goods_id) receivedByGoods.set(String(it.goods_id), (receivedByGoods.get(String(it.goods_id)) || 0) + Number(it.quantity_received || 0));
    }));

    const { data: returns, error: retErr } = await supabase.from('purchase_returns').select('id').eq('po_id', poId);
    if (retErr) throw retErr;
    const returnIds = (returns || []).map((x: any) => x.id).filter(Boolean);

    const returnedTotalByGoods = new Map<string, number>();
    const currentReturnByGoods = new Map<string, number>();
    if (returnIds.length > 0) {
      const { data: retItems, error: retItemErr } = await supabase
        .from('purchase_return_items')
        .select('return_id, goods_id, quantity_returned')
        .in('return_id', returnIds);
      if (retItemErr) throw retItemErr;
      (retItems || []).forEach((it: any) => {
        const gid = String(it.goods_id || '');
        if (!gid) return;
        const qty = Number(it.quantity_returned || 0);
        returnedTotalByGoods.set(gid, (returnedTotalByGoods.get(gid) || 0) + qty);
        if (String(it.return_id) === String(returnId)) {
          currentReturnByGoods.set(gid, (currentReturnByGoods.get(gid) || 0) + qty);
        }
      });
    }

    const maxByGoods = new Map<string, number>();
    const goodsIds = new Set<string>([...receivedByGoods.keys(), ...returnedTotalByGoods.keys(), ...currentReturnByGoods.keys()]);
    goodsIds.forEach((gid) => {
      const received = Number(receivedByGoods.get(gid) || 0);
      const returnedTotal = Number(returnedTotalByGoods.get(gid) || 0);
      const cur = Number(currentReturnByGoods.get(gid) || 0);
      const max = Math.max(0, received - Math.max(0, returnedTotal - cur));
      maxByGoods.set(gid, max);
    });
    return maxByGoods;
  };

  const openEditReturn = async (ret: ReturnHistoryItem) => {
    const poId = String(selectedPO?.id || '');
    if (!poId) return;
    setEditingReturn(ret);
    setEditDate(String(ret.return_date || new Date().toISOString().split('T')[0]));
    setEditNotes(String(ret.notes || ''));
    const p = getPoPaymentInfo(selectedPO);
    if (p.status === 'UNPAID' || p.status === 'PARTIAL') {
      setEditSettlementType('AP_DEDUCT');
      setEditSettlementAccountId(ret.settlement_account_id || getDefaultApAccountId());
    } else {
      const st = String(ret.settlement_type || 'REFUND').toUpperCase();
      setEditSettlementType(st === 'DEPOSIT' ? 'DEPOSIT' : st === 'AP_DEDUCT' ? 'AP_DEDUCT' : 'REFUND');
      setEditSettlementAccountId(ret.settlement_account_id || '');
    }
    setEditLines([]);
    setIsEditOpen(true);
    try {
      const maxByGoods = await computeEditMaxQtyByGoods(poId, ret.id);
      const lines: EditReturnLine[] = (ret.items || []).map((it: any) => {
        const g = it.goods;
        const gid = String(it.goods_id || g?.id || '');
        return {
          goods_id: gid,
          item_code: String(g?.item_code || ''),
          name: String(g?.name || ''),
          unit: String(g?.unit || ''),
          item_type: String(g?.item_type || ''),
          unit_price: Number(it.unit_price || 0),
          original_qty: Number(it.quantity_returned || 0),
          max_qty: Number(maxByGoods.get(gid) || 0),
          return_qty: Number(it.quantity_returned || 0),
        };
      });
      setEditLines(lines);
    } catch (e: any) {
      toast.error('Gagal memuat data edit retur: ' + (e?.message || 'Unknown error'));
      setIsEditOpen(false);
      setEditingReturn(null);
    }
  };

  const saveEditReturn = async () => {
    const poId = String(selectedPO?.id || '');
    if (!poId || !editingReturn) return;
    const p = getPoPaymentInfo(selectedPO);
    if (p.status === 'NO_INVOICE') {
      toast.error(`Retur tidak aktif: ${p.reason}.`);
      return;
    }
    if (!editDate) {
      toast.error('Tanggal retur wajib diisi.');
      return;
    }

    const shouldUseApDeduct = p.status === 'UNPAID' || p.status === 'PARTIAL';
    const effectiveSettlementAccountId = editSettlementAccountId || (shouldUseApDeduct ? getDefaultApAccountId() : '');
    const effectiveSettlementType = shouldUseApDeduct ? 'AP_DEDUCT' : editSettlementType;
    if (shouldUseApDeduct && !effectiveSettlementAccountId) {
      toast.error('Akun Hutang Usaha (AP) belum disetting. Mohon set COA Hutang Usaha untuk penyelesaian retur.');
      return;
    }
    if (p.status === 'PAID' && !effectiveSettlementAccountId) {
      toast.error('Akun penyelesaian wajib dipilih.');
      return;
    }

    const normalizedLines = (editLines || []).map(l => ({ ...l, return_qty: Number(l.return_qty || 0) }));
    const invalid = normalizedLines.find(l => l.return_qty < 0 || l.return_qty > l.max_qty + 1e-9);
    if (invalid) {
      toast.error(`Qty retur tidak valid untuk ${invalid.name || invalid.item_code}. Maks: ${invalid.max_qty}.`);
      return;
    }

    const goodsIds = Array.from(new Set(normalizedLines.map(l => String(l.goods_id || '')).filter(Boolean)));
    const { data: freshStocks, error: stockErr } = await supabase
      .from('goods')
      .select('id, current_stock')
      .in('id', goodsIds);
    if (stockErr) throw stockErr;
    const stockById = new Map<string, number>();
    (freshStocks || []).forEach((g: any) => stockById.set(String(g.id), Number(g.current_stock || 0)));

    const stockInvalid = normalizedLines.find(l => {
      if (isServiceType(l.item_type)) return false;
      const delta = Number(l.return_qty || 0) - Number(l.original_qty || 0);
      if (delta <= 0) return false;
      const cur = Number(stockById.get(String(l.goods_id)) || 0);
      return delta > cur + 1e-9;
    });
    if (stockInvalid) {
      const delta = Number(stockInvalid.return_qty || 0) - Number(stockInvalid.original_qty || 0);
      const cur = Number(stockById.get(String(stockInvalid.goods_id)) || 0);
      toast.warning(`Stok tidak cukup untuk menambah retur ${stockInvalid.name}. Stok: ${cur}, Tambahan Retur: ${delta}. Proses tetap dilanjutkan.`);
    }

    const itemsToSave = normalizedLines.filter(l => Number(l.return_qty || 0) > 0);
    if (itemsToSave.length === 0) {
      toast.error('Isi minimal 1 qty retur.');
      return;
    }

    setIsEditProcessing(true);
    try {
      const totalReturnAmount = itemsToSave.reduce((sum, l) => sum + Number(l.unit_price || 0) * Number(l.return_qty || 0), 0);

      const { error: hErr } = await supabase
        .from('purchase_returns')
        .update({
          return_date: editDate,
          notes: editNotes ? editNotes : null,
          settlement_type: effectiveSettlementType,
          settlement_account_id: effectiveSettlementAccountId ? effectiveSettlementAccountId : null,
          settlement_amount: totalReturnAmount,
        } as any)
        .eq('id', editingReturn.id);
      if (hErr) throw hErr;

      const { error: delErr } = await supabase.from('purchase_return_items').delete().eq('return_id', editingReturn.id);
      if (delErr) throw delErr;

      const payload = itemsToSave.map((l) => {
        const unit = Number(l.unit_price || 0);
        const qty = Number(l.return_qty || 0);
        return {
          return_id: editingReturn.id,
          goods_id: l.goods_id,
          quantity_returned: qty,
          unit_price: unit,
          total_price: unit * qty,
        };
      });
      const { error: insErr } = await supabase.from('purchase_return_items').insert(payload as any);
      if (insErr) throw insErr;

      for (const l of normalizedLines) {
        const gid = String(l.goods_id || '');
        if (!gid) continue;
        if (isServiceType(l.item_type)) continue;
        const delta = Number(l.return_qty || 0) - Number(l.original_qty || 0);
        if (!delta) continue;
        const cur = Number(stockById.get(gid) || 0);
        const next = cur - delta;
        const { error: uErr } = await supabase.from('goods').update({ current_stock: next }).eq('id', gid);
        if (uErr) throw uErr;
      }

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

      const creditByAccountId: Record<string, number> = {};
      const persAcc = await fetchPersediaanAccount();
      for (const l of itemsToSave) {
        const amt = Number(l.unit_price || 0) * Number(l.return_qty || 0);
        if (!amt) continue;
        const itemType = String(l.item_type || '').toUpperCase();
        let acc: any = null;
        if (itemType === 'PERSEDIAAN') {
          acc = persAcc;
        } else if (itemType === 'ASET_AKTIVA_TETAP') {
          acc = await fetchAccountByName('aktiva tetap');
        } else {
          const code = accountCodeByGoodsType(itemType);
          if (code) acc = await fetchAccountByCode(code);
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
                    : itemType === 'PERSEDIAAN'
                      ? 'persediaan'
                      : '';
          acc = fallbackName ? await fetchAccountByName(fallbackName) : null;
        }
        if (!acc) continue;
        creditByAccountId[String(acc.id)] = (creditByAccountId[String(acc.id)] || 0) + amt;
      }
      const creditLines = Object.entries(creditByAccountId).filter(([, v]) => Number(v || 0) !== 0);

      await supabase.from('journal_entries').delete().eq('reference', editingReturn.id);
      if (totalReturnAmount > 0 && creditLines.length > 0) {
        const { data: je, error: jeErr } = await supabase
          .from('journal_entries')
          .insert([{
            entry_date: editDate,
            voucher_no: editingReturn.return_number,
            reference: editingReturn.id,
            description: `Retur Pembelian ${editingReturn.return_number} (PO ${selectedPO.po_number})`,
            entry_type: 'JOURNAL',
            total_amount: totalReturnAmount,
          }])
          .select()
          .single();
        if (jeErr) throw jeErr;

        const itemsPayload: any[] = [{
          journal_entry_id: je.id,
          account_id: effectiveSettlementAccountId,
          debit: totalReturnAmount,
          credit: 0,
          description:
            effectiveSettlementType === 'AP_DEDUCT'
              ? 'Pengurangan Hutang Usaha (Retur Pembelian)'
              : effectiveSettlementType === 'REFUND'
                ? 'Refund Retur Pembelian'
                : 'Deposit/Uang Muka Retur Pembelian',
        }];
        creditLines.forEach(([accountId, amt]) => {
          itemsPayload.push({
            journal_entry_id: je.id,
            account_id: accountId,
            debit: 0,
            credit: amt,
            description: 'Pengurangan nilai barang (Retur)',
          });
        });
        const { error: jelErr } = await supabase.from('journal_entry_items').insert(itemsPayload);
        if (jelErr) throw jelErr;
      }

      toast.success('Retur berhasil diperbarui.');
      setIsEditOpen(false);
      setEditingReturn(null);
      await loadReturnHistory(poId);
      const { data: refreshed } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          po_date,
          status,
          suppliers (name),
          purchase_invoices (id, status, total_amount, paid_amount)
        `)
        .eq('id', poId)
        .single();
      if (refreshed) {
        setPos((prev) => prev.map((x) => (x.id === refreshed.id ? refreshed : x)));
        setSelectedPO(refreshed);
      }
    } catch (e: any) {
      toast.error('Gagal mengubah retur: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsEditProcessing(false);
    }
  };

  const deleteReturn = async (ret: ReturnHistoryItem) => {
    const poId = String(selectedPO?.id || '');
    if (!poId) return;
    if (!window.confirm(`Hapus retur ${ret.return_number}?`)) return;

    try {
      const allItems = (ret.items || []).map((it: any) => ({
        goods_id: String(it.goods_id || ''),
        qty: Number(it.quantity_returned || 0),
        item_type: String(it.goods?.item_type || ''),
      })).filter((x: any) => x.goods_id && x.qty > 0);

      const goodsIds = Array.from(new Set(allItems.map((x: any) => x.goods_id)));
      const { data: freshStocks, error: stockErr } = await supabase
        .from('goods')
        .select('id, current_stock')
        .in('id', goodsIds);
      if (stockErr) throw stockErr;
      const stockById = new Map<string, number>();
      (freshStocks || []).forEach((g: any) => stockById.set(String(g.id), Number(g.current_stock || 0)));

      for (const it of allItems) {
        if (isServiceType(it.item_type)) continue;
        const cur = Number(stockById.get(it.goods_id) || 0);
        const next = cur + Number(it.qty || 0);
        const { error: uErr } = await supabase.from('goods').update({ current_stock: next }).eq('id', it.goods_id);
        if (uErr) throw uErr;
      }

      await supabase.from('journal_entries').delete().eq('reference', ret.id);
      const { error: delErr } = await supabase.from('purchase_returns').delete().eq('id', ret.id);
      if (delErr) throw delErr;

      toast.success('Retur berhasil dihapus.');
      await loadReturnHistory(poId);
      const { data: refreshed } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          po_date,
          status,
          suppliers (name),
          purchase_invoices (id, status, total_amount, paid_amount)
        `)
        .eq('id', poId)
        .single();
      if (refreshed) {
        setPos((prev) => prev.map((x) => (x.id === refreshed.id ? refreshed : x)));
        setSelectedPO(refreshed);
      }
    } catch (e: any) {
      toast.error('Gagal menghapus retur: ' + (e?.message || 'Unknown error'));
    }
  };

  const loadReturnData = async (po: any) => {
    const poId = String(po?.id || '');
    if (!poId) return;

    // --- Validasi tabel (tetap dipertahankan) ---
    const tablesToValidate = ['purchase_returns', 'purchase_return_items'];
    for (const table of tablesToValidate) {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error) throw new Error(`Database belum siap: tabel ${table} tidak ditemukan. Jalankan migrasi yang sesuai.`);
    }
    const { error: colErr } = await supabase.from('purchase_returns').select('settlement_type').limit(1);
    if (colErr) throw new Error("Database belum siap: kolom 'settlement_type' di 'purchase_returns' tidak ditemukan.");

    // --- LANGKAH 1: Ambil semua item PO, hanya dengan ID ---
    const { data: poItems, error: poErr } = await supabase
      .from('purchase_order_items')
      .select('goods_id, quantity, unit_price')
      .eq('po_id', poId);
    if (poErr) throw poErr;
    if (!poItems || poItems.length === 0) {
      setReturnLines([]);
      return;
    }

    // --- LANGKAH 2: Ambil data 'goods' secara terpisah dan aman ---
    const goodsIds = poItems.map(it => it.goods_id).filter(Boolean); // Filter ID yang null/kosong
    const { data: goodsData, error: gErr } = await supabase
      .from('goods')
      .select('id, name, item_code, unit, item_type, current_stock')
      .in('id', goodsIds);
    if (gErr) throw gErr;
    const goodsMap = new Map((goodsData || []).map(g => [g.id, g]));

    // --- LANGKAH 3: Ambil data penerimaan & retur yang sudah ada ---
    const { data: receipts, error: rErr } = await supabase
      .from('goods_receipts')
      .select('items:goods_receipt_items(goods_id, quantity_received)')
      .eq('po_id', poId);
    if (rErr) throw rErr;
    const receivedByGoods = new Map<string, number>();
    (receipts || []).forEach(r => (r.items || []).forEach((it: any) => {
      if (it.goods_id) receivedByGoods.set(it.goods_id, (receivedByGoods.get(it.goods_id) || 0) + Number(it.quantity_received || 0));
    }));

    const { data: returns, error: retErr } = await supabase.from('purchase_returns').select('id').eq('po_id', poId);
    if (retErr) throw retErr;
    const returnedByGoods = new Map<string, number>();
    const returnIds = (returns || []).map(x => x.id).filter(Boolean);
    if (returnIds.length > 0) {
      const { data: retItems, error: retItemErr } = await supabase.from('purchase_return_items').select('goods_id, quantity_returned').in('return_id', returnIds);
      if (retItemErr) throw retItemErr;
      (retItems || []).forEach((it: any) => {
        if (it.goods_id) returnedByGoods.set(it.goods_id, (returnedByGoods.get(it.goods_id) || 0) + Number(it.quantity_returned || 0));
      });
    }

    // --- LANGKAH 4: Gabungkan semua data dengan aman ---
    const lines: ReturnLine[] = poItems
      .map(item => {
        const g = goodsMap.get(item.goods_id);
        // JIKA DATA GOODS TIDAK DITEMUKAN, LEWATI ITEM INI
        if (!g) {
          console.warn(`[DATA-SKIP] Melewatkan item PO karena data barang (goods) dengan ID ${item.goods_id} tidak ditemukan.`);
          return null;
        }

        const gid = String(g.id);
        const received = receivedByGoods.get(gid) || 0;
        const returned = returnedByGoods.get(gid) || 0;
        const available = Math.max(0, received - returned);

        return {
          goods_id: gid,
          item_code: String(g.item_code || ''),
          name: String(g.name || ''),
          unit: String(g.unit || ''),
          item_type: String(g.item_type || ''),
          ordered_qty: Number(item.quantity || 0),
          received_qty: received,
          returned_qty: returned,
          available_qty: available,
          current_stock: Number(g.current_stock || 0),
          unit_price: Number(item.unit_price || 0),
          return_qty: 0,
        };
      })
      .filter((line): line is ReturnLine => line !== null);

    setReturnLines(lines);
  };

  const handleReturnClick = async (po: any) => {
    const p = getPoPaymentInfo(po);
    if (p.status === 'NO_INVOICE') {
      toast.error(`Retur tidak aktif: ${p.reason}.`);
      return;
    }
    setSelectedPO(po);
    setReturnDate(new Date().toISOString().split('T')[0]);
    setReturnNotes('');
    setReturnLines([]);
    setReturnMode('PARTIAL');
    setReturnHistory([]);
    if (p.status === 'UNPAID' || p.status === 'PARTIAL') {
      setSettlementType('AP_DEDUCT');
      setSettlementAccountId(getDefaultApAccountId());
    } else {
      setSettlementType('REFUND');
      setSettlementAccountId('');
    }
    setIsConfirmOpen(true);
    try {
      await loadReturnData(po);
      await loadReturnHistory(String(po.id || ''));
    } catch (e: any) {
      toast.error('Gagal memuat rincian PO: ' + (e?.message || 'Unknown error'));
    }
  };

  const processReturn = async () => {
    if (!selectedPO) return;
    const p = getPoPaymentInfo(selectedPO);
    if (p.status === 'NO_INVOICE') {
      toast.error(`Retur tidak aktif: ${p.reason}.`);
      return;
    }
    if (!returnDate) {
      toast.error('Tanggal retur wajib diisi.');
      return;
    }
    const shouldUseApDeduct = p.status === 'UNPAID' || p.status === 'PARTIAL';
    const effectiveSettlementAccountId = settlementAccountId || (shouldUseApDeduct ? getDefaultApAccountId() : '');
    const effectiveSettlementType = shouldUseApDeduct ? 'AP_DEDUCT' : settlementType;
    if (shouldUseApDeduct && !effectiveSettlementAccountId) {
      toast.error('Akun Hutang Usaha (AP) belum disetting. Mohon set COA Hutang Usaha untuk penyelesaian retur.');
      return;
    }
    if (p.status === 'PAID' && !effectiveSettlementAccountId) {
      toast.error('Akun penyelesaian wajib dipilih.');
      return;
    }

    const itemsToReturn = (returnLines || [])
      .map((l) => ({ ...l, return_qty: Number(l.return_qty || 0) }))
      .filter((l) => l.return_qty > 0);

    if (itemsToReturn.length === 0) {
      toast.error('Isi minimal 1 qty retur.');
      return;
    }

    const invalid = itemsToReturn.find((l) => l.return_qty > l.available_qty + 1e-9);
    if (invalid) {
      toast.error(`Qty retur melebihi sisa diterima untuk ${invalid.name || invalid.item_code}.`);
      return;
    }

    const qtyByGoodsId = new Map<string, number>();
    itemsToReturn.forEach((l) => {
      const gid = String(l.goods_id || '');
      if (!gid) return;
      qtyByGoodsId.set(gid, (qtyByGoodsId.get(gid) || 0) + Number(l.return_qty || 0));
    });

    const goodsIds = Array.from(qtyByGoodsId.keys());
    const { data: freshStocks, error: stockErr } = await supabase
      .from('goods')
      .select('id, current_stock')
      .in('id', goodsIds);
    if (stockErr) throw stockErr;

    const stockById = new Map<string, number>();
    (freshStocks || []).forEach((g: any) => stockById.set(String(g.id), Number(g.current_stock || 0)));

    const stockInvalidId = goodsIds.find((gid) => {
      const line = itemsToReturn.find(l => l.goods_id === gid);
      const itemType = String(line?.item_type || '').toUpperCase();

      // Skip stock check for JASA or SERVICE type items
      if (itemType === 'JASA' || itemType === 'SERVICE') {
        return false;
      }
      const req = Number(qtyByGoodsId.get(gid) || 0);
      const cur = Number(stockById.get(gid) || 0);
      return req > cur + 1e-9;
    });
    if (stockInvalidId) {
      const line = itemsToReturn.find((l) => String(l.goods_id) === String(stockInvalidId));
      const name = line?.name || line?.item_code || stockInvalidId;
      const req = Number(qtyByGoodsId.get(stockInvalidId) || 0);
      const cur = Number(stockById.get(stockInvalidId) || 0);
      toast.warning(`Stok tidak cukup untuk retur ${name}. Stok: ${cur}, Retur: ${req}. Proses tetap dilanjutkan.`);
    }

    setIsProcessing(true);
    try {
      const totalReturnAmount = itemsToReturn.reduce((sum, l) => sum + Number(l.unit_price || 0) * Number(l.return_qty || 0), 0);

      const { data: header, error: hErr } = await supabase
        .from('purchase_returns')
        .insert([{
          return_number: `RT-${Date.now()}`,
          po_id: selectedPO.id,
          return_date: returnDate,
          settlement_type: effectiveSettlementType,
          settlement_account_id: effectiveSettlementAccountId ? effectiveSettlementAccountId : null,
          settlement_amount: totalReturnAmount,
          notes: returnNotes ? returnNotes : null,
        }])
        .select()
        .single();
      if (hErr) throw hErr;

      const payload = itemsToReturn.map((l) => {
        const unit = Number(l.unit_price || 0);
        const qty = Number(l.return_qty || 0);
        return {
          return_id: header.id,
          goods_id: l.goods_id,
          quantity_returned: qty,
          unit_price: unit,
          total_price: unit * qty,
        };
      });
      const { error: iErr } = await supabase.from('purchase_return_items').insert(payload as any);
      if (iErr) throw iErr;

      for (const [gid, qty] of qtyByGoodsId.entries()) {
        const line = itemsToReturn.find(l => l.goods_id === gid);
        const itemType = String(line?.item_type || '').toUpperCase();

        // Skip stock update for JASA or SERVICE type items
        if (itemType === 'JASA' || itemType === 'SERVICE') {
          continue;
        }
        const cur = Number(stockById.get(gid) || 0);
        const newStock = cur - Number(qty || 0);
        const { error: uErr } = await supabase
          .from('goods')
          .update({ current_stock: newStock })
          .eq('id', gid);
        if (uErr) throw uErr;
      }

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

      const persAcc = await fetchPersediaanAccount();
      const creditByAccountId: Record<string, number> = {};
      for (const l of itemsToReturn) {
        const amt = Number(l.unit_price || 0) * Number(l.return_qty || 0);
        if (!amt) continue;
        const itemType = String(l.item_type || '').toUpperCase();
        let acc: any = null;
        if (itemType === 'PERSEDIAAN') {
          acc = persAcc;
        } else if (itemType === 'ASET_AKTIVA_TETAP') {
          acc = await fetchAccountByName('aktiva tetap');
        } else {
          const code = accountCodeByGoodsType(itemType);
          if (code) acc = await fetchAccountByCode(code);
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
                    : itemType === 'PERSEDIAAN'
                      ? 'persediaan'
                      : '';
          acc = fallbackName ? await fetchAccountByName(fallbackName) : null;
        }
        if (!acc) continue;
        creditByAccountId[String(acc.id)] = (creditByAccountId[String(acc.id)] || 0) + amt;
      }

      const creditLines = Object.entries(creditByAccountId).filter(([, v]) => Number(v || 0) !== 0);
      if (totalReturnAmount > 0 && creditLines.length > 0) {
        await supabase.from('journal_entries').delete().eq('reference', header.id);

        const { data: je, error: jeErr } = await supabase
          .from('journal_entries')
          .insert([{
            entry_date: returnDate,
            voucher_no: header.return_number,
            reference: header.id,
            description: `Retur Pembelian ${header.return_number} (PO ${selectedPO.po_number})`,
            entry_type: 'JOURNAL',
            total_amount: totalReturnAmount,
          }])
          .select()
          .single();
        if (jeErr) throw jeErr;

        const itemsPayload: any[] = [{
          journal_entry_id: je.id,
          account_id: effectiveSettlementAccountId,
          debit: totalReturnAmount,
          credit: 0,
          description:
            effectiveSettlementType === 'AP_DEDUCT'
              ? 'Pengurangan Hutang Usaha (Retur Pembelian)'
              : effectiveSettlementType === 'REFUND'
                ? 'Refund Retur Pembelian'
                : 'Deposit/Uang Muka Retur Pembelian',
        }];
        creditLines.forEach(([accountId, amt]) => {
          itemsPayload.push({
            journal_entry_id: je.id,
            account_id: accountId,
            debit: 0,
            credit: amt,
            description: 'Pengurangan nilai barang (Retur)',
          });
        });
        const { error: jelErr } = await supabase.from('journal_entry_items').insert(itemsPayload);
        if (jelErr) throw jelErr;
      }

      const { data: refreshed } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          po_date,
          status,
          suppliers (name),
          purchase_invoices (id, status, total_amount, paid_amount)
        `)
        .eq('id', selectedPO.id)
        .single();
      if (refreshed) {
        setPos((prev) => prev.map((p) => (p.id === refreshed.id ? refreshed : p)));
      }

      toast.success('Retur berhasil diproses.');
      setIsConfirmOpen(false);
      setSelectedPO(null);
    } catch (error: any) {
      toast.error('Gagal memproses retur: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDateFilter(prev => ({ ...prev, [name]: value }));
  };

  const filteredPos = pos.filter(p => 
    p.po_number.toLowerCase().includes(search.toLowerCase()) ||
    p.suppliers?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Daftar PO Selesai / Diterima</CardTitle>
          <CardDescription>Pilih PO yang akan diretur. Hanya PO yang sudah diterima (sebagian/penuh) yang muncul di sini.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Cari berdasarkan No. PO atau Supplier..." 
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Label>Dari</Label>
              <Input type="date" name="startDate" value={dateFilter.startDate} onChange={handleDateChange} />
              <Label>Sampai</Label>
              <Input type="date" name="endDate" value={dateFilter.endDate} onChange={handleDateChange} />
            </div>
            <Button onClick={fetchCompletedPOs} variant="outline" size="icon">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal PO</TableHead>
                <TableHead>No. PO</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pembayaran</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">Memuat data...</TableCell>
                </TableRow>
              ) : filteredPos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">Tidak ada data PO yang bisa diretur pada periode ini.</TableCell>
                </TableRow>
              ) : (
                filteredPos.map(po => {
                  const paymentInfo = getPoPaymentInfo(po);
                  return (
                    <TableRow key={po.id}>
                      <TableCell>{formatDate(po.po_date)}</TableCell>
                      <TableCell>{po.po_number}</TableCell>
                      <TableCell>{po.suppliers?.name || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={po.status === 'RECEIVED_PART' ? 'secondary' : 'default'}
                          className={
                            po.status === 'RECEIVED_FULL'
                              ? 'bg-emerald-600 text-white hover:bg-emerald-600/80'
                              : po.status === 'RECEIVED_PART'
                                ? 'bg-indigo-600 text-white hover:bg-indigo-600/80'
                                : ''
                          }
                        >
                          {po.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={paymentInfo.status === 'UNPAID' ? 'destructive' : 'secondary'}
                          className={
                            paymentInfo.status === 'PAID'
                              ? 'bg-emerald-600 text-white hover:bg-emerald-600/80'
                              : paymentInfo.status === 'PARTIAL'
                                ? 'bg-amber-500 text-white hover:bg-amber-500/80'
                                : paymentInfo.status === 'NO_INVOICE'
                                  ? 'bg-slate-200 text-slate-800 hover:bg-slate-200/80'
                                  : ''
                          }
                        >
                          {
                            paymentInfo.status === 'PAID' ? 'Lunas' :
                            paymentInfo.status === 'UNPAID' ? 'Belum Bayar' :
                            paymentInfo.status === 'PARTIAL' ? 'Bayar Sebagian' : 'Tanpa Invoice'
                          }
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button onClick={() => handleReturnClick(po)} size="sm">
                          Retur
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Retur Pembelian</DialogTitle>
            <DialogDescription>
              Isi qty retur untuk PO {selectedPO?.po_number}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
          
          {getPoPaymentInfo(selectedPO).status === 'UNPAID' || getPoPaymentInfo(selectedPO).status === 'PARTIAL' ? (
            <div className="p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-md">
              <p><AlertTriangle className="inline-block h-5 w-5 mr-2" />Invoice belum dibayar. Retur akan otomatis mengurangi Hutang Usaha, tanpa perlu pilih akun penyelesaian.</p>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Tanggal Retur</Label>
              <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Catatan (opsional)</Label>
              <Input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="Keterangan retur..." />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Mode Retur</Label>
              <Select value={returnMode} onValueChange={(v: any) => setReturnMode(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih mode retur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARTIAL">Retur Sebagian</SelectItem>
                  <SelectItem value="FULL">Retur Keseluruhan</SelectItem>
                </SelectContent>
              </Select>
              {returnMode === 'FULL' && <p className="text-xs text-muted-foreground mt-1">Otomatis mengisi qty retur = sisa diterima untuk semua barang.</p>}
            </div>
            {getPoPaymentInfo(selectedPO).status === 'PAID' && (
              <div className="col-span-2">
                <Label>Penyelesaian</Label>
                <div className="flex space-x-2">
                  <Select value={settlementType} onValueChange={(v: any) => setSettlementType(v)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Tipe Penyelesaian" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REFUND">Refund (Uang Kembali)</SelectItem>
                      <SelectItem value="DEPOSIT">Simpan sebagai Deposit</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={settlementAccountId} onValueChange={setSettlementAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Akun Kas/Bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {coaAccounts
                        .filter(a => String(a.account_code || '').startsWith('11'))
                        .map(acc => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.account_code} - {acc.account_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="border rounded-md max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barang</TableHead>
                  <TableHead className="text-right">Diterima</TableHead>
                  <TableHead className="text-right">Sudah Retur</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead className="w-[120px]">Qty Retur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24">
                      Memuat rincian...
                    </TableCell>
                  </TableRow>
                ) : (
                  returnLines.map((line, index) => (
                    <TableRow key={line.goods_id}>
                      <TableCell>
                        <p className="font-medium">{line.name}</p>
                        <p className="text-xs text-muted-foreground">{line.item_code}</p>
                      </TableCell>
                      <TableCell className="text-right">{line.received_qty} {line.unit}</TableCell>
                      <TableCell className="text-right">{line.returned_qty} {line.unit}</TableCell>
                      <TableCell className="text-right font-medium">{line.available_qty} {line.unit}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.return_qty}
                          onChange={(e) => {
                            const newQty = e.target.value;
                            setReturnLines(prev =>
                              prev.map((l, i) =>
                                i === index ? { ...l, return_qty: Number(newQty) } : l
                              )
                            );
                          }}
                          max={line.available_qty}
                          min={0}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-yellow-600 mt-1"><AlertTriangle className="inline-block h-3 w-3 mr-1" />Qty retur tidak boleh melebihi sisa diterima.</p>

          <div className="mt-4 border rounded-md">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <div className="font-medium">Riwayat Retur</div>
              <div className="text-xs text-muted-foreground">
                {isHistoryLoading ? 'Memuat...' : `${returnHistory.length} retur`}
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Retur</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Item</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-16 text-sm text-muted-foreground">
                        Belum ada retur.
                      </TableCell>
                    </TableRow>
                  ) : (
                    returnHistory.map((r, idx) => {
                      const latestId = returnHistory[0]?.id;
                      const canEdit = String(selectedPO?.status || '') !== 'RETURNED_FULL';
                      const canDelete = String(selectedPO?.status || '') === 'RETURNED_FULL' && String(r.id) === String(latestId);
                      const itemCount = Array.isArray(r.items) ? r.items.length : 0;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.return_number}</TableCell>
                          <TableCell>{formatDate(r.return_date)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(r.settlement_amount || 0))}</TableCell>
                          <TableCell className="text-right">{itemCount}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!canEdit || isProcessing}
                                onClick={() => openEditReturn(r)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={!canDelete || isProcessing}
                                onClick={() => deleteReturn(r)}
                              >
                                Hapus
                              </Button>
                            </div>
                            {String(selectedPO?.status || '') === 'RETURNED_FULL' && idx === 0 && (
                              <div className="text-[11px] text-muted-foreground mt-1">Hapus aktif hanya untuk retur terakhir saat status PO = RETURNED_FULL.</div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          </div>

          <DialogFooter>
            <div className="w-full flex justify-between items-center">
              <p className="text-lg font-bold">
                Total Retur: {formatCurrency(
                  returnLines.reduce((sum, l) => sum + l.return_qty * l.unit_price, 0)
                )}
              </p>
              <div>
                <Button variant="ghost" onClick={() => setIsConfirmOpen(false)} disabled={isProcessing}>
                  Batal
                </Button>
                <Button onClick={processReturn} disabled={isProcessing}>
                  {isProcessing ? 'Memproses...' : 'Proses Retur'}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingReturn(null); setEditLines([]); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Retur</DialogTitle>
            <DialogDescription>
              Edit item yang diretur untuk {selectedPO?.po_number}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">

          {getPoPaymentInfo(selectedPO).status === 'UNPAID' || getPoPaymentInfo(selectedPO).status === 'PARTIAL' ? (
            <div className="p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-md">
              <p><AlertTriangle className="inline-block h-5 w-5 mr-2" />Invoice belum dibayar. Retur akan otomatis mengurangi Hutang Usaha.</p>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Tanggal Retur</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Catatan (opsional)</Label>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Keterangan retur..." />
            </div>
          </div>

          {getPoPaymentInfo(selectedPO).status === 'PAID' && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Penyelesaian</Label>
                <Select value={editSettlementType} onValueChange={(v: any) => setEditSettlementType(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipe Penyelesaian" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REFUND">Refund (Uang Kembali)</SelectItem>
                    <SelectItem value="DEPOSIT">Simpan sebagai Deposit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Akun Kas/Bank</Label>
                <Select value={editSettlementAccountId} onValueChange={setEditSettlementAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Akun Kas/Bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaAccounts
                      .filter(a => String(a.account_code || '').startsWith('11'))
                      .map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.account_code} - {acc.account_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="border rounded-md max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barang</TableHead>
                  <TableHead className="text-right">Qty Awal</TableHead>
                  <TableHead className="text-right">Maks</TableHead>
                  <TableHead className="w-[140px]">Qty Retur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24">
                      Memuat rincian...
                    </TableCell>
                  </TableRow>
                ) : (
                  editLines.map((line, index) => (
                    <TableRow key={line.goods_id}>
                      <TableCell>
                        <p className="font-medium">{line.name}</p>
                        <p className="text-xs text-muted-foreground">{line.item_code}</p>
                      </TableCell>
                      <TableCell className="text-right">{line.original_qty} {line.unit}</TableCell>
                      <TableCell className="text-right">{line.max_qty} {line.unit}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.return_qty}
                          onChange={(e) => {
                            const newQty = e.target.value;
                            setEditLines(prev => prev.map((l, i) => i === index ? { ...l, return_qty: Number(newQty) } : l));
                          }}
                          max={line.max_qty}
                          min={0}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          </div>

          <DialogFooter>
            <div className="w-full flex justify-between items-center">
              <p className="text-lg font-bold">
                Total Retur: {formatCurrency(
                  editLines.reduce((sum, l) => sum + Number(l.return_qty || 0) * Number(l.unit_price || 0), 0)
                )}
              </p>
              <div>
                <Button variant="ghost" onClick={() => setIsEditOpen(false)} disabled={isEditProcessing}>
                  Batal
                </Button>
                <Button onClick={saveEditReturn} disabled={isEditProcessing}>
                  {isEditProcessing ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
