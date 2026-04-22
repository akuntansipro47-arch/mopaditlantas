import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Eye, Trash2, ClipboardCheck, Play, CheckCircle, RefreshCw, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";
import { useReactToPrint } from 'react-to-print';
import PrintSPK from '@/components/ui/PrintSPK';
import { useAuth } from '@/context/AuthContext';

type WO = Database['public']['Tables']['work_orders']['Row'];
type VehicleEntry = Database['public']['Tables']['vehicle_entries']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Mechanic = Database['public']['Tables']['mechanics']['Row'];

export type WOWithDetails = WO & {
  vehicle_entries: (VehicleEntry & { vehicles: Vehicle | null }) | null;
  mechanics: Mechanic | null;
};

export default function WorkOrder() {
  const { user } = useAuth();
  const [wos, setWos] = useState<WOWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [printData, setPrintData] = useState<{ wo: WOWithDetails; entry: any } | null>(null);
  const printComponentRef = useRef<HTMLDivElement>(null);

  const [entries, setEntries] = useState<(VehicleEntry & { vehicles: Vehicle | null })[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  
  const [isVehicleSearchOpen, setIsVehicleSearchOpen] = useState(false);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  
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
    if (item.status !== 'IN_PROGRESS') {
      toast.warning('Hanya Work Order dengan status IN_PROGRESS yang dapat diedit.');
      return;
    }
    setFormData({
      work_date: item.work_date,
      vehicle_entry_id: item.vehicle_entry_id || '',
      mechanic_id: item.mechanic_id || '',
    });
    setIsEditing(true);
    setCurrentId(item.id);
    setIsDialogOpen(true);
  };

  const checkSparepartsIssued = async (wo: WOWithDetails): Promise<{ valid: boolean; message: string; unissued: string[] }> => {
    if (!wo.vehicle_entry_id) {
      return { valid: true, message: 'Tidak ada sparepart', unissued: [] };
    }

    const { data: estItems, error: estError } = await supabase
      .from('vehicle_entry_spareparts')
      .select('id, goods_id, item_name, qty, value_only')
      .eq('vehicle_entry_id', wo.vehicle_entry_id);

    if (estError) {
      return { valid: false, message: 'Gagal mengambil data sparepart', unissued: [] };
    }

    const nonValueOnlyItems = (estItems || []).filter((item: any) => !item.value_only);
    if (nonValueOnlyItems.length === 0) {
      return { valid: true, message: 'Tidak ada sparepart yang perlu dikeluarkan', unissued: [] };
    }

    const { data: issuedItems, error: issuedError } = await supabase
      .from('goods_issue_items')
      .select('goods_id, quantity, value_only, goods_issues!inner(work_order_id)')
      .eq('goods_issues.work_order_id', wo.id);

    if (issuedError) {
      return { valid: false, message: 'Gagal mengambil data barang keluar', unissued: [] };
    }

    const issuedMap = new Map<string, number>();
    (issuedItems || []).forEach((item: any) => {
      if (!item.value_only && item.goods_id) {
        const current = issuedMap.get(item.goods_id) || 0;
        issuedMap.set(item.goods_id, current + (item.quantity || 0));
      }
    });

    const unissued: string[] = [];
    for (const item of nonValueOnlyItems) {
      const goodsId = item.goods_id;
      if (!goodsId) {
        unissued.push(item.item_name || 'Item tanpa nama');
        continue;
      }
      const issuedQty = issuedMap.get(goodsId) || 0;
      if (issuedQty < (item.qty || 0)) {
        unissued.push(item.item_name || 'Item');
      }
    }

    if (unissued.length > 0) {
      return { 
        valid: false, 
        message: `Sparepart berikut belum/tidak cukup keluar: ${unissued.slice(0, 5).join(', ')}${unissued.length > 5 ? '...' : ''}`,
        unissued 
      };
    }

    return { valid: true, message: 'Semua sparepart sudah dikeluarkan', unissued: [] };
  };

  const handleCompleteWO = async (wo: WOWithDetails) => {
    const { valid, message } = await checkSparepartsIssued(wo);
    if (!valid) {
      toast.error(`Tidak dapat menyelesaikan WO: ${message}`);
      return;
    }

    if (!window.confirm(`Yakin ingin menyelesaikan Work Order "${wo.wo_number}"?\n\n${message}`)) {
      return;
    }

    await handleStatusChange(wo.id, 'COMPLETED');
  };

  const handleReopenWO = async (wo: WOWithDetails) => {
    const canReopen = user?.role === 'SUPER_ADMIN' || 
                      (user?.role === 'ADMIN' && user?.allowed_menus?.includes('trans_wo_reopen'));

    if (!canReopen) {
      toast.error('Anda tidak memiliki akses untuk me-reopen Work Order. Hubungi Super Admin.');
      return;
    }

    if (!window.confirm(`Yakin ingin me-reopen Work Order "${wo.wo_number}"?`)) {
      return;
    }

    await handleStatusChange(wo.id, 'IN_PROGRESS');
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('work_orders')
        .update({ status: newStatus } as any)
        .eq('id', id);
      
      if (error) throw error;
      
      toast.success(`Status WO diubah menjadi ${newStatus}`);
      await fetchWOs();
    } catch (error: any) {
      toast.error('Gagal update status: ' + error.message);
    }
  };

  const handleDelete = async (id: string, vehicleEntryId: string | null) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus Work Order ini? Tindakan ini tidak dapat dibatalkan.')) {
      try {
        const { error: deleteError } = await supabase.from('work_orders').delete().eq('id', id);
        if (deleteError) throw deleteError;

        if (vehicleEntryId) {
          const { error: updateError } = await supabase
            .from('vehicle_entries')
            .update({ status: 'OPEN' })
            .eq('id', vehicleEntryId);
          
          if (updateError) {
            toast.warning('WO dihapus, tapi gagal mengembalikan status Nota Dinas. Harap periksa manual.');
          }
        }

        toast.success('Work Order berhasil dihapus');
        await fetchWOs();
        await fetchMasterData();
      } catch (error: any) {
        toast.error('Gagal menghapus WO: ' + error.message);
      }
    }
  };

  const handlePrintTrigger = useReactToPrint({
    content: () => printComponentRef.current,
    onAfterPrint: () => setPrintData(null),
  });

  const handlePrint = async (wo: WOWithDetails) => {
    if (!wo.vehicle_entry_id) {
      toast.error("Error: Work Order ini tidak terhubung dengan Kendaraan Masuk.");
      return;
    }
    try {
      toast.info("Mempersiapkan data untuk dicetak...");

      // Step 1: Fetch entry with jobs and sparepart IDs
      const { data: entry, error: entryError } = await supabase
        .from('vehicle_entries')
        .select(`
          *,
          vehicle_entry_jobs (
            *,
            job_types (*)
          ),
          vehicle_entry_spareparts (*)
        `)
        .eq('id', wo.vehicle_entry_id)
        .single();

      if (entryError) {
        throw new Error(`Gagal mengambil detail entry: ${entryError.message}`);
      }

      if (!entry) {
        toast.error("Data entry kendaraan tidak ditemukan.");
        return;
      }

      // Step 2: If there are spareparts, fetch their details separately
      if (entry.vehicle_entry_spareparts && entry.vehicle_entry_spareparts.length > 0) {
        const goodsIds = entry.vehicle_entry_spareparts
          .map((sp: any) => sp.goods_id)
          .filter(Boolean);
        
        let goodsData: any[] = [];
        if (goodsIds.length > 0) {
          const { data, error: goodsError } = await supabase
            .from('goods')
            .select('*')
            .in('id', goodsIds);

          if (goodsError) {
            throw new Error(`Gagal mengambil detail sparepart: ${goodsError.message}`);
          }
          goodsData = data || [];
        }

        // Step 3: Combine the data
        const goodsMap = new Map(goodsData.map((g: any) => [g.id, g]));
        const enrichedSpareparts = entry.vehicle_entry_spareparts.map((sp: any) => ({
          ...sp,
          spareparts: sp.goods_id ? goodsMap.get(sp.goods_id) || null : null,
        }));

        const enrichedEntry = { ...entry, vehicle_entry_spareparts: enrichedSpareparts };
        setPrintData({ wo, entry: enrichedEntry });

      } else {
        // No spareparts, just set the data
        setPrintData({ wo, entry });
      }

    } catch (e: any) {
      console.error(e);
      toast.error(e.message);
      setPrintData(null);
    }
  };

  useEffect(() => {
    if (printData) {
      // Memberikan waktu bagi React untuk merender komponen sebelum memicu cetak
      const timer = setTimeout(() => {
        handlePrintTrigger();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [printData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        work_date: formData.work_date,
        vehicle_entry_id: formData.vehicle_entry_id,
        mechanic_id: formData.mechanic_id,
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
          .insert([{ ...payload, status: 'OPEN' } as any]);
        if (error) throw error;
        
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
      fetchMasterData();
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
                  <Dialog open={isVehicleSearchOpen} onOpenChange={setIsVehicleSearchOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        {selectedEntryDetails ? 
                          `${selectedEntryDetails.vehicles?.license_plate} (${selectedEntryDetails.vehicles?.brand_type})` : 
                          "Pilih Kendaraan Masuk..."}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px]">
                      <DialogHeader>
                        <DialogTitle>Cari Kendaraan Masuk</DialogTitle>
                        <DialogDescription>Cari berdasarkan plat nomor atau tipe kendaraan.</DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <Input 
                          placeholder="Ketik untuk mencari..." 
                          value={vehicleSearchQuery}
                          onChange={(e) => setVehicleSearchQuery(e.target.value)}
                          className="mb-4"
                        />
                        <div className="max-h-[300px] overflow-y-auto space-y-2">
                          {entries
                            .filter(e => 
                              e.vehicles?.license_plate.toLowerCase().includes(vehicleSearchQuery.toLowerCase()) ||
                              e.vehicles?.brand_type.toLowerCase().includes(vehicleSearchQuery.toLowerCase())
                            )
                            .map(e => (
                              <div 
                                key={e.id}
                                onClick={() => {
                                  handleSelectChange('vehicle_entry_id', e.id);
                                  setIsVehicleSearchOpen(false);
                                  setVehicleSearchQuery('');
                                }}
                                className="p-3 border rounded-md hover:bg-accent cursor-pointer"
                              >
                                <p className="font-semibold">{e.vehicles?.license_plate} ({e.vehicles?.brand_type})</p>
                                <p className="text-sm text-muted-foreground">Tgl Masuk: {new Date(e.entry_date).toLocaleDateString('id-ID')}</p>
                              </div>
                            ))
                          }
                          {entries.length === 0 && <p className="text-center text-sm text-muted-foreground">Tidak ada kendaraan masuk status OPEN.</p>}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <p className="text-xs text-muted-foreground">Hanya menampilkan kendaraan masuk yang belum diproses.</p>
                </div>

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
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8" onClick={() => handleCompleteWO(item)}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Selesai
                            </Button>
                          )}
                          {item.status === 'COMPLETED' && (
                            <Button size="sm" variant="outline" className="h-8 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200" onClick={() => window.open(`/print/surat-jalan/${item.id}`, '_blank')}>
                              <Printer className="h-4 w-4 mr-1" /> Surat Jalan
                            </Button>
                          )}
                          {item.status === 'COMPLETED' && (
                            <Button size="sm" variant="secondary" className="h-8" onClick={() => handleReopenWO(item)}>
                              <RefreshCw className="h-4 w-4 mr-1" /> Re-open
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-8" onClick={() => handlePrint(item)} disabled={item.status !== 'IN_PROGRESS'}>
                             <Printer className="h-4 w-4 mr-1" /> SPK
                          </Button>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => handleEdit(item)} disabled={item.status !== 'IN_PROGRESS'}>
                            <Eye className="h-4 w-4 mr-1" /> Edit
                          </Button>
                          {item.status !== 'COMPLETED' && (
                            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id, item.vehicle_entry_id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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

      {/* Komponen cetak yang disembunyikan (tetap dirender agar terbaca oleh library) */}
      <div className="opacity-0 absolute pointer-events-none -z-50 overflow-hidden h-0 w-0">
        {printData && <div ref={printComponentRef}><PrintSPK data={printData} /></div>}
      </div>
    </div>
  );
}