import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Eye, Trash2, PackageMinus, Printer, Pencil, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate } from '@/lib/utils';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check } from 'lucide-react';
import { useRealtimeRefetch } from '@/hooks/useRealtimeRefetch';

type GoodsIssue = Database['public']['Tables']['goods_issues']['Row'];
type GoodsIssueItem = Database['public']['Tables']['goods_issue_items']['Row'];
type WO = Database['public']['Tables']['work_orders']['Row'];
type VehicleEntry = Database['public']['Tables']['vehicle_entries']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Goods = Database['public']['Tables']['goods']['Row'];

type IssueItemSource = 'ESTIMASI' | 'PO' | 'STOK' | 'MANUAL';

type IssueItemForm = {
  goods_id: string;
  quantity: number;
  cap_quantity: number | null;
  issued_quantity: number;
  locked: boolean;
  source: IssueItemSource;
  mismatch: boolean;
  hint: string;
  value_only: boolean;
};

type GoodsIssueWithDetails = GoodsIssue & {
  work_orders: (WO & {
    vehicle_entries: (VehicleEntry & { vehicles: Vehicle | null }) | null
  }) | null;
  items: (GoodsIssueItem & { goods: Goods | null })[];
};

const normalizeText = (v: string) =>
  String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeCompact = (v: string) => normalizeText(v).replace(/\s+/g, '');

const isNameMatch = (a: string, b: string) => {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  const ac = aa.replace(/\s+/g, '');
  const bc = bb.replace(/\s+/g, '');
  if (ac && bc) {
    if (ac === bc) return true;
    if (ac.includes(bc) || bc.includes(ac)) return true;
  }
  return aa.includes(bb) || bb.includes(aa);
};

const nameMatchScore = (a: string, b: string) => {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return 0;
  const ac = normalizeCompact(a);
  const bc = normalizeCompact(b);
  if (ac && bc && ac === bc) return 100;
  if (aa === bb) return 90;
  if (ac && bc && (ac.includes(bc) || bc.includes(ac))) return 60 - Math.min(30, Math.abs(ac.length - bc.length));
  if (aa.includes(bb) || bb.includes(aa)) return 50 - Math.min(25, Math.abs(aa.length - bb.length));
  return 0;
};

const pickBestByName = <T extends { name: string }>(needle: string, candidates: T[]) => {
  let best: T | null = null;
  let bestScore = 0;
  candidates.forEach((c) => {
    const s = nameMatchScore(needle, c.name);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  });
  if (!best || bestScore < 40) return null;
  return best;
};

