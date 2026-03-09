import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, Wrench } from 'lucide-react';
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

type Job = Database['public']['Tables']['job_types']['Row'];

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    job_name: '',
    job_group: 'PERBAIKAN',
    selling_price: 0,
    hpp: 0,
  });

  const [missingColumn, setMissingColumn] = useState(false);

  useEffect(() => {
    checkColumnExistence();
    fetchJobs();
  }, []);

  async function checkColumnExistence() {
    const { error } = await supabase.from('job_types').select('hpp').limit(1);
    if (error && error.message.includes('does not exist')) {
        setMissingColumn(true);
    }
  }

  async function fetchJobs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('job_types')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data pekerjaan: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, job_group: value }));
  };

  const resetForm = () => {
    setFormData({ job_name: '', job_group: 'PERBAIKAN', selling_price: 0, hpp: 0 });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (item: any) => {
    setFormData({
      job_name: item.job_name,
      job_group: item.job_group,
      selling_price: item.selling_price || 0,
      hpp: item.hpp || 0,
    });
    setIsEditing(true);
    setCurrentId(item.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus data pekerjaan ini?')) return;
    try {
      const { error } = await supabase.from('job_types').delete().eq('id', id);
      if (error) throw error;
      toast.success('Data dihapus');
      fetchJobs();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...formData };
      if (missingColumn) {
          delete (payload as any).hpp;
      }

      if (isEditing && currentId) {
        const { error } = await supabase.from('job_types').update(payload as any).eq('id', currentId);
        if (error) throw error;
        toast.success('Data diperbarui');
      } else {
        const { error } = await supabase.from('job_types').insert([payload as any]);
        if (error) throw error;
        toast.success('Data ditambahkan');
      }
      setIsDialogOpen(false);
      resetForm();
      fetchJobs();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter(j => 
    j.job_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {missingColumn && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <span className="font-bold">Perhatian:</span> Kolom 'hpp' belum ada di database. 
                Fitur Laporan Laba Kotor membutuhkan kolom ini.
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                Silakan jalankan SQL berikut di Supabase SQL Editor:
              </p>
              <code className="block mt-2 bg-yellow-100 p-2 rounded text-xs font-mono text-yellow-800 select-all">
                ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS hpp NUMERIC DEFAULT 0;
              </code>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Data Pekerjaan (Updated)</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Tambah Pekerjaan</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Pekerjaan' : 'Tambah Pekerjaan Baru'}</DialogTitle>
              <DialogDescription>Input jenis pekerjaan atau perbaikan.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Nama Pekerjaan</Label>
                  <Input name="job_name" value={formData.job_name} onChange={(e) => handleInputChange({...e, target: {...e.target, value: e.target.value.toUpperCase(), name: e.target.name}})} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Group</Label>
                  <Select value={formData.job_group} onValueChange={handleSelectChange}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERBAIKAN">PERBAIKAN (Umum)</SelectItem>
                      <SelectItem value="PERBAIKAN R4">PERBAIKAN R4</SelectItem>
                      <SelectItem value="PERBAIKAN R2">PERBAIKAN R2</SelectItem>
                      <SelectItem value="PERBAIKAN R2 KECIL">PERBAIKAN R2 KECIL</SelectItem>
                      <SelectItem value="SERVICE RINGAN R4">SERVICE RINGAN R4</SelectItem>
                      <SelectItem value="SERVICE RINGAN R2">SERVICE RINGAN R2</SelectItem>
                      <SelectItem value="SERVICE RINGAN R2 KECIL">SERVICE RINGAN R2 KECIL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Harga Jual (Revenue)</Label>
                  <Input type="number" name="selling_price" value={formData.selling_price} onChange={handleInputChange} className="col-span-3" min="0" placeholder="0" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">HPP (Modal)</Label>
                  <div className="col-span-3">
                      <Input 
                        type="number" 
                        name="hpp" 
                        value={formData.hpp} 
                        onChange={handleInputChange} 
                        min="0" 
                        placeholder="0" 
                        disabled={missingColumn}
                      />
                      {missingColumn && <p className="text-[10px] text-red-500 mt-1">Kolom HPP belum tersedia di database.</p>}
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
            <CardTitle>Daftar Pekerjaan</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari Pekerjaan..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Pekerjaan</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Harga Jual</TableHead>
                  <TableHead>HPP</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24">Tidak ada data.</TableCell></TableRow>
                ) : (
                  filteredJobs.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.job_name}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${item.job_group === 'PERBAIKAN' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                          {item.job_group.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell>{formatCurrency(item.selling_price || 0)}</TableCell>
                      <TableCell>{formatCurrency(item.hpp || 0)}</TableCell>
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
