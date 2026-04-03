import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, Printer, Check, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate, cn } from '@/lib/utils';
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from "@/components/ui/command";
import { useRealtimeRefetch } from '@/hooks/useRealtimeRefetch';
import { useAuth } from '@/context/AuthContext';

type VehicleEntry = Database['public']['Tables']['vehicle_entries']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Job = Database['public']['Tables']['job_types']['Row'];

type EntryJobDetail = Database['public']['Tables']['vehicle_entry_jobs']['Row'] & {
  job_types: Job | null;
};

type EntryWithDetails = VehicleEntry & {
  vehicles: Vehicle | null;
  vehicle_entry_jobs: EntryJobDetail[];
  vehicle_entry_spareparts: Database['public']['Tables']['vehicle_entry_spareparts']['Row'][];
  work_orders: { status: string; wo_number: string }[];
};

type SparepartDraft = {
  name: string;
  qty: number;
  price: number;
  value_only: boolean;
};

export default function VehicleEntryPage() {
  const { user } = useAuth();
  const canAdjustEstimationPrice = String(user?.role || '').toUpperCase().includes('ADMIN');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [entries, setEntries] = useState<EntryWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Vehicle Search State
  const [isVehicleSearchOpen, setIsVehicleSearchOpen] = useState(false);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');

  // Job Search State
  const [isJobSearchOpen, setIsJobSearchOpen] = useState(false);
  const [activeJobSearchIndex, setActiveJobSearchIndex] = useState<number | null>(null);
  const [jobSearchQuery, setJobSearchQuery] = useState('');

  // Dropdown Data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  
  // Form State
  const [formData, setFormData] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    estimated_finish_date: '',
    vehicle_id: '',
    nota_dinas_number: '',
    service_group: 'PERBAIKAN',
    notes: '',
  });

  // Filter State
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of current month
    endDate: new Date().toISOString().split('T')[0] // Today
  });

  // Multiple Jobs State
  const [entryJobs, setEntryJobs] = useState<{ group: string, job_id: string; job_name?: string; notes: string; value_only: boolean; estimated_price: number; spareparts?: SparepartDraft[] }[]>([]);
  
  // Sparepart Dialog State
  const [isSparepartDialogOpen, setIsSparepartDialogOpen] = useState(false);
  const [activeJobIndex, setActiveJobIndex] = useState<number | null>(null);
  const [tempSpareparts, setTempSpareparts] = useState<SparepartDraft[]>([]);
  const [goodsList, setGoodsList] = useState<any[]>([]); // For price lookup

  useEffect(() => {
    fetchEntries();
    fetchMasterData();
  }, [dateFilter]); // Refetch when date filter changes

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
    tables: ['vehicles', 'job_types', 'goods'],
    enabled: isDialogOpen,
    onRefetch: fetchMasterData,
  });

  async function fetchMasterData() {
    const { data: v } = await supabase.from('vehicles').select('*');
    setVehicles(v || []);
    const { data: j } = await supabase.from('job_types').select('*');
    setJobs(j || []);
    const { data: g } = await supabase.from('goods').select('id, name, selling_price, current_stock').order('name');
    setGoodsList(g || []);
  }

  async function fetchEntries() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vehicle_entries')
        .select(`
          *,
          vehicles (*),
          vehicle_entry_jobs (
            *,
            job_types (*)
          ),
          vehicle_entry_spareparts (
            *
          ),
          work_orders (
            status,
            wo_number
          )
        `)
        .gte('entry_date', dateFilter.startDate)
        .lte('entry_date', dateFilter.endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setEntries(data as any || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data entry: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const [isPartSearchOpen, setIsPartSearchOpen] = useState(false);
  const [activePartIndex, setActivePartIndex] = useState<number | null>(null);
  const [partSearchQuery, setPartSearchQuery] = useState('');

  // --- Sparepart Sub-Column Logic ---
  const handleOpenSparepartDialog = (index: number) => {
    setActiveJobIndex(index);
    setTempSpareparts(entryJobs[index].spareparts || []);
    setIsSparepartDialogOpen(true);
  };

  const handleAddTempSparepart = () => {
    setTempSpareparts([...tempSpareparts, { name: '', qty: 1, price: 0, value_only: false }]);
  };

  const handleRemoveTempSparepart = (idx: number) => {
    setTempSpareparts(tempSpareparts.filter((_, i) => i !== idx));
  };

  const handleTempSparepartChange = (idx: number, field: string, value: any) => {
    const newParts = [...tempSpareparts];
    (newParts[idx] as any)[field] = value;
    setTempSpareparts(newParts);
  };

  const handleSelectGoodForSparepart = (good: any) => {
      if (activePartIndex !== null) {
          const newParts = [...tempSpareparts];
          newParts[activePartIndex].name = good.name;
          newParts[activePartIndex].price = good.selling_price || 0;
          setTempSpareparts(newParts);
          setIsPartSearchOpen(false);
          setPartSearchQuery('');
      }
  };

  const handleSaveSpareparts = () => {
    if (activeJobIndex !== null) {
      const newJobs = [...entryJobs];
      newJobs[activeJobIndex].spareparts = tempSpareparts;
      setEntryJobs(newJobs);
    }
    setIsSparepartDialogOpen(false);
  };

  const calculateTotalPagu = (parts: any[]) => {
      return parts.reduce((sum: number, p: any) => sum + (p.qty * p.price), 0);
  };

  const getBaseJobGroup = (group: string) => {
    const g = String(group || '').toUpperCase();
    if (g.includes('SERVICE')) return 'SERVICE_RINGAN';
    return 'PERBAIKAN';
  };

  const isJobGroupMatch = (jobGroup: string, selectedGroup: string) => {
    const a = String(jobGroup || '');
    const b = String(selectedGroup || '');
    if (!a || !b) return false;
    if (a === b) return true;
    return a === getBaseJobGroup(b);
  };

  const getJobPagu = (jobId: string) => {
    if (!jobId) return 0;
    const job = jobs.find((j) => j.id === jobId);
    return Number((job as any)?.selling_price || 0);
  };

  const getJobEstimationFromRow = (row: any) => {
    const epRaw = row?.estimated_price;
    const ep = Number(epRaw);
    const sp = Number(row?.job_types?.selling_price || 0);
    if (Number.isFinite(ep) && ep > 0) return ep;
    if ((!Number.isFinite(ep) || epRaw === null || epRaw === undefined) && sp > 0) return sp;
    if (Number.isFinite(ep) && ep === 0 && sp > 0) return sp;
    return Number.isFinite(ep) ? ep : 0;
  };

  const calculateFormEstimation = () => {
    return entryJobs.reduce((sum, j) => {
      const jobPagu = Number(j.estimated_price || 0);
      const partsPagu = calculateTotalPagu(j.spareparts || []);
      return sum + jobPagu + partsPagu;
    }, 0);
  };

  // Helper to check if job needs sparepart detail
  const needsSparepartDetail = (job: { group: string, job_id: string; job_name?: string }) => {
      const selectedJob = jobs.find(j => j.id === job.job_id);
      const jobName = (job.job_name || selectedJob?.job_name || '').toLowerCase();
      const groupName = job.group?.toUpperCase() || '';
      
      const isPerbaikan = groupName.includes('PERBAIKAN');
      const isGanti = jobName.includes('ganti sparepart') || jobName.includes('ban') || jobName.includes('lainnya');
      
      return isPerbaikan && isGanti;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      entry_date: new Date().toISOString().split('T')[0],
      estimated_finish_date: '',
      vehicle_id: '',
      nota_dinas_number: '',
      service_group: 'PERBAIKAN',
      notes: '',
    });
    setEntryJobs([]);
    setIsVehicleSearchOpen(false);
    setVehicleSearchQuery('');
    setIsJobSearchOpen(false);
    setActiveJobSearchIndex(null);
    setJobSearchQuery('');
    setIsSparepartDialogOpen(false);
    setActiveJobIndex(null);
    setTempSpareparts([]);
    setIsPartSearchOpen(false);
    setActivePartIndex(null);
    setPartSearchQuery('');
    setIsEditing(false);
    setCurrentId(null);
  };

  const handlePrintEntry = (id: string) => {
    window.open(`/print/entry/${id}`, '_blank');
  };

  const handleEdit = async (item: EntryWithDetails) => {
    setFormData({
      entry_date: item.entry_date,
      estimated_finish_date: (item as any).estimated_finish_date || '',
      vehicle_id: item.vehicle_id || '',
      nota_dinas_number: item.nota_dinas_number || '',
      service_group: item.service_group,
      notes: item.notes || '',
    });
    
    const existingJobs = item.vehicle_entry_jobs || [];
    const existingParts = item.vehicle_entry_spareparts || [];

    const mappedJobs = existingJobs.map(j => {
      const jobTypeId = j.job_type_id || '';
      const groupStr = (j.job_types?.job_group || item.service_group) as string;
      const jobName = j.job_types?.job_name || jobs.find(x => x.id === jobTypeId)?.job_name || '';
      const jobEstimated = getJobEstimationFromRow(j);

      const parts = existingParts
        .filter(p => p.job_type_id === jobTypeId)
        .map(p => ({
          name: p.item_name,
          qty: p.qty,
          price: p.estimated_price,
          value_only: Boolean((p as any).value_only),
        }));

      return {
        group: groupStr,
        job_id: jobTypeId,
        job_name: jobName,
        notes: j.notes || '',
        value_only: Boolean((j as any).value_only),
        estimated_price: jobEstimated,
        spareparts: parts,
      };
    });

    const knownJobTypeIds = new Set(mappedJobs.map(j => j.job_id).filter(Boolean));
    const unassignedParts = existingParts.filter(p => !p.job_type_id || !knownJobTypeIds.has(p.job_type_id));
    if (unassignedParts.length > 0) {
      const partsToAdd = unassignedParts.map(p => ({
        name: p.item_name,
        qty: p.qty,
        price: p.estimated_price,
        value_only: Boolean((p as any).value_only),
      }));

      const gantiJobIdx = mappedJobs.findIndex(j => needsSparepartDetail(j));
      if (gantiJobIdx >= 0) {
        mappedJobs[gantiJobIdx].spareparts = [...(mappedJobs[gantiJobIdx].spareparts || []), ...partsToAdd];
      } else if (mappedJobs.length > 0) {
        mappedJobs.push({
          group: 'PERBAIKAN',
          job_id: '',
          job_name: 'Suku Cadang Tambahan',
          notes: 'Suku Cadang Tambahan',
          value_only: false,
          estimated_price: 0,
          spareparts: partsToAdd,
        });
      } else {
        mappedJobs.push({
          group: 'PERBAIKAN',
          job_id: '',
          job_name: 'Suku Cadang Tambahan',
          notes: 'Suku Cadang Tambahan',
          value_only: false,
          estimated_price: 0,
          spareparts: partsToAdd,
        });
      }
    }

    if (mappedJobs.length === 0) {
      if (existingParts.length > 0) {
        setEntryJobs([
          {
            group: 'PERBAIKAN',
            job_id: '',
            job_name: 'Suku Cadang Tambahan',
            notes: 'Suku Cadang Tambahan',
            value_only: false,
            estimated_price: 0,
            spareparts: existingParts.map(p => ({
              name: p.item_name,
              qty: p.qty,
              price: p.estimated_price,
              value_only: Boolean((p as any).value_only),
            })),
          },
        ]);
      } else {
        setEntryJobs([{ group: item.service_group as string, job_id: '', job_name: '', notes: '', value_only: false, estimated_price: 0, spareparts: [] }]);
      }
    } else {
      setEntryJobs(mappedJobs);
    }

    setIsEditing(true);
    setCurrentId(item.id);
    setIsDialogOpen(true);
  };

  const handleAddJob = () => {
    setEntryJobs([...entryJobs, { group: 'PERBAIKAN', job_id: '', job_name: '', notes: '', value_only: false, estimated_price: 0, spareparts: [] }]);
  };

  const handleRemoveJob = (index: number) => {
    setEntryJobs(entryJobs.filter((_, i) => i !== index));
  };

  const handleJobChange = (index: number, field: 'group' | 'job_id' | 'notes', value: string) => {
    const newJobs = [...entryJobs];
    if (field === 'group') {
      newJobs[index].group = value;
      newJobs[index].job_id = ''; // Reset job when group changes
      newJobs[index].job_name = '';
      newJobs[index].value_only = false;
      newJobs[index].estimated_price = 0;
    } else if (field === 'job_id') {
      newJobs[index].job_id = value;
      const job = jobs.find(j => j.id === value);
      newJobs[index].job_name = job?.job_name || '';
      newJobs[index].estimated_price = Number((job as any)?.selling_price || 0);
    } else {
      newJobs[index].notes = value;
    }
    setEntryJobs(newJobs);
  };

  const handleSelectJob = (jobId: string) => {
    if (activeJobSearchIndex !== null) {
      handleJobChange(activeJobSearchIndex, 'job_id', jobId);
      setIsJobSearchOpen(false);
      setJobSearchQuery('');
    }
  };

  const handleJobValueOnlyChange = (index: number, v: boolean) => {
    const newJobs = [...entryJobs];
    newJobs[index].value_only = v;
    setEntryJobs(newJobs);
  };

  const handleJobEstimatedPriceChange = (index: number, v: number) => {
    const newJobs = [...entryJobs];
    newJobs[index].estimated_price = Math.max(0, Number(v) || 0);
    setEntryJobs(newJobs);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus entry kendaraan ini?')) return;
    try {
      const { error } = await supabase.from('vehicle_entries').delete().eq('id', id);
      if (error) throw error;
      toast.success('Data dihapus');
      fetchEntries();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const entryPayload = {
        entry_date: formData.entry_date,
        estimated_finish_date: formData.estimated_finish_date ? formData.estimated_finish_date : null,
        vehicle_id: formData.vehicle_id,
        nota_dinas_number: formData.nota_dinas_number,
        service_group: formData.service_group,
        notes: formData.notes,
        status: 'OPEN',
      };

      let targetId = currentId;

      if (isEditing && currentId) {
        const { error } = await supabase
          .from('vehicle_entries')
          .update(entryPayload as any)
          .eq('id', currentId);
        if (error) throw error;
        
        // Update Jobs: Delete all and re-insert
        await supabase.from('vehicle_entry_jobs').delete().eq('vehicle_entry_id', currentId);
        // Delete old spareparts
        await supabase.from('vehicle_entry_spareparts').delete().eq('vehicle_entry_id', currentId);

      } else {
        const { data: newEntry, error } = await supabase
          .from('vehicle_entries')
          .insert([entryPayload as any])
          .select()
          .single();
        
        if (error) throw error;
        targetId = newEntry.id;
      }
        
      if (targetId && entryJobs.length > 0) {
          // Insert Jobs
          {
            const { error: colErr } = await supabase
              .from('vehicle_entry_jobs')
              .select('estimated_price')
              .limit(1);
            if (colErr) {
              toast.error("DB belum siap: kolom 'estimated_price' (pekerjaan) belum ada. Jalankan migration 20240309_schema_update_v3.sql di Supabase.");
              return;
            }
          }
          if (entryJobs.some((j) => Boolean(j.value_only))) {
            const { error: colErr } = await supabase
              .from('vehicle_entry_jobs')
              .select('value_only')
              .limit(1);
            if (colErr) {
              toast.error("DB belum siap: kolom 'value_only' (pekerjaan) belum ada. Jalankan migration 20260331_add_value_only_to_vehicle_entry_jobs.sql di Supabase.");
              return;
            }
          }
          const jobsPayload = entryJobs.map(j => ({
            vehicle_entry_id: targetId,
            job_type_id: j.job_id,
            notes: j.notes,
            value_only: Boolean(j.value_only),
            estimated_price: Number(j.estimated_price || 0),
          }));
          const { error: jobsError } = await supabase.from('vehicle_entry_jobs').insert(jobsPayload);
          if (jobsError) throw jobsError;

          // Insert Spareparts
          const allSpareparts: any[] = [];
          entryJobs.forEach(job => {
              if (job.spareparts && job.spareparts.length > 0) {
                  job.spareparts.forEach(part => {
                      allSpareparts.push({
                          vehicle_entry_id: targetId,
                          job_type_id: job.job_id,
                          item_name: part.name,
                          qty: part.qty,
                          estimated_price: part.price,
                          value_only: Boolean(part.value_only),
                      });
                  });
              }
          });

          if (allSpareparts.length > 0) {
               const hasValueOnly = allSpareparts.some((p) => Boolean((p as any).value_only));
               if (hasValueOnly) {
                 const { error: colErr } = await supabase
                   .from('vehicle_entry_spareparts')
                   .select('value_only')
                   .limit(1);
                 if (colErr) {
                   toast.error("DB belum siap: kolom 'value_only' belum ada. Jalankan migration 20260331_add_value_only_flags.sql di Supabase.");
                   return;
                 }
               }
               const { error: spError } = await supabase.from('vehicle_entry_spareparts').insert(allSpareparts);
               if (spError) throw spError;
          }
      }

      toast.success(isEditing ? 'Entry diperbarui' : 'Entry kendaraan berhasil');
      
      setIsDialogOpen(false);
      resetForm();
      fetchEntries();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateEstimation = (entry: EntryWithDetails) => {
    let total = 0;
    // Job Estimation
    entry.vehicle_entry_jobs?.forEach(job => {
        total += getJobEstimationFromRow(job);
    });
    // Part Estimation
    entry.vehicle_entry_spareparts?.forEach(part => {
        total += (part.estimated_price || 0) * (part.qty || 0);
    });
    return total;
  };

  const searchLower = search.toLowerCase();
  const filteredEntries = entries.filter((e) => {
    const entryNumber = String((e as any).entry_number || '').toLowerCase();
    const plate = String(e.vehicles?.license_plate || '').toLowerCase();
    return entryNumber.includes(searchLower) || plate.includes(searchLower);
  });

  const classifyVehicleType = (vehicleType?: string | null) => {
    const vt = String(vehicleType || '').toUpperCase();
    if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
    if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
    if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
    return '-';
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Entry Kendaraan Masuk</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Entry Baru</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Entry' : 'Entry Kendaraan Masuk'}</DialogTitle>
              <DialogDescription>Catat kendaraan masuk untuk perbaikan/service.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tanggal Masuk</Label>
                      <Input name="entry_date" type="date" value={formData.entry_date} onChange={handleInputChange} required />
                    </div>
                    <div className="space-y-2">
                      <Label>No. Nota Dinas</Label>
                      <Input name="nota_dinas_number" value={formData.nota_dinas_number} onChange={handleInputChange} placeholder="ND-..." required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Tgl Estimasi Unit Selesai</Label>
                    <Input name="estimated_finish_date" type="date" value={formData.estimated_finish_date} onChange={handleInputChange} />
                  </div>

                  <div className="space-y-2">
                    <Label>Pilih Kendaraan (Nopol)</Label>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between font-normal",
                        !formData.vehicle_id && "text-muted-foreground"
                      )}
                      onClick={(e) => { e.preventDefault(); setIsVehicleSearchOpen(true); }}
                    >
                      {formData.vehicle_id
                        ? vehicles.find(v => v.id === formData.vehicle_id)?.license_plate
                        : "Cari Nopol..."}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </div>

                  {/* Vehicle Search Dialog */}
                  <Dialog open={isVehicleSearchOpen} onOpenChange={setIsVehicleSearchOpen}>
                    <DialogContent className="sm:max-w-[500px] p-0">
                      <Command>
                        <CommandInput 
                          placeholder="Cari Nopol atau Tipe..." 
                          value={vehicleSearchQuery} 
                          onChange={(e) => setVehicleSearchQuery(e.target.value)} 
                        />
                        <CommandList>
                          <CommandEmpty>Kendaraan tidak ditemukan.</CommandEmpty>
                          <CommandGroup heading="Daftar Kendaraan">
                            {vehicles
                              .filter(v => 
                                v.license_plate.toLowerCase().includes(vehicleSearchQuery.toLowerCase()) ||
                                (v.brand_type && v.brand_type.toLowerCase().includes(vehicleSearchQuery.toLowerCase()))
                              )
                              .map(v => (
                                <CommandItem
                                  key={v.id}
                                  onSelect={() => {
                                    handleSelectChange('vehicle_id', v.id);
                                    setIsVehicleSearchOpen(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-bold">{v.license_plate}</span>
                                    <span className="text-xs text-muted-foreground">{v.brand_type}</span>
                                  </div>
                                  {formData.vehicle_id === v.id && <Check className="ml-auto h-4 w-4" />}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </DialogContent>
                  </Dialog>

                  {/* Job Search Dialog */}
                  <Dialog open={isJobSearchOpen} onOpenChange={setIsJobSearchOpen}>
                    <DialogContent className="sm:max-w-[500px] p-0">
                      <Command>
                        <CommandInput 
                          placeholder="Cari jenis pekerjaan..." 
                          value={jobSearchQuery} 
                          onChange={(e) => setJobSearchQuery(e.target.value)} 
                        />
                        <CommandList>
                          <CommandEmpty>Pekerjaan tidak ditemukan.</CommandEmpty>
                          <CommandGroup heading="Daftar Pekerjaan">
                            {activeJobSearchIndex !== null && entryJobs[activeJobSearchIndex] && jobs
                              .filter(j => isJobGroupMatch((j as any).job_group, entryJobs[activeJobSearchIndex].group))
                              .filter(j => j.job_name.toLowerCase().includes(jobSearchQuery.toLowerCase()))
                              .map(j => (
                                <CommandItem
                                  key={j.id}
                                  onSelect={() => handleSelectJob(j.id)}
                                >
                                  {j.job_name}
                                  {entryJobs[activeJobSearchIndex]?.job_id === j.id && <Check className="ml-auto h-4 w-4" />}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </DialogContent>
                  </Dialog>

                  {/* Multiple Jobs Selection */}
                  <div className="space-y-3 border p-3 rounded-md bg-slate-50">
                    <div className="flex justify-between items-center">
                      <Label>Daftar Pekerjaan / Service (Bisa Campuran Group)</Label>
                      <Button type="button" variant="outline" size="sm" onClick={handleAddJob}>+ Tambah Pekerjaan</Button>
                    </div>
                    
                    {entryJobs.map((job, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end border-b pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                        <div className="col-span-4 space-y-1">
                          <Label className="text-xs">Group Service {index + 1}</Label>
                          <Select value={job.group} onValueChange={(v) => handleJobChange(index, 'group', v)}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                        <div className="col-span-6 space-y-1">
                          <Label className="text-xs">Jenis Pekerjaan {index + 1}</Label>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between font-normal h-9 px-3",
                              !job.job_id && "text-muted-foreground"
                            )}
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveJobSearchIndex(index);
                              setIsJobSearchOpen(true);
                            }}
                          >
                            <span className="truncate">
                              {job.job_id
                                ? jobs.find(j => j.id === job.job_id)?.job_name
                                : "Pilih Pekerjaan..."}
                            </span>
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </div>
                        <div className="col-span-1 space-y-1">
                          <Label className="text-xs">Nilai Saja</Label>
                          <div className="flex items-center justify-center h-9 border rounded-md bg-white">
                            <Checkbox
                              checked={Boolean(job.value_only)}
                              onCheckedChange={(v) => handleJobValueOnlyChange(index, Boolean(v))}
                            />
                          </div>
                        </div>
                        <div className="col-span-1">
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-500" onClick={() => handleRemoveJob(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {job.job_id && (
                          <div className="col-span-12 mt-2 pl-4 border-l-2 border-slate-200">
                            <div className="bg-white p-2 rounded-md">
                              <div className="flex justify-between items-center mb-2">
                                <Label className="text-xs font-bold text-slate-700">Rincian Pekerjaan (Estimasi)</Label>
                              </div>
                              <Table className="bg-white rounded-md border text-xs">
                                <TableHeader>
                                  <TableRow className="h-8 hover:bg-transparent">
                                    <TableHead className="h-8 py-1">Nama Pekerjaan</TableHead>
                                    <TableHead className="h-8 py-1 text-right">Harga Pagu</TableHead>
                                    <TableHead className="h-8 py-1 text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  <TableRow className="h-8 hover:bg-transparent border-b">
                                    <TableCell className="py-1">
                                      {jobs.find((j) => j.id === job.job_id)?.job_name || job.job_name || '-'}
                                    </TableCell>
                                    <TableCell className="py-1 text-right">
                                      {canAdjustEstimationPrice ? (
                                        <Input
                                          type="number"
                                          value={Number(job.estimated_price || 0)}
                                          onChange={(e) => handleJobEstimatedPriceChange(index, Number(e.target.value))}
                                          className="h-7 text-right"
                                        />
                                      ) : (
                                        Number(job.estimated_price || 0).toLocaleString('id-ID')
                                      )}
                                    </TableCell>
                                    <TableCell className="py-1 text-right font-medium">
                                      {Number(job.estimated_price || 0).toLocaleString('id-ID')}
                                    </TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                        
                        {/* Sub-column for Sparepart Detail (Conditional) */}
                        {(needsSparepartDetail(job) || (job.spareparts && job.spareparts.length > 0)) && (
                            <div className="col-span-12 mt-2 pl-4 border-l-2 border-orange-200">
                                <div className="bg-orange-50 p-2 rounded-md">
                                    <div className="flex justify-between items-center mb-2">
                                        <Label className="text-xs font-bold text-orange-800">Rincian Sparepart / Ban (Estimasi)</Label>
                                        <Button type="button" variant="outline" size="sm" className="h-6 text-xs bg-white" onClick={() => handleOpenSparepartDialog(index)}>
                                            {job.spareparts && job.spareparts.length > 0 ? 'Edit Rincian' : '+ Input Rincian'}
                                        </Button>
                                    </div>
                                    
                                    {job.spareparts && job.spareparts.length > 0 ? (
                                        <Table className="bg-white rounded-md border text-xs">
                                            <TableHeader>
                                                <TableRow className="h-8 hover:bg-transparent">
                                                    <TableHead className="h-8 py-1">Nama Barang</TableHead>
                                                    <TableHead className="h-8 py-1 w-[50px]">Qty</TableHead>
                                                    <TableHead className="h-8 py-1 text-right">Harga Pagu</TableHead>
                                                    <TableHead className="h-8 py-1 text-right">Total</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {job.spareparts.map((part, pIdx) => (
                                                    <TableRow key={pIdx} className="h-8 hover:bg-transparent border-b">
                                                        <TableCell className="py-1">{part.name}</TableCell>
                                                        <TableCell className="py-1 text-center">{part.qty}</TableCell>
                                                        <TableCell className="py-1 text-right">{part.price.toLocaleString('id-ID')}</TableCell>
                                                        <TableCell className="py-1 text-right font-medium">{(part.qty * part.price).toLocaleString('id-ID')}</TableCell>
                                                    </TableRow>
                                                ))}
                                                <TableRow className="h-8 bg-orange-100 hover:bg-orange-100 font-bold">
                                                    <TableCell colSpan={3} className="py-1 text-right">Total Estimasi:</TableCell>
                                                    <TableCell className="py-1 text-right">{calculateTotalPagu(job.spareparts).toLocaleString('id-ID')}</TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <p className="text-xs text-orange-600 italic">Belum ada rincian barang.</p>
                                    )}
                                </div>
                            </div>
                        )}
                      </div>
                    ))}
                    {entryJobs.length === 0 && (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground italic mb-2">Belum ada pekerjaan dipilih.</p>
                        <Button type="button" variant="secondary" size="sm" onClick={handleAddJob}>+ Tambah Pekerjaan Pertama</Button>
                      </div>
                    )}
                    {entryJobs.length > 0 && (
                      <div className="flex justify-end pt-2">
                        <div className="text-sm font-semibold">
                          Total Estimasi: {calculateFormEstimation().toLocaleString('id-ID')}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Catatan / Keluhan</Label>
                    <Input name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Deskripsi kerusakan..." />
                  </div>
                  
                  <div className="flex items-center space-x-2 border p-3 rounded-md bg-slate-50">
                    <Checkbox id="sparepart" />
                    <label htmlFor="sparepart" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Perlu Penggantian Sparepart? (Check untuk buka dialog sparepart nanti)
                    </label>
                  </div>
                </div>
              </div>
              <DialogFooter className="pt-2 border-t mt-auto">
                <Button type="submit" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan Entry'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Sparepart Detail Dialog */}
        <Dialog open={isSparepartDialogOpen} onOpenChange={setIsSparepartDialogOpen}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Input Rincian Sparepart / Ban</DialogTitle>
                    <DialogDescription>Masukkan estimasi barang dan harga pagu.</DialogDescription>
                </DialogHeader>
                
                <div className="py-4">
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                        {tempSpareparts.map((part, idx) => (
                            <div key={idx} className="flex gap-2 items-end border-b pb-2">
                                <div className="flex-1 space-y-1">
                                    <Label className="text-xs">Nama Barang</Label>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className={cn(
                                            "w-full justify-between font-normal h-8 text-xs px-2",
                                            !part.name && "text-muted-foreground"
                                        )}
                                        onClick={() => {
                                            setActivePartIndex(idx);
                                            setIsPartSearchOpen(true);
                                        }}
                                    >
                                        {part.name || "Pilih Barang..."}
                                        <Search className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                    </Button>
                                </div>
                                <div className="w-16 space-y-1">
                                    <Label className="text-xs">Qty</Label>
                                    <Input 
                                        type="number" 
                                        value={part.qty} 
                                        onChange={(e) => handleTempSparepartChange(idx, 'qty', parseInt(e.target.value) || 0)} 
                                        className="h-8 text-center"
                                    />
                                </div>
                                <div className="w-24 space-y-1">
                                    <Label className="text-xs">Nilai Saja</Label>
                                    <div className="flex items-center justify-center h-8 border rounded-md bg-white">
                                      <Checkbox
                                        checked={Boolean(part.value_only)}
                                        onCheckedChange={(v) => handleTempSparepartChange(idx, 'value_only', Boolean(v))}
                                      />
                                    </div>
                                </div>
                                <div className="w-28 space-y-1">
                                    <Label className="text-xs">Harga Pagu</Label>
                                    <Input 
                                        type="number" 
                                        value={part.price} 
                                        readOnly={!canAdjustEstimationPrice}
                                        onChange={(e) => {
                                          if (!canAdjustEstimationPrice) return;
                                          handleTempSparepartChange(idx, 'price', Number(e.target.value) || 0);
                                        }}
                                        className={cn(
                                          "h-8 text-right",
                                          canAdjustEstimationPrice ? "bg-white" : "bg-gray-100 text-gray-500"
                                        )}
                                    />
                                </div>
                                <div className="w-28 space-y-1">
                                    <Label className="text-xs">Total</Label>
                                    <Input 
                                        value={(part.qty * part.price).toLocaleString('id-ID')}
                                        readOnly
                                        className="h-8 text-right bg-gray-100 font-bold text-slate-700"
                                    />
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleRemoveTempSparepart(idx)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddTempSparepart} className="mt-2 w-full border-dashed">
                        + Tambah Baris Barang
                    </Button>
                    
                    <div className="mt-4 p-3 bg-gray-100 rounded-md flex justify-between items-center font-bold">
                        <span>Total Estimasi Pagu:</span>
                        <span>{calculateTotalPagu(tempSpareparts).toLocaleString('id-ID')}</span>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsSparepartDialogOpen(false)}>Batal</Button>
                    <Button onClick={handleSaveSpareparts}>Simpan Rincian</Button>
                </DialogFooter>

                {/* Nested Dialog for Part Search */}
                <Dialog open={isPartSearchOpen} onOpenChange={setIsPartSearchOpen}>
                    <DialogContent className="sm:max-w-[400px] p-0">
                        <Command>
                            <CommandInput 
                                placeholder="Cari nama barang..." 
                                value={partSearchQuery}
                                onChange={(e) => setPartSearchQuery(e.target.value)}
                            />
                            <CommandList>
                                <CommandEmpty>Barang tidak ditemukan.</CommandEmpty>
                                <CommandGroup heading="Daftar Barang">
                                    {goodsList
                                        .filter(g => g.name.toLowerCase().includes(partSearchQuery.toLowerCase()))
                                        .slice(0, 20)
                                        .map(g => (
                                            <CommandItem
                                                key={g.id}
                                                onSelect={() => handleSelectGoodForSparepart(g)}
                                                className="flex flex-col items-start py-2"
                                            >
                                                <span className="font-bold text-sm">{g.name}</span>
                                                <div className="flex gap-2 text-xs text-muted-foreground">
                                                    <span>Stok: {g.current_stock}</span>
                                                    <span>•</span>
                                                    <span>Rp {g.selling_price?.toLocaleString('id-ID')}</span>
                                                </div>
                                            </CommandItem>
                                        ))
                                    }
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center mb-4">
             <CardTitle>Riwayat Kendaraan Masuk</CardTitle>
             <div className="flex gap-2 items-center">
                <div className="flex items-center gap-2 bg-white border rounded-md px-2 py-1">
                  <span className="text-sm text-gray-500">Periode:</span>
                  <Input 
                    type="date" 
                    className="w-auto border-0 p-0 h-auto focus-visible:ring-0 text-xs"
                    value={dateFilter.startDate} 
                    onChange={(e) => setDateFilter({...dateFilter, startDate: e.target.value})} 
                  />
                  <span className="text-sm text-gray-500">-</span>
                  <Input 
                    type="date" 
                    className="w-auto border-0 p-0 h-auto focus-visible:ring-0 text-xs"
                    value={dateFilter.endDate} 
                    onChange={(e) => setDateFilter({...dateFilter, endDate: e.target.value})} 
                  />
                </div>
                <div className="relative w-64 ml-4">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Cari No. Entry / Nopol..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Entry</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Est. Selesai</TableHead>
                  <TableHead>Kendaraan</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Nota Dinas</TableHead>
                  <TableHead className="w-[30%]">Daftar Pekerjaan</TableHead>
                  <TableHead className="text-right">Total Estimasi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right w-[140px] pr-6">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center h-24">Tidak ada data entry.</TableCell></TableRow>
                ) : (
                  filteredEntries.map((item) => (
                    <TableRow key={item.id} className="align-top">
                      <TableCell className="font-medium">{item.entry_number}</TableCell>
                      <TableCell>{formatDate(item.entry_date)}</TableCell>
                      <TableCell>{(item as any).estimated_finish_date ? formatDate((item as any).estimated_finish_date) : '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{item.vehicles?.license_plate}</span>
                          <span className="text-xs text-muted-foreground">{item.vehicles?.brand_type}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {classifyVehicleType(item.vehicles?.vehicle_type)}
                        </span>
                      </TableCell>
                      <TableCell>{item.nota_dinas_number || '-'}</TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          {item.vehicle_entry_jobs && item.vehicle_entry_jobs.length > 0 ? (
                            item.vehicle_entry_jobs.map((job, idx) => (
                              <div key={idx} className="flex flex-col text-sm border-b last:border-0 pb-1 last:pb-0">
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    job.job_types?.job_group.includes('PERBAIKAN') ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {job.job_types?.job_group.includes('PERBAIKAN') ? 'PRB' : 'SRV'}
                                  </span>
                                  <span className="font-medium">{job.job_types?.job_name || '-'}</span>
                                </div>
                                {job.notes && <span className="text-xs text-muted-foreground ml-1">- {job.notes}</span>}
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground italic text-xs">Tidak ada detail pekerjaan</span>
                          )}
                          {item.notes && (
                             <div className="mt-2 text-xs bg-slate-50 p-1 rounded">
                               <span className="font-semibold">Catatan Umum:</span> {item.notes}
                             </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {calculateEstimation(item as any).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' }).replace(',00', '')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {(() => {
                            const statusWeight = (s?: string | null) => {
                              const v = String(s || '').toUpperCase();
                              if (v === 'CLOSED') return 4;
                              if (v === 'COMPLETED') return 3;
                              if (v === 'IN_PROGRESS') return 2;
                              if (v === 'OPEN') return 1;
                              return 0;
                            };
                            const woList = Array.isArray(item.work_orders) ? item.work_orders : [];
                            const woBest = woList.reduce((best: any, cur: any) => {
                              if (!best) return cur;
                              return statusWeight(cur?.status) > statusWeight(best?.status) ? cur : best;
                            }, null as any);

                            const woStatus = String(woBest?.status || '').toUpperCase();
                            const woNumber = woBest?.wo_number || '-';
                            const isLocked = woStatus === 'COMPLETED' || woStatus === 'CLOSED';

                            const entryDisplayStatus = isLocked ? 'CLOSED' : woBest ? 'PROCESSED' : 'OPEN';

                            return (
                              <>
                          {/* Entry Status */}
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold w-fit ${
                            entryDisplayStatus === 'OPEN' ? 'bg-green-100 text-green-800' : 
                            entryDisplayStatus === 'CLOSED' ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {entryDisplayStatus}
                          </span>
                          
                          {/* WO Status */}
                          {woBest ? (
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold w-fit ${
                              isLocked ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'
                            }`}>
                              {woStatus === 'COMPLETED'
                                ? `WO ${woNumber} (Selesai)`
                                : woStatus === 'CLOSED'
                                  ? `WO ${woNumber} (Close)`
                                  : `WO ${woNumber} (Proses)`}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic pl-1">Belum WO</span>
                          )}
                              </>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {(() => {
                          const statusWeight = (s?: string | null) => {
                            const v = String(s || '').toUpperCase();
                            if (v === 'CLOSED') return 4;
                            if (v === 'COMPLETED') return 3;
                            if (v === 'IN_PROGRESS') return 2;
                            if (v === 'OPEN') return 1;
                            return 0;
                          };
                          const woList = Array.isArray(item.work_orders) ? item.work_orders : [];
                          const woBest = woList.reduce((best: any, cur: any) => {
                            if (!best) return cur;
                            return statusWeight(cur?.status) > statusWeight(best?.status) ? cur : best;
                          }, null as any);

                          const woStatus = String(woBest?.status || '').toUpperCase();
                          const isLocked = woStatus === 'COMPLETED' || woStatus === 'CLOSED';
                          const canEditThis = !isLocked || isSuperAdmin;
                          return (
                            <div className="flex justify-end gap-3">
                              <Button variant="ghost" size="icon" onClick={() => handlePrintEntry(item.id)} title={isLocked ? "View" : "Cetak SPK Awal"}>
                                {isLocked ? <Eye className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
                              </Button>
                              {canEditThis && (
                                <>
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(item)} title="Edit">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {!isLocked && (
                                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(item.id)} title="Hapus">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}
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