export default function GoodsIssuePage() {
  const [issues, setIssues] = useState<GoodsIssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // WO Search State
  const [isWOSearchOpen, setIsWOSearchOpen] = useState(false);
  const [woSearchQuery, setWOSearchQuery] = useState('');

  // Master Data
  const [wos, setWos] = useState<WO[]>([]);
  const [goodsList, setGoodsList] = useState<Goods[]>([]);
  const [issuedByGoodsId, setIssuedByGoodsId] = useState<Record<string, { qty: number; lastIssueNumber: string; lastIssueDate: string }>>({});
  
  // Form State
  const [formData, setFormData] = useState({
    issue_date: new Date().toISOString().split('T')[0],
    work_order_id: '',
  });

  // Items State (Dynamic Form)
  const [issueItems, setIssueItems] = useState<IssueItemForm[]>([
    { goods_id: '', quantity: 1, cap_quantity: null, issued_quantity: 0, locked: false, source: 'MANUAL', mismatch: false, hint: '', value_only: false },
  ]);

  // Filter State
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of current month
    endDate: new Date().toISOString().split('T')[0] // Today
  });

  useEffect(() => {
    fetchIssues();
    fetchMasterData();
  }, [dateFilter]);

  useEffect(() => {
    if (isDialogOpen) fetchMasterData();
  }, [isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) return;
    const onFocus = () => fetchMasterData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isDialogOpen]);

  useRealtimeRefetch({
    tables: ['goods', 'work_orders', 'vehicle_entries', 'vehicles'],
    enabled: isDialogOpen,
    onRefetch: fetchMasterData,
  });

  async function fetchMasterData() {
    // Fetch WOs (include COMPLETED so users can issue parts even after WO is closed)
    const { data: w } = await supabase
      .from('work_orders')
      .select('*, vehicle_entries(*, vehicles(*))')
      .in('status', ['OPEN', 'IN_PROGRESS', 'COMPLETED'])
      .order('created_at', { ascending: false })
      .limit(100); // Limit to recent 100 to avoid performance issues
    setWos(w as any || []);

    const { data: g } = await supabase.from('goods').select('*').order('name');
    setGoodsList(g || []);
  }

  async function fetchIssues() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('goods_issues')
        .select(`
          *,
          work_orders (
            wo_number,
            vehicle_entries (
              nota_dinas_number,
              vehicles (license_plate)
            )
          ),
          items:goods_issue_items (
            *,
            goods (name, unit, item_code)
          )
        `)
        .gte('issue_date', dateFilter.startDate)
        .lte('issue_date', dateFilter.endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIssues(data as any || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data barang keluar: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleAddItem = () => {
    setIssueItems((prev) => [...prev, { goods_id: '', quantity: 1, cap_quantity: null, issued_quantity: 0, locked: false, source: 'MANUAL', mismatch: false, hint: '', value_only: false }]);
  };

  const handleRemoveItem = (index: number) => {
    setIssueItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOpenSearch = (index: number) => {
    setActiveItemIndex(index);
    setItemSearchQuery('');
    setItemSearchOpen(true);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...issueItems];
    (newItems[index] as any)[field] = value;
    setIssueItems(newItems);
  };

  const fetchIssuedSummaryForWO = async (workOrderId: string, excludeIssueId?: string | null) => {
    if (!workOrderId) return {} as Record<string, { qty: number; lastIssueNumber: string; lastIssueDate: string }>;

    let rows: any[] | null = null;
    {
      const q = supabase
        .from('goods_issue_items')
        .select(`
          goods_id,
          quantity,
          value_only,
          goods_issues!inner (
            id,
            issue_date,
            issue_number,
            work_order_id
          )
        `)
        .eq('goods_issues.work_order_id', workOrderId);
      const q2 = excludeIssueId ? q.neq('issue_id', excludeIssueId) : q;
      const { data, error } = await q2;
      if (!error) rows = (data as any[]) || [];
    }

    if (!rows) {
      const q = supabase
        .from('goods_issue_items')
        .select(`
          goods_id,
          quantity,
          goods_issues!inner (
            id,
            issue_date,
            issue_number,
            work_order_id
          )
        `)
        .eq('goods_issues.work_order_id', workOrderId);
      const q2 = excludeIssueId ? q.neq('issue_id', excludeIssueId) : q;
      const { data, error } = await q2;
      if (error) throw error;
      rows = (data as any[]) || [];
    }

    const out: Record<string, { qty: number; lastIssueNumber: string; lastIssueDate: string; _t: number }> = {};

    for (const r of rows || []) {
      const goodsId = String((r as any).goods_id || '');
      if (!goodsId) continue;
      if (Boolean((r as any).value_only)) continue;
      const qty = Number((r as any).quantity || 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const gi = (r as any).goods_issues || {};
      const issueDate = String(gi.issue_date || '');
      const issueNumber = String(gi.issue_number || '');
      const t = issueDate ? new Date(issueDate).getTime() : 0;

      const prev = out[goodsId] || { qty: 0, lastIssueNumber: '', lastIssueDate: '', _t: 0 };
      prev.qty += qty;
      if (t >= prev._t) {
        prev._t = t;
        prev.lastIssueDate = issueDate;
        prev.lastIssueNumber = issueNumber;
      }
      out[goodsId] = prev;
    }

    const cleaned: Record<string, { qty: number; lastIssueNumber: string; lastIssueDate: string }> = {};
    Object.entries(out).forEach(([k, v]) => {
      cleaned[k] = { qty: v.qty, lastIssueNumber: v.lastIssueNumber, lastIssueDate: v.lastIssueDate };
    });
    return cleaned;
  };

  const applyIssuedInfo = (it: IssueItemForm, goodsId: string, issuedMap: Record<string, { qty: number; lastIssueNumber: string; lastIssueDate: string }>) => {
    const issued = issuedMap[goodsId]?.qty || 0;
    const lastIssueNumber = issuedMap[goodsId]?.lastIssueNumber || '';
    const lastIssueDate = issuedMap[goodsId]?.lastIssueDate || '';

    const cap = Number.isFinite(Number(it.cap_quantity)) ? Number(it.cap_quantity) : null;
    const remaining = cap !== null ? Math.max(0, cap - issued) : null;
    const locked = cap === null ? issued > 0 : remaining !== null && remaining <= 0;

    const nextQty = cap === null ? (locked ? 0 : it.quantity) : (remaining ?? 0);
    const hintIssued =
      issued > 0
        ? `Sudah keluar: ${issued}${lastIssueDate ? ` (tgl ${formatDate(lastIssueDate)})` : ''}${lastIssueNumber ? ` ${lastIssueNumber}` : ''}`
        : '';

    const hintRemaining = cap !== null ? `Sisa yang bisa keluar: ${remaining}` : '';
    const mergedHint = [it.hint, hintIssued, hintRemaining].filter(Boolean).join(' • ');

    return {
      ...it,
      goods_id: goodsId,
      issued_quantity: issued,
      quantity: nextQty,
      locked,
      hint: mergedHint,
      mismatch: it.mismatch || locked,
    };
  };

  const loadSuggestedItemsForWO = async (wo: WO) => {
    setLoading(true);
    try {
      const suggestions: IssueItemForm[] = [];
      const issuedMap = await fetchIssuedSummaryForWO(String(wo.id), editingId);
      setIssuedByGoodsId(issuedMap);

      const vehicleEntryId = (wo as any).vehicle_entry_id || '';
      const estItemsAgg = new Map<string, { name: string; qty: number; value_only: boolean; goods_id?: string; item_code?: string }>();
      if (vehicleEntryId) {
        let estData: any[] | null = null;
        {
          const { data, error } = await supabase
            .from('vehicle_entry_spareparts')
            .select('goods_id, item_code, item_name, qty, value_only')
            .eq('vehicle_entry_id', vehicleEntryId);
          if (!error) estData = (data as any[]) || [];
          else {
            const { data: fallback, error: fallbackErr } = await supabase
              .from('vehicle_entry_spareparts')
              .select('item_name, qty')
              .eq('vehicle_entry_id', vehicleEntryId);
            if (fallbackErr) throw fallbackErr;
            estData = (fallback as any[]) || [];
          }
        }

        (estData || []).forEach((it: any) => {
          const name = String(it.item_name || '').trim();
          const gid = String(it.goods_id || '').trim();
          const code = String(it.item_code || '').trim();
          const key = gid ? `gid:${gid}` : code ? `code:${normalizeText(code).replace(/\\s+/g, '')}` : `name:${normalizeText(name)}`;
          if (!key) return;
          const prev = estItemsAgg.get(key);
          const qty = Number(it.qty || 0);
          const vo = Boolean((it as any).value_only);
          if (prev) {
            prev.qty += qty;
            prev.value_only = prev.value_only || vo;
            if (!prev.goods_id && gid) prev.goods_id = gid;
            if (!prev.item_code && code) prev.item_code = code;
          } else {
            estItemsAgg.set(key, { name, qty, value_only: vo, goods_id: gid || undefined, item_code: code || undefined });
          }
        });
      }

      const { data: poData, error: poErr } = await supabase
        .from('purchase_orders')
        .select(
          `
          id,
          po_number,
          status,
          purchase_order_items (
            quantity,
            goods (id, item_code, name)
          )
        `
        )
        .eq('work_order_id', wo.id)
        .in('status', ['RECEIVED_PART', 'RECEIVED_FULL']);
      if (poErr) throw poErr;

      const poItemsAggByName = new Map<string, { goods_id: string; item_code: string; name: string; qty: number }>();
      (poData || []).forEach((po: any) => {
        const items = Array.isArray(po.purchase_order_items) ? po.purchase_order_items : [];
        items.forEach((it: any) => {
          const g = it.goods;
          const name = String(g?.name || '').trim();
          const goods_id = String(g?.id || '');
          const item_code = String(g?.item_code || '').trim();
          const qty = Number(it.quantity || 0);
          const key = normalizeText(name);
          if (!key || !goods_id) return;
          const prev = poItemsAggByName.get(key);
          if (prev) prev.qty += qty;
          else poItemsAggByName.set(key, { goods_id, item_code, name, qty });
        });
      });

      const matchedPoKeys = new Set<string>();

      Array.from(estItemsAgg.values()).forEach((est) => {
        const estGid = String(est.goods_id || '').trim();
        const estCode = String(est.item_code || '').trim();

        const poMatches = Array.from(poItemsAggByName.values()).filter((p) => {
          if (estGid) return String(p.goods_id || '') === estGid;
          if (estCode) {
            return normalizeText(String(p.item_code || '')).replace(/\s+/g, '') === normalizeText(estCode).replace(/\s+/g, '');
          }
          return false;
        });
        const poQty = poMatches.reduce((sum, p) => sum + (Number(p.qty) || 0), 0);
        const match = poMatches[0] || null;
        if (match) matchedPoKeys.add(normalizeText(match.name));

        let goodsId = estGid || match?.goods_id || '';
        const matchedGood = (() => {
          if (goodsId) return goodsList.find((g) => g.id === goodsId) || null;
          if (estCode) {
            return (
              goodsList.find(
                (g) =>
                  normalizeText(String((g as any).item_code || '')).replace(/\s+/g, '') ===
                  normalizeText(estCode).replace(/\s+/g, '')
              ) || null
            );
          }
          return null;
        })();

        if (!goodsId && matchedGood?.id) goodsId = matchedGood.id;

        // --- FIX: Smart match by name if ID is missing ---
        if (!goodsId && est.name) {
          const bestMatch = pickBestByName(est.name, goodsList);
          if (bestMatch) {
            goodsId = bestMatch.id;
          }
        }
        // --- END FIX ---

        const estQty = Number(est.qty || 0);
        const stock = Number(matchedGood?.current_stock || 0);
        const isInventory = String(matchedGood?.item_type || '').toUpperCase() === 'PERSEDIAAN';

        let mismatch = false;
        let hint = '';
        let source: IssueItemSource = 'ESTIMASI';

        if (est.value_only) {
          suggestions.push({
            goods_id: goodsId,
            quantity: estQty,
            cap_quantity: null,
            issued_quantity: 0,
            locked: false,
            source: 'ESTIMASI',
            mismatch: false,
            hint: 'Nilai saja (tidak mengurangi stok)',
            value_only: true,
          });
          return;
        }

        if (!goodsId) {
          mismatch = true;
          hint = `Estimasi belum terhubung ke Kode Barang. Silakan pilih barang sesuai estimasi: ${est.name}`;
        } else if (poMatches.length === 0) {
          mismatch = true;
          hint = 'Belum ada PO diterima untuk barang ini';
        } else if (poQty > 0 && estQty !== Number(poQty || 0)) {
          mismatch = true;
          hint = `Qty Estimasi (${estQty}) ≠ Qty PO Diterima (${poQty})`;
        }

        const base: IssueItemForm = {
          goods_id: goodsId,
          quantity: estQty,
          cap_quantity: estQty,
          issued_quantity: 0,
          locked: false,
          source,
          mismatch,
          hint,
          value_only: false,
        };
        suggestions.push(goodsId ? applyIssuedInfo(base, goodsId, issuedMap) : base);
      });

      Array.from(poItemsAggByName.values()).forEach((po) => {
        const isMatched = Array.from(estItemsAgg.values()).some((e) => {
          const eg = String(e.goods_id || '').trim();
          if (eg) return eg === String(po.goods_id || '');
          const ec = String(e.item_code || '').trim();
          if (ec) return normalizeText(String(po.item_code || '')).replace(/\s+/g, '') === normalizeText(ec).replace(/\s+/g, '');
          return false;
        });
        if (isMatched) return;

        const poQty = Number(po.qty || 0);
        const base: IssueItemForm = {
          goods_id: po.goods_id,
          quantity: poQty,
          cap_quantity: poQty,
          issued_quantity: 0,
          locked: false,
          source: 'PO',
          mismatch: true,
          hint: 'Ada di PO yang sudah diterima, tidak ada di estimasi',
          value_only: false,
        };
        suggestions.push(po.goods_id ? applyIssuedInfo(base, po.goods_id, issuedMap) : base);
      });

      if (suggestions.length > 0) {
        setIssueItems(suggestions);
        const mismatchCount = suggestions.filter((s) => s.mismatch).length;
        if (mismatchCount > 0) toast.warning(`Ada ${mismatchCount} item yang tidak sesuai (Estimasi vs PO)`);
        else toast.success(`${suggestions.length} item dimuat (Estimasi + PO diterima)`);
      } else {
        setIssueItems([{ goods_id: '', quantity: 1, cap_quantity: null, issued_quantity: 0, locked: false, source: 'MANUAL', mismatch: false, hint: '', value_only: false }]);
        toast.info('Tidak ada item estimasi/PO diterima untuk WO ini.');
      }
    } catch (e: any) {
      toast.error('Gagal memuat item dari estimasi/PO: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (issue: GoodsIssueWithDetails) => {
    setEditingId(issue.id);
    setFormData({
      issue_date: issue.issue_date,
      work_order_id: issue.work_order_id || '',
    });
    fetchIssuedSummaryForWO(String(issue.work_order_id || ''), String(issue.id)).then(setIssuedByGoodsId).catch(() => setIssuedByGoodsId({}));
    setIssueItems(
      issue.items.map((i) => ({
        goods_id: i.goods_id || '',
        quantity: i.quantity,
        cap_quantity: null,
        issued_quantity: 0,
        locked: false,
        source: 'MANUAL',
        mismatch: false,
        hint: '',
        value_only: Boolean((i as any).value_only),
      }))
    );
    setIsDialogOpen(true);
  };

  const handlePrint = (id: string) => {
    window.open(`/print/issue/${id}`, '_blank');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Hapus data pengeluaran ini? Stok akan dikembalikan.')) return;
    setLoading(true);
    try {
      // 1. Get items to restore stock
      const { data: items } = await supabase
        .from('goods_issue_items')
        .select('*')
        .eq('issue_id', id);
      
      if (items) {
        for (const item of items) {
          if (item.goods_id && !Boolean((item as any).value_only)) {
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
        }
        // Delete items manually
        await supabase.from('goods_issue_items').delete().eq('issue_id', id);
      }

      // 2. Delete Issue
      const { error } = await supabase.from('goods_issues').delete().eq('id', id);
      if (error) throw error;

      toast.success('Data dihapus dan stok dikembalikan');
      fetchIssues();
      fetchMasterData();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    } finally {
      setLoading(false);
    }
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

  const fetchHppSparepartAccount = async () => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .eq('category', 'HPP')
      .or('account_name.ilike.%sparepart%,account_name.ilike.%persediaan%,account_name.ilike.%hpp%')
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) return data;
    const { data: data2 } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .eq('category', 'HPP')
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data2 || null;
  };

  const fetchLastPoPriceMap = async (goodsIds: string[]) => {
    const map: Record<string, number> = {};
    if (goodsIds.length === 0) return map;
    const { data } = await supabase
      .from('purchase_order_items')
      .select('goods_id, unit_price, created_at')
      .in('goods_id', goodsIds)
      .order('created_at', { ascending: false });
    (data || []).forEach((it: any) => {
      const gid = String(it.goods_id || '');
      if (!gid) return;
      if (map[gid] !== undefined) return;
      map[gid] = Number(it.unit_price || 0);
    });
    return map;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);

    try {
      if (issueItems.some((it) => it.value_only)) {
        const { error: colErr } = await supabase
          .from('goods_issue_items')
          .select('value_only')
          .limit(1);
        if (colErr) {
          toast.error("DB belum siap: kolom 'value_only' belum ada. Jalankan migration 20260331_add_value_only_flags.sql di Supabase.");
          return null;
        }
      }

      const itemsToSubmit = (issueItems || [])
        .map((it) => ({ ...it, quantity: Number(it.quantity || 0) }))
        .filter((it) => it.goods_id && it.quantity > 0);

      if (itemsToSubmit.length === 0) {
        toast.error('Isi minimal 1 qty barang keluar.');
        return null;
      }

      const invalid = itemsToSubmit.some((it) => !it.goods_id || Number(it.quantity || 0) <= 0);
      if (invalid) {
        toast.error('Pastikan semua item sudah dipilih dan qty > 0');
        return null;
      }

      const issuedMap = await fetchIssuedSummaryForWO(String(formData.work_order_id || ''), editingId);
      const offenders: string[] = [];

      const oldQtyByGoodsId: Record<string, number> = {};
      if (editingId) {
        const { data: old } = await supabase
          .from('goods_issue_items')
          .select('goods_id, quantity, value_only')
          .eq('issue_id', editingId);
        (old || []).forEach((x: any) => {
          const gid = String(x?.goods_id || '');
          if (!gid) return;
          if (Boolean(x?.value_only)) return;
          oldQtyByGoodsId[gid] = (oldQtyByGoodsId[gid] || 0) + Number(x?.quantity || 0);
        });
      }

      for (const it of itemsToSubmit) {
        if (!it.goods_id) continue;
        if (Boolean(it.value_only)) continue;
        const issued = Number(issuedMap[it.goods_id]?.qty || 0);
        const cap = Number.isFinite(Number(it.cap_quantity)) ? Number(it.cap_quantity) : null;
        const qty = Number(it.quantity || 0);

        const oldQty = Number(oldQtyByGoodsId[it.goods_id] || 0);
        const delta = qty - oldQty;
        if (editingId && delta <= 0) continue;

        if (cap === null) {
          if (issued > 0 && qty > 0) {
            const gName = goodsList.find((g) => g.id === it.goods_id)?.name || it.goods_id;
            offenders.push(`${gName} (sudah keluar ${issued})`);
          }
        } else {
          if (issued + qty > cap + 0.0001) {
            const gName = goodsList.find((g) => g.id === it.goods_id)?.name || it.goods_id;
            offenders.push(`${gName} (maks ${cap}, sudah ${issued})`);
          }
        }
      }
      if (offenders.length > 0) {
        toast.error(`Barang sudah pernah keluar untuk WO ini atau melebihi sisa: ${offenders.slice(0, 5).join(', ')}${offenders.length > 5 ? '…' : ''}`);
        return null;
      }

      let targetIssueId = editingId;
      let issueNumber = '';

      if (editingId) {
        // --- UPDATE MODE ---
        
        // 1. Restore Old Stock
        const { data: oldItems } = await supabase
          .from('goods_issue_items')
          .select('*')
          .eq('issue_id', editingId);

        if (oldItems) {
           for (const item of oldItems) {
             if (item.goods_id && !Boolean((item as any).value_only)) {
               const { data: g } = await supabase.from('goods').select('current_stock').eq('id', item.goods_id).single();
               if (g) {
                 await supabase.from('goods').update({ current_stock: (g.current_stock || 0) + item.quantity }).eq('id', item.goods_id);
               }
             }
           }
        }

        // 2. Delete Old Items
        await supabase.from('goods_issue_items').delete().eq('issue_id', editingId);

        // 3. Update Header
        const { error: headerError } = await supabase
          .from('goods_issues')
          .update({
            work_order_id: formData.work_order_id,
            issue_date: formData.issue_date,
          })
          .eq('id', editingId);
        
        if (headerError) throw headerError;
        const { data: head } = await supabase.from('goods_issues').select('issue_number').eq('id', editingId).maybeSingle();
        issueNumber = String(head?.issue_number || '');

      } else {
        // --- CREATE MODE ---
        const { data: newIssue, error: issueError } = await supabase
          .from('goods_issues')
          .insert([{
            issue_number: `GI-${Date.now()}`,
            work_order_id: formData.work_order_id,
            issue_date: formData.issue_date,
          }])
          .select()
          .single();
        
        if (issueError) throw issueError;
        targetIssueId = newIssue.id;
        issueNumber = String(newIssue.issue_number || '');
      }

      // 4. Insert New Items & Deduct Stock (Common for both)
      if (targetIssueId) {
        const itemsPayload = itemsToSubmit.map((item) => ({
          issue_id: targetIssueId,
          goods_id: item.goods_id,
          quantity: Number(item.quantity || 0),
          value_only: Boolean(item.value_only),
        }));

        const { error: itemsError } = await supabase
          .from('goods_issue_items')
          .insert(itemsPayload);

        if (itemsError) throw itemsError;

        // Deduct Stock
        for (const item of itemsToSubmit) {
          if (item.goods_id && !item.value_only) {
             const { data: currentGood } = await supabase
               .from('goods')
               .select('current_stock')
               .eq('id', item.goods_id)
               .single();
              
             if (currentGood) {
               await supabase
                 .from('goods')
                  .update({ current_stock: (currentGood.current_stock || 0) - Number(item.quantity || 0) })
                 .eq('id', item.goods_id);
             }
          }
        }
      }

      if (targetIssueId) {
        await supabase.from('journal_entries').delete().eq('reference', targetIssueId);

        const nonValueItems = issueItems
          .filter((it) => Boolean(it.goods_id) && !Boolean(it.value_only))
          .map((it) => ({ goods_id: String(it.goods_id), quantity: Number(it.quantity || 0) }))
          .filter((it) => it.goods_id && it.quantity > 0);

        if (nonValueItems.length > 0) {
          const goodsIds = Array.from(new Set(nonValueItems.map((it) => it.goods_id)));
          const { data: goodsRows } = await supabase.from('goods').select('id, item_type').in('id', goodsIds);
          const goodsTypeById = new Map<string, string>();
          (goodsRows || []).forEach((g: any) => goodsTypeById.set(String(g.id), String(g.item_type || '')));

          const persItems = nonValueItems.filter((it) => String(goodsTypeById.get(it.goods_id) || '').toUpperCase() === 'PERSEDIAAN');
          if (persItems.length > 0) {
            const persAcc = await fetchPersediaanAccount();
            if (!persAcc) throw new Error('Akun Persediaan tidak ditemukan di COA.');
            const hppAcc = await fetchHppSparepartAccount();
            if (!hppAcc) throw new Error('Akun HPP (Sparepart/Persediaan) tidak ditemukan di COA.');

            const priceMap = await fetchLastPoPriceMap(persItems.map((it) => it.goods_id));
            const totalCost = persItems.reduce((sum, it) => sum + (Number(priceMap[it.goods_id] || 0) * it.quantity), 0);

            if (totalCost > 0) {
              const woNumber = wos.find((w) => w.id === formData.work_order_id)?.wo_number || '';
              const { data: entry, error: entryErr } = await supabase
                .from('journal_entries')
                .insert([{
                  entry_date: formData.issue_date,
                  voucher_no: issueNumber || `GI-${Date.now()}`,
                  description: `Barang Keluar ${issueNumber || ''} ${woNumber ? `(${woNumber})` : ''}`.trim(),
                  entry_type: 'JOURNAL',
                  total_amount: totalCost,
                  reference: targetIssueId,
                }])
                .select()
                .single();
              if (entryErr) throw entryErr;

              const { error: itemsErr2 } = await supabase.from('journal_entry_items').insert([
                {
                  journal_entry_id: entry.id,
                  account_id: hppAcc.id,
                  debit: totalCost,
                  credit: 0,
                  description: 'HPP Persediaan',
                },
                {
                  journal_entry_id: entry.id,
                  account_id: persAcc.id,
                  debit: 0,
                  credit: totalCost,
                  description: 'Pengurangan Persediaan',
                },
              ]);
              if (itemsErr2) throw itemsErr2;
            }
          }
        }
      }

      toast.success(editingId ? 'Data berhasil diperbarui' : 'Pengeluaran barang berhasil dicatat');
      setIsDialogOpen(false);
      setFormData({ issue_date: new Date().toISOString().split('T')[0], work_order_id: '' });
      setIssueItems([{ goods_id: '', quantity: 1, cap_quantity: null, issued_quantity: 0, locked: false, source: 'MANUAL', mismatch: false, hint: '', value_only: false }]);
      setEditingId(null);
      setIssuedByGoodsId({});
      fetchIssues();
      fetchMasterData();
      return targetIssueId;
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const filteredIssues = issues.filter(i => 
    i.issue_number.toLowerCase().includes(search.toLowerCase()) ||
    i.work_orders?.wo_number.toLowerCase().includes(search.toLowerCase()) ||
    i.work_orders?.vehicle_entries?.vehicles?.license_plate.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setFormData({ issue_date: new Date().toISOString().split('T')[0], work_order_id: '' });
    setIssueItems([{ goods_id: '', quantity: 1, cap_quantity: null, issued_quantity: 0, locked: false, source: 'MANUAL', mismatch: false, hint: '', value_only: false }]);
    setEditingId(null);
    setIssuedByGoodsId({});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Barang Keluar / Sparepart</h2>
        <div className="flex gap-2">
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Catat Barang Keluar
          </Button>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Pengeluaran Barang' : 'Pengeluaran Barang Baru'}</DialogTitle>
              <DialogDescription>{editingId ? 'Edit data pengeluaran dan sesuaikan stok.' : 'Keluarkan sparepart untuk Work Order tertentu.'}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tanggal Keluar</Label>
                    <Input type="date" value={formData.issue_date} onChange={(e) => setFormData({...formData, issue_date: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Untuk Work Order (WO)</Label>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between font-normal",
                        !formData.work_order_id && "text-muted-foreground"
                      )}
                      onClick={(e) => { e.preventDefault(); setIsWOSearchOpen(true); }}
                    >
                      {formData.work_order_id
                        ? (() => {
                            const w = wos.find(w => w.id === formData.work_order_id);
                            return w ? `${w.wo_number} - ${(w as any).vehicle_entries?.vehicles?.license_plate}` : "WO tidak ditemukan";
                          })()
                        : "Cari Work Order..."}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </div>
                </div>

                {/* WO Search Dialog */}
                <Dialog open={isWOSearchOpen} onOpenChange={setIsWOSearchOpen}>
                  <DialogContent className="sm:max-w-[600px] p-0">
                    <Command>
                      <CommandInput 
                        placeholder="Cari No. WO atau Nopol..." 
                        value={woSearchQuery} 
                        onChange={(e) => setWOSearchQuery(e.target.value)} 
                      />
                      <CommandList>
                        <CommandEmpty>Work Order tidak ditemukan.</CommandEmpty>
                        <CommandGroup heading="Daftar WO (Open / In Progress)">
                          {wos
                            .filter(w => 
                              w.wo_number.toLowerCase().includes(woSearchQuery.toLowerCase()) ||
                              (w as any).vehicle_entries?.vehicles?.license_plate.toLowerCase().includes(woSearchQuery.toLowerCase())
                            )
                            .map(w => (
                              <CommandItem
                                key={w.id}
                                onSelect={async () => {
                                  setFormData({...formData, work_order_id: w.id});
                                  setIsWOSearchOpen(false);

                                  await loadSuggestedItemsForWO(w);
                                }}
                              >
                                <div className="flex flex-col w-full">
                                  <div className="flex justify-between">
                                    <span className="font-bold">{w.wo_number}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${w.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                      {w.status.replace('_', ' ')}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{(w as any).vehicle_entries?.vehicles?.license_plate}</span>
                                    <span>{formatDate(w.work_date)}</span>
                                  </div>
                                </div>
                                {formData.work_order_id === w.id && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </DialogContent>
                </Dialog>

                <div className="space-y-4 border rounded-md p-4 bg-slate-50">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-semibold">Daftar Sparepart</Label>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>+ Tambah Item</Button>
                  </div>

                  {issueItems.some((it) => it.mismatch) && (
                    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                      Ada item yang tidak sesuai antara Estimasi dan PO (yang sudah diterima). Item tersebut ditandai merah.
                    </div>
                  )}
                  
                  {issueItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-8 space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Barang</Label>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'text-[10px] px-2 py-0.5 rounded-full border',
                                item.source === 'ESTIMASI' && 'bg-slate-100 text-slate-700 border-slate-200',
                                item.source === 'PO' && 'bg-blue-100 text-blue-800 border-blue-200',
                                item.source === 'STOK' && 'bg-emerald-100 text-emerald-800 border-emerald-200',
                                item.source === 'MANUAL' && 'bg-gray-100 text-gray-700 border-gray-200'
                              )}
                            >
                              {item.source === 'ESTIMASI' ? 'Estimasi' : item.source === 'PO' ? 'PO' : item.source === 'STOK' ? 'Stok' : 'Manual'}
                            </span>
                            {item.value_only && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                                Nilai saja
                              </span>
                            )}
                            {item.mismatch && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                                Tidak sesuai
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={item.locked}
                          className={cn(
                            "w-full justify-between text-left font-normal h-8",
                            !item.goods_id && "text-muted-foreground",
                            item.locked && "opacity-70 cursor-not-allowed"
                          )}
                          onClick={() => handleOpenSearch(index)}
                        >
                          <span className="truncate">
                            {item.goods_id
                              ? (() => {
                                  const g = goodsList.find(g => g.id === item.goods_id);
                                  return g ? `${g.name} (Stok: ${g.current_stock})` : "Barang tidak ditemukan";
                                })()
                              : "Pilih Barang..."}
                          </span>
                          <Search className="ml-2 h-3 w-3 opacity-50" />
                        </Button>
                        {item.hint && (
                          <div className={cn('text-[11px]', item.mismatch ? 'text-red-600' : 'text-slate-500')}>
                            {item.hint}
                          </div>
                        )}
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-xs">Qty</Label>
                        <Input 
                          type="text" 
                          inputMode="numeric"
                          className="h-8 text-center" 
                          value={item.quantity} 
                          disabled={item.locked}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            handleItemChange(index, 'quantity', val ? parseInt(val) : 0);
                          }}
                        />
                      </div>
                      <div className="col-span-1">
                        {issueItems.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleRemoveItem(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter className="flex justify-between sm:justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                  <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                    <Save className="mr-2 h-4 w-4" /> Simpan
                  </Button>
                  <Button type="button" variant="secondary" disabled={loading} onClick={async (e) => {
                    const id = await handleSubmit(e);
                    if (id && typeof id === 'string') handlePrint(id);
                  }}>
                    <Printer className="mr-2 h-4 w-4" /> Simpan & Cetak
                  </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Riwayat Barang Keluar</CardTitle>
            <div className="flex items-center gap-2">
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
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Cari No. Issue / WO / Nopol..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Issue</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No. WO</TableHead>
                  <TableHead>Kendaraan</TableHead>
                  <TableHead>Jml Item</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIssues.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24">Tidak ada data barang keluar.</TableCell></TableRow>
                ) : (
                  filteredIssues.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.issue_number}</TableCell>
                      <TableCell>{formatDate(item.issue_date)}</TableCell>
                      <TableCell>{item.work_orders?.wo_number || '-'}</TableCell>
                      <TableCell>{item.work_orders?.vehicle_entries?.vehicles?.license_plate || '-'}</TableCell>
                      <TableCell>{item.items?.length || 0} Item</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => handlePrint(item.id)} title="Cetak">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => handleEdit(item)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)} title="Hapus">
                            <Trash2 className="h-4 w-4" />
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
      {/* Item Search Dialog */}
      <Dialog open={itemSearchOpen} onOpenChange={setItemSearchOpen}>
        <DialogContent className="sm:max-w-[500px] p-0">
          <Command className="rounded-lg border shadow-md">
            <CommandInput 
              placeholder="Cari nama barang..." 
              value={itemSearchQuery}
              onChange={(e) => setItemSearchQuery(e.target.value)}
            />
            <CommandList>
              <CommandEmpty>Barang tidak ditemukan.</CommandEmpty>
              <CommandGroup heading="Daftar Barang">
                {goodsList
                  .filter(g => g.name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                  .map((g) => (
                  <CommandItem
                    key={g.id}
                    onSelect={() => {
                      const issued = Number(issuedByGoodsId[g.id]?.qty || 0);
                      if (issued > 0 && !editingId) {
                        toast.error(`Barang ini sudah pernah keluar untuk WO ini (qty ${issued}). Pilih barang lain.`);
                        return;
                      }
                      if (activeItemIndex !== null) {
                        setIssueItems((prev) => {
                          const next = [...prev];
                          const current = next[activeItemIndex];
                          const base: IssueItemForm = {
                            ...current,
                            goods_id: g.id,
                            cap_quantity: null,
                            source: current.source || 'MANUAL',
                          };
                          next[activeItemIndex] = applyIssuedInfo(base, g.id, issuedByGoodsId);
                          return next;
                        });
                      }
                      setItemSearchOpen(false);
                      setActiveItemIndex(null);
                    }}
                    className={cn(
                      "cursor-pointer p-2 hover:bg-slate-100",
                      formData.work_order_id && issuedByGoodsId[g.id]?.qty ? "opacity-60" : ""
                    )}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        activeItemIndex !== null && issueItems[activeItemIndex]?.goods_id === g.id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {g.unit} - Stok: {g.current_stock}
                        {formData.work_order_id && issuedByGoodsId[g.id]?.qty ? ` • Sudah keluar: ${issuedByGoodsId[g.id]?.qty}` : ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}