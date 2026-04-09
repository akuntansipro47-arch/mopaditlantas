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
  const [settlementType, setSettlementType] = useState<'REFUND' | 'DEPOSIT'>('REFUND');
  const [settlementAccountId, setSettlementAccountId] = useState<string>('');
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

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

  const getPoPaymentEligibility = (po: any) => {
    const inv = (po as any)?.purchase_invoices;
    const invoices = Array.isArray(inv) ? inv : inv ? [inv] : [];
    if (invoices.length === 0) {
      return { eligible: false, reason: 'Belum ada invoice' };
    }
    const total = invoices.reduce((sum: number, x: any) => sum + Number(x?.total_amount || 0), 0);
    const paid = invoices.reduce((sum: number, x: any) => sum + Number(x?.paid_amount || 0), 0);
    const ok = total <= 0 ? false : paid + 0.01 >= total;
    if (!ok) {
      return { eligible: false, reason: 'Invoice belum lunas' };
    }
    return { eligible: true, reason: '' };
  };

  async function fetchCompletedPOs() {
    setLoading(true);
    try {
      // Fetch POs that are fully received or partially received within date range
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (name),
          goods_receipts (receipt_number, receipt_date),
          purchase_invoices (id, status, total_amount, paid_amount)
        `)
        .in('status', ['RECEIVED_FULL', 'RECEIVED_PART'])
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

  const loadReturnData = async (po: any) => {
    const poId = String(po?.id || '');
    if (!poId) return;

    {
      const { error: colErr } = await supabase.from('purchase_returns').select('id').limit(1);
      if (colErr) {
        throw new Error("DB belum siap: tabel purchase_returns belum ada. Jalankan migration 20260404_add_purchase_returns.sql di Supabase.");
      }
    }
    {
      const { error: colErr } = await supabase.from('purchase_return_items').select('id').limit(1);
      if (colErr) {
        throw new Error("DB belum siap: tabel purchase_return_items belum ada. Jalankan migration 20260404_add_purchase_returns.sql di Supabase.");
      }
    }
    {
      const { error: colErr } = await supabase.from('purchase_returns').select('settlement_type').limit(1);
      if (colErr) {
        throw new Error("DB belum siap: kolom settlement retur belum ada. Jalankan migration 20260404_add_purchase_returns_settlement.sql di Supabase.");
      }
    }

    const { data: poItems, error: poErr } = await supabase
      .from('purchase_order_items')
      .select(`
        goods_id,
        quantity,
        unit_price,
        goods (id, name, item_code, unit, item_type)
      `)
      .eq('po_id', poId);
    if (poErr) throw poErr;

    const goodsById = new Map<string, any>();
    const orderedByGoods = new Map<string, { qty: number; unit_price: number }>();
    (poItems || []).forEach((it: any) => {
      const gid = String(it.goods_id || it.goods?.id || '');
      if (!gid) return;
      if (it.goods) goodsById.set(gid, it.goods);
      const prev = orderedByGoods.get(gid);
      orderedByGoods.set(gid, {
        qty: (prev?.qty || 0) + Number(it.quantity || 0),
        unit_price: prev?.unit_price !== undefined ? prev.unit_price : Number(it.unit_price || 0),
      });
    });

    const { data: receipts, error: rErr } = await supabase
      .from('goods_receipts')
      .select(`
        id,
        receipt_date,
        items:goods_receipt_items (
          goods_id,
          quantity_received
        )
      `)
      .eq('po_id', poId);
    if (rErr) throw rErr;

    const receivedByGoods = new Map<string, number>();
    (receipts || []).forEach((r: any) => {
      const items = Array.isArray(r.items) ? r.items : [];
      items.forEach((it: any) => {
        const gid = String(it.goods_id || '');
        if (!gid) return;
        receivedByGoods.set(gid, (receivedByGoods.get(gid) || 0) + Number(it.quantity_received || 0));
      });
    });

    const { data: returns, error: retErr } = await supabase
      .from('purchase_returns')
      .select('id')
      .eq('po_id', poId);
    if (retErr) throw retErr;

    const returnedByGoods = new Map<string, number>();
    const returnIds = (returns || []).map((x: any) => x.id).filter(Boolean);
    if (returnIds.length > 0) {
      const { data: retItems, error: retItemErr } = await supabase
        .from('purchase_return_items')
        .select('goods_id, quantity_returned')
        .in('return_id', returnIds);
      if (retItemErr) throw retItemErr;
      (retItems || []).forEach((it: any) => {
        const gid = String(it.goods_id || '');
        if (!gid) return;
        returnedByGoods.set(gid, (returnedByGoods.get(gid) || 0) + Number(it.quantity_returned || 0));
      });
    }

    const goodsIds = Array.from(orderedByGoods.keys());
    const { data: goodsStocks, error: gErr } = await supabase
      .from('goods')
      .select('id, current_stock')
      .in('id', goodsIds);
    if (gErr) throw gErr;
    const stockById = new Map<string, number>();
    (goodsStocks || []).forEach((g: any) => stockById.set(String(g.id), Number(g.current_stock || 0)));

    const lines: ReturnLine[] = goodsIds.map((gid) => {
      const g = goodsById.get(gid) || {};
      const ordered = orderedByGoods.get(gid)?.qty || 0;
      const unitPrice = orderedByGoods.get(gid)?.unit_price || 0;
      const received = receivedByGoods.get(receivedKey(gid)) || 0;
      const returned = returnedByGoods.get(receivedKey(gid)) || 0;
      const available = Math.max(0, received - returned);
      return {
        goods_id: gid,
        item_code: String(g.item_code || ''),
        name: String(g.name || ''),
        unit: String(g.unit || ''),
        item_type: String(g.item_type || ''),
        ordered_qty: ordered,
        received_qty: received,
        returned_qty: returned,
        available_qty: available,
        current_stock: stockById.get(gid) || 0,
        unit_price: Number(unitPrice || 0),
        return_qty: 0,
      };
    });

    setReturnLines(lines);
  };

  const handleReturnClick = async (po: any) => {
    const elig = getPoPaymentEligibility(po);
    if (!elig.eligible) {
      toast.error(`Retur tidak aktif: ${elig.reason}.`);
      return;
    }
    setSelectedPO(po);
    setReturnDate(new Date().toISOString().split('T')[0]);
    setReturnNotes('');
    setReturnLines([]);
    setSettlementType('REFUND');
    setSettlementAccountId('');
    setIsConfirmOpen(true);
    try {
      await loadReturnData(po);
    } catch (e: any) {
      toast.error('Gagal memuat rincian PO: ' + (e?.message || 'Unknown error'));
    }
  };

  const processReturn = async () => {
    if (!selectedPO) return;
    const elig = getPoPaymentEligibility(selectedPO);
    if (!elig.eligible) {
      toast.error(`Retur tidak aktif: ${elig.reason}.`);
      return;
    }
    if (!returnDate) {
      toast.error('Tanggal retur wajib diisi.');
      return;
    }
    if (!settlementAccountId) {
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

    const stockInvalid = itemsToReturn.find((l) => l.return_qty > l.current_stock + 1e-9);
    if (stockInvalid) {
      toast.error(`Stok tidak cukup untuk retur ${stockInvalid.name || stockInvalid.item_code}.`);
      return;
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
          settlement_type: settlementType,
          settlement_account_id: settlementAccountId,
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

      for (const l of itemsToReturn) {
        const newStock = Math.max(0, Number(l.current_stock || 0) - Number(l.return_qty || 0));
        const { error: uErr } = await supabase
          .from('goods')
          .update({ current_stock: newStock })
          .eq('id', l.goods_id);
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
          account_id: settlementAccountId,
          debit: totalReturnAmount,
          credit: 0,
          description: settlementType === 'REFUND' ? 'Refund Retur Pembelian' : 'Deposit/Uang Muka Retur Pembelian',
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
        .from('purchase_returns')
        .select('id')
        .eq('po_id', selectedPO.id);
      const returnIds = (refreshed || []).map((x: any) => x.id).filter(Boolean);
      const returnedByGoods = new Map<string, number>();
      if (returnIds.length > 0) {
        const { data: retItems } = await supabase
          .from('purchase_return_items')
          .select('goods_id, quantity_returned')
          .in('return_id', returnIds);
        (retItems || []).forEach((it: any) => {
          const gid = String(it.goods_id || '');
          if (!gid) return;
          returnedByGoods.set(gid, (returnedByGoods.get(gid) || 0) + Number(it.quantity_returned || 0));
        });
      }

      let allZero = true;
      let allFull = true;
      (returnLines || []).forEach((l) => {
        const received = Number(l.received_qty || 0);
        const returned = returnedByGoods.get(l.goods_id) || 0;
        const remaining = Math.max(0, received - returned);
        const ordered = Number(l.ordered_qty || 0);
        if (remaining > 0) allZero = false;
        if (ordered > 0 && remaining + 1e-9 < ordered) allFull = false;
      });

      const nextStatus = allZero ? 'ISSUED' : allFull ? 'RECEIVED_FULL' : 'RECEIVED_PART';
      const { error: poErr } = await supabase.from('purchase_orders').update({ status: nextStatus as any }).eq('id', selectedPO.id);
      if (poErr) throw poErr;

      toast.success(`Retur berhasil. Status PO sekarang: ${nextStatus}`);
      setIsConfirmOpen(false);
      fetchCompletedPOs();
    } catch (error: any) {
      toast.error('Gagal memproses retur: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredPos = useMemo(() => {
    const q = search.toLowerCase();
    return pos.filter((po) =>
      String(po.po_number || '').toLowerCase().includes(q) ||
      String(po.suppliers?.name || '').toLowerCase().includes(q)
    );
  }, [pos, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Retur Pembelian</h2>
        <p className="text-muted-foreground">
            Retur pembelian bisa dilakukan sebagian. Stok barang akan otomatis dikurangi sesuai qty retur.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center mb-4">
             <CardTitle>Daftar PO Selesai / Diterima</CardTitle>
             <div className="flex gap-2 items-center">
                <div className="flex items-center gap-2 bg-white border rounded-md px-2 py-1">
                  <span className="text-sm text-gray-500">Periode:</span>
                  <Input 
                    type="date" 
                    className="w-auto border-0 p-0 h-auto focus-visible:ring-0 text-xs"
                    value={dateFilter.startDate} 
                    onChange={(e) => setDateFilter({...dateFilter, startDate: e.target.value})} 
                  />
                  <span className="text-sm text-gray-500">-</span>
                  <Input 
                    type="date" 
                    className="w-auto border-0 p-0 h-auto focus-visible:ring-0 text-xs"
                    value={dateFilter.endDate} 
                    onChange={(e) => setDateFilter({...dateFilter, endDate: e.target.value})} 
                  />
                </div>
                <div className="relative w-64 ml-4">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Cari No. PO / Supplier..." 
                    className="pl-8 h-9" 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                  />
                </div>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. PO</TableHead>
                  <TableHead>No. Terima</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Total Nilai</TableHead>
                  <TableHead>Status Saat Ini</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPos.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center h-24">Tidak ada PO yang dapat diretur dalam periode ini.</TableCell></TableRow>
                ) : (
                  filteredPos.map((po) => (
                    (() => {
                      const elig = getPoPaymentEligibility(po);
                      return (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium">{po.po_number}</TableCell>
                      <TableCell className="text-xs text-blue-600 font-medium">
                        {po.goods_receipts && po.goods_receipts.length > 0 
                          ? po.goods_receipts.map((r: any) => r.receipt_number).join(', ')
                          : '-'}
                      </TableCell>
                      <TableCell>{formatDate(po.po_date)}</TableCell>
                      <TableCell>{po.suppliers?.name}</TableCell>
                      <TableCell>{formatCurrency(po.total_amount)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={po.status === 'RECEIVED_FULL' ? 'default' : 'secondary'}
                          className={po.status === 'RECEIVED_FULL' ? 'bg-green-600' : 'bg-blue-600'}
                        >
                          {po.status === 'RECEIVED_FULL' ? 'Diterima Penuh' : po.status === 'RECEIVED_PART' ? 'Diterima Parsial' : po.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!elig.eligible && (
                          <div className="text-[10px] text-red-600 mb-1">{elig.reason}</div>
                        )}
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8"
                            disabled={!elig.eligible}
                            onClick={() => handleReturnClick(po)}
                        >
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                            Retur
                        </Button>
                      </TableCell>
                    </TableRow>
                      );
                    })()
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Retur Pembelian
            </DialogTitle>
            <DialogDescription className="pt-2">
              Isi qty retur untuk PO <strong>{selectedPO?.po_number}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-xs text-slate-500">Tanggal Retur</span>
                <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500">Catatan (opsional)</span>
                <Input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="Keterangan retur..." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Penyelesaian Retur</Label>
                <Select value={settlementType} onValueChange={(v: any) => setSettlementType(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih opsi..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REFUND">Refund (Kas/Bank)</SelectItem>
                    <SelectItem value="DEPOSIT">Deposit / Uang Muka</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Akun Penyelesaian</Label>
                <Select value={settlementAccountId} onValueChange={setSettlementAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    {coaAccounts.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  {settlementType === 'REFUND'
                    ? 'Pilih akun Kas/Bank yang menerima refund.'
                    : 'Pilih akun Deposit/Uang Muka (piutang vendor) untuk saldo retur.'}
                </p>
              </div>
            </div>

            <div className="rounded-md border max-h-[360px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barang</TableHead>
                    <TableHead className="text-center">Diterima</TableHead>
                    <TableHead className="text-center">Sudah Retur</TableHead>
                    <TableHead className="text-center">Sisa</TableHead>
                    <TableHead className="text-center">Qty Retur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnLines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        Memuat rincian...
                      </TableCell>
                    </TableRow>
                  ) : (
                    returnLines.map((l) => (
                      <TableRow key={l.goods_id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{l.name || '-'}</span>
                            <span className="text-xs text-slate-500">{l.item_code || '-'} • {l.item_type || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{l.received_qty} <span className="text-xs text-slate-400">{l.unit}</span></TableCell>
                        <TableCell className="text-center">{l.returned_qty} <span className="text-xs text-slate-400">{l.unit}</span></TableCell>
                        <TableCell className="text-center font-semibold">{l.available_qty} <span className="text-xs text-slate-400">{l.unit}</span></TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={0}
                            max={l.available_qty}
                            value={String(l.return_qty || 0)}
                            onChange={(e) => {
                              const v = Math.max(0, Number(e.target.value || 0));
                              setReturnLines((prev) => prev.map((x) => x.goods_id === l.goods_id ? { ...x, return_qty: v } : x));
                            }}
                            disabled={isProcessing || l.available_qty <= 0}
                            className="h-9 w-24 text-center inline-flex"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="text-xs text-slate-500 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div>
                Qty retur tidak boleh melebihi sisa diterima, dan stok harus cukup (barang belum dipakai).
              </div>
            </div>
            <div className="flex justify-end">
              <div className="text-sm">
                <span className="text-slate-500 mr-2">Total Retur:</span>
                <span className="font-bold">
                  {formatCurrency(
                    (returnLines || []).reduce((sum, l) => sum + Number(l.unit_price || 0) * Number(l.return_qty || 0), 0)
                  )}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmOpen(false)} disabled={isProcessing}>Batal</Button>
            <Button onClick={processReturn} disabled={isProcessing}>
                {isProcessing ? 'Memproses...' : 'Proses Retur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
