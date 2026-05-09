import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { logActivity } from '@/lib/activityLog';

type Supplier = Database['public']['Tables']['suppliers']['Row'];

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    pic_name: '',
    phone_number: '',
    address: '',
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  async function fetchSuppliers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSuppliers(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data supplier: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: ['name', 'pic_name', 'address'].includes(name) ? value.toUpperCase() : value }));
  };

  const resetForm = () => {
    setFormData({ name: '', pic_name: '', phone_number: '', address: '' });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (item: Supplier) => {
    setFormData({
      name: item.name,
      pic_name: item.pic_name || '',
      phone_number: item.phone_number || '',
      address: item.address || '',
    });
    setIsEditing(true);
    setCurrentId(item.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus data supplier ini?')) return;
    try {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
      toast.success('Data dihapus');
      {
        const s = suppliers.find((x) => String(x.id) === String(id)) as any;
        const name = String(s?.name || '').trim() || null;
        void logActivity({
          action: 'MASTER_SUPPLIER_DELETE',
          module: 'MASTER_SUPPLIERS',
          entity_type: 'suppliers',
          entity_id: String(id),
          details: `Hapus supplier${name ? ` ${name}` : ''}`.trim(),
          meta: { supplier_id: id, name },
        });
      }
      fetchSuppliers();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditing && currentId) {
        const { error } = await supabase.from('suppliers').update(formData as any).eq('id', currentId);
        if (error) throw error;
        toast.success('Data diperbarui');
        void logActivity({
          action: 'MASTER_SUPPLIER_UPDATE',
          module: 'MASTER_SUPPLIERS',
          entity_type: 'suppliers',
          entity_id: String(currentId),
          details: `Update supplier ${String(formData.name || '').trim()}`.trim(),
          meta: { supplier_id: currentId, name: String(formData.name || '').trim() || null },
        });
      } else {
        const { error } = await supabase.from('suppliers').insert([formData as any]);
        if (error) throw error;
        toast.success('Data ditambahkan');
        void logActivity({
          action: 'MASTER_SUPPLIER_CREATE',
          module: 'MASTER_SUPPLIERS',
          entity_type: 'suppliers',
          entity_id: '',
          details: `Create supplier ${String(formData.name || '').trim()}`.trim(),
          meta: { name: String(formData.name || '').trim() || null },
        });
      }
      setIsDialogOpen(false);
      resetForm();
      await fetchSuppliers();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.pic_name && s.pic_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Data Supplier</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Tambah Supplier</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Supplier' : 'Tambah Supplier Baru'}</DialogTitle>
              <DialogDescription>Input data supplier.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Nama Supplier</Label>
                  <Input name="name" value={formData.name} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">PIC Supplier</Label>
                  <Input name="pic_name" value={formData.pic_name} onChange={handleInputChange} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">No. Telp</Label>
                  <Input name="phone_number" value={formData.phone_number} onChange={handleInputChange} className="col-span-3" type="number" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Alamat</Label>
                  <Input name="address" value={formData.address} onChange={handleInputChange} className="col-span-3" />
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
            <CardTitle>Daftar Supplier</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari Nama/PIC..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Supplier</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>No. Telp</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24">Tidak ada data.</TableCell></TableRow>
                ) : (
                  filteredSuppliers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.pic_name || '-'}</TableCell>
                      <TableCell>{item.phone_number || '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={item.address || ''}>{item.address || '-'}</TableCell>
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
