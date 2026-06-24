import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, Package, CheckCircle, XCircle } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { formatCurrency } from '@/lib/utils';
import { logActivity } from '@/lib/activityLog';

type Goods = Database['public']['Tables']['goods']['Row'];

export default function Goods() {
  const [goods, setGoods] = useState<Goods[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    unit: '',
    item_type: 'PERSEDIAAN',
    selling_price: 0,
    group_sparepart: '' as '' | 'R4' | 'R2' | 'R2_KECIL',
    is_active: true,
  });

  useEffect(() => {
    fetchGoods();
  }, []);

  async function fetchGoods() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('goods')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setGoods(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data barang: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'selling_price') {
      // Allow only numbers
      const numericValue = value.replace(/[^0-9]/g, '');
      setFormData(prev => ({ ...prev, [name]: numericValue ? parseInt(numericValue) : 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: name === 'name' || name === 'unit' ? value.toUpperCase() : value }));
    }
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, item_type: value }));
  };

  const handleGroupChange = (value: string) => {
    setFormData(prev => ({ ...prev, group_sparepart: value as any }));
  };

  const resetForm = () => {
    setFormData({ name: '', unit: '', item_type: 'PERSEDIAAN', selling_price: 0, group_sparepart: '' as any, is_active: true });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (item: Goods) => {
    setFormData({
      name: item.name,
      unit: item.unit,
      item_type: item.item_type,
      selling_price: item.selling_price || 0,
      group_sparepart: (item.group_sparepart || '') as any,
      is_active: (item as any).is_active !== false, // Default to true if null
    });
    setIsEditing(true);
    setCurrentId(item.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus data barang ini?')) return;
    try {
      const { error } = await supabase.from('goods').delete().eq('id', id);
      if (error) throw error;
      toast.success('Data dihapus');
      {
        const g = goods.find((x) => String(x.id) === String(id)) as any;
        const name = String(g?.name || '').trim() || null;
        void logActivity({
          action: 'MASTER_GOODS_DELETE',
          module: 'MASTER_GOODS',
          entity_type: 'goods',
          entity_id: String(id),
          details: `Hapus barang/jasa${name ? ` ${name}` : ''}`.trim(),
          meta: { goods_id: id, name },
        });
      }
      fetchGoods();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) return toast.error('Nama barang wajib diisi');
    if (!formData.unit.trim()) return toast.error('Satuan wajib diisi');
    if (!formData.item_type) return toast.error('Tipe wajib dipilih');
    if (formData.selling_price === null || formData.selling_price === undefined) return toast.error('Harga jual wajib diisi');
    
    // Perubahan Rule: Group hanya wajib jika tipenya "PERSEDIAAN"
    if (formData.item_type === 'PERSEDIAAN' && !formData.group_sparepart) {
      return toast.error('Group wajib dipilih untuk tipe Persediaan (R2/R4/R2 Kecil)');
    }

    setSaving(true);
    try {
      if (isEditing && currentId) {
        const { error } = await supabase.from('goods').update(formData as any).eq('id', currentId);
        if (error) throw error;
        toast.success('Data diperbarui');
        void logActivity({
          action: 'MASTER_GOODS_UPDATE',
          module: 'MASTER_GOODS',
          entity_type: 'goods',
          entity_id: String(currentId),
          details: `Update barang/jasa ${String(formData.name || '').trim()}`.trim(),
          meta: { goods_id: currentId, name: String(formData.name || '').trim() || null, item_type: formData.item_type },
        });
      } else {
        const { error } = await supabase.from('goods').insert([formData as any]);
        if (error) throw error;
        toast.success('Data ditambahkan');
        void logActivity({
          action: 'MASTER_GOODS_CREATE',
          module: 'MASTER_GOODS',
          entity_type: 'goods',
          entity_id: '',
          details: `Create barang/jasa ${String(formData.name || '').trim()}`.trim(),
          meta: { name: String(formData.name || '').trim() || null, item_type: formData.item_type },
        });
      }
      setIsDialogOpen(false);
      resetForm();
      fetchGoods();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredGoods = goods.filter(g => 
    g.name.toLowerCase().includes(search.toLowerCase()) || 
    g.item_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Data Barang/Jasa</h2>
          <p className="mt-1 text-sm text-slate-500">Kelola stok, jasa, dan status barang dengan layout yang lebih rapi di mobile/tablet.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Tambah Barang</Button>
          </DialogTrigger>
          <DialogContent className="max-w-[calc(100vw-1rem)] p-3 sm:max-w-[500px] sm:p-6">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Barang' : 'Tambah Barang Baru'}</DialogTitle>
              <DialogDescription>Input data barang atau jasa.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label className="text-left sm:text-right">Nama Barang</Label>
                  <Input name="name" value={formData.name} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label className="text-left sm:text-right">Satuan</Label>
                  <Input name="unit" value={formData.unit} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label className="text-left sm:text-right">Tipe</Label>
                  <Select value={formData.item_type} onValueChange={handleSelectChange}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSEDIAAN">Persediaan</SelectItem>
                      <SelectItem value="NON_PERSEDIAAN">Non Persediaan</SelectItem>
                      <SelectItem value="ASET_AKTIVA_TETAP">Aset Aktiva Tetap</SelectItem>
                      <SelectItem value="PERALATAN_WORKSHOP">Peralatan Workshop</SelectItem>
                      <SelectItem value="INVENTARIS_KANTOR">Inventaris Kantor</SelectItem>
                      <SelectItem value="FURNITURE">Furniture</SelectItem>
                      <SelectItem value="PERLENGKAPAN">Perlengkapan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label className="text-left sm:text-right">Group</Label>
                  <Select value={formData.group_sparepart || ''} onValueChange={handleGroupChange}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={formData.item_type === 'PERSEDIAAN' ? "Pilih Group (Wajib)" : "Pilih Group (Opsional)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="R2">R2</SelectItem>
                      <SelectItem value="R4">R4</SelectItem>
                      <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label className="text-left sm:text-right">Harga Jual (Rp)</Label>
                  <Input 
                    type="text" 
                    name="selling_price" 
                    value={String(formData.selling_price ?? 0)} 
                    onChange={handleInputChange} 
                    className="col-span-3" 
                    placeholder="0" 
                    inputMode="numeric"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label className="text-left sm:text-right">Status</Label>
                  <div className="col-span-3 flex items-center space-x-2">
                    <Checkbox 
                      id="is_active" 
                      checked={!formData.is_active} 
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: !checked }))}
                    />
                    <label
                      htmlFor="is_active"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-red-600"
                    >
                      Non-Aktifkan Barang Ini
                    </label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Daftar Barang</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Cari Nama/Kode..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode Barang</TableHead>
                  <TableHead>Nama Barang</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Harga Jual</TableHead>
                  <TableHead>Stok</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGoods.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center h-24">Tidak ada data.</TableCell></TableRow>
                ) : (
                  filteredGoods.map((item) => (
                    <TableRow key={item.id} className={!(item as any).is_active ? 'bg-gray-50 opacity-60' : ''}>
                      <TableCell>{item.item_code || 'Auto'}</TableCell>
                      <TableCell className="font-medium">
                        {item.name}
                        {!(item as any).is_active && <span className="ml-2 text-xs text-red-500 font-bold">(Non-Aktif)</span>}
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${item.item_type === 'PERSEDIAAN' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                          {item.item_type?.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        {item.group_sparepart ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {item.group_sparepart === 'R2_KECIL' ? 'R2 Kecil' : item.group_sparepart}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Tidak ada group</span>
                        )}
                      </TableCell>
                      <TableCell>{formatCurrency(item.selling_price || 0)}</TableCell>
                      <TableCell>{item.current_stock}</TableCell>
                      <TableCell className="text-center">
                        {(item as any).is_active !== false ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
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
