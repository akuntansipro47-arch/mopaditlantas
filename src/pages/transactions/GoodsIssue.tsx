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

type GoodsIssue = Database['public']['Tables']['goods_issues']['Row'];
type GoodsIssueItem = Database['public']['Tables']['goods_issue_items']['Row'];
type WO = Database['public']['Tables']['work_orders']['Row'];
type VehicleEntry = Database['public']['Tables']['vehicle_entries']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Goods = Database['public']['Tables']['goods']['Row'];

type IssueItemSource = 'ESTIMASI' | 'PO' | 'MANUAL';

type IssueItemForm = {
  goods_id: string;
  quantity: number;
  source: IssueItemSource;
  mismatch: boolean;
  hint: string;
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

const isNameMatch = (a: string, b: string) => {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  return aa.includes(bb) || bb.includes(aa);
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
  
  // Form State
  const [formData, setFormData] = useState({
    issue_date: new Date().toISOString().split('T')[0],
    work_order_id: '',
  });

  // Items State (Dynamic Form)
  const [issueItems, setIssueItems] = useState<IssueItemForm[]>([
    { goods_id: '', quantity: 1, source: 'MANUAL', mismatch: false, hint: '' },
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
    setIssueItems([...issueItems, { goods_id: '', quantity: 1, source: 'MANUAL', mismatch: false, hint: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setIssueItems(issueItems.filter((_, i) => i !== index));
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

  const loadSuggestedItemsForWO = async (wo: WO) => {
    setLoading(true);
    try {
      const suggestions: IssueItemForm[] = [];

      const vehicleEntryId = (wo as any).vehicle_entry_id || '';
      const estItemsAgg = new Map<string, { name: string; qty: number }>();
      if (vehicleEntryId) {
        const { data: estData, error: estErr } = await supabase
          .from('vehicle_entry_spareparts')
          .select('item_name, qty')
          .eq('vehicle_entry_id', vehicleEntryId);
        if (estErr) throw estErr;

        (estData || []).forEach((it: any) => {
          const name = String(it.item_name || '').trim();
          const key = normalizeText(name);
          if (!key) return;
          const prev = estItemsAgg.get(key);
          const qty = Number(it.qty || 0);
          if (prev) prev.qty += qty;
          else estItemsAgg.set(key, { name, qty });
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
            goods (id, name)
          )
        `
        )
        .eq('work_order_id', wo.id)
        .in('status', ['RECEIVED_PART', 'RECEIVED_FULL']);
      if (poErr) throw poErr;

      const poItemsAggByName = new Map<string, { goods_id: string; name: string; qty: number }>();
      (poData || []).forEach((po: any) => {
        const items = Array.isArray(po.purchase_order_items) ? po.purchase_order_items : [];
        items.forEach((it: any) => {
          const g = it.goods;
          const name = String(g?.name || '').trim();
          const goods_id = String(g?.id || '');
          const qty = Number(it.quantity || 0);
          const key = normalizeText(name);
          if (!key || !goods_id) return;
          const prev = poItemsAggByName.get(key);
          if (prev) prev.qty += qty;
          else poItemsAggByName.set(key, { goods_id, name, qty });
        });
      });

      const matchedPoKeys = new Set<string>();

      Array.from(estItemsAgg.values()).forEach((est) => {
        const poMatches = Array.from(poItemsAggByName.values()).filter((p) => isNameMatch(est.name, p.name));
        const poQty = poMatches.reduce((sum, p) => sum + (Number(p.qty) || 0), 0);
        const match = poMatches[0];
        if (match) matchedPoKeys.add(normalizeText(match.name));

        let goodsId = match?.goods_id || '';
        if (!goodsId) {
          const found = goodsList.find((g) => isNameMatch(est.name, g.name));
          goodsId = found?.id || '';
        }

        const mismatch =
          poMatches.length === 0 ||
          (poQty > 0 && Number(est.qty || 0) !== Number(poQty || 0));

        const hint =
          poMatches.length === 0
            ? 'Estimasi tidak ditemukan pada PO yang sudah diterima'
            : Number(est.qty || 0) !== Number(poQty || 0)
              ? `Qty Estimasi (${est.qty}) ≠ Qty PO Diterima (${poQty})`
              : '';

        suggestions.push({
          goods_id: goodsId,
          quantity: Number(est.qty || 0),
          source: 'ESTIMASI',
          mismatch,
          hint,
        });
      });

      Array.from(poItemsAggByName.values()).forEach((po) => {
        const isMatched = Array.from(estItemsAgg.values()).some((e) => isNameMatch(e.name, po.name));
        if (isMatched) return;

        suggestions.push({
          goods_id: po.goods_id,
          quantity: Number(po.qty || 0),
          source: 'PO',
          mismatch: true,
          hint: 'Ada di PO yang sudah diterima, tidak ada di estimasi',
        });
      });

      if (suggestions.length > 0) {
        setIssueItems(suggestions);
        const mismatchCount = suggestions.filter((s) => s.mismatch).length;
        if (mismatchCount > 0) toast.error(`Ada ${mismatchCount} item yang tidak sesuai (Estimasi vs PO)`);
        else toast.success(`${suggestions.length} item dimuat (Estimasi + PO diterima)`);
      } else {
        setIssueItems([{ goods_id: '', quantity: 1, source: 'MANUAL', mismatch: false, hint: '' }]);
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
    setIssueItems(
      issue.items.map((i) => ({
        goods_id: i.goods_id || '',
        quantity: i.quantity,
        source: 'MANUAL',
        mismatch: false,
        hint: '',
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
          if (item.goods_id) {
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);

    try {
      const invalid = issueItems.some((it) => !it.goods_id || Number(it.quantity || 0) <= 0);
      if (invalid) {
        toast.error('Pastikan semua item sudah dipilih dan qty > 0');
        return null;
      }

      let targetIssueId = editingId;

      if (editingId) {
        // --- UPDATE MODE ---
        
        // 1. Restore Old Stock
        const { data: oldItems } = await supabase
          .from('goods_issue_items')
          .select('*')
          .eq('issue_id', editingId);

        if (oldItems) {
           for (const item of oldItems) {
             if (item.goods_id) {
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
      }

      // 4. Insert New Items & Deduct Stock (Common for both)
      if (targetIssueId) {
        const itemsPayload = issueItems.map((item) => ({
          issue_id: targetIssueId,
          goods_id: item.goods_id,
          quantity: Number(item.quantity || 0),
        }));

        const { error: itemsError } = await supabase
          .from('goods_issue_items')
          .insert(itemsPayload);

        if (itemsError) throw itemsError;

        // Deduct Stock
        for (const item of issueItems) {
          if (item.goods_id) {
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

      toast.success(editingId ? 'Data berhasil diperbarui' : 'Pengeluaran barang berhasil dicatat');
      setIsDialogOpen(false);
      setFormData({ issue_date: new Date().toISOString().split('T')[0], work_order_id: '' });
      setIssueItems([{ goods_id: '', quantity: 1, source: 'MANUAL', mismatch: false, hint: '' }]);
      setEditingId(null);
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
    setIssueItems([{ goods_id: '', quantity: 1, source: 'MANUAL', mismatch: false, hint: '' }]);
    setEditingId(null);
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
                                item.source === 'MANUAL' && 'bg-gray-100 text-gray-700 border-gray-200'
                              )}
                            >
                              {item.source === 'ESTIMASI' ? 'Estimasi' : item.source === 'PO' ? 'PO' : 'Manual'}
                            </span>
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
                          className={cn("w-full justify-between text-left font-normal h-8", !item.goods_id && "text-muted-foreground")}
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
                      if (activeItemIndex !== null) {
                        handleItemChange(activeItemIndex, 'goods_id', g.id);
                      }
                      setItemSearchOpen(false);
                      setActiveItemIndex(null);
                    }}
                    className="cursor-pointer p-2 hover:bg-slate-100"
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
                      <span className="text-xs text-muted-foreground">{g.unit} - Stok: {g.current_stock}</span>
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
