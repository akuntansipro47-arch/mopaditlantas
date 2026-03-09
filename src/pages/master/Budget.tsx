import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, Wallet, Calendar } from 'lucide-react';
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

type BudgetPeriod = Database['public']['Tables']['budget_periods']['Row'];
type BudgetAllocation = Database['public']['Tables']['budget_allocations']['Row'];

type AllocationWithDetails = BudgetAllocation & {
  period_month: string;
  period_year: number;
};

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function Budget() {
  const [allocations, setAllocations] = useState<AllocationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    month: 'Januari',
    year: new Date().getFullYear().toString(),
    vehicle_type: 'R4',
    service_group: 'PERBAIKAN',
    amount: '0',
  });

  useEffect(() => {
    fetchBudgets();
  }, []);

  async function fetchBudgets() {
    setLoading(true);
    try {
      // Join query is tricky in Supabase client without views, so we might need two queries or RPC
      // For now, let's fetch allocations and join manually or use select with foreign key
      const { data, error } = await supabase
        .from('budget_allocations')
        .select(`
          *,
          budget_periods (
            month,
            year
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform data
      const formattedData = data.map((item: any) => ({
        ...item,
        period_month: item.budget_periods?.month,
        period_year: item.budget_periods?.year,
      }));

      setAllocations(formattedData);
    } catch (error: any) {
      toast.error('Gagal mengambil data anggaran: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      month: 'Januari',
      year: new Date().getFullYear().toString(),
      vehicle_type: 'R4',
      service_group: 'PERBAIKAN',
      amount: '0',
    });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (item: AllocationWithDetails) => {
    setFormData({
      month: item.period_month,
      year: item.period_year.toString(),
      vehicle_type: item.vehicle_type || 'R4',
      service_group: item.service_group || 'PERBAIKAN',
      amount: item.amount.toString(),
    });
    setIsEditing(true);
    setCurrentId(item.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus anggaran ini?')) return;
    try {
      const { error } = await supabase.from('budget_allocations').delete().eq('id', id);
      if (error) throw error;
      toast.success('Data dihapus');
      fetchBudgets();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Find or Create Period
      let periodId;
      const { data: existingPeriod } = await supabase
        .from('budget_periods')
        .select('id')
        .eq('month', formData.month)
        .eq('year', parseInt(formData.year))
        .single();

      if (existingPeriod) {
        periodId = existingPeriod.id;
      } else {
        const { data: newPeriod, error: periodError } = await supabase
          .from('budget_periods')
          .insert([{ month: formData.month, year: parseInt(formData.year) }])
          .select()
          .single();
        
        if (periodError) throw periodError;
        periodId = newPeriod.id;
      }

      // 2. Insert/Update Allocation
      const allocationData = {
        period_id: periodId,
        vehicle_type: formData.vehicle_type,
        service_group: formData.service_group,
        amount: parseFloat(formData.amount),
      };

      if (isEditing && currentId) {
        // Note: We don't update period_id usually if editing, but let's allow it
        const { error } = await supabase
          .from('budget_allocations')
          .update(allocationData as any)
          .eq('id', currentId);
        if (error) throw error;
        toast.success('Anggaran diperbarui');
      } else {
        const { error } = await supabase
          .from('budget_allocations')
          .insert([allocationData as any]);
        if (error) throw error;
        toast.success('Anggaran ditambahkan');
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchBudgets();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredAllocations = allocations.filter(a => 
    a.period_month.toLowerCase().includes(search.toLowerCase()) ||
    a.period_year.toString().includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Data Anggaran</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Tambah Anggaran</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Anggaran' : 'Setup Anggaran Baru'}</DialogTitle>
              <DialogDescription>Alokasi anggaran per periode dan grup.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bulan</Label>
                    <Select value={formData.month} onValueChange={(v) => handleSelectChange('month', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tahun</Label>
                    <Input name="year" value={formData.year} onChange={handleInputChange} type="number" required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Kendaraan</Label>
                    <Select value={formData.vehicle_type} onValueChange={(v) => handleSelectChange('vehicle_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="R4">R4 (Mobil)</SelectItem>
                        <SelectItem value="R2">R2 (Moge)</SelectItem>
                        <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                        <SelectItem value="R4/R2">R4/R2 (Gabungan)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Group</Label>
                    <Select value={formData.service_group} onValueChange={(v) => handleSelectChange('service_group', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERBAIKAN">Perbaikan</SelectItem>
                        <SelectItem value="SERVICE_RINGAN">Service Ringan</SelectItem>
                        <SelectItem value="PERBAIKAN R4">PERBAIKAN R4</SelectItem>
                        <SelectItem value="PERBAIKAN R2">PERBAIKAN R2</SelectItem>
                        <SelectItem value="PERBAIKAN R2 KECIL">PERBAIKAN R2 KECIL</SelectItem>
                        <SelectItem value="SERVICE RINGAN R4">SERVICE RINGAN R4</SelectItem>
                        <SelectItem value="SERVICE RINGAN R2">SERVICE RINGAN R2</SelectItem>
                        <SelectItem value="SERVICE RINGAN R2 KECIL">SERVICE RINGAN R2 KECIL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Nominal Anggaran (Rp)</Label>
                  <Input name="amount" value={formData.amount} onChange={handleInputChange} type="number" min="0" required />
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
            <CardTitle>Daftar Anggaran</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Cari Bulan/Tahun..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Kendaraan</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Anggaran</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAllocations.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24">Tidak ada data.</TableCell></TableRow>
                ) : (
                  filteredAllocations.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center">
                          <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                          {item.period_month} {item.period_year}
                        </div>
                      </TableCell>
                      <TableCell>{item.vehicle_type}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${item.service_group.includes('PERBAIKAN') ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                          {item.service_group?.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold">{formatCurrency(item.amount)}</TableCell>
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
