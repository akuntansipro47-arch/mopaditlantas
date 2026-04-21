import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { PlusCircle, Edit, Trash2, CheckCircle, XCircle, RefreshCw, Wrench, ClipboardCheck, Search, AlertTriangle, Barcode } from 'lucide-react';
import { generateTransactionNumber, formatDate } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from '@/components/ui/badge';
import ReactToPrint, { useReactToPrint } from 'react-to-print';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { addDays } from 'date-fns';
const [dateRange, setDateRange] = useState<DateRange | undefined>({
  from: addDays(new Date(), -30),
  to: new Date(),
});

// Type definitions
interface Vehicle {
  id: string;
  license_plate: string;
  owner_name: string;
  model: string;
  brand_type: string;
}

interface VehicleEntry {
  id: string;
  complaint: string;
  vehicles: Vehicle | null;
}

interface Mechanic {
  id: string;
  name: string;
}

interface WorkOrder {
  id: string;
  wo_number: string;
  status: string;
  work_date: string;
  created_at: string;
  vehicle_entry_id: string;
  mechanic_id: string;
  vehicle_entries: VehicleEntry | null;
  mechanics: Mechanic | null;
}

const WorkOrderV2 = () => {
  const { user } = useAuth();
  const [wos, setWos] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEntrySearchOpen, setIsEntrySearchOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentWo, setCurrentWo] = useState<Partial<WorkOrder>>({});
  const [availableEntries, setAvailableEntries] = useState<VehicleEntry[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const printComponentRef = useRef<HTMLDivElement>(null);
  const [selectedWoForPrint, setSelectedWoForPrint] = useState<WorkOrder | null>(null);

  const handlePrint = useReactToPrint({
    content: () => printComponentRef.current,
    documentTitle: `SPK-${selectedWoForPrint?.wo_number}`,
    onAfterPrint: () => setSelectedWoForPrint(null),
  });

  const triggerPrint = (wo: WorkOrder) => {
    setSelectedWoForPrint(wo);
  };

  useEffect(() => {
    if (selectedWoForPrint) {
      handlePrint();
    }
  }, [selectedWoForPrint, handlePrint]);

  const fetchWOs = useCallback(async () => {
    setLoading(true);
    try {
      // Step 1: Fetch base WO data
      let woQuery = supabase.from('work_orders').select('id, wo_number, status, work_date, created_at, vehicle_entry_id, mechanic_id').order('created_at', { ascending: false });
      if (dateRange?.from) woQuery = woQuery.gte('work_date', formatDate(dateRange.from));
      if (dateRange?.to) woQuery = woQuery.lte('work_date', formatDate(dateRange.to));
      const { data: woData, error: woError } = await woQuery;
      if (woError) throw new Error(`Work Orders: ${woError.message}`);
      if (!woData || woData.length === 0) {
        setWos([]);
        setLoading(false);
        return;
      }

      // Step 2: Collect related IDs
      const entryIds = [...new Set(woData.map(wo => wo.vehicle_entry_id).filter(Boolean))];
      const mechanicIds = [...new Set(woData.map(wo => wo.mechanic_id).filter(Boolean))];

      // Step 3: Fetch related data (entries and mechanics)
      const [
        { data: entriesData, error: entriesError },
        { data: mechanicsData, error: mechanicsError }
      ] = await Promise.all([
        entryIds.length > 0 ? supabase.from('vehicle_entries').select('id, notes, vehicle_id').in('id', entryIds) : Promise.resolve({ data: [], error: null }),
        mechanicIds.length > 0 ? supabase.from('mechanics').select('id, name').in('id', mechanicIds) : Promise.resolve({ data: [], error: null })
      ]);

      if (entriesError) throw new Error(`Vehicle Entries: ${entriesError.message}`);
      if (mechanicsError) throw new Error(`Mechanics: ${mechanicsError.message}`);

      // Step 4: Fetch vehicle data from entries
      const vehicleIds = [...new Set(entriesData?.map(e => e.vehicle_id).filter(Boolean) || [])];
      const { data: vehiclesData, error: vehiclesError } = vehicleIds.length > 0
        ? await supabase.from('vehicles').select('id, license_plate, owner_name, model, brand_type').in('id', vehicleIds)
        : { data: [], error: null };
      
      if (vehiclesError) throw new Error(`Vehicles: ${vehiclesError.message}`);

      // Step 5: Create lookup maps and combine data, aliasing notes to complaint
      const mechanicsMap = new Map(mechanicsData?.map(m => [m.id, m]));
      const vehiclesMap = new Map(vehiclesData?.map(v => [v.id, v]));
      const entriesMap = new Map(entriesData?.map(e => [e.id, { 
        ...e, 
        complaint: (e as any).notes, 
        vehicles: vehiclesMap.get(e.vehicle_id) || null 
      }]));

      const combinedData = woData.map(wo => ({
        ...wo,
        mechanics: mechanicsMap.get(wo.mechanic_id) || null,
        vehicle_entries: entriesMap.get(wo.vehicle_entry_id) || null,
      }));
      
      setWos(combinedData as any);

    } catch (error: any) {
      console.error("Error fetching WOs:", error);
      toast.error('Gagal mengambil data WO: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAvailableEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('vehicle_entries')
        .select('id, notes, vehicles(license_plate)')
        .eq('status', 'OPEN');

      if (error) throw error;
      
      if (data) {
        // Alias 'notes' to 'complaint' to match component's expectation
        const mappedData = data.map(entry => ({
          ...entry,
          complaint: (entry as any).notes
        }));
        setAvailableEntries(mappedData as any);
      }
    } catch (error: any) {
      toast.error("Gagal mengambil data antrian: " + error.message);
    }
  };

  const fetchMechanics = async () => {
    try {
      const { data, error } = await supabase.from('mechanics').select('id, name');
      if (error) throw error;
      setMechanics(data);
    } catch (error: any) {
      toast.error("Gagal mengambil data mekanik: " + error.message);
    }
  };

  useEffect(() => {
    fetchWOs();
  }, [fetchWOs]);

  useEffect(() => {
    if (isDialogOpen) {
      fetchAvailableEntries();
      fetchMechanics();
    }
  }, [isDialogOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCurrentWo(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setCurrentWo(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setIsEditing(false);
    setCurrentWo({});
  };

  const handleSubmit = async () => {
    if (!currentWo.vehicle_entry_id || !currentWo.mechanic_id || !currentWo.work_date) {
      toast.error("Harap lengkapi semua field yang diperlukan.");
      return;
    }

    const woData = {
      ...currentWo,
      wo_number: currentWo.wo_number || await generateTransactionNumber('work_orders', 'WO'),
      status: currentWo.status || 'OPEN',
    };

    try {
      let result;
      if (isEditing) {
        const { data, error } = await supabase.from('work_orders').update(woData).eq('id', currentWo.id).select();
        if (error) throw error;
        result = data;
        toast.success("Work Order berhasil diperbarui.");
      } else {
        const { data, error } = await supabase.from('work_orders').insert(woData).select();
        if (error) throw error;
        result = data;
        toast.success("Work Order berhasil dibuat.");
      }
      fetchWOs();
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error("Gagal menyimpan Work Order: " + error.message);
    }
  };

  const handleEdit = (wo: WorkOrder) => {
    setCurrentWo(wo);
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Apakah Anda yakin ingin menghapus Work Order ini?")) {
      try {
        const { error } = await supabase.from('work_orders').delete().eq('id', id);
        if (error) throw error;
        toast.success("Work Order berhasil dihapus.");
        fetchWOs();
      } catch (error: any) {
        toast.error("Gagal menghapus Work Order: " + error.message);
      }
    }
  };

  const handleFinishWO = async (woId: string) => {
    if (window.confirm("Apakah Anda yakin ingin menyelesaikan Work Order ini?")) {
      try {
        const { error } = await supabase.from('work_orders').update({ status: 'COMPLETED' }).eq('id', woId);
        if (error) throw error;
        toast.success("Work Order telah diselesaikan.");
        fetchWOs();
      } catch (error: any) {
        toast.error("Gagal menyelesaikan WO: " + error.message);
      }
    }
  };

  const selectedEntry = availableEntries.find(entry => entry.id === currentWo.vehicle_entry_id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Daftar Work Order (SPK)</h1>
        <div className="flex items-center gap-2">
                    <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <PlusCircle className="mr-2 h-4 w-4" /> Tambah WO
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">No. WO</TableHead>
                  <TableHead>Tgl. Entry</TableHead>
                  <TableHead>No. Polisi</TableHead>
                  <TableHead>Keluhan</TableHead>
                  <TableHead>Mekanik</TableHead>
                  <TableHead className="text-right w-[250px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : wos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      Tidak ada data Work Order ditemukan.
                    </TableCell>
                  </TableRow>
                ) : (
                  wos.map((wo) => (
                    <TableRow key={wo.id}>
                      <TableCell className="font-medium">{wo.wo_number}</TableCell>
                      <TableCell>{formatDate(wo.work_date)}</TableCell>
                      <TableCell>{wo.vehicle_entries?.vehicles?.license_plate || '-'}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{wo.vehicle_entries?.complaint || '-'}</TableCell>
                      <TableCell>{wo.mechanics?.name || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => triggerPrint(wo)} title="Cetak SPK">
                          <Barcode className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(wo)} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(wo.id)} title="Hapus">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                        {wo.status !== 'COMPLETED' && (
                          <Button variant="outline" size="sm" onClick={() => handleFinishWO(wo.id)} className="ml-2">
                            <CheckCircle className="mr-2 h-4 w-4" /> Selesaikan
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Work Order' : 'Tambah Work Order'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Perbarui detail Work Order.' : 'Buat Surat Perintah Kerja (SPK) baru dari antrian kendaraan.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle_entry_id">Antrian Kendaraan (Nopol)</Label>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => setIsEntrySearchOpen(true)}
              >
                {selectedEntry ? `${selectedEntry.vehicles?.license_plate} - ${selectedEntry.complaint}` : "Pilih dari antrian..."}
                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mechanic_id">Mekanik</Label>
              <select
                name="mechanic_id"
                id="mechanic_id"
                value={currentWo.mechanic_id || ''}
                onChange={(e) => handleSelectChange('mechanic_id', e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="" disabled>Pilih Mekanik</option>
                {mechanics.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="work_date">Tanggal Pengerjaan</Label>
              <Input
                id="work_date"
                name="work_date"
                type="date"
                value={currentWo.work_date || ''}
                onChange={handleInputChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button type="submit" onClick={handleSubmit}>{isEditing ? 'Simpan Perubahan' : 'Buat WO'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vehicle Entry Search Command */}
      <Dialog open={isEntrySearchOpen} onOpenChange={setIsEntrySearchOpen}>
        <DialogContent className="p-0">
          <Command>
            <CommandInput placeholder="Cari No. Polisi atau Keluhan..." />
            <CommandList>
              <CommandEmpty>Tidak ada antrian tersedia.</CommandEmpty>
              <CommandGroup heading="Antrian Kendaraan (Status OPEN)">
                {availableEntries.map((entry) => (
                  <CommandItem
                    key={entry.id}
                    onSelect={() => {
                      handleSelectChange('vehicle_entry_id', entry.id);
                      setIsEntrySearchOpen(false);
                    }}
                  >
                    {entry.vehicles?.license_plate} - {entry.complaint}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Print SPK Component (Hidden) */}
      <div style={{ display: 'none' }}>
        <div ref={printComponentRef}>
          {selectedWoForPrint && (
            <div className="print-container p-4">
              <style>{`
                @media print {
                  body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; }
                  .no-print { display: none !important; }
                  .print-container { padding: 0; margin: 0; }
                  .print-header h1 { font-size: 14pt; text-align: center; margin: 0; }
                  .info-grid { display: grid; grid-template-columns: 120px 1fr; gap: 2px 10px; font-size: 10pt; margin-top: 15px; }
                  .item-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                  .item-table th, .item-table td { border: 1px solid #000; padding: 4px; text-align: left; }
                  .signatures { margin-top: 30px; display: flex; justify-content: space-around; font-size: 10pt; }
                  .signatures div { text-align: center; }
                  .signatures div p { margin-top: 50px; border-top: 1px solid #000; padding-top: 5px; }
                }
              `}</style>
              <div className="print-header text-center mb-4">
                <h1 className="text-xl font-bold">SURAT PERINTAH KERJA</h1>
                <p>{selectedWoForPrint.wo_number}</p>
              </div>
              <div className="info-grid text-sm">
                <strong>No. Polisi:</strong><span>{selectedWoForPrint.vehicle_entries?.vehicles?.license_plate}</span>
                <strong>Kendaraan:</strong><span>{selectedWoForPrint.vehicle_entries?.vehicles?.brand_type}</span>
                <strong>Pemilik:</strong><span>{selectedWoForPrint.vehicle_entries?.vehicles?.owner_name}</span>
                <strong>Tanggal:</strong><span>{formatDate(selectedWoForPrint.work_date)}</span>
                <strong>Mekanik:</strong><span>{selectedWoForPrint.mechanics?.name}</span>
              </div>
              <div className="mt-4">
                <h2 className="font-bold border-b border-black">KELUHAN:</h2>
                <p className="mt-2 text-sm">{selectedWoForPrint.vehicle_entries?.complaint}</p>
              </div>
              <div className="mt-4">
                <h2 className="font-bold border-b border-black">DETAIL PEKERJAAN / SPAREPART:</h2>
                <div className="min-h-[200px] border-x border-b border-black mt-2">
                  {/* Details will be added here later */}
                </div>
              </div>
              <div className="signatures mt-8">
                <div>
                  <p>Pemilik Kendaraan</p>
                </div>
                <div>
                  <p>Service Advisor</p>
                </div>
                <div>
                  <p>Mekanik</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkOrderV2;