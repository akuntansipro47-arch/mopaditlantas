import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext.tsx';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PlusCircle, Edit, Trash2, CheckCircle, XCircle, RefreshCw, Wrench, ClipboardCheck, Search, AlertTriangle, BadgeCheck, X, ShoppingCart } from 'lucide-react';
import { generateTransactionNumber, formatDate } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from '@/components/ui/badge';
import ReactToPrint, { useReactToPrint } from 'react-to-print';

// Type definitions
interface Vehicle { id: string; license_plate: string; owner_name: string; model: string; brand_type: string; }
interface Mechanic { id: string; name: string; }
interface VehicleEntry { id: string; complaint: string; vehicle_id: string; vehicles: Vehicle | null; }
interface WO { id: string; wo_number: string; status: string; work_date: string; created_at: string; vehicle_entry_id: string; mechanic_id: string; }
interface WOWithDetails extends WO {
  mechanics: Mechanic | null;
  vehicle_entries: VehicleEntry | null;
}
interface Goods { id: string; name: string; code: string; stock: number; selling_price: number; }
interface WOBillingItem { type: 'PART' | 'JASA'; name: string; qty: number; price: number; goods_id?: string; }
interface PartValidationStatus { isMet: boolean; missing: { name: string; required: number; issued: number; missing: number }[]; }

