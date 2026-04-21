import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Eye, Trash2, ClipboardCheck, Play, CheckCircle, Printer, XCircle, RefreshCw, Check, X, Camera, Upload, Image as ImageIcon, Pencil, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate, generateTransactionNumber, formatCurrency, cn } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from "@/components/ui/command";
import { useAuth } from '@/context/AuthContext';
import { useRealtimeRefetch } from '@/hooks/useRealtimeRefetch';

type WO = Database['public']['Tables']['work_orders']['Row'];
type VehicleEntry = Database['public']['Tables']['vehicle_entries']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Mechanic = Database['public']['Tables']['mechanics']['Row'];
type Goods = Database['public']['Tables']['goods']['Row'];

type WOWithDetails = WO & {
  vehicle_entries: (VehicleEntry & { vehicles: Vehicle | null }) | null;
  mechanics: Mechanic | null;
};

type BillingItem = {
  type: 'PART' | 'JASA';
  name: string;
  qty: number;
  price: number;
};

type WOBillingItem = {
  id?: string;
  item_type: 'JOB' | 'PART';
  job_type_id: string | null;
  goods_id: string | null;
  item_name: string;
  qty: number;
  unit_price: number;
  total_price: number;
  job_group: 'PERBAIKAN' | 'SERVICE_RINGAN' | string;
  source?: 'GOODS_ISSUE' | 'WO_INTERFACE'; // Add source tracking
};

