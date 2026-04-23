import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Eye, Trash2, ShoppingCart, Pencil, Save, Printer, FileText, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate, generateTransactionNumber } from '@/lib/utils';
import { useRealtimeRefetch } from '@/hooks/useRealtimeRefetch';

type PO = Database['public']['Tables']['purchase_orders']['Row'];
type POItem = Database['public']['Tables']['purchase_order_items']['Row'];
type Supplier = Database['public']['Tables']['suppliers']['Row'];
type Goods = Database['public']['Tables']['goods']['Row'];
type WO = Database['public']['Tables']['work_orders']['Row'];

type POWithDetails = PO & {
  suppliers: Supplier | null;
  work_orders: WO | null; // Optional link
};

const normalizeText = (v: string) =>
  String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export default function PurchaseOrderV2() {
  const [pos, setPos] = useState<POWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  // Master Data
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [goodsList, setGoodsList] = useState<Goods[]>([]);
  const [jobTypes, setJobTypes] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]); // To link PO to WO if needed

  const [poType, setPoType] = useState<'WO' | 'STOCK'>('WO');

  // Form State
  const [formData, setFormData] = useState({
    supplier_id: '',
    work_order_id: 'NONE', // Optional
    po_date: new Date().toISOString().split('T')[0],
  });

  // Items State (Dynamic Form)
  const [poItems, setPoItems] = useState<{
    line_type?: 'PART' | 'JASA';
    goods_id: string;
    job_type_id?: string;
    service_name?: string;
    brand: string;
    quantity: number;
    unit_price: number;
    estimated_name?: string;
    locked_unit_price?: boolean;
    from_work_order?: boolean;
  }[]>([{ line_type: 'PART', goods_id: '', job_type_id: '', service_name: '', brand: '', quantity: 1, unit_price: 0 }]);

  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [jobSearchOpen, setJobSearchOpen] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [activeJobItemIndex, setActiveJobItemIndex] = useState<number | null>(null);

  // Filter State
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of current month
    endDate: new Date().toISOString().split('T')[0] // Today
  });

  // --- Auto-refresh using interval ---
  useEffect(() => {
    // Fetch immediately on mount
    fetchPOs(); 

    // Then, fetch every 5 seconds
    const intervalId = setInterval(() => {
      // console.log('Polling for PO updates...');
      fetchPOs();
    }, 5000); // 5000 milliseconds = 5 seconds

    // Cleanup interval when component unmounts
    return () => {
      clearInterval(intervalId);
    };
  }, [dateFilter]); // Re-run if dateFilter changes

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
    tables: ['suppliers', 'goods', 'work_orders', 'vehicle_entries', 'vehicles', 'vehicle_entry_spareparts', 'vehicle_entry_jobs', 'job_types'],
    enabled: isDialogOpen,
    onRefetch: fetchMasterData,
  });

  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  
  const [woSearchOpen, setWoSearchOpen] = useState(false);
  const [woSearchQuery, setWoSearchQuery] = useState('');

  async function fetchMasterData() {
    const { data: s } = await supabase.from('suppliers').select('*').order('name', { ascending: true });
    setSuppliers(s || []);
    const { data: g } = await supabase.from('goods').select('*').order('name', { ascending: true });
    setGoodsList(g || []);
    const { data: j } = await supabase.from('job_types').select('*').or('is_active.is.null,is_active.eq.true').order('job_name', { ascending: true });
    setJobTypes((j as any[]) || []);
    // Fetch OPEN Work Orders with Vehicle info and estimations
    {
      const { data: w, error: wErr } = await supabase
        .from('work_orders')
        .select(`
          *,
          vehicle_entries (
            id,
            entry_number,
            vehicles (license_plate, brand_type),
            vehicle_entry_jobs (
              job_type_id,
              notes,
              estimated_price,
              value_only,
              job_types (job_name, job_group, selling_price)
            ),
            vehicle_entry_spareparts (goods_id, item_code, item_name, qty, estimated_price, value_only)
          )
        `)
        .in('status', ['OPEN', 'IN_PROGRESS']); // Fetch both OPEN and IN_PROGRESS
      if (!wErr) {
        setWorkOrders(w || []);
      } else {
        const { data: w2, error: w2Err } = await supabase
          .from('work_orders')
          .select(`
            *,
            vehicle_entries (
              id,
              entry_number,
              vehicles (license_plate, brand_type),
              vehicle_entry_jobs (
                job_type_id,
                notes,
                estimated_price,
                job_types (job_name, job_group, selling_price)
              ),
              vehicle_entry_spareparts (item_name, qty, estimated_price)
            )
          `)
          .in('status', ['OPEN', 'IN_PROGRESS']);
        if (w2Err) {
          toast.error('Gagal memuat Work Order: ' + (w2Err.message || wErr.message));
          setWorkOrders([]);
        } else {
          setWorkOrders(w2 || []);
        }
      }
    }
  }

  async function fetchPOs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (*),
          purchase_returns (id),
          work_orders (
            wo_number,
            vehicle_entries (
              vehicles (
                license_plate,
                vehicle_type
              )
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const allPOs = data as any || [];
      
      // Filter Logic: (Date in Range) OR (Status != RECEIVED_FULL)
      // Assuming RECEIVED_FULL is the "Closed" state.
      // And show if not cancelled (unless in range)
      const filtered = allPOs.filter((po: any) => {
        const poDate = po.po_date || po.created_at.split('T')[0];
        const isDateInRange = poDate >= dateFilter.startDate && poDate <= dateFilter.endDate;
        
        // "po yang belum closing saja"
        const isNotClosed = po.status !== 'RECEIVED_FULL' && po.status !== 'CANCELLED' && po.status !== 'RETURNED_FULL';
        
        // Show if (Not Closed) OR (In Date Range)
        // If in date range, show even if closed.
        return isNotClosed || isDateInRange;
      });

      setPos(filtered);
    } catch (error: any) {
      toast.error('Gagal mengambil data PO: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleAddItem = () => {
    setPoItems([...poItems, { line_type: 'PART', goods_id: '', job_type_id: '', service_name: '', brand: '', quantity: 1, unit_price: 0 }]);
  };

  const handleOpenSearch = (index: number) => {
    const it = poItems[index];
    const lt = (it as any)?.line_type || 'PART';
    if (lt === 'JASA') {
      setActiveJobItemIndex(index);
      setJobSearchQuery('');
      setJobSearchOpen(true);
      return;
    }
    setActiveItemIndex(index);
    setItemSearchQuery('');
    setItemSearchOpen(true);
  };

  const handleRemoveItem = (index: number) => {
    setPoItems(poItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...poItems];
    (newItems[index] as any)[field] = value;
    setPoItems(newItems);
  };

  const calculateTotal = () => {
    return poItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const handlePoTypeChange = (type: 'WO' | 'STOCK') => {
    setPoType(type);
    if (type === 'STOCK') {
      setFormData(prev => ({ ...prev, work_order_id: 'NONE' }));
    }
  };

  const resetForm = () => {
    setFormData({ 
      supplier_id: '', 
      work_order_id: 'NONE',
      po_date: new Date().toISOString().split('T')[0]
    });
    setPoItems([{ line_type: 'PART', goods_id: '', job_type_id: '', service_name: '', brand: '', quantity: 1, unit_price: 0 }]);
    setPoType('WO');
    setEditingId(null);
    setIsReadOnly(false);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDateStr = e.target.value;
    const selectedDate = new Date(selectedDateStr);
    const today = new Date();
    const minDate = new Date();
    minDate.setMonth(today.getMonth() - 1);
    
    // Normalize time to midnight for comparison
    today.setHours(23, 59, 59, 999); // End of today
    minDate.setHours(0, 0, 0, 0);

    if (selectedDate < minDate) {
      toast.error('Tanggal PO maksimal mundur 1 bulan dari hari ini');
      return;
    }

    setFormData({ ...formData, po_date: selectedDateStr });
  };

  const handleEdit = async (po: POWithDetails, readOnly: boolean = false) => {
    const hasReturn =
      Array.isArray((po as any).purchase_returns) && (po as any).purchase_returns.length > 0;
    const canEdit =
      po.status === 'ISSUED' ||
      po.status === 'DRAFT' ||
      (hasReturn && po.status !== 'RETURNED_FULL' && po.status !== 'CANCELLED');

    if (!readOnly && !canEdit) {
      toast.error(`PO dengan status ${po.status} tidak dapat diedit.`);
      return;
    }

    setLoading(true);
    setEditingId(po.id);
    setIsReadOnly(readOnly);

    try {
      // Get items
      const { data: items, error } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', po.id);
      
      if (error) throw error;

      // Fill Form
      setFormData({
        supplier_id: po.supplier_id || '',
        work_order_id: po.work_order_id || 'NONE',
        po_date: po.po_date || new Date().toISOString().split('T')[0],
      });
      
      setPoType(po.work_order_id ? 'WO' : 'STOCK');
      
      if (items && items.length > 0) {
        setPoItems(items.map((i: any) => ({
          line_type: (i.line_type || (i.goods_id ? 'PART' : i.job_type_id ? 'JASA' : 'PART')) as any,
          goods_id: i.goods_id || '',
          job_type_id: i.job_type_id || '',
          service_name: i.service_name || '',
          brand: i.brand || '',
          quantity: i.quantity,
          unit_price: i.unit_price || 0
        })));
      } else {
        setPoItems([{ line_type: 'PART', goods_id: '', job_type_id: '', service_name: '', brand: '', quantity: 1, unit_price: 0 }]);
      }
      
      setIsDialogOpen(true);
    } catch (error: any) {
      toast.error('Gagal memuat detail PO: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (poId: string) => {
    // Open dedicated print page
    window.open(`/print/po/${poId}`, '_blank');
    toast.success('Mencetak PO...');
  };

  const handlePrintDotMatrix = (poId: string) => {
    window.open(`/print/po-dot/${poId}`, '_blank');
    toast.success('Mencetak PO (Dot Matrix)...');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Validation
    if (!formData.supplier_id) {
      toast.error('Silakan pilih supplier');
      return;
    }
    if (
      poItems.length === 0 ||
      poItems.some((i: any) => {
        const lt = i.line_type || 'PART';
        if (lt === 'JASA') return (!i.job_type_id && !String(i.service_name || '').trim()) || i.quantity <= 0;
        return !i.goods_id || i.quantity <= 0;
      })
    ) {
      toast.error('Mohon lengkapi daftar barang/jasa (minimal 1 item dengan Qty > 0)');
      return;
    }

    setLoading(true);

    try {
      let targetPoId = editingId;

      if (editingId) {
        // UPDATE Existing PO
        const { error: poError } = await supabase
          .from('purchase_orders')
          .update({
            supplier_id: formData.supplier_id,
            work_order_id: poType === 'WO' && formData.work_order_id !== 'NONE' ? formData.work_order_id : null,
            total_amount: calculateTotal(),
            po_date: formData.po_date,
          })
          .eq('id', editingId);

        if (poError) throw poError;

        // Delete existing items to replace with new ones
        const { error: deleteError } = await supabase
          .from('purchase_order_items')
          .delete()
          .eq('po_id', editingId);

        if (deleteError) throw deleteError;

      } else {
        // CREATE New PO
        const { data: newPO, error: poError } = await supabase
          .from('purchase_orders')
          .insert([{
            po_number: generateTransactionNumber('PO'),
            supplier_id: formData.supplier_id,
            work_order_id: poType === 'WO' && formData.work_order_id !== 'NONE' ? formData.work_order_id : null,
            status: 'ISSUED',
            total_amount: calculateTotal(),
            po_date: formData.po_date,
          }])
          .select()
          .single();
        
        if (poError) throw poError;
        targetPoId = newPO.id;
      }

      // Insert Items (for both Create and Update)
      if (targetPoId) {
        const itemsPayload = poItems.map((item: any) => ({
          po_id: targetPoId,
          line_type: item.line_type || (item.goods_id ? 'PART' : item.job_type_id ? 'JASA' : 'PART'),
          goods_id: (item.line_type || 'PART') === 'JASA' ? null : item.goods_id,
          job_type_id: (item.line_type || 'PART') === 'JASA' ? item.job_type_id : null,
          service_name:
            (item.line_type || 'PART') === 'JASA'
              ? (item.service_name || '')
              : String(
                  item.estimated_name ||
                    goodsList.find((g: any) => String(g.id) === String(item.goods_id))?.name ||
                    ''
                ) || null,
          brand: item.brand || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price
        }));

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(itemsPayload);

        if (itemsError) throw itemsError;
      }

      toast.success(editingId ? 'PO berhasil diperbarui' : 'Purchase Order berhasil dibuat');
      setIsDialogOpen(false);
      resetForm();
      fetchPOs();
      return targetPoId; // Return ID for chaining
    } catch (error: any) {
      toast.error('Gagal menyimpan PO: ' + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const poToDelete = pos.find(p => p.id === id);
    if (poToDelete && (poToDelete.status === 'RECEIVED_FULL' || poToDelete.status === 'RECEIVED_PART' || poToDelete.status === 'RETURNED_FULL')) {
       toast.error('PO yang sudah diterima (sebagian/penuh) tidak dapat dihapus. Gunakan menu Retur Pembelian.');
       return;
    }

    {
      const { data: returns, error: retErr } = await supabase
        .from('purchase_returns')
        .select('id')
        .eq('po_id', id)
        .limit(1);
      if (!retErr && returns && returns.length > 0) {
        toast.error('PO tidak dapat dihapus karena sudah ada transaksi retur pembelian.');
        return;
      }
    }

    if (!confirm('Hapus PO ini? Data yang dihapus tidak dapat dikembalikan.')) return;
    try {
      // 1. Manually delete related records to satisfy FK constraints
      
      // Delete Goods Receipts
      const { data: receipts } = await supabase.from('goods_receipts').select('id').eq('po_id', id);
      if (receipts && receipts.length > 0) {
          const receiptIds = receipts.map(r => r.id);
          await supabase.from('goods_receipt_items').delete().in('receipt_id', receiptIds);
          await supabase.from('goods_receipts').delete().in('id', receiptIds);
      }

      // Delete Purchase Invoices (Fixes "purchase_invoices_po_id_fkey")
      const { data: invoices } = await supabase.from('purchase_invoices').select('id').eq('po_id', id);
      if (invoices && invoices.length > 0) {
          const invoiceIds = invoices.map(i => i.id);
          // Delete invoice items if they exist (assuming table name)
          await supabase.from('purchase_invoice_items').delete().in('invoice_id', invoiceIds);
          // Delete the invoices themselves
          await supabase.from('purchase_invoices').delete().in('id', invoiceIds);
      }

      // 2. Delete PO Items
      await supabase.from('purchase_order_items').delete().eq('po_id', id);

      // 3. Delete PO
      const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
      if (error) throw error;
      
      toast.success('PO dihapus');
      fetchPOs();
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg.includes('purchase_returns_po_id_fkey')) {
        toast.error('PO tidak dapat dihapus karena sudah ada transaksi retur pembelian.');
        return;
      }
      toast.error('Gagal menghapus: ' + msg);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(supplierSearchQuery.toLowerCase()) || 
    (s as any).contact_person?.toLowerCase().includes(supplierSearchQuery.toLowerCase())
  );

  const handleSupplierSelect = (supplier: any) => {
    setFormData({ ...formData, supplier_id: supplier.id });
    setSupplierSearchOpen(false);
  };

  const filteredPOs = pos.filter((item: any) => {
    const searchLower = search.toLowerCase();
    const v = item.work_orders?.vehicle_entries?.vehicles;
    const nopol = v?.license_plate?.toLowerCase() || '';
    return (
      item.po_number.toLowerCase().includes(searchLower) ||
      item.suppliers?.name.toLowerCase().includes(searchLower) ||
      nopol.includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-green-700">Purchase Order (PO) - TES REFRESH</h2>
        <div className="flex gap-2">
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Buat PO Baru
          </Button>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent
            className="sm:max-w-[90vw] h-[90vh] flex flex-col"
            onInteractOutside={(e) => {
              if (supplierSearchOpen || itemSearchOpen || woSearchOpen) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (supplierSearchOpen || itemSearchOpen || woSearchOpen) e.preventDefault();
            }}
            onFocusOutside={(e) => {
              if (supplierSearchOpen || itemSearchOpen || woSearchOpen) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editingId ? (isReadOnly ? 'Detail Purchase Order' : 'Edit Purchase Order') : 'Buat Purchase Order'}</DialogTitle>
              <DialogDescription>{editingId ? (isReadOnly ? 'Lihat detail PO.' : 'Perbarui data Purchase Order.') : 'Pilih supplier dan daftar barang yang akan dibeli.'}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
                {/* PO Type Selection */}
                <div className="flex flex-col space-y-3 border p-3 rounded-md bg-slate-50">
                  <Label>Tipe Pengadaan:</Label>
                  <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-2">
                      <input 
                        type="radio" id="po_wo" name="po_type" 
                        checked={poType === 'WO'} 
                        onChange={() => !isReadOnly && handlePoTypeChange('WO')}
                        disabled={isReadOnly}
                        className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <Label htmlFor="po_wo" className="cursor-pointer font-normal">Berdasarkan WO (Project)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="radio" id="po_stock" name="po_type" 
                        checked={poType === 'STOCK'} 
                        onChange={() => !isReadOnly && handlePoTypeChange('STOCK')}
                        disabled={isReadOnly}
                        className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <Label htmlFor="po_stock" className="cursor-pointer font-normal">Stok Gudang (Umum)</Label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tanggal PO</Label>
                    <Input 
                      type="date" 
                      value={formData.po_date} 
                      onChange={handleDateChange}
                      max={new Date().toISOString().split('T')[0]} 
                      disabled={isReadOnly}
                    />
                    {!isReadOnly && <p className="text-[10px] text-gray-500">* Maksimal mundur 1 bulan</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Supplier</Label>
                    <div className="relative">
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full justify-between text-left font-normal border-lime-200 hover:border-lime-500"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!isReadOnly) setSupplierSearchOpen(true);
                        }}
                        disabled={isReadOnly}
                      >
                        {formData.supplier_id 
                          ? suppliers.find(s => s.id === formData.supplier_id)?.name || 'Pilih Supplier'
                          : 'Pilih Supplier'}
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </div>
                  </div>
                  
                {/* WO Selection Popup */}
                {poType === 'WO' && (
                  <div className="space-y-2">
                    <Label>Referensi No. WO</Label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full justify-between text-left font-normal h-auto py-2"
                      onClick={() => setWoSearchOpen(true)}
                      disabled={isReadOnly}
                    >
                      {formData.work_order_id && formData.work_order_id !== 'NONE'
                        ? (() => {
                            const wo = workOrders.find(w => w.id === formData.work_order_id);
                            return wo ? (
                              <div className="flex flex-col items-start gap-1">
                                <span className="font-bold">{wo.wo_number}</span>
                                <span className="text-xs text-muted-foreground">
                                  {wo.vehicle_entries?.vehicles?.license_plate || '-'} • {wo.vehicle_entries?.vehicles?.brand_type || '-'}
                                </span>
                              </div>
                            ) : <span className="text-muted-foreground">Pilih Work Order...</span>;
                          })()
                        : <span className="text-muted-foreground">Pilih Work Order...</span>}
                      <Search className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </div>
                )}
              </div>

              {/* WO Search Dialog */}
              <Dialog open={woSearchOpen} onOpenChange={setWoSearchOpen}>
                <DialogContent className="sm:max-w-[500px] p-0 gap-0">
                  <Command className="rounded-lg border shadow-md">
                    <CommandInput 
                      placeholder="Cari No. WO atau Nopol..." 
                      value={woSearchQuery}
                      onValueChange={(val: string) => setWoSearchQuery(val)}
                    />
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      <CommandEmpty className="py-6 text-center text-sm">Work Order tidak ditemukan.</CommandEmpty>
                      <CommandGroup heading="Work Orders Aktif">
                        {workOrders
                          .filter((wo: any) => {
                             const searchLower = woSearchQuery.toLowerCase();
                             const woNumber = wo.wo_number?.toLowerCase() || '';
                             const entryNumber = String(wo.vehicle_entries?.entry_number || '').toLowerCase();
                             const licensePlate = wo.vehicle_entries?.vehicles?.license_plate?.toLowerCase() || '';

                             return (
                               woNumber.includes(searchLower) ||
                               entryNumber.includes(searchLower) ||
                               licensePlate.includes(searchLower)
                             );
                          })
                          .map((wo: any) => (
                          <CommandItem
                            key={wo.id}
                            onSelect={() => {
                              setFormData({ ...formData, work_order_id: wo.id });
                              setWoSearchOpen(false);

                              const jobs = wo.vehicle_entries?.vehicle_entry_jobs || [];
                              const jobItems = Array.isArray(jobs)
                                ? jobs
                                    .filter((j: any) => !Boolean((j as any).value_only))
                                    .map((j: any) => ({
                                      line_type: 'JASA' as const,
                                      goods_id: '',
                                      job_type_id: String(j.job_type_id || ''),
                                      service_name: String(j.job_types?.job_name || j.notes || ''),
                                      brand: '',
                                      quantity: 1,
                                      unit_price: (() => {
                                        const epRaw = j.estimated_price;
                                        const ep = Number(epRaw);
                                        if (Number.isFinite(ep) && ep > 0) return ep;
                                        const sp = Number(j.job_types?.selling_price || 0);
                                        if (sp > 0) return sp;
                                        return 0;
                                      })(),
                                      from_work_order: true,
                                      locked_unit_price: false,
                                    }))
                                    .filter((x: any) => (x.job_type_id || String(x.service_name || '').trim()) && Number(x.unit_price || 0) > 0)
                                : [];

                              const parts = wo.vehicle_entries?.vehicle_entry_spareparts || [];
                              const hasGoodsRefColumns =
                                Array.isArray(parts) &&
                                parts.some((p: any) => Object.prototype.hasOwnProperty.call(p, 'goods_id') || Object.prototype.hasOwnProperty.call(p, 'item_code'));
                              const partItems = Array.isArray(parts)
                                ? parts
                                    .filter((p: any) => !Boolean((p as any).value_only))
                                    .map((p: any) => {
                                      const codeNorm = String((p as any).item_code || '')
                                        .toLowerCase()
                                        .replace(/\s+/g, '')
                                        .trim();
                                      const byCode = codeNorm
                                        ? goodsList.find(
                                            (g: any) =>
                                              String(g.item_code || '').toLowerCase().replace(/\s+/g, '').trim() === codeNorm
                                          )
                                        : null;
                                      const byNameExact = goodsList.find(
                                        (g: any) => normalizeText(String(g.name || '')) === normalizeText(String(p.item_name || ''))
                                      );
                                      const gid = String((p as any).goods_id || '') || String(byCode?.id || '');
                                      const finalGid = gid || String(byNameExact?.id || '');
                                      return {
                                        line_type: 'PART' as const,
                                        goods_id: finalGid,
                                        job_type_id: '',
                                        service_name: '',
                                        brand: '',
                                        quantity: p.qty || 1,
                                        unit_price: p.estimated_price || 0,
                                        estimated_name: p.item_name,
                                        from_work_order: true,
                                        locked_unit_price: false,
                                      };
                                    })
                                    .filter((x: any) => {
                                      if (Number(x.unit_price || 0) <= 0) return false;
                                      if (!hasGoodsRefColumns) return true;
                                      return Boolean(x.goods_id);
                                    })
                                : [];

                              const combined = [...jobItems, ...partItems];
                              setPoItems(
                                combined.length > 0
                                  ? combined
                                  : [{ line_type: 'PART', goods_id: '', job_type_id: '', service_name: '', brand: '', quantity: 1, unit_price: 0 }]
                              );
                            }}
                            className="cursor-pointer p-3 hover:bg-slate-100 border-b last:border-0 aria-selected:bg-slate-100"
                          >
                            <div className="flex flex-col w-full gap-1">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-sm">{wo.wo_number}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                    wo.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                    {wo.status}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <span className="font-medium text-slate-700">{wo.vehicle_entries?.vehicles?.license_plate || '-'}</span>
                                <span>{wo.vehicle_entries?.vehicles?.brand_type || '-'}</span>
                              </div>
                              {Array.isArray(wo.vehicle_entries?.vehicle_entry_jobs) && wo.vehicle_entries.vehicle_entry_jobs.length > 0 && (
                                <div className="mt-1 text-[11px] text-slate-700">
                                  <div className="font-semibold text-[10px] text-slate-500 uppercase">Pekerjaan</div>
                                  <div className="space-y-0.5">
                                    {wo.vehicle_entries.vehicle_entry_jobs.slice(0, 3).map((j: any, idx: number) => (
                                      <div key={idx} className="flex items-start gap-2">
                                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold shrink-0">
                                          {j.job_types?.job_group || '-'}
                                        </span>
                                        <span className="truncate">{j.job_types?.job_name || '-'}</span>
                                      </div>
                                    ))}
                                    {wo.vehicle_entries.vehicle_entry_jobs.length > 3 && (
                                      <div className="text-[10px] text-slate-500 italic">
                                        +{wo.vehicle_entries.vehicle_entry_jobs.length - 3} pekerjaan lainnya
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {Array.isArray(wo.vehicle_entries?.vehicle_entry_spareparts) && wo.vehicle_entries.vehicle_entry_spareparts.length > 0 && (
                                <div className="mt-1 text-[11px] text-slate-700">
                                  <div className="font-semibold text-[10px] text-slate-500 uppercase">Sparepart</div>
                                  <div className="space-y-0.5">
                                    {wo.vehicle_entries.vehicle_entry_spareparts.slice(0, 3).map((p: any, idx: number) => (
                                      <div key={idx} className="flex justify-between gap-2">
                                        <span className="truncate">{p.item_name}</span>
                                        <span className="text-slate-500">x{p.qty || 1}</span>
                                      </div>
                                    ))}
                                    {wo.vehicle_entries.vehicle_entry_spareparts.length > 3 && (
                                      <div className="text-[10px] text-slate-500 italic">
                                        +{wo.vehicle_entries.vehicle_entry_spareparts.length - 3} sparepart lainnya
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            {formData.work_order_id === wo.id && <Check className="ml-2 h-4 w-4 text-green-600" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </DialogContent>
              </Dialog>

              <div className="space-y-4 border rounded-md p-4 bg-slate-50">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-semibold">Daftar Barang / Jasa</Label>
                    {!isReadOnly && <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>+ Tambah Item</Button>}
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Jasa/Part</TableHead>
                        <TableHead className="w-[300px]">Barang / Jasa</TableHead>
                        <TableHead className="w-[200px]">Merk / Tipe</TableHead>
                        <TableHead className="w-[100px]">Qty</TableHead>
                        <TableHead className="w-[180px]">Harga Satuan</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Select
                              value={(item as any).line_type || 'PART'}
                              onValueChange={(v: any) => {
                                const next = [...poItems] as any[];
                                const cur = next[index] || {};
                                if (v === 'JASA') {
                                  next[index] = {
                                    ...cur,
                                    line_type: 'JASA',
                                    goods_id: '',
                                    estimated_name: undefined,
                                    brand: '',
                                  };
                                } else {
                                  next[index] = {
                                    ...cur,
                                    line_type: 'PART',
                                    job_type_id: '',
                                    service_name: '',
                                  };
                                }
                                setPoItems(next as any);
                              }}
                              disabled={isReadOnly}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Pilih..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PART">PART</SelectItem>
                                <SelectItem value="JASA">JASA</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button 
                              type="button"
                              variant={(item as any).line_type === 'PART' && !item.goods_id && item.estimated_name ? "secondary" : "outline"}
                              className={cn(
                                "w-full justify-between text-left font-normal", 
                                (item as any).line_type === 'PART' && !item.goods_id && !item.estimated_name && "text-muted-foreground",
                                (item as any).line_type === 'JASA' && !(item as any).job_type_id && "text-muted-foreground",
                                (item as any).line_type === 'PART' && !item.goods_id && item.estimated_name && "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
                              )}
                              onClick={() => handleOpenSearch(index)}
                              disabled={isReadOnly}
                            >
                              <span>
                                {((item as any).line_type || 'PART') === 'JASA'
                                  ? (() => {
                                      const id = String((item as any).job_type_id || '');
                                      const jt = jobTypes.find((j: any) => String(j.id) === id);
                                      const name = String((item as any).service_name || jt?.job_name || '');
                                      return name ? name : 'Klik untuk cari jasa...';
                                    })()
                                  : item.goods_id 
                                    ? (() => {
                                        const g = goodsList.find(g => g.id === item.goods_id);
                                        return g ? `${g.name} (${g.unit})` : "Barang tidak ditemukan";
                                      })()
                                    : item.estimated_name 
                                      ? `Pilih master untuk: ${item.estimated_name}`
                                      : "Klik untuk cari barang..."
                                }
                              </span>
                              <Search className="ml-2 h-4 w-4 opacity-50" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Input 
                              className="h-9" placeholder="Merk/Tipe..."
                              value={item.brand} 
                              onChange={(e) => handleItemChange(index, 'brand', e.target.value)} 
                              disabled={isReadOnly}
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="text" 
                              inputMode="numeric"
                              className="h-9 text-center" 
                              value={item.quantity} 
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                handleItemChange(index, 'quantity', val ? parseInt(val) : 0);
                              }}
                              disabled={isReadOnly}
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="text"
                              inputMode="numeric"
                              className="h-9"
                              value={item.unit_price} 
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                handleItemChange(index, 'unit_price', val ? parseInt(val) : 0);
                              }} 
                              disabled={isReadOnly || Boolean((item as any).locked_unit_price)}
                            />
                          </TableCell>
                          <TableCell>
                            {!isReadOnly && poItems.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleRemoveItem(index)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  <div className="flex justify-end pt-2 border-t">
                    <span className="font-bold">Total: {formatCurrency(calculateTotal())}</span>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex justify-between sm:justify-between w-full">
                <div className="flex gap-2">
                  {isReadOnly && editingId && (
                    <Button type="button" variant="outline" onClick={() => handlePrint(editingId)}>
                      <Printer className="mr-2 h-4 w-4" /> Cetak PO
                    </Button>
                  )}
                  {isReadOnly && editingId && (
                    <Button type="button" variant="outline" onClick={() => handlePrintDotMatrix(editingId)}>
                      <Printer className="mr-2 h-4 w-4" /> Dot Matrix
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {!isReadOnly && (
                    <>
                      <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
                        <Save className="mr-2 h-4 w-4" /> Simpan
                      </Button>
                      <Button type="button" variant="outline" disabled={loading} onClick={async () => {
                        const poId = await handleSubmit();
                        if (poId) {
                          handlePrint(poId);
                        }
                      }}>
                        <Printer className="mr-2 h-4 w-4" /> Simpan & Cetak
                      </Button>
                    </>
                  )}
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Tutup</Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center mb-4">
             <CardTitle>Daftar Purchase Order</CardTitle>
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
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Cari No. PO, Nopol..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
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
                  <TableHead>Tanggal PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Tipe Pengadaan (Project/Stok)</TableHead>
                  <TableHead>Kendaraan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPOs.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center h-24">Tidak ada data PO.</TableCell></TableRow>
                ) : (
                    filteredPOs.map((item: any) => {
                      const v = item.work_orders?.vehicle_entries?.vehicles;
                      const nopol = v?.license_plate || '-';
                      const vGroup = v?.vehicle_type || '';
                      const vText = item.work_order_id ? (vGroup ? `${nopol} (${vGroup})` : nopol) : '-';
                      const hasReturn = Array.isArray((item as any).purchase_returns) && (item as any).purchase_returns.length > 0;
                      const canEdit =
                        item.status === 'ISSUED' ||
                        item.status === 'DRAFT' ||
                        (hasReturn && item.status !== 'RETURNED_FULL' && item.status !== 'CANCELLED');
                      const statusLabel =
                        item.status === 'RETURNED_FULL'
                          ? 'RETUR PENUH'
                          : item.status === 'CANCELLED'
                            ? 'DIBATALKAN'
                            : hasReturn
                              ? 'ADA RETUR'
                              : String(item.status || '').replace('_', ' ');

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.po_number}</TableCell>
                        <TableCell>{formatDate(item.po_date || item.created_at)}</TableCell>
                        <TableCell>{item.suppliers?.name || '-'}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            item.work_order_id ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {item.work_order_id ? 'Project (WO)' : 'Stok Gudang'}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{vText}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            item.status === 'ISSUED' ? 'bg-blue-100 text-blue-800' : 
                            item.status === 'RECEIVED_FULL' ? 'bg-green-100 text-green-800' :
                            item.status === 'RETURNED_FULL' ? 'bg-red-100 text-red-800' :
                            item.status === 'CANCELLED' ? 'bg-gray-200 text-gray-800' :
                            hasReturn ? 'bg-amber-100 text-amber-800' :
                            'bg-gray-100'
                          }`}>
                            {statusLabel}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold">{formatCurrency(item.total_amount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 items-center">
                            <Button variant="outline" size="sm" onClick={() => handlePrint(item.id)} title="Cetak PO">
                              <Printer className="h-4 w-4 mr-1" /> Cetak
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handlePrintDotMatrix(item.id)} title="Cetak Dot Matrix (LX-310)">
                              <Printer className="h-4 w-4 mr-1" /> Dot
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => handleEdit(item, true)} title="Lihat Detail">
                              <Eye className="h-4 w-4 mr-1" /> Detail
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              disabled={!canEdit}
                              className="bg-yellow-600 hover:bg-yellow-700 text-white disabled:opacity-60"
                              onClick={() => handleEdit(item, false)}
                              title={canEdit ? 'Edit PO' : 'PO tidak dapat diedit'}
                            >
                              <Pencil className="h-4 w-4 mr-1" /> Edit
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)} title="Hapus PO">
                              <Trash2 className="h-4 w-4" />
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
                  .slice(0, 50)
                  .map((g) => (
                  <CommandItem
                    key={g.id}
                    onSelect={() => {
                      if (activeItemIndex !== null) {
                        handleItemChange(activeItemIndex, 'line_type', 'PART');
                        handleItemChange(activeItemIndex, 'goods_id', g.id);
                        handleItemChange(activeItemIndex, 'job_type_id', '');
                        handleItemChange(activeItemIndex, 'service_name', '');
                        // Also update selling price if available
                        if (g.selling_price) {
                          handleItemChange(activeItemIndex, 'unit_price', g.selling_price);
                        }
                      }
                      setItemSearchOpen(false);
                      setActiveItemIndex(null);
                    }}
                    className="cursor-pointer p-2 hover:bg-slate-100"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        activeItemIndex !== null && poItems[activeItemIndex]?.goods_id === g.id
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

      <Dialog open={jobSearchOpen} onOpenChange={setJobSearchOpen}>
        <DialogContent className="sm:max-w-[500px] p-0">
          <Command className="rounded-lg border shadow-md">
            <CommandInput
              placeholder="Cari jasa/pekerjaan..."
              value={jobSearchQuery}
              onChange={(e) => setJobSearchQuery(e.target.value)}
            />
            <CommandList>
              <CommandEmpty>Jasa tidak ditemukan.</CommandEmpty>
              <CommandGroup heading="Daftar Jasa / Pekerjaan">
                {jobTypes
                  .filter((j: any) => String(j.job_name || '').toLowerCase().includes(jobSearchQuery.toLowerCase()))
                  .slice(0, 50)
                  .map((j: any) => (
                    <CommandItem
                      key={j.id}
                      onSelect={() => {
                        if (activeJobItemIndex !== null) {
                          handleItemChange(activeJobItemIndex, 'line_type', 'JASA');
                          handleItemChange(activeJobItemIndex, 'job_type_id', j.id);
                          handleItemChange(activeJobItemIndex, 'service_name', j.job_name);
                          handleItemChange(activeJobItemIndex, 'goods_id', '');
                          handleItemChange(activeJobItemIndex, 'estimated_name', undefined);
                          handleItemChange(activeJobItemIndex, 'brand', '');
                          handleItemChange(activeJobItemIndex, 'quantity', 1);
                          handleItemChange(activeJobItemIndex, 'unit_price', Number(j.hpp || 0));
                        }
                        setJobSearchOpen(false);
                        setActiveJobItemIndex(null);
                      }}
                      className="cursor-pointer p-2 hover:bg-slate-100"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          activeJobItemIndex !== null && String((poItems[activeJobItemIndex] as any)?.job_type_id || '') === String(j.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{j.job_name}</span>
                        <span className="text-xs text-muted-foreground">{j.job_group || '-'} • HPP: {formatCurrency(Number(j.hpp || 0))}</span>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Supplier Search Dialog - Radix Modal Sejajar dengan Form PO */}
      <Dialog open={supplierSearchOpen} onOpenChange={setSupplierSearchOpen}>
        <DialogContent className="sm:max-w-[600px] p-0 gap-0" style={{ zIndex: 100000 }}>
          <Command className="rounded-lg border shadow-md">
            <CommandInput
              placeholder="Cari supplier (nama/kontak/telp/kota)..."
              value={supplierSearchQuery}
              onValueChange={(val: string) => setSupplierSearchQuery(val)}
            />
            <CommandList className="max-h-[360px] overflow-y-auto">
              <CommandEmpty className="py-6 text-center text-sm">Supplier tidak ditemukan.</CommandEmpty>
              <CommandGroup heading="Supplier">
                {filteredSuppliers.map((s: any) => (
                  <CommandItem
                    key={s.id}
                    onSelect={() => {
                      handleSupplierSelect(s);
                      setSupplierSearchQuery('');
                    }}
                    className="cursor-pointer p-3 hover:bg-slate-100 border-b last:border-0 aria-selected:bg-slate-100"
                  >
                    <div className="flex flex-col w-full gap-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm">{s.name}</span>
                        <span className="text-[10px] text-muted-foreground">{s.city || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>{s.contact_person || '-'}</span>
                        <span>{s.phone || '-'}</span>
                      </div>
                      {s.address && (
                        <div className="text-[11px] text-slate-600 line-clamp-2">
                          {s.address}
                        </div>
                      )}
                    </div>
                    {formData.supplier_id === s.id && <Check className="ml-2 h-4 w-4 text-green-600" />}
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
