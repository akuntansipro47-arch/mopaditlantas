import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Eye, Trash2, ClipboardCheck, Play, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox.tsx";
import { Combobox } from "@/components/ui/combobox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";

type WO = Database['public']['Tables']['work_orders']['Row'];
type VehicleEntry = Database['public']['Tables']['vehicle_entries']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Mechanic = Database['public']['Tables']['mechanics']['Row'];

type WOWithDetails = WO & {
  vehicle_entries: (VehicleEntry & { vehicles: Vehicle | null }) | null;
  mechanics: Mechanic | null;
};

export default function WorkOrder() {
  const [wos, setWos] = useState<WOWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  
  // Print State
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printData, setPrintData] = useState<any>(null);

  // Master Data
  const [entries, setEntries] = useState<(VehicleEntry & { vehicles: Vehicle | null })[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  
  // Form State
  const [formData, setFormData] = useState({
    work_date: new Date().toISOString().split('T')[0],
    vehicle_entry_id: '',
    mechanic_id: '',
  });

  const [selectedEntryDetails, setSelectedEntryDetails] = useState<any>(null);

  useEffect(() => {
    fetchWOs();
    fetchMasterData();
  }, []);

  useEffect(() => {
    if (formData.vehicle_entry_id && entries.length > 0) {
      const entry = entries.find(e => e.id === formData.vehicle_entry_id);
      setSelectedEntryDetails(entry);
    } else {
      setSelectedEntryDetails(null);
    }
  }, [formData.vehicle_entry_id, entries]);

  async function fetchMasterData() {
    // Fetch OPEN Vehicle Entries that haven't been processed yet
    const { data: e } = await supabase
      .from('vehicle_entries')
      .select(`
        *, 
        vehicles (*),
        vehicle_entry_jobs (
          *,
          job_types (*)
        )
      `)
      .eq('status', 'OPEN');
    setEntries(e as any || []);

    const { data: m } = await supabase.from('mechanics').select('*');
    setMechanics(m || []);
  }

  async function fetchWOs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          mechanics (*),
          vehicle_entries (
            *,
            vehicles (*)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWos(data as any || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data WO: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      work_date: new Date().toISOString().split('T')[0],
      vehicle_entry_id: '',
      mechanic_id: '',
    });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (item: WOWithDetails) => {
    setFormData({
      work_date: item.work_date,
      vehicle_entry_id: item.vehicle_entry_id || '',
      mechanic_id: item.mechanic_id || '',
    });
    setIsEditing(true);
    setCurrentId(item.id);
    setIsDialogOpen(true);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('work_orders')
        .update({ status: newStatus } as any)
        .eq('id', id);
      
      if (error) throw error;
      
      toast.success(`Status WO diubah menjadi ${newStatus}`);
      fetchWOs();
    } catch (error: any) {
      toast.error('Gagal update status: ' + error.message);
    }
  };

  const handlePrint = async (wo: WOWithDetails) => {
    // Fetch full details for printing
    try {
      const { data: entry } = await supabase
        .from('vehicle_entries')
        .select(`
          *,
          vehicle_entry_jobs (
            *,
            job_types (*)
          ),
          vehicle_entry_spareparts (*)
        `)
        .eq('id', wo.vehicle_entry_id || '')
        .single();

      if (entry) {
        setPrintData({
          wo,
          entry
        });
        setIsPrintDialogOpen(true);
      }
    } catch (e) {
      toast.error("Gagal memuat data cetak");
    }
  };

  const handlePrintSPK = () => {
    const printContent = document.getElementById('printable-spk');
    if (printContent) {
      const originalContents = document.body.innerHTML;
      document.body.innerHTML = printContent.innerHTML;
      window.print();
      document.body.innerHTML = originalContents;
      window.location.reload(); // Reload to restore event handlers
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        work_date: formData.work_date,
        vehicle_entry_id: formData.vehicle_entry_id,
        mechanic_id: formData.mechanic_id,
        status: 'OPEN',
      };

      if (isEditing && currentId) {
        const { error } = await supabase
          .from('work_orders')
          .update(payload as any)
          .eq('id', currentId);
        if (error) throw error;
        toast.success('WO diperbarui');
      } else {
        const { error } = await supabase
          .from('work_orders')
          .insert([payload as any]);
        if (error) throw error;
        
        // Also update Vehicle Entry status to PROCESSED
        if (formData.vehicle_entry_id) {
           await supabase
             .from('vehicle_entries')
             .update({ status: 'PROCESSED' } as any)
             .eq('id', formData.vehicle_entry_id);
        }

        toast.success('WO berhasil dibuat');
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchWOs();
      fetchMasterData(); // Refresh available entries
    } catch (error: any) {
      toast.error('Gagal menyimpan WO: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredWOs = wos.filter(w => 
    w.wo_number.toLowerCase().includes(search.toLowerCase()) ||
    w.vehicle_entries?.vehicles?.license_plate.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Work Order (WO)</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Buat WO Baru</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Work Order' : 'Buat Work Order Baru'}</DialogTitle>
              <DialogDescription>Tugaskan mekanik untuk perbaikan kendaraan.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                    <Label>Tanggal WO</Label>
                    <Input type="date" value={formData.work_date} onChange={(e) => setFormData({...formData, work_date: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Pilih Mekanik</Label>
                    <Select value={formData.mechanic_id} onValueChange={(v) => handleSelectChange('mechanic_id', v)}>
                      <SelectTrigger><SelectValue placeholder="Pilih Mekanik" /></SelectTrigger>
                      <SelectContent>
                        {mechanics.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name} ({m.specialization})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Referensi Nota Dinas (Entry Kendaraan)</Label>
                  <Combobox
                    options={entries.map(e => ({
                      value: e.id,
                      label: `${e.vehicles?.license_plate} (${e.vehicles?.brand_type}) - ${new Date(e.entry_date).toLocaleDateString('id-ID')}`
                    }))}
                    value={formData.vehicle_entry_id}
                    onChange={(v) => handleSelectChange('vehicle_entry_id', v)}
                    placeholder="Pilih Kendaraan Masuk"
                    searchPlaceholder="Cari plat nomor atau merk..."
                    emptyText="Tidak ada kendaraan masuk status OPEN."
                    disabled={isEditing}
                  />
                  <p className="text-xs text-muted-foreground">Hanya menampilkan kendaraan masuk yang belum diproses.</p>
                </div>

                {/* Entry Details Preview */}
                {selectedEntryDetails && (
                  <div className="space-y-3 border rounded-md p-3 bg-slate-50">
                    <div className="flex justify-between">
                      <Label className="text-sm font-semibold">Detail Kendaraan & Keluhan</Label>
                      <Badge variant="outline">{selectedEntryDetails.nota_dinas_number}</Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground block">Nopol</span>
                        <span className="font-medium">{selectedEntryDetails.vehicles?.license_plate}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Tipe</span>
                        <span className="font-medium">{selectedEntryDetails.vehicles?.brand_type}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block">Daftar Pekerjaan (Entry)</span>
                      {selectedEntryDetails.vehicle_entry_jobs && selectedEntryDetails.vehicle_entry_jobs.length > 0 ? (
                        <div className="space-y-1 pl-1">
                          {selectedEntryDetails.vehicle_entry_jobs.map((job: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <Badge variant="secondary" className="text-[10px] px-1 h-4">
                                {job.job_types?.job_group === 'PERBAIKAN' ? 'PRB' : 'SRV'}
                              </Badge>
                              <span>{job.job_types?.job_name}</span>
                              {job.notes && <span className="text-muted-foreground italic">- {job.notes}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">Tidak ada detail pekerjaan</span>
                      )}
                    </div>

                    {selectedEntryDetails.notes && (
                      <div className="text-xs bg-yellow-50 p-2 rounded text-yellow-800 border border-yellow-100">
                        <span className="font-semibold">Catatan Entry:</span> {selectedEntryDetails.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan WO'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between">
            <CardTitle>Daftar Work Order</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari No. WO / Nopol..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. WO</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Kendaraan</TableHead>
                  <TableHead>Mekanik</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWOs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24">Tidak ada data WO.</TableCell></TableRow>
                ) : (
                  filteredWOs.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.wo_number}</TableCell>
                      <TableCell>{formatDate(item.work_date)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{item.vehicle_entries?.vehicles?.license_plate}</span>
                          <span className="text-xs text-muted-foreground">{item.vehicle_entries?.nota_dinas_number}</span>
                        </div>
                      </TableCell>
                      <TableCell>{item.mechanics?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={
                          item.status === 'OPEN' ? 'secondary' : 
                          item.status === 'IN_PROGRESS' ? 'default' : 
                          item.status === 'COMPLETED' ? 'outline' : 'destructive'
                        } className={item.status === 'COMPLETED' ? 'bg-green-100 text-green-800 border-transparent' : ''}>
                          {item.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {item.status === 'OPEN' && (
                            <Button size="sm" variant="outline" onClick={() => handleStatusChange(item.id, 'IN_PROGRESS')}>
                              <Play className="h-4 w-4 mr-1" /> Mulai
                            </Button>
                          )}
                          {item.status === 'IN_PROGRESS' && (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8" onClick={() => handleStatusChange(item.id, 'COMPLETED')}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Selesai
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-8" onClick={() => handlePrint(item)}>
                             <ClipboardCheck className="h-4 w-4 mr-1" /> SPK
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}><Eye className="h-4 w-4" /></Button>
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

      {/* Print SPK Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Cetak Surat Perintah Kerja (SPK)</DialogTitle>
          </DialogHeader>
          
          <div className="border p-4 rounded bg-white max-h-[60vh] overflow-y-auto" id="printable-spk">
            {printData && (
              <div className="space-y-6 text-sm font-sans">
                {/* Header */}
                <div className="text-center border-b pb-4 mb-4">
                  <h1 className="text-xl font-bold uppercase">Surat Perintah Kerja (SPK)</h1>
                  <p className="text-muted-foreground">No. WO: {printData.wo.wo_number}</p>
                </div>

                {/* Info */}
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <p><span className="font-semibold w-24 inline-block">Tanggal:</span> {formatDate(printData.wo.work_date)}</p>
                    <p><span className="font-semibold w-24 inline-block">Nopol:</span> {printData.wo.vehicle_entries?.vehicles?.license_plate}</p>
                    <p><span className="font-semibold w-24 inline-block">Kendaraan:</span> {printData.wo.vehicle_entries?.vehicles?.brand_type}</p>
                    <p><span className="font-semibold w-24 inline-block">Odometer:</span> {printData.entry.current_odometer?.toLocaleString()} km</p>
                  </div>
                  <div className="space-y-1">
                    <p><span className="font-semibold w-24 inline-block">Mekanik:</span> {printData.wo.mechanics?.name}</p>
                    <p><span className="font-semibold w-24 inline-block">Nota Dinas:</span> {printData.entry.nota_dinas_number}</p>
                    <p><span className="font-semibold w-24 inline-block">Driver:</span> {printData.entry.driver_name}</p>
                  </div>
                </div>

                {/* Job List */}
                <div>
                    <h3 className="font-bold border-b mb-2 pb-1">Daftar Pekerjaan (Jasa)</h3>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b">
                                <th className="py-2 w-10">No</th>
                                <th className="py-2">Deskripsi Pekerjaan</th>
                                <th className="py-2 w-1/3">Catatan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {printData.entry.vehicle_entry_jobs?.map((job: any, i: number) => (
                                <tr key={i} className="border-b border-slate-100">
                                    <td className="py-2">{i+1}</td>
                                    <td className="py-2 font-medium">{job.job_types?.job_name}</td>
                                    <td className="py-2 text-muted-foreground italic">{job.notes || '-'}</td>
                                </tr>
                            ))}
                            {(!printData.entry.vehicle_entry_jobs || printData.entry.vehicle_entry_jobs.length === 0) && (
                                <tr><td colSpan={3} className="py-4 text-center italic text-muted-foreground">Tidak ada jasa</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Part List */}
                <div>
                    <h3 className="font-bold border-b mb-2 pb-1">Daftar Sparepart / Bahan</h3>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b">
                                <th className="py-2 w-10">No</th>
                                <th className="py-2">Nama Sparepart</th>
                                <th className="py-2 w-20 text-center">Qty</th>
                                <th className="py-2 w-20">Satuan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {printData.entry.vehicle_entry_spareparts?.map((part: any, i: number) => (
                                <tr key={i} className="border-b border-slate-100">
                                    <td className="py-2">{i+1}</td>
                                    <td className="py-2 font-medium">{part.sparepart_name}</td>
                                    <td className="py-2 text-center">{part.qty}</td>
                                    <td className="py-2">{part.unit || 'Pcs'}</td>
                                </tr>
                            ))}
                             {(!printData.entry.vehicle_entry_spareparts || printData.entry.vehicle_entry_spareparts.length === 0) && (
                                <tr><td colSpan={4} className="py-4 text-center italic text-muted-foreground">Tidak ada sparepart</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-4 pt-12 mt-8 text-center">
                    <div>
                        <p className="mb-16">Kepala Mekanik</p>
                        <p className="font-bold underline">( ....................... )</p>
                    </div>
                     <div>
                        <p className="mb-16">Mekanik</p>
                        <p className="font-bold underline">( {printData.wo.mechanics?.name} )</p>
                    </div>
                    <div>
                        <p className="mb-16">Pengemudi</p>
                        <p className="font-bold underline">( {printData.entry.driver_name || '.......................'} )</p>
                    </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
             <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>Tutup</Button>
             <Button onClick={handlePrintSPK}><ClipboardCheck className="mr-2 h-4 w-4" /> Cetak Sekarang</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}