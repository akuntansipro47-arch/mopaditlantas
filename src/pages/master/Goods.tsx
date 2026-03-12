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
import { useDemo } from '@/context/DemoDataContext';

type Goods = Database['public']['Tables']['goods']['Row'];

export default function Goods() {
  const { isDemo, goods: demoGoods, addGood } = useDemo();
  const [goods, setGoods] = useState<Goods[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    unit: '',
    item_type: 'PERSEDIAAN',
    selling_price: 0,
    is_active: true,
  });

  useEffect(() => {
    if (isDemo) {
      setGoods(demoGoods.map(d => ({
        id: d.id,
        item_code: d.code,
        name: d.name,
        unit: d.unit,
        item_type: d.type as any,
        selling_price: d.price,
        current_stock: d.stock,
        cost_price: d.cost,
        is_active: true,
        created_at: new Date().toISOString()
      })) as any);
      setLoading(false);
    } else {
      fetchGoods();
    }
  }, [isDemo, demoGoods]);

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

  const resetForm = () => {
    setFormData({ name: '', unit: '', item_type: 'PERSEDIAAN', selling_price: 0, is_active: true });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (item: Goods) => {
    setFormData({
      name: item.name,
      unit: item.unit,
      item_type: item.item_type,
      selling_price: item.selling_price || 0,
      is_active: item.is_active !== false, // Default to true if null
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
      fetchGoods();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isDemo) {
      addGood({
        code: `DEMO-${Math.floor(Math.random() * 10000)}`,
        name: formData.name,
        type: formData.item_type,
        unit: formData.unit,
        cost: 0,
        price: formData.selling_price,
        stock: 0
      });
      toast.success('Data ditambahkan (Demo Mode)');
      setIsDialogOpen(false);
      resetForm();
      return;
    }

    setLoading(true);
    try {
      if (isEditing && currentId) {
        const { error } = await supabase.from('goods').update(formData as any).eq('id', currentId);
        if (error) throw error;
        toast.success('Data diperbarui');
      } else {
        const { error } = await supabase.from('goods').insert([formData as any]);
        if (error) throw error;
        toast.success('Data ditambahkan');
      }
      setIsDialogOpen(false);
      resetForm();
      fetchGoods();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredGoods = goods.filter(g => 
    g.name.toLowerCase().includes(search.toLowerCase()) || 
    g.item_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Data Barang/Jasa (Updated)</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Tambah Barang</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Barang' : 'Tambah Barang Baru'}</DialogTitle>
              <DialogDescription>Input data barang atau jasa.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Nama Barang</Label>
                  <Input name="name" value={formData.name} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Satuan</Label>
                  <Input name="unit" value={formData.unit} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Tipe</Label>
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
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Harga Jual (Rp)</Label>
                  <Input 
                    type="text" 
                    name="selling_price" 
                    value={formData.selling_price || ''} 
                    onChange={handleInputChange} 
                    className="col-span-3" 
                    placeholder="0" 
                    inputMode="numeric"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Status</Label>
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
                <Button type="submit" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between">
            <CardTitle>Daftar Barang</CardTitle>
            <div className="relative w-64">
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
                  <TableHead>Harga Jual</TableHead>
                  <TableHead>Stok</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGoods.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center h-24">Tidak ada data.</TableCell></TableRow>
                ) : (
                  filteredGoods.map((item) => (
                    <TableRow key={item.id} className={!item.is_active ? 'bg-gray-50 opacity-60' : ''}>
                      <TableCell>{item.item_code || 'Auto'}</TableCell>
                      <TableCell className="font-medium">
                        {item.name}
                        {!item.is_active && <span className="ml-2 text-xs text-red-500 font-bold">(Non-Aktif)</span>}
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${item.item_type === 'PERSEDIAAN' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                          {item.item_type?.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell>{formatCurrency(item.selling_price || 0)}</TableCell>
                      <TableCell>{item.current_stock}</TableCell>
                      <TableCell className="text-center">
                        {item.is_active !== false ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
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
