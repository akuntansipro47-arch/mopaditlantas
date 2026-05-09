import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logActivity } from '@/lib/activityLog';

type Vehicle = Database['public']['Tables']['vehicles']['Row'];

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Form State
  const [formData, setFormData] = useState({
    vehicle_type: 'R4',
    license_plate: '',
    brand_type: '',
    owner_name: '',
    chassis_number: '',
    engine_number: '',
    body_number: ''
  });

  useEffect(() => {
    fetchVehicles();
  }, []);

  async function fetchVehicles() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVehicles(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data kendaraan: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
    if (formErrors[name]) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, vehicle_type: value }));
    if (formErrors.vehicle_type) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next.vehicle_type;
        return next;
      });
    }
  };

  const resetForm = () => {
    setFormData({
      vehicle_type: 'R4',
      license_plate: '',
      brand_type: '',
      owner_name: '',
      chassis_number: '',
      engine_number: '',
      body_number: ''
    });
    setFormErrors({});
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setFormData({
      vehicle_type: vehicle.vehicle_type,
      license_plate: vehicle.license_plate,
      brand_type: vehicle.brand_type || '',
      owner_name: (vehicle as any).owner_name || '',
      chassis_number: vehicle.chassis_number || '',
      engine_number: vehicle.engine_number || '',
      body_number: vehicle.body_number || ''
    });
    setFormErrors({});
    setIsEditing(true);
    setCurrentId(vehicle.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;

    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      
      toast.success('Data berhasil dihapus');
      {
        const v = vehicles.find((x) => String(x.id) === String(id)) as any;
        const plate = String(v?.license_plate || '').trim() || null;
        void logActivity({
          action: 'MASTER_VEHICLE_DELETE',
          module: 'MASTER_VEHICLES',
          entity_type: 'vehicles',
          entity_id: String(id),
          details: `Hapus kendaraan${plate ? ` ${plate}` : ''}`.trim(),
          meta: { vehicle_id: id, license_plate: plate },
        });
      }
      fetchVehicles();
    } catch (error: any) {
      toast.error('Gagal menghapus data: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!String(formData.vehicle_type || '').trim()) nextErrors.vehicle_type = 'Wajib dipilih';
    if (!String(formData.license_plate || '').trim()) nextErrors.license_plate = 'Wajib diisi';
    if (!String(formData.brand_type || '').trim()) nextErrors.brand_type = 'Wajib diisi';
    if (!String(formData.owner_name || '').trim()) nextErrors.owner_name = 'Wajib diisi';
    if (!String(formData.chassis_number || '').trim()) nextErrors.chassis_number = 'Wajib diisi';
    if (!String(formData.engine_number || '').trim()) nextErrors.engine_number = 'Wajib diisi';
    if (!String(formData.body_number || '').trim()) nextErrors.body_number = 'Wajib diisi';
    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      toast.error('Lengkapi semua kolom wajib sebelum menyimpan.');
      return;
    }
    setLoading(true);

    try {
      if (isEditing && currentId) {
        const { error } = await supabase
          .from('vehicles')
          .update(formData as any)
          .eq('id', currentId);
        if (error) throw error;
        toast.success('Data berhasil diperbarui');
        void logActivity({
          action: 'MASTER_VEHICLE_UPDATE',
          module: 'MASTER_VEHICLES',
          entity_type: 'vehicles',
          entity_id: String(currentId),
          details: `Update kendaraan ${String(formData.license_plate || '').trim()}`,
          meta: { vehicle_id: currentId, license_plate: String(formData.license_plate || '').trim() || null, vehicle_type: formData.vehicle_type },
        });
      } else {
        const { error } = await supabase
          .from('vehicles')
          .insert([formData as any]);
        if (error) throw error;
        toast.success('Data berhasil ditambahkan');
        void logActivity({
          action: 'MASTER_VEHICLE_CREATE',
          module: 'MASTER_VEHICLES',
          entity_type: 'vehicles',
          entity_id: '',
          details: `Create kendaraan ${String(formData.license_plate || '').trim()}`,
          meta: { license_plate: String(formData.license_plate || '').trim() || null, vehicle_type: formData.vehicle_type },
        });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchVehicles();
    } catch (error: any) {
      toast.error('Gagal menyimpan data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredVehicles = vehicles.filter(v => 
    v.license_plate.toLowerCase().includes(search.toLowerCase()) ||
    (v.brand_type && v.brand_type.toLowerCase().includes(search.toLowerCase())) ||
    ((v as any).owner_name && String((v as any).owner_name).toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Data Kendaraan</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Tambah Kendaraan
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Kendaraan' : 'Tambah Kendaraan Baru'}</DialogTitle>
              <DialogDescription>
                Isi form berikut untuk {isEditing ? 'mengubah' : 'menambahkan'} data kendaraan.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="vehicle_type" className="text-right">
                    Jenis
                  </Label>
                  <Select 
                    value={formData.vehicle_type} 
                    onValueChange={handleSelectChange}
                  >
                    <SelectTrigger className={`col-span-3 ${formErrors.vehicle_type ? 'border-red-500' : ''}`}>
                      <SelectValue placeholder="Pilih Jenis" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="R4">R4 (Mobil)</SelectItem>
                      <SelectItem value="R2">R2 (Moge)</SelectItem>
                      <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                    </SelectContent>
                  </Select>
                  {formErrors.vehicle_type && <div className="col-span-4 text-right text-xs text-red-600">{formErrors.vehicle_type}</div>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="license_plate" className="text-right">
                    No. Polisi
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="license_plate"
                      name="license_plate"
                      value={formData.license_plate}
                      onChange={handleInputChange}
                      className={formErrors.license_plate ? 'border-red-500' : ''}
                      required
                    />
                    {formErrors.license_plate && <p className="text-xs text-red-600">{formErrors.license_plate}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="brand_type" className="text-right">
                    Merk/Type
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="brand_type"
                      name="brand_type"
                      value={formData.brand_type}
                      onChange={handleInputChange}
                      className={formErrors.brand_type ? 'border-red-500' : ''}
                      required
                    />
                    {formErrors.brand_type && <p className="text-xs text-red-600">{formErrors.brand_type}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="owner_name" className="text-right">
                    Pemilik/Pemakai
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="owner_name"
                      name="owner_name"
                      value={formData.owner_name}
                      onChange={handleInputChange}
                      className={formErrors.owner_name ? 'border-red-500' : ''}
                      required
                    />
                    {formErrors.owner_name && <p className="text-xs text-red-600">{formErrors.owner_name}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="chassis_number" className="text-right">
                    No. Rangka
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="chassis_number"
                      name="chassis_number"
                      value={formData.chassis_number}
                      onChange={handleInputChange}
                      className={formErrors.chassis_number ? 'border-red-500' : ''}
                      required
                    />
                    {formErrors.chassis_number && <p className="text-xs text-red-600">{formErrors.chassis_number}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="engine_number" className="text-right">
                    No. Mesin
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="engine_number"
                      name="engine_number"
                      value={formData.engine_number}
                      onChange={handleInputChange}
                      className={formErrors.engine_number ? 'border-red-500' : ''}
                      required
                    />
                    {formErrors.engine_number && <p className="text-xs text-red-600">{formErrors.engine_number}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="body_number" className="text-right">
                    No. Lambung
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="body_number"
                      name="body_number"
                      value={formData.body_number}
                      onChange={handleInputChange}
                      className={formErrors.body_number ? 'border-red-500' : ''}
                      required
                    />
                    {formErrors.body_number && <p className="text-xs text-red-600">{formErrors.body_number}</p>}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Daftar Kendaraan</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari No. Polisi atau Merk..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Polisi</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Merk/Type</TableHead>
                  <TableHead>Pemilik/Pemakai</TableHead>
                  <TableHead>No. Rangka</TableHead>
                  <TableHead>No. Mesin</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      {loading ? 'Memuat data...' : 'Tidak ada data kendaraan ditemukan.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell className="font-medium">{vehicle.license_plate}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          vehicle.vehicle_type === 'R4' ? 'bg-blue-100 text-blue-800' :
                          vehicle.vehicle_type === 'R2' ? 'bg-green-100 text-green-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {vehicle.vehicle_type === 'R2_KECIL' ? 'R2 Kecil' : vehicle.vehicle_type}
                        </span>
                      </TableCell>
                      <TableCell>{vehicle.brand_type || '-'}</TableCell>
                      <TableCell>{(vehicle as any).owner_name || '-'}</TableCell>
                      <TableCell>{vehicle.chassis_number || '-'}</TableCell>
                      <TableCell>{vehicle.engine_number || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(vehicle)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(vehicle.id)}>
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
