import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { generateTransactionNumber } from '@/lib/utils';
import { logActivity } from '@/lib/activityLog';
import { Check, Eye, Pencil, Plus, Printer, Search, XCircle } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type PurchaseRequestStatus = 'OPEN' | 'PO_CREATED' | 'CLOSED' | 'CANCELLED';

type PurchaseRequestRow = {
  id: string;
  pr_number: string;
  work_order_id: string;
  status: PurchaseRequestStatus;
  po_id: string | null;
  po_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  work_orders?: any;
};

type PurchaseRequestItemRow = {
  id?: string;
  purchase_request_id?: string;
  line_type: 'PART' | 'JASA';
  goods_id?: string | null;
  job_type_id?: string | null;
  service_name?: string | null;
  brand?: string | null;
  quantity: number;
  notes?: string | null;
};

const normalizeText = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export default function PurchaseRequest() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prs, setPrs] = useState<PurchaseRequestRow[]>([]);
  const [goodsList, setGoodsList] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const [woSearchOpen, setWoSearchOpen] = useState(false);
  const [woSearchQuery, setWoSearchQuery] = useState('');

  const [formData, setFormData] = useState<{ work_order_id: string; notes: string }>({
    work_order_id: '',
    notes: '',
  });

  const [items, setItems] = useState<PurchaseRequestItemRow[]>([]);
  const missingTableWarnedRef = useRef(false);

  const isMissingPurchaseRequestTables = (msg: string) => {
    const m = String(msg || '').toLowerCase();
    return (
      (m.includes('relation') && m.includes('purchase_requests') && m.includes('does not exist')) ||
      (m.includes('relation') && m.includes('purchase_request_items') && m.includes('does not exist')) ||
      (m.includes('could not find the table') && m.includes('purchase_requests')) ||
      (m.includes('schema cache') && m.includes('purchase_requests'))
    );
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      await Promise.all([fetchPRs(), fetchMasterData()]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMasterData() {
    try {
      const supportsColumn = async (table: string, column: string) => {
        const { error } = await supabase.from(table as any).select(column as any).limit(1);
        return !error;
      };

      const [supportsJobValueOnly, supportsPartGoodsId, supportsPartItemCode, supportsPartValueOnly] = await Promise.all([
        supportsColumn('vehicle_entry_jobs', 'value_only'),
        supportsColumn('vehicle_entry_spareparts', 'goods_id'),
        supportsColumn('vehicle_entry_spareparts', 'item_code'),
        supportsColumn('vehicle_entry_spareparts', 'value_only'),
      ]);

      const jobCols = ['job_type_id', 'notes', 'job_types (job_name, job_group)'];
      if (supportsJobValueOnly) jobCols.push('value_only');

      const partCols = ['item_name', 'qty'];
      if (supportsPartGoodsId) partCols.push('goods_id');
      if (supportsPartItemCode) partCols.push('item_code');
      if (supportsPartValueOnly) partCols.push('value_only');

      const [{ data: g, error: gErr }, { data: w, error: wErr }] = await Promise.all([
        supabase.from('goods').select('id, name, unit, item_code'),
        supabase
          .from('work_orders')
          .select(
            `
            id,
            wo_number,
            status,
            vehicle_entries (
              id,
              entry_number,
              vehicles (license_plate, brand_type),
              vehicle_entry_jobs (${jobCols.join(', ')}),
              vehicle_entry_spareparts (${partCols.join(', ')})
            )
          `
          )
          .in('status', ['OPEN', 'IN_PROGRESS', 'COMPLETED']),
      ]);

      if (gErr) throw gErr;
      if (wErr) throw wErr;

      setGoodsList((g as any) || []);
      setWorkOrders((w as any) || []);
    } catch (e: any) {
      toast.error('Gagal memuat data master: ' + (e?.message || e));
      console.error('fetchMasterData error:', e);
    }
  }

  async function fetchPRs() {
    try {
      const { data, error } = await supabase
        .from('purchase_requests' as any)
        .select(
          `
          *,
          work_orders (
            id,
            wo_number,
            vehicle_entries (
              vehicles (license_plate, brand_type)
            )
          )
        `
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPrs(((data as any) || []) as PurchaseRequestRow[]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (isMissingPurchaseRequestTables(msg)) {
        if (!missingTableWarnedRef.current) {
          missingTableWarnedRef.current = true;
          toast.error("Purchase Request belum aktif: tabel 'purchase_requests' belum ada / schema cache belum update. Jalankan migration 20260513_create_purchase_requests.sql lalu refresh schema cache Supabase.");
        }
      } else {
        toast.error('Gagal memuat Purchase Request: ' + msg);
      }
      setPrs([]);
    }
  }

  const selectedWo = useMemo(
    () => workOrders.find((w: any) => String(w.id) === String(formData.work_order_id)) || null,
    [workOrders, formData.work_order_id]
  );

  const selectedWoDisplay = useMemo(() => {
    if (!selectedWo) return null;
    const ve = Array.isArray(selectedWo.vehicle_entries) ? selectedWo.vehicle_entries[0] : selectedWo.vehicle_entries;
    return {
      wo_number: selectedWo.wo_number,
      license_plate: ve?.vehicles?.license_plate || '-',
    };
  }, [selectedWo]);

  const buildItemsFromWo = (wo: any) => {
    const ve = Array.isArray(wo?.vehicle_entries) ? wo.vehicle_entries[0] : wo.vehicle_entries;
    const jobs = Array.isArray(ve?.vehicle_entry_jobs) ? ve.vehicle_entry_jobs : [];
    const parts = Array.isArray(ve?.vehicle_entry_spareparts) ? ve.vehicle_entry_spareparts : [];

    const jobItems: PurchaseRequestItemRow[] = jobs
      .filter((j: any) => !Boolean(j?.value_only))
      .map((j: any) => ({
        line_type: 'JASA',
        job_type_id: String(j.job_type_id || '') || null,
        service_name: String(j.job_types?.job_name || j.notes || '').trim() || null,
        quantity: 1,
        brand: '',
      }))
      .filter((x) => Boolean(x.job_type_id) || Boolean(x.service_name));

    const partItems: PurchaseRequestItemRow[] = parts
      .filter((p: any) => !Boolean(p?.value_only))
      .map((p: any) => {
        const codeNorm = String(p?.item_code || '')
          .toLowerCase()
          .replace(/\s+/g, '')
          .trim();
        const byCode = codeNorm
          ? goodsList.find((g: any) => String(g.item_code || '').toLowerCase().replace(/\s+/g, '').trim() === codeNorm)
          : null;
        const byNameExact = goodsList.find((g: any) => normalizeText(String(g.name || '')) === normalizeText(String(p.item_name || '')));
        const gid = String(p?.goods_id || '') || String(byCode?.id || '');
        const finalGid = gid || String(byNameExact?.id || '');
        return {
          line_type: 'PART',
          goods_id: finalGid || null,
          quantity: Number(p.qty || 1) || 1,
          brand: '',
          notes: p.item_name ? String(p.item_name) : null,
        } as PurchaseRequestItemRow;
      })
      .filter((x) => Boolean(x.goods_id));

    return [...jobItems, ...partItems];
  };

  const resetForm = () => {
    setEditingId(null);
    setIsReadOnly(false);
    setFormData({ work_order_id: '', notes: '' });
    setItems([]);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleOpenWoSearch = () => {
    setWoSearchQuery('');
    setWoSearchOpen(true);
  };

  const handleSelectWo = (wo: any) => {
    setFormData((p) => ({ ...p, work_order_id: wo.id }));
    setWoSearchOpen(false);
    const next = buildItemsFromWo(wo);
    if (next.length === 0) {
      toast.error('Item WO kosong / semua item N/A, tidak bisa buat Purchase Request.');
      setItems([]);
      return;
    }
    setItems(next);
  };

  const handleEdit = async (row: PurchaseRequestRow, readOnly: boolean) => {
    setLoading(true);
    setEditingId(row.id);
    setIsReadOnly(readOnly || row.status !== 'OPEN');
    try {
      const { data: lines, error } = await supabase
        .from('purchase_request_items' as any)
        .select('id, line_type, goods_id, job_type_id, service_name, brand, quantity, notes')
        .eq('purchase_request_id', row.id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      setFormData({
        work_order_id: String(row.work_order_id || ''),
        notes: String(row.notes || ''),
      });
      setItems(((lines as any) || []) as PurchaseRequestItemRow[]);
      setIsDialogOpen(true);
    } catch (e: any) {
      toast.error('Gagal memuat detail Purchase Request: ' + String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = (idx: number, field: keyof PurchaseRequestItemRow, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const cur = next[idx] || ({} as any);
      (next[idx] as any) = { ...cur, [field]: value };
      return next;
    });
  };

  const handleRemoveItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = () => {
    if (!formData.work_order_id) return 'Pilih Work Order.';
    if (items.length === 0) return 'Item request kosong.';
    for (const it of items) {
      if (it.line_type === 'PART' && !it.goods_id) return 'Ada item PART tanpa barang.';
      if (it.line_type === 'JASA' && !it.job_type_id && !String(it.service_name || '').trim()) return 'Ada item JASA tanpa nama.';
      if (!Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0) return 'Qty harus > 0.';
    }
    return '';
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setLoading(true);
    try {
      if (editingId) {
        const { data: cur, error: curErr } = await supabase
          .from('purchase_requests' as any)
          .select('id, status')
          .eq('id', editingId)
          .single();
        if (curErr) throw curErr;
        if (String((cur as any)?.status) !== 'OPEN') {
          toast.error('Purchase Request sudah diproses, tidak bisa diubah.');
          return;
        }

        const { error: upErr } = await supabase
          .from('purchase_requests' as any)
          .update({ notes: formData.notes || null, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (upErr) throw upErr;

        const { error: delErr } = await supabase.from('purchase_request_items' as any).delete().eq('purchase_request_id', editingId);
        if (delErr) throw delErr;

        const payload = items.map((it) => ({
          purchase_request_id: editingId,
          line_type: it.line_type,
          goods_id: it.line_type === 'PART' ? it.goods_id : null,
          job_type_id: it.line_type === 'JASA' ? it.job_type_id : null,
          service_name: it.line_type === 'JASA' ? it.service_name : null,
          brand: it.brand || null,
          quantity: Number(it.quantity) || 0,
          notes: it.notes || null,
        }));
        const { error: insErr } = await supabase.from('purchase_request_items' as any).insert(payload);
        if (insErr) throw insErr;

        if (user) {
          const wo = workOrders.find((w: any) => String(w.id) === String(formData.work_order_id));
          const woNumber = String(wo?.wo_number || '').trim() || null;
          void logActivity({
            user_id: user.id,
            username: user.username,
            role: user.role,
            action: 'UPDATE_PURCHASE_REQUEST',
            module: 'PURCHASE_REQUEST',
            entity_type: 'purchase_requests',
            entity_id: editingId,
            details: `Update Purchase Request${woNumber ? ` • WO ${woNumber}` : ''}`,
            meta: { wo_number: woNumber, items: payload.length },
          });
        }
      } else {
        const prNumber = generateTransactionNumber('PR');
        const { data: pr, error: prErr } = await supabase
          .from('purchase_requests' as any)
          .insert({
            pr_number: prNumber,
            work_order_id: formData.work_order_id,
            status: 'OPEN',
            notes: formData.notes || null,
            created_by: user?.id || null,
          })
          .select('id, pr_number, work_order_id')
          .single();
        if (prErr) throw prErr;

        const prId = String((pr as any).id);
        const payload = items.map((it) => ({
          purchase_request_id: prId,
          line_type: it.line_type,
          goods_id: it.line_type === 'PART' ? it.goods_id : null,
          job_type_id: it.line_type === 'JASA' ? it.job_type_id : null,
          service_name: it.line_type === 'JASA' ? it.service_name : null,
          brand: it.brand || null,
          quantity: Number(it.quantity) || 0,
          notes: it.notes || null,
        }));

        const { error: insErr } = await supabase.from('purchase_request_items' as any).insert(payload);
        if (insErr) throw insErr;

        if (user) {
          const wo = workOrders.find((w: any) => String(w.id) === String(formData.work_order_id));
          const woNumber = String(wo?.wo_number || '').trim() || null;
          void logActivity({
            user_id: user.id,
            username: user.username,
            role: user.role,
            action: 'CREATE_PURCHASE_REQUEST',
            module: 'PURCHASE_REQUEST',
            entity_type: 'purchase_requests',
            entity_id: prId,
            details: `Create Purchase Request ${prNumber}${woNumber ? ` • WO ${woNumber}` : ''}`.trim(),
            meta: { pr_number: prNumber, wo_number: woNumber, items: payload.length },
          });
        }
      }

      toast.success('Purchase Request tersimpan');
      setIsDialogOpen(false);
      resetForm();
      await fetchPRs();
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (isMissingPurchaseRequestTables(msg)) {
        toast.error("Purchase Request belum aktif: jalankan migration 20260513_create_purchase_requests.sql lalu refresh schema cache Supabase.");
      } else {
        toast.error('Gagal menyimpan Purchase Request: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async (row: PurchaseRequestRow) => {
    if (row.status !== 'OPEN') return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('purchase_requests' as any)
        .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
      toast.success('Purchase Request ditutup');
      if (user) {
        const woNumber = String(row.work_orders?.wo_number || '').trim() || null;
        void logActivity({
          user_id: user.id,
          username: user.username,
          role: user.role,
          action: 'CLOSE_PURCHASE_REQUEST',
          module: 'PURCHASE_REQUEST',
          entity_type: 'purchase_requests',
          entity_id: row.id,
          details: `Close Purchase Request ${row.pr_number}${woNumber ? ` • WO ${woNumber}` : ''}`.trim(),
          meta: { pr_number: row.pr_number, wo_number: woNumber },
        });
      }
      await fetchPRs();
    } catch (e: any) {
      toast.error('Gagal menutup Purchase Request: ' + String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handlePrintDotMatrix = (id: string) => {
    window.open(`/print/pr-dot/${id}`, '_blank');
  };

  const filtered = useMemo(() => prs, [prs]);

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Purchase Request / Request Item</CardTitle>
            <div className="text-xs text-slate-500">Request item dari WO (item N/A tidak masuk).</div>
          </div>
          <Button onClick={openCreate} disabled={loading}>
            <Plus className="h-4 w-4 mr-2" />
            Buat Purchase Request
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">No. PR</TableHead>
                  <TableHead className="w-[180px]">No. WO</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="w-[160px]">No. PO</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-sm text-slate-500">
                      Memuat...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-sm text-slate-500">
                      Belum ada data.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => {
                    const ve = Array.isArray(r.work_orders?.vehicle_entries) ? r.work_orders?.vehicle_entries[0] : r.work_orders?.vehicle_entries;
                    const v = ve?.vehicles;
                    const unit = v?.license_plate ? `${v.license_plate} • ${v.brand_type || '-'}` : '-';
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-sm">{r.pr_number}</TableCell>
                        <TableCell className="text-sm">{r.work_orders?.wo_number || '-'}</TableCell>
                        <TableCell className="text-sm">{unit}</TableCell>
                        <TableCell className="text-sm font-semibold">
                          {r.status === 'OPEN' ? 'OPEN' : r.status === 'PO_CREATED' ? 'PROSES PO' : r.status}
                        </TableCell>
                        <TableCell className="text-sm">{r.po_number || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => handlePrintDotMatrix(r.id)}>
                              <Printer className="h-4 w-4 mr-2" />
                              Dot
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleEdit(r, true)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Detail
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleEdit(r, false)} disabled={r.status !== 'OPEN'}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleClose(r)} disabled={r.status !== 'OPEN'}>
                              <XCircle className="h-4 w-4 mr-2" />
                              Close
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(v) => (v ? setIsDialogOpen(true) : (setIsDialogOpen(false), resetForm()))}>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>
              {isReadOnly ? 'Detail Purchase Request' : editingId ? 'Edit Purchase Request' : 'Buat Purchase Request'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Referensi No. WO</Label>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal h-9 px-3"
                onClick={() => {
                  if (isReadOnly || editingId) return;
                  handleOpenWoSearch();
                }}
                disabled={isReadOnly || Boolean(editingId)}
              >
                {selectedWoDisplay ? (
                  <span className="truncate">
                    {selectedWoDisplay.wo_number} • {selectedWoDisplay.license_plate}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Pilih Work Order...</span>
                )}
                <Search className="ml-2 h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                disabled={isReadOnly}
                placeholder="Opsional..."
              />
            </div>
          </div>

          <div className="space-y-2 border rounded-md p-4 bg-slate-50 max-h-[60vh] overflow-y-auto">
            <div className="flex justify-between items-center sticky top-0 bg-slate-50 z-10 pb-2">
              <Label className="text-base font-semibold">Daftar Barang / Jasa</Label>
              <div className="text-xs text-slate-500">{items.length.toLocaleString('id-ID')} item</div>
            </div>

            <Table>
              <TableHeader className="sticky top-[32px] bg-slate-50 z-10">
                <TableRow>
                  <TableHead className="w-[120px]">Tipe</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[120px] text-right">Qty</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-16 text-center text-sm text-slate-500">
                      Belum ada item.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it, idx) => {
                    const goodsName =
                      it.line_type === 'PART'
                        ? goodsList.find((g: any) => String(g.id) === String(it.goods_id))?.name || '-'
                        : '';
                    const serviceLabel =
                      it.line_type === 'JASA'
                        ? String(it.service_name || '').trim() || '-'
                        : '';
                    return (
                      <Fragment key={`${it.line_type}-${it.goods_id || it.job_type_id || idx}`}>
                        <TableRow>
                          <TableCell className="text-xs font-semibold">{it.line_type}</TableCell>
                          <TableCell className="text-sm">
                            {it.line_type === 'PART' ? goodsName : serviceLabel}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text"
                              inputMode="numeric"
                              className="h-9 text-right"
                              value={it.quantity}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                handleItemChange(idx, 'quantity', val ? parseInt(val) : 0);
                              }}
                              disabled={isReadOnly}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {!isReadOnly && (
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-red-500" onClick={() => handleRemoveItem(idx)}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {isReadOnly && <Check className="h-4 w-4 text-slate-300 ml-auto" />}
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <div className="flex-1 flex justify-start gap-2">
              {editingId && (
                <Button variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => handlePrintDotMatrix(editingId)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Cetak Dot Matrix
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={() => (setIsDialogOpen(false), resetForm())}>
              Tutup
            </Button>
            {!isReadOnly && (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? 'Menyimpan...' : 'Simpan'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={woSearchOpen} onOpenChange={setWoSearchOpen}>
        <DialogContent className="sm:max-w-[520px] p-0 gap-0">
          <Command className="rounded-lg border shadow-md">
            <CommandInput placeholder="Cari No. WO atau Nopol..." value={woSearchQuery} onValueChange={(val: string) => setWoSearchQuery(val)} />
            <CommandList className="max-h-[340px] overflow-y-auto">
              <CommandEmpty className="py-6 text-center text-sm">Work Order tidak ditemukan.</CommandEmpty>
              <CommandGroup heading="Work Orders Aktif">
                {workOrders
                  .filter((wo: any) => {
                    const q = woSearchQuery.toLowerCase();
                    const woNumber = String(wo.wo_number || '').toLowerCase();
                    
                    const ve = Array.isArray(wo.vehicle_entries) ? wo.vehicle_entries[0] : wo.vehicle_entries;
                    const entryNumber = String(ve?.entry_number || '').toLowerCase();
                    const licensePlate = String(ve?.vehicles?.license_plate || '').toLowerCase();
                    
                    return woNumber.includes(q) || entryNumber.includes(q) || licensePlate.includes(q);
                  })
                  .map((wo: any) => {
                    const ve = Array.isArray(wo.vehicle_entries) ? wo.vehicle_entries[0] : wo.vehicle_entries;
                    return (
                      <CommandItem
                        key={wo.id}
                        onSelect={() => handleSelectWo(wo)}
                        className="cursor-pointer p-3 hover:bg-slate-100 border-b last:border-0 aria-selected:bg-slate-100"
                      >
                        <div className="flex flex-col w-full gap-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sm">{wo.wo_number}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-green-100 text-green-700">{wo.status}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs text-muted-foreground">
                            <span className="font-medium text-slate-700">{ve?.vehicles?.license_plate || '-'}</span>
                            <span>{ve?.vehicles?.brand_type || '-'}</span>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}

