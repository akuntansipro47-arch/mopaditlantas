import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, UserCog } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { logActivity } from '@/lib/activityLog';

type Mechanic = Database['public']['Tables']['mechanics']['Row'];

export default function Mechanics() {
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    specialization: 'ALL',
    phone_number: '',
    nik: '',
    address: '',
    category: 'R4',
  });

  useEffect(() => {
    fetchMechanics();
  }, []);

  async function fetchMechanics() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mechanics')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMechanics(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data mekanik: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'name' ? value.toUpperCase() : value }));
  };

  const handleCategoryChange = (value: string) => {
    // Sync category to specialization for now to maintain compatibility
    setFormData(prev => ({ ...prev, category: value, specialization: value }));
  };

  const resetForm = () => {
    setFormData({ name: '', specialization: 'ALL', phone_number: '', nik: '', address: '', category: 'R4' });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (item: Mechanic) => {
    setFormData({
      name: item.name,
      specialization: item.specialization,
      phone_number: item.phone_number || '',
      nik: item.nik || '',
      address: item.address || '',
      category: item.specialization || 'R4', // Sync specialization with category
    });
    setIsEditing(true);
    setCurrentId(item.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus data mekanik ini?')) return;
    try {
      const { error } = await supabase.from('mechanics').delete().eq('id', id);
      if (error) throw error;
      toast.success('Data dihapus');
      {
        const m = mechanics.find((x) => String(x.id) === String(id)) as any;
        const name = String(m?.name || '').trim() || null;
        void logActivity({
          action: 'MASTER_MECHANIC_DELETE',
          module: 'MASTER_MECHANICS',
          entity_type: 'mechanics',
          entity_id: String(id),
          details: `Hapus mekanik${name ? ` ${name}` : ''}`.trim(),
          meta: { mechanic_id: id, name },
        });
      }
      fetchMechanics();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditing && currentId) {
        const { error } = await supabase.from('mechanics').update(formData as any).eq('id', currentId);
        if (error) throw error;
        toast.success('Data diperbarui');
        void logActivity({
          action: 'MASTER_MECHANIC_UPDATE',
          module: 'MASTER_MECHANICS',
          entity_type: 'mechanics',
          entity_id: String(currentId),
          details: `Update mekanik ${String(formData.name || '').trim()}`.trim(),
          meta: { mechanic_id: currentId, name: String(formData.name || '').trim() || null },
        });
      } else {
        const { error } = await supabase.from('mechanics').insert([formData as any]);
        if (error) throw error;
        toast.success('Data ditambahkan');
        void logActivity({
          action: 'MASTER_MECHANIC_CREATE',
          module: 'MASTER_MECHANICS',
          entity_type: 'mechanics',
          entity_id: '',
          details: `Create mekanik ${String(formData.name || '').trim()}`.trim(),
          meta: { name: String(formData.name || '').trim() || null },
        });
      }
      setIsDialogOpen(false);
      resetForm();
      fetchMechanics();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredMechanics = mechanics.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Data Mekanik</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Tambah Mekanik</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Mekanik' : 'Tambah Mekanik Baru'}</DialogTitle>
              <DialogDescription>Input data mekanik.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Nama Mekanik</Label>
                  <Input name="name" value={formData.name} onChange={handleInputChange} className="col-span-3" required placeholder="Free Text" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">No. NIK</Label>
                  <Input name="nik" value={formData.nik} onChange={handleInputChange} className="col-span-3" type="number" placeholder="Numerik Only" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">No. HP</Label>
                  <Input name="phone_number" value={formData.phone_number} onChange={handleInputChange} className="col-span-3" type="number" placeholder="Numerik Only" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Alamat</Label>
                  <Input name="address" value={formData.address} onChange={handleInputChange} className="col-span-3" placeholder="Free Text" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Kategori Mekanik</Label>
                  <Select value={formData.category} onValueChange={handleCategoryChange}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="R4">R4</SelectItem>
                      <SelectItem value="R2">R2</SelectItem>
                      <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                    </SelectContent>
                  </Select>
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
            <CardTitle>Daftar Mekanik</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Cari Nama..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Mekanik</TableHead>
                  <TableHead>NIK</TableHead>
                  <TableHead>No. HP</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMechanics.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24">Tidak ada data.</TableCell></TableRow>
                ) : (
                  filteredMechanics.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.nik || '-'}</TableCell>
                      <TableCell>{item.phone_number || '-'}</TableCell>
                      <TableCell>
                         <span className="px-2 py-1 rounded-full bg-slate-100 text-xs">
                          {item.specialization ? item.specialization.replace('_', ' ') : '-'}
                         </span>
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
