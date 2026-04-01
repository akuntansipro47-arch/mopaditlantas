import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Eye, Trash2, ShoppingCart, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from '@/lib/utils';
import { Checkbox } from "@/components/ui/checkbox";
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

export default function PurchaseOrderNew() {
  const [pos, setPos] = useState<POWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  // Master Data
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [goodsList, setGoodsList] = useState<Goods[]>([]);
  const [workOrders, setWorkOrders] = useState<WO[]>([]); // To link PO to WO if needed

  const [poType, setPoType] = useState<'WO' | 'STOCK'>('WO');

  // Form State
  const [formData, setFormData] = useState({
    supplier_id: '',
    work_order_id: 'NONE', // Optional
    po_date: new Date().toISOString().split('T')[0],
  });

  // Items State (Dynamic Form)
  const [poItems, setPoItems] = useState<{
    goods_id: string;
    brand: string;
    quantity: number;
    unit_price: number;
  }[]>([{ goods_id: '', brand: '', quantity: 1, unit_price: 0 }]);

  useEffect(() => {
    console.log('PurchaseOrderNew Mounted - Final Fix');
    fetchPOs();
    fetchMasterData();
  }, []);

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
    tables: ['suppliers', 'goods', 'work_orders'],
    enabled: isDialogOpen,
    onRefetch: fetchMasterData,
  });

  async function fetchMasterData() {
    const { data: s } = await supabase.from('suppliers').select('*');
    setSuppliers(s || []);
    const { data: g } = await supabase.from('goods').select('*');
    setGoodsList(g || []);
    // Fetch OPEN Work Orders
    const { data: w } = await supabase.from('work_orders').select('*').eq('status', 'OPEN');
    setWorkOrders(w || []);
  }

  async function fetchPOs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPos(data as any || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data PO: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleAddItem = () => {
    setPoItems([...poItems, { goods_id: '', brand: '', quantity: 1, unit_price: 0 }]);
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
    setPoItems([{ goods_id: '', brand: '', quantity: 1, unit_price: 0 }]);
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
    // Check if status is RECEIVED (FULL or PART) - Warn user but maybe allow?
    // Actually user requirement "tidak ada tombol edit" implies they want it.
    // If status is RECEIVED, editing is dangerous for stock.
    // Let's allow editing for ISSUED and DRAFT (if any).
    // If RECEIVED, show error toast as before, BUT the button is now visible so they know it exists.
    
    if (!readOnly && po.status !== 'ISSUED' && po.status !== 'DRAFT') {
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
          goods_id: i.goods_id || '',
          brand: i.brand || '',
          quantity: i.quantity,
          unit_price: i.unit_price || 0
        })));
      } else {
        setPoItems([{ goods_id: '', brand: '', quantity: 1, unit_price: 0 }]);
      }
      
      setIsDialogOpen(true);
    } catch (error: any) {
      toast.error('Gagal memuat detail PO: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        const itemsPayload = poItems.map(item => ({
          po_id: targetPoId,
          goods_id: item.goods_id,
          brand: item.brand,
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
    } catch (error: any) {
      toast.error('Gagal menyimpan PO: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus PO ini? Stok barang tidak akan dikembalikan.')) return;
    try {
      const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
      if (error) throw error;
      toast.success('PO dihapus');
      fetchPOs();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Purchase Order (PO) - FINAL</h2>
        <div className="flex gap-2">
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Buat PO Baru
          </Button>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>{editingId ? (isReadOnly ? 'Detail Purchase Order' : 'Edit Purchase Order') : 'Buat Purchase Order'}</DialogTitle>
              <DialogDescription>{editingId ? (isReadOnly ? 'Lihat detail PO.' : 'Perbarui data Purchase Order.') : 'Pilih supplier dan daftar barang yang akan dibeli.'}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
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
                    <Select value={formData.supplier_id} onValueChange={(v) => setFormData({...formData, supplier_id: v})} disabled={isReadOnly}>
                      <SelectTrigger><SelectValue placeholder="Pilih Supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {poType === 'WO' && (
                    <div className="space-y-2">
                      <Label>Referensi No. WO</Label>
                      <Select value={formData.work_order_id} onValueChange={(v) => setFormData({...formData, work_order_id: v})} disabled={isReadOnly}>
                        <SelectTrigger><SelectValue placeholder="Pilih WO (Jika ada)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">-- Tidak Ada --</SelectItem>
                          {workOrders.map(w => (
                            <SelectItem key={w.id} value={w.id}>{w.wo_number}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-4 border rounded-md p-4 bg-slate-50">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-semibold">Daftar Barang</Label>
                    {!isReadOnly && <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>+ Tambah Barang</Button>}
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[30%]">Barang</TableHead>
                        <TableHead className="w-[25%]">Merk / Tipe</TableHead>
                        <TableHead className="w-[15%]">Qty</TableHead>
                        <TableHead className="w-[20%]">Harga Satuan</TableHead>
                        <TableHead className="w-[10%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Select value={item.goods_id} onValueChange={(v) => handleItemChange(index, 'goods_id', v)} disabled={isReadOnly}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="Pilih Barang" /></SelectTrigger>
                              <SelectContent>
                                {goodsList.map(g => (
                                  <SelectItem key={g.id} value={g.id}>{g.name} ({g.unit})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                              type="number" className="h-9" min="1"
                              value={item.quantity} 
                              onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value))} 
                              disabled={isReadOnly}
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" className="h-9" min="0"
                              value={item.unit_price} 
                              onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value))} 
                              disabled={isReadOnly}
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
              <DialogFooter>
                {!isReadOnly && <Button type="submit" disabled={loading}>{loading ? 'Memproses...' : (editingId ? 'Simpan Perubahan' : 'Buat PO')}</Button>}
                {isReadOnly && <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Tutup</Button>}
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between">
            <CardTitle>Daftar Purchase Order</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari No. PO..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
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
                  <TableHead>Status</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pos.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center h-24">Tidak ada data PO.</TableCell></TableRow>
                ) : (
                  pos.map((item) => (
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
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          item.status === 'ISSUED' ? 'bg-blue-100 text-blue-800' : 
                          item.status === 'RECEIVED_FULL' ? 'bg-green-100 text-green-800' : 'bg-gray-100'
                        }`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold">{formatCurrency(item.total_amount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 items-center">
                          <Button variant="secondary" size="sm" onClick={() => handleEdit(item, true)} title="Lihat Detail">
                            <Eye className="h-4 w-4 mr-1" /> Detail
                          </Button>
                          <Button variant="default" size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={() => handleEdit(item, false)} title="Edit PO">
                            <Pencil className="h-4 w-4 mr-1" /> Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)} title="Hapus PO">
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
    </div>
  );
}