export default function WorkOrderV2() {
  const { user } = useAuth();
  const [wos, setWos] = useState<WOWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // New states for the Finish WO Modal
  const [isFinishWOModalOpen, setFinishWOModalOpen] = useState(false);
  const [activeWOForBilling, setActiveWOForBilling] = useState<any | null>(null);
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [partValidationStatus, setPartValidationStatus] = useState<{isMet: boolean, missing: any[]}>({ isMet: false, missing: [] });

  // Entry Search Dialog
  const [isEntrySearchOpen, setIsEntrySearchOpen] = useState(false);
  const [entrySearchQuery, setEntrySearchQuery] = useState('');

  const [activeWOImages, setActiveWOImages] = useState<any[]>([]);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Print State
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printData, setPrintData] = useState<any>(null);

  async function fetchWOImages(woId: string) {
    const { data } = await supabase
        .from('work_order_images')
        .select('*')
        .eq('work_order_id', woId)
        .order('created_at', { ascending: false });
    setActiveWOImages(data || []);
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, woId: string) => {
    if (!event.target.files || event.target.files.length === 0) return;
    
    const files = Array.from(event.target.files);
    
    setUploadingImage(true);
    try {
        for (const file of files) {
            const compressedBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (event) => {
                    const img = new Image();
                    img.src = event.target?.result as string;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        const MAX_WIDTH = 1280;
                        const MAX_HEIGHT = 1280;
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > MAX_WIDTH) {
                                height *= MAX_WIDTH / width;
                                width = MAX_WIDTH;
                            }
                        } else {
                            if (height > MAX_HEIGHT) {
                                width *= MAX_HEIGHT / height;
                                height = MAX_HEIGHT;
                            }
                        }

                        canvas.width = width;
                        canvas.height = height;
                        
                        if (ctx) {
                            ctx.drawImage(img, 0, 0, width, height);
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                            resolve(dataUrl);
                        } else {
                            reject(new Error("Canvas context failed"));
                        }
                    };
                    img.onerror = (err) => reject(err);
                };
                reader.onerror = error => reject(error);
            });

            const { error: dbError } = await supabase
                .from('work_order_images')
                .insert([{
                    work_order_id: woId,
                    image_url: compressedBase64,
                    uploaded_by: user?.id || null
                }]);

            if (dbError) throw dbError;
        }

        toast.success("Foto berhasil diupload & dikompresi");
        await fetchWOImages(woId);

    } catch (error: any) {
        console.error(error);
        toast.error("Gagal upload: " + error.message);
    } finally {
        setUploadingImage(false);
        if (event.target) event.target.value = ''; 
    }
  };

  const handleDeleteImage = async (imageId: string) => {
      if(!confirm("Hapus foto ini?")) return;
      try {
          await supabase.from('work_order_images').delete().eq('id', imageId);
          toast.success("Foto dihapus");
          if(activeWOForBilling) fetchWOImages(activeWOForBilling.id);
      } catch (e: any) {
          toast.error("Gagal hapus: " + e.message);
      }
  };

  const handlePrint = async (wo: WOWithDetails) => {
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
      window.location.reload();
    }
  };

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
  }, [dateRange]);

  useEffect(() => {
    if (isDialogOpen) {
      fetchMasterData();
    }
  }, [isDialogOpen]);

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

  const fetchWOs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id,
          wo_number,
          work_date,
          status,
          vehicle_entry_id,
          mechanic_id,
          created_at,
          work_started_at,
          work_completed_at,
          mechanics (name),
          vehicle_entries (
            id,
            vehicles (license_plate, brand_type, vehicle_type)
          )
        `)
        .gte('work_date', dateRange.from)
        .lte('work_date', dateRange.to)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWos((data as any) || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data WO: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

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

  const handlePrintSuratJalan = (woId: string) => {
    window.open(`/print/surat-jalan/${woId}`, '_blank');
  };

  const handleStatusChange = async (id: string, newStatus: string, currentStatus?: string) => {
    if (newStatus === 'CLOSED' && !confirm('Apakah Anda yakin ingin menutup WO ini? Pastikan semua pekerjaan selesai.')) {
      return;
    }
    
    if (currentStatus === 'CLOSED' || currentStatus === 'COMPLETED') { 
        const hasReopenAccess = user?.role === 'SUPER_ADMIN' || (user?.role === 'ADMIN' && user?.allowed_menus?.includes('trans_wo_reopen'));
        
        if (!hasReopenAccess) {
             toast.error("Hanya Admin dengan izin khusus yang bisa membuka kembali WO.");
             return;
        }
    }

    try {
      const updatePayload: { status: string; work_started_at?: string; work_completed_at?: string; } = { status: newStatus };

      if (newStatus === 'IN_PROGRESS' && currentStatus === 'OPEN') {
        updatePayload.work_started_at = new Date().toISOString();
      }
      
      if (newStatus === 'CLOSED') {
        updatePayload.work_completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('work_orders')
        .update(updatePayload as any)
        .eq('id', id);
      
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
          .insert([{
            ...payload,
            wo_number: generateTransactionNumber('WO')
          } as any]);
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
  const handleFinishWO = async (wo: any) => {
    setLoading(true);
    setFinishWOModalOpen(true); 
    setActiveWOForBilling(wo);

    setBillingItems([]);
    setPartValidationStatus({ isMet: false, missing: [] });

    try {
      // THE FIX IS HERE: Explicitly defining the relationship
      const { data: heavyWOData, error: heavyWOError } = await supabase
        .from('work_orders')
        .select(`
          *,
          mechanics (*),
          vehicle_entries (
            *,
            vehicles (*),
            vehicle_entry_jobs (*, job_types(*)),
            vehicle_entry_spareparts (
              *, 
              item_name,
              spareparts:sparepart_id (name, selling_price)
            )
          )
        `)
        .eq('id', wo.id)
        .single();

      if (heavyWOError) throw heavyWOError;
      if (!heavyWOData) throw new Error("Data WO tidak ditemukan untuk diselesaikan.");

      const heavyWO = heavyWOData;

      const estimatedParts = heavyWO.vehicle_entries?.vehicle_entry_spareparts || [];
      const estimatedJobs = heavyWO.vehicle_entries?.vehicle_entry_jobs || [];
      const tempBillingItems: BillingItem[] = [];

      estimatedParts.forEach((part: any) => {
        tempBillingItems.push({
          type: 'PART',
          name: part.spareparts?.name || part.item_name || 'Sparepart tidak dikenal',
          qty: part.qty || 1,
          price: part.estimated_price || part.spareparts?.selling_price || 0,
        });
      });

      estimatedJobs.forEach((job: any) => {
        tempBillingItems.push({
          type: 'JASA',
          name: job.job_types?.job_name || 'Jasa tidak dikenal',
          qty: 1,
          price: job.estimated_price || job.job_types?.selling_price || 0,
        });
      });
      
      setBillingItems(tempBillingItems);

      const { data: issuedData, error: issuedError } = await supabase
        .from('goods_issue_items')
        .select('sparepart_id, qty')
        .eq('work_order_id', wo.id);

      if (issuedError) throw issuedError;

      const issuedMap = new Map<string, number>();
      (issuedData || []).forEach((item: any) => {
        if (item.sparepart_id) {
          const currentQty = issuedMap.get(item.sparepart_id) || 0;
          issuedMap.set(item.sparepart_id, currentQty + item.qty);
        }
      });

      let allPartsMet = true;
      const missingParts: { name: string; required: number; issued: number; missing: number }[] = [];

      (estimatedParts || []).forEach((required: any) => {
        if (required.sparepart_id) {
            const issuedQty = issuedMap.get(required.sparepart_id) || 0;
            if (issuedQty < required.qty) {
              allPartsMet = false;
              missingParts.push({
                name: required.spareparts?.name || required.item_name || 'Nama Barang Tidak Ditemukan',
                required: required.qty,
                issued: issuedQty,
                missing: required.qty - issuedQty,
              });
            }
        } else if (required.qty > 0) {
            allPartsMet = false;
            missingParts.push({
                name: required.item_name || 'Barang manual tanpa ID',
                required: required.qty,
                issued: 0,
                missing: required.qty,
            });
        }
      });

      setPartValidationStatus({ isMet: allPartsMet, missing: missingParts });

    } catch (error: any) {
      toast.error('Gagal memproses data penyelesaian WO: ' + error.message);
      setFinishWOModalOpen(false);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveBillingAndClose = async () => {
    if (!activeWOForBilling) return;
    setLoading(true);
    try {
      // Update status to 'COMPLETED'
      const { error: statusError } = await supabase
        .from('work_orders')
        .update({ status: 'COMPLETED', work_completed_at: new Date().toISOString() })
        .eq('id', activeWOForBilling.id);

      if (statusError) throw statusError;

      toast.success('WO Selesai & Billing Tersimpan!');
      setFinishWOModalOpen(false);
      setActiveWOForBilling(null);
      fetchWOs();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredWOs = wos.filter(wo => {
    const searchTerm = entrySearchQuery.toLowerCase();
    const woNumber = wo.wo_number?.toLowerCase() || '';
    const licensePlate = wo.vehicle_entries?.vehicles?.license_plate?.toLowerCase() || '';
    return woNumber.includes(searchTerm) || licensePlate.includes(searchTerm);
  });

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Work Order</CardTitle>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Tambah WO
            </Button>
          </div>
          <div className="flex items-center space-x-2 pt-4">
            <Input type="date" value={dateRange.from} onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))} />
            <Input type="date" value={dateRange.to} onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))} />
            <Input
              placeholder="Cari No. WO atau Nopol..."
              value={entrySearchQuery}
              onChange={(e) => setEntrySearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. WO</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Nopol</TableHead>
                <TableHead>Mekanik</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lead Time</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center">Memuat data...</TableCell></TableRow>
              ) : filteredWOs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center">Tidak ada data</TableCell></TableRow>
              ) : (
                filteredWOs.map(wo => (
                  <TableRow key={wo.id}>
                    <TableCell>{wo.wo_number}</TableCell>
                    <TableCell>{formatDate(wo.work_date)}</TableCell>
                    <TableCell>{wo.vehicle_entries?.vehicles?.license_plate}</TableCell>
                    <TableCell>{wo.mechanics?.name}</TableCell>
                    <TableCell><Badge variant={wo.status === 'OPEN' ? 'secondary' : wo.status === 'IN_PROGRESS' ? 'default' : wo.status === 'COMPLETED' ? 'outline' : 'success'}>{wo.status}</Badge></TableCell>
                    <TableCell>
                      {wo.work_started_at && wo.work_completed_at ? 
                        `${Math.round((new Date(wo.work_completed_at).getTime() - new Date(wo.work_started_at).getTime()) / (1000 * 60))} menit`
                        : '-'}
                    </TableCell>
                    <TableCell className="space-x-1">
                      <Button variant="outline" size="sm" onClick={() => handlePrint(wo)}><Printer className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(wo)}><Pencil className="h-4 w-4" /></Button>
                      {wo.status === 'OPEN' && <Button variant="outline" size="sm" onClick={() => handleStatusChange(wo.id, 'IN_PROGRESS', wo.status)}><Play className="h-4 w-4" /></Button>}
                      {wo.status === 'IN_PROGRESS' && <Button variant="default" size="sm" onClick={() => handleFinishWO(wo)}><CheckCircle className="h-4 w-4" /></Button>}
                      {wo.status === 'COMPLETED' && <Button variant="destructive" size="sm" onClick={() => handleStatusChange(wo.id, 'CLOSED', wo.status)}><XCircle className="h-4 w-4" /></Button>}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handlePrintSuratJalan(wo.id)}
                        disabled={wo.status !== 'CLOSED'}
                        title={wo.status !== 'CLOSED' ? 'WO harus ditutup terlebih dahulu' : 'Cetak Surat Jalan'}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Surat Jalan
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Tambah/Edit WO */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit' : 'Tambah'} Work Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label>Tanggal</Label>
                <Input type="date" value={formData.work_date} onChange={e => setFormData(prev => ({ ...prev, work_date: e.target.value }))} />
              </div>
              <div>
                <Label>No. Antrian Kendaraan</Label>
                <Select name="vehicle_entry_id" value={formData.vehicle_entry_id} onValueChange={v => handleSelectChange('vehicle_entry_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih No. Antrian" /></SelectTrigger>
                  <SelectContent>
                    {entries.map(entry => (
                      <SelectItem key={entry.id} value={entry.id}>{entry.vehicles?.license_plate} - {formatDate(entry.entry_date)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedEntryDetails && (
                <Card className="bg-slate-50">
                  <CardContent className="pt-4 text-sm">
                    <p><strong>Nopol:</strong> {selectedEntryDetails.vehicles?.license_plate}</p>
                    <p><strong>Keluhan:</strong> {selectedEntryDetails.complaint}</p>
                    <p><strong>Estimasi Pekerjaan:</strong></p>
                    <ul className="list-disc pl-5">
                      {selectedEntryDetails.vehicle_entry_jobs?.map((job: any) => (
                        <li key={job.id}>{job.job_types?.job_name || 'Pekerjaan custom'}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              <div>
                <Label>Mekanik</Label>
                <Select name="mechanic_id" value={formData.mechanic_id} onValueChange={v => handleSelectChange('mechanic_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih Mekanik" /></SelectTrigger>
                  <SelectContent>
                    {mechanics.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Selesaikan WO */}
      <Dialog open={isFinishWOModalOpen} onOpenChange={setFinishWOModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Selesaikan Work Order: {activeWOForBilling?.wo_number}</DialogTitle>
            <DialogDescription>
              Periksa item tagihan dan pastikan semua sparepart sudah terpenuhi sebelum menyelesaikan WO.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="text-center p-8">Memuat data...</div>
          ) : (
            <>
              <div className="mb-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Status Pemenuhan Sparepart</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {partValidationStatus.isMet ? (
                      <div className="text-green-600 flex items-center"><CheckCircle className="mr-2 h-4 w-4" /> Semua sparepart yang diestimasi sudah terpenuhi.</div>
                    ) : (
                      <div className="text-red-600">
                        <div className="font-bold flex items-center"><XCircle className="mr-2 h-4 w-4" /> Ada sparepart yang belum terpenuhi:</div>
                        <ul className="list-disc pl-5 mt-2">
                          {partValidationStatus.missing.map((p, i) => (
                            <li key={i}>{p.name} (butuh: {p.required}, keluar: {p.issued}, kurang: {p.missing})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Nama Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Harga</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billingItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell><Badge variant={item.type === 'JASA' ? 'default' : 'secondary'}>{item.type}</Badge></TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.qty}</TableCell>
                      <TableCell>{formatCurrency(item.price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <DialogFooter className="mt-4">
                <Button 
                  onClick={handleSaveBillingAndClose} 
                  disabled={!partValidationStatus.isMet || loading}
                  title={!partValidationStatus.isMet ? 'Sparepart belum lengkap, tidak bisa menyelesaikan WO' : ''}
                >
                  {loading ? 'Menyimpan...' : 'Simpan & Selesaikan WO'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
           {/* Dialog Print SPK */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cetak SPK</DialogTitle>
          </DialogHeader>
          <div id="printable-spk" className="text-sm p-1">
            <div className="p-4 border rounded-lg">
              <div className="text-center mb-4 border-b-2 border-black pb-2">
                <h2 className="text-lg font-bold uppercase">Surat Perintah Kerja</h2>
                <p className="text-xs">No. WO: {printData?.wo.wo_number}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
                <div><strong>Tanggal:</strong> {formatDate(printData?.wo.work_date)}</div>
                <div><strong>Nopol:</strong> {printData?.wo.vehicle_entries?.vehicles?.license_plate}</div>
                <div><strong>Mekanik:</strong> {printData?.wo.mechanics?.name}</div>
                <div><strong>Tipe Kendaraan:</strong> {printData?.wo.vehicle_entries?.vehicles?.brand_type}</div>
              </div>

              <div className="mb-4">
                <h3 className="font-bold text-base">Keluhan Pelanggan:</h3>
                <p className="text-sm italic border p-2 rounded-md bg-gray-50 min-h-[50px]">
                  {printData?.wo.vehicle_entries?.complaint || 'Tidak ada keluhan tercatat.'}
                </p>
              </div>
              
              <div className="mb-4">
                <h3 className="font-bold text-base border-b pb-1 mb-2">Rincian Pekerjaan:</h3>
                <ul className="list-decimal list-inside space-y-1">
                  {printData?.entry.vehicle_entry_jobs.map((j: any) => (
                    <li key={j.id}>{j.job_types?.job_name || 'Pekerjaan custom'}</li>
                  ))}
                </ul>
              </div>

              <div className="mb-8">
                <h3 className="font-bold text-base border-b pb-1 mb-2">Estimasi Sparepart:</h3>
                <ul className="list-decimal list-inside space-y-1">
                  {printData?.entry.vehicle_entry_spareparts.map((p: any) => (
                    <li key={p.id}>{p.item_name} (Qty: {p.qty})</li>
                  ))}
                </ul>
              </div>

              <div className="mt-16 pt-8 text-center grid grid-cols-3 gap-4 text-xs">
                  <div>
                      <p>Mekanik,</p>
                      <div className="mt-20 border-b border-gray-400 mx-4"></div>
                      <p className="mt-1">( {printData?.wo.mechanics?.name || ''} )</p>
                  </div>
                  <div>
                      <p>Kepala Mekanik,</p>
                      <div className="mt-20 border-b border-gray-400 mx-4"></div>
                      <p className="mt-1">(_________________)</p>
                  </div>
                  <div>
                      <p>Quality Control,</p>
                      <div className="mt-20 border-b border-gray-400 mx-4"></div>
                      <p className="mt-1">(_________________)</p>
                  </div>
              </div>

            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={handlePrintSPK}><Printer className="mr-2 h-4 w-4" />Cetak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    
    </div>
  );
}