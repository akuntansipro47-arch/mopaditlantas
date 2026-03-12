import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, UserPlus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from '@/lib/utils';

export default function EmployeeData() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
      employee_code: '',
      full_name: '',
      nickname: '',
      position: '',
      department: '',
      join_date: new Date().toISOString().split('T')[0],
      phone: '',
      base_salary: 0,
      status: 'ACTIVE'
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  async function fetchEmployees() {
      setLoading(true);
      try {
          const { data, error } = await supabase
            .from('employees')
            .select('*')
            .order('employee_code');
          if (error) throw error;
          setEmployees(data || []);
      } catch (error: any) {
          toast.error("Gagal memuat data karyawan: " + error.message);
      } finally {
          setLoading(false);
      }
  }

  const handleSave = async () => {
      if (!formData.employee_code || !formData.full_name) {
          return toast.error("Kode dan Nama wajib diisi");
      }

      setLoading(true);
      try {
          if (currentId) {
              const { error } = await supabase
                .from('employees')
                .update(formData)
                .eq('id', currentId);
              if (error) throw error;
              toast.success("Data diperbarui");
          } else {
              const { error } = await supabase
                .from('employees')
                .insert([formData]);
              if (error) throw error;
              toast.success("Karyawan baru ditambahkan");
          }
          setIsDialogOpen(false);
          fetchEmployees();
      } catch (error: any) {
          toast.error("Gagal menyimpan: " + error.message);
      } finally {
          setLoading(false);
      }
  };

  const handleEdit = (emp: any) => {
      setCurrentId(emp.id);
      setFormData({
          employee_code: emp.employee_code,
          full_name: emp.full_name,
          nickname: emp.nickname || '',
          position: emp.position || '',
          department: emp.department || '',
          join_date: emp.join_date,
          phone: emp.phone || '',
          base_salary: emp.base_salary || 0,
          status: emp.status
      });
      setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
      if (!confirm("Hapus data karyawan ini?")) return;
      try {
          const { error } = await supabase.from('employees').delete().eq('id', id);
          if (error) throw error;
          toast.success("Data dihapus");
          fetchEmployees();
      } catch (e: any) {
          toast.error("Gagal hapus: " + e.message);
      }
  };

  const filteredEmployees = employees.filter(e => 
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.employee_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Data Karyawan</h2>
        <Button onClick={() => {
            setCurrentId(null);
            setFormData({
                employee_code: '', full_name: '', nickname: '', position: '', 
                department: '', join_date: new Date().toISOString().split('T')[0], 
                phone: '', base_salary: 0, status: 'ACTIVE'
            });
            setIsDialogOpen(true);
        }}>
            <UserPlus className="mr-2 h-4 w-4" /> Tambah Karyawan
        </Button>
      </div>

      <Card>
          <CardHeader>
              <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cari Nama / NIK..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
          </CardHeader>
          <CardContent>
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>NIK / Kode</TableHead>
                          <TableHead>Nama Lengkap</TableHead>
                          <TableHead>Jabatan</TableHead>
                          <TableHead>Divisi</TableHead>
                          <TableHead>No. HP</TableHead>
                          <TableHead>Gaji Pokok</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {filteredEmployees.map(emp => (
                          <TableRow key={emp.id}>
                              <TableCell className="font-mono font-bold">{emp.employee_code}</TableCell>
                              <TableCell>
                                  <div>{emp.full_name}</div>
                                  <div className="text-xs text-gray-500">Join: {emp.join_date}</div>
                              </TableCell>
                              <TableCell>{emp.position}</TableCell>
                              <TableCell>{emp.department}</TableCell>
                              <TableCell>{emp.phone}</TableCell>
                              <TableCell>{formatCurrency(emp.base_salary)}</TableCell>
                              <TableCell>
                                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${emp.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                      {emp.status}
                                  </span>
                              </TableCell>
                              <TableCell className="text-right">
                                  <Button variant="ghost" size="sm" onClick={() => handleEdit(emp)}><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(emp.id)}><Trash2 className="h-4 w-4" /></Button>
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
              <DialogHeader>
                  <DialogTitle>{currentId ? 'Edit Karyawan' : 'Tambah Karyawan Baru'}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="space-y-2">
                      <Label>NIK / Kode Karyawan</Label>
                      <Input value={formData.employee_code} onChange={e => setFormData({...formData, employee_code: e.target.value})} placeholder="EMP-001" />
                  </div>
                  <div className="space-y-2">
                      <Label>Nama Lengkap</Label>
                      <Input value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                      <Label>Jabatan</Label>
                      <Input value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                      <Label>Divisi</Label>
                      <Input value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                      <Label>Tanggal Masuk</Label>
                      <Input type="date" value={formData.join_date} onChange={e => setFormData({...formData, join_date: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                      <Label>No. Telepon</Label>
                      <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                      <Label>Gaji Pokok</Label>
                      <Input type="number" value={formData.base_salary} onChange={e => setFormData({...formData, base_salary: Number(e.target.value)})} />
                  </div>
                  <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="ACTIVE">Aktif</SelectItem>
                              <SelectItem value="RESIGNED">Resign / Non-Aktif</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                  <Button onClick={handleSave} disabled={loading}>Simpan</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}