export default function WorkOrderV2() {
  const { user } = useAuth();
  const [wos, setWos] = useState<WOWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ work_date: new Date().toISOString().split('T')[0], vehicle_entry_id: '', mechanic_id: '' });
  
  // Master Data
  const [availableEntries, setAvailableEntries] = useState<any[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [selectedEntryDetails, setSelectedEntryDetails] = useState<any>(null);
  const [isEntrySearchOpen, setIsEntrySearchOpen] = useState(false);
  const [entrySearchQuery, setEntrySearchQuery] = useState("");

  // Finishing WO State
  const [finishWOModalOpen, setFinishWOModalOpen] = useState(false);
  const [activeWOForBilling, setActiveWOForBilling] = useState<WOWithDetails | null>(null);
  const [billingItems, setBillingItems] = useState<WOBillingItem[]>([]);
  const [partValidationStatus, setPartValidationStatus] = useState<PartValidationStatus>({ isMet: false, missing: [] });

  // SPK Print State
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printData, setPrintData] = useState<any>(null);
  const printComponentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    content: () => printComponentRef.current,
  });

  const fetchMasterData = useCallback(async () => {
    try {
      const [entriesRes, mechanicsRes] = await Promise.all([
        supabase.from('vehicle_entries').select('*, vehicles(*)').eq('status', 'OPEN'),
        supabase.from('mechanics').select('*')
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (mechanicsRes.error) throw mechanicsRes.error;
      setAvailableEntries(entriesRes.data || []);
      setMechanics(mechanicsRes.data || []);
    } catch (error: any) {
      toast.error('Gagal memuat data master: ' + error.message);
    }
  }, []);
const fetchWOs = useCallback(async () => {
  setLoading(true);
  try {
    // Step 1: Fetch base WO data
    let woQuery = supabase.from('work_orders').select('id, wo_number, status, work_date, created_at, vehicle_entry_id, mechanic_id').order('created_at', { ascending: false });
    if (dateRange.start) woQuery = woQuery.gte('work_date', dateRange.start);
    if (dateRange.end) woQuery = woQuery.lte('work_date', dateRange.end);
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
      entryIds.length > 0 ? supabase.from('vehicle_entries').select('id, complaint, vehicle_id').in('id', entryIds) : Promise.resolve({ data: [], error: null }),
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

    // Step 5: Create lookup maps and combine data
    const mechanicsMap = new Map(mechanicsData?.map(m => [m.id, m]));
    const vehiclesMap = new Map(vehiclesData?.map(v => [v.id, v]));
    const entriesMap = new Map(entriesData?.map(e => [e.id, { ...e, vehicles: vehiclesMap.get(e.vehicle_id) || null }]));

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
}, [dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchWOs();
    fetchMasterData();
  }, [fetchWOs, fetchMasterData]);

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'vehicle_entry_id') {
      const entry = availableEntries.find(e => e.id === value);
      setSelectedEntryDetails(entry);
    }
  };

  const resetForm = () => {
    setFormData({ work_date: new Date().toISOString().split('T')[0], vehicle_entry_id: '', mechanic_id: '' });
    setIsEditing(false);
    setCurrentId(null);
    setSelectedEntryDetails(null);
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

  const handleStatusChange = async (id: string, newStatus: string, currentStatus?: string) => {
    if (newStatus === 'CLOSED' && !confirm('Apakah Anda yakin ingin menutup WO ini? Pastikan semua pekerjaan selesai.')) return;
    
    const hasReopenAccess = user?.role === 'SUPER_ADMIN' || (user?.role === 'ADMIN' && user?.allowed_menus?.includes('trans_wo_reopen'));
    if ((currentStatus === 'CLOSED' || currentStatus === 'COMPLETED') && !hasReopenAccess) {
      toast.error("Hanya Admin dengan izin khusus yang bisa membuka kembali WO.");
      return;
    }

    try {
      const updatePayload: { status: string; work_started_at?: string; } = { status: newStatus };
      if (newStatus === 'IN_PROGRESS' && currentStatus === 'OPEN') {
        updatePayload.work_started_at = new Date().toISOString();
      }
      const { error } = await supabase.from('work_orders').update(updatePayload as any).eq('id', id);
      if (error) throw error;
      toast.success(`Status WO diubah menjadi ${newStatus}`);
      fetchWOs();
    } catch (error: any) {
      toast.error('Gagal update status: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { work_date: formData.work_date, vehicle_entry_id: formData.vehicle_entry_id, mechanic_id: formData.mechanic_id, status: 'OPEN' };
      if (isEditing && currentId) {
        const { error } = await supabase.from('work_orders').update(payload as any).eq('id', currentId);
        if (error) throw error;
        toast.success('WO diperbarui');
      } else {
        const { error } = await supabase.from('work_orders').insert([{ ...payload, wo_number: generateTransactionNumber('WO') } as any]);
        if (error) throw error;
        if (formData.vehicle_entry_id) {
          await supabase.from('vehicle_entries').update({ status: 'PROCESSED' } as any).eq('id', formData.vehicle_entry_id);
        }
        toast.success('WO berhasil dibuat');
      }
      setIsDialogOpen(false);
      resetForm();
      fetchWOs();
      fetchMasterData();
    } catch (error: any) {
      toast.error('Gagal menyimpan WO: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus WO ini?')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('work_orders').delete().eq('id', id);
      if (error) throw error;
      toast.success('Work Order berhasil dihapus');
      fetchWOs();
    } catch (error: any) {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Gagal Hapus: WO ini sudah memiliki referensi di data lain (misal: barang keluar).');
      } else {
        toast.error('Gagal menghapus WO: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPrintDialog = async (wo: WOWithDetails) => {
    setLoading(true);
    try {
        const { data, error } = await supabase
            .from('vehicle_entries')
            .select(`
                *,
                vehicles(*),
                vehicle_entry_jobs(*, job_types(*)),
                vehicle_entry_spareparts(*, spareparts(*))
            `)
            .eq('id', wo.vehicle_entry_id)
            .single();

        if (error) throw error;
        
        setPrintData({ wo, entry: data });
        setIsPrintDialogOpen(true);
    } catch (err: any) {
        toast.error("Gagal memuat data untuk SPK: " + err.message);
    } finally {
        setLoading(false);
    }
  };

  const filteredWOs = wos.filter(w => {
    const searchTerm = search.toLowerCase();
    if (!searchTerm) return true;

    const woNumber = w.wo_number?.toLowerCase() || '';
    const status = w.status?.toLowerCase() || '';
    const licensePlate = w.vehicle_entries?.vehicles?.license_plate?.toLowerCase() || '';
    const ownerName = w.vehicle_entries?.vehicles?.owner_name?.toLowerCase() || '';
    const brandType = w.vehicle_entries?.vehicles?.brand_type?.toLowerCase() || '';
    const model = w.vehicle_entries?.vehicles?.model?.toLowerCase() || '';

    return (
      woNumber.includes(searchTerm) ||
      status.includes(searchTerm) ||
      licensePlate.includes(searchTerm) ||
      ownerName.includes(searchTerm) ||
      brandType.includes(searchTerm) ||
      model.includes(searchTerm)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN': return <Badge variant="secondary">Terbuka</Badge>;
      case 'IN_PROGRESS': return <Badge className="bg-blue-500 text-white">Dikerjakan</Badge>;
      case 'COMPLETED': return <Badge className="bg-green-500 text-white">Selesai</Badge>;
      case 'CLOSED': return <Badge variant="destructive">Ditutup</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            Manajemen Work Order
            <Button onClick={() => { setIsDialogOpen(true); resetForm(); }}>
              <PlusCircle className="h-4 w-4 mr-2" /> Tambah WO
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <div className="flex-grow max-w-md">
              <Input placeholder="Cari No. WO, No. Polisi, Customer, Status..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
              <span>-</span>
              <Input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
              <Button onClick={() => fetchWOs()}><Search className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. WO</TableHead>
                  <TableHead>Tgl Dibuat</TableHead>
                  <TableHead>No. Polisi</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Mekanik</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center">Memuat data...</TableCell></TableRow>
                ) : filteredWOs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center">Tidak ada data WO ditemukan.</TableCell></TableRow>
                ) : (
                  filteredWOs.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.wo_number}</TableCell>
                      <TableCell>{formatDate(item.created_at)}</TableCell>
                      <TableCell>{item.vehicle_entries?.vehicles?.license_plate || '-'}</TableCell>
                      <TableCell>{item.vehicle_entries?.vehicles?.owner_name || '-'}</TableCell>
                      <TableCell>{item.mechanics?.name || '-'}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.status === 'OPEN' && (
                            <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600" onClick={() => handleStatusChange(item.id, 'IN_PROGRESS', item.status)}>
                              Mulai Kerjakan
                            </Button>
                          )}
                          {item.status === 'IN_PROGRESS' && (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange(item.id, 'COMPLETED', item.status)}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Selesai
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-8" onClick={() => handleOpenPrintDialog(item)}>
                             <ClipboardCheck className="h-4 w-4 mr-1" /> SPK
                          </Button>
                          {item.status === 'COMPLETED' && (
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleStatusChange(item.id, 'CLOSED', item.status)}>
                              <XCircle className="h-4 w-4 mr-1" /> Tutup WO
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
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

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit' : 'Tambah'} Work Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="work_date" className="text-right">Tgl. WO</Label>
                <Input id="work_date" type="date" value={formData.work_date} onChange={e => setFormData(prev => ({ ...prev, work_date: e.target.value }))} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="vehicle_entry_id" className="text-right">No. Antrian</Label>
                <div className="col-span-3">
                  <Button type="button" variant="outline" className="w-full justify-start text-left font-normal" onClick={() => setIsEntrySearchOpen(true)}>
                    {selectedEntryDetails ? `${selectedEntryDetails.vehicles?.license_plate} - ${selectedEntryDetails.complaint}` : "Pilih Antrian Kendaraan"}
                  </Button>
                </div>
              </div>
              {selectedEntryDetails && (
                <div className="grid grid-cols-4 items-center gap-4">
                    <div/>
                    <div className="col-span-3 text-sm text-muted-foreground p-2 bg-slate-50 rounded-md">
                        <p><b>Customer:</b> {selectedEntryDetails.vehicles?.owner_name}</p>
                        <p><b>Model:</b> {selectedEntryDetails.vehicles?.brand_type} {selectedEntryDetails.vehicles?.model}</p>
                        <p><b>Tgl Masuk:</b> {formatDate(selectedEntryDetails.entry_date)}</p>
                    </div>
                </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="mechanic_id" className="text-right">Mekanik</Label>
                <select id="mechanic_id" value={formData.mechanic_id} onChange={e => handleSelectChange('mechanic_id', e.target.value)} className="col-span-3 border rounded-md p-2">
                  <option value="">Pilih Mekanik</option>
                  {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">{isEditing ? 'Simpan Perubahan' : 'Buat WO'}</Button>
            </DialogFooter>
          </form>
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

      {/* SPK Print Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Cetak Surat Perintah Kerja (SPK)</DialogTitle>
          </DialogHeader>
          <div ref={printComponentRef} className="p-4 print-container">
            {/* Print-specific styles */}
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
            {printData && (
              <div>
                <div className="print-header">
                  <h1>SURAT PERINTAH KERJA</h1>
                </div>
                <div className="info-grid">
                  <dt>No. WO:</dt><dd>{printData.wo.wo_number}</dd>
                  <dt>Tanggal:</dt><dd>{formatDate(printData.wo.work_date)}</dd>
                  <dt>No. Polisi:</dt><dd>{printData.entry.vehicles.license_plate}</dd>
                  <dt>Customer:</dt><dd>{printData.entry.vehicles.owner_name}</dd>
                  <dt>Kendaraan:</dt><dd>{`${printData.entry.vehicles.brand_type} ${printData.entry.vehicles.model}`}</dd>
                  <dt>Mekanik:</dt><dd>{printData.wo.mechanics?.name || '-'}</dd>
                </div>
                <h2 className="font-bold mt-4">Keluhan:</h2>
                <p>{printData.entry.complaint}</p>
                
                <h2 className="font-bold mt-4">Estimasi Pekerjaan:</h2>
                <table className="item-table">
                  <thead>
                    <tr><th>Deskripsi</th><th>Qty</th></tr>
                  </thead>
                  <tbody>
                    {printData.entry.vehicle_entry_jobs.map((j: any) => <tr key={`job-${j.id}`}><td>Jasa: {j.job_types.job_name}</td><td>1</td></tr>)}
                    {printData.entry.vehicle_entry_spareparts.map((p: any) => <tr key={`part-${p.id}`}><td>Part: {p.spareparts?.name || p.item_name}</td><td>{p.qty}</td></tr>)}
                  </tbody>
                </table>

                <div className="signatures">
                  <div>Hormat Kami,<p>(.....................)</p></div>
                  <div>Customer,<p>({printData.entry.vehicles.owner_name})</p></div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="no-print">
            <Button onClick={handlePrint}>Cetak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}