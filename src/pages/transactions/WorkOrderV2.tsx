import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Eye, Trash2, ClipboardCheck, Play, CheckCircle, Printer, XCircle, RefreshCw, Check, X, Camera, Upload, Image as ImageIcon, Pencil, Wrench, Info } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
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

type WO = Database['public']['Tables']['work_orders']['Row'];
type VehicleEntry = Database['public']['Tables']['vehicle_entries']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Mechanic = Database['public']['Tables']['mechanics']['Row'];
type Goods = Database['public']['Tables']['goods']['Row'];

type WOWithDetails = WO & {
  vehicle_entries: (VehicleEntry & { vehicles: Vehicle | null }) | null;
  mechanics: Mechanic | null;
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
    source?: 'GOODS_ISSUE' | 'WO_INTERFACE';
    is_info_only?: boolean; // New flag for info-only stock
  };

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

  // Billing / Finishing State
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [billingItems, setBillingItems] = useState<WOBillingItem[]>([]);
  const [activeWO, setActiveWO] = useState<WOWithDetails | null>(null);
  const [goodsList, setGoodsList] = useState<Goods[]>([]);
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [serviceRinganFilter, setServiceRinganFilter] = useState(false);
  const [activeBillingIndex, setActiveBillingIndex] = useState<number | null>(null);
  
  // Entry Search Dialog
  const [isEntrySearchOpen, setIsEntrySearchOpen] = useState(false);
  const [entrySearchQuery, setEntrySearchQuery] = useState('');

  const [activeWOImages, setActiveWOImages] = useState<any[]>([]);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Print State
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printData, setPrintData] = useState<any>(null);

  // ... (inside fetchWOs or separate function)
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
            // 1. Compress Image Logic
            const compressedBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (event) => {
                    const img = new Image();
                    img.src = event.target?.result as string;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        // Max dimensions
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
                            // Compress to JPEG with 0.7 quality
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

            // 2. Save directly to DB (Bypassing Storage Bucket)
            const { error: dbError } = await supabase
                .from('work_order_images')
                .insert([{
                    work_order_id: woId,
                    image_url: compressedBase64, // Storing compressed base64 string
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

  const handleDeleteImage = async (imageId: string, imageUrl: string) => {
      if(!confirm("Hapus foto ini?")) return;
      try {
          await supabase.from('work_order_images').delete().eq('id', imageId);
          toast.success("Foto dihapus");
          if(activeWO) fetchWOImages(activeWO.id);
      } catch (e: any) {
          toast.error("Gagal hapus: " + e.message);
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
    console.log('WorkOrder V2 Mounted - Version 3.3 (Date Filter & Vehicle Search)');
    fetchWOs();
    fetchMasterData();
    fetchGoods();
  }, [dateRange]);

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

  async function fetchGoods() {
    const { data } = await supabase
      .from('goods')
      .select('*')
      .eq('is_active', true) // Only active goods
      .order('name');
    setGoodsList(data || []);
  }

  async function fetchWOs() {
    setLoading(true);
    try {
      let query = supabase
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

      if (dateRange.start) {
        query = query.gte('work_date', dateRange.start);
      }
      if (dateRange.end) {
        query = query.lte('work_date', dateRange.end);
      }

      const { data, error } = await query;

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

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (newStatus === 'CLOSED' && !confirm('Apakah Anda yakin ingin menutup WO ini? Pastikan semua pekerjaan selesai.')) {
      return;
    }
    
    // Check permission for Re-open or Editing Closed/Completed WO
    if (activeWO?.status === 'CLOSED' || activeWO?.status === 'COMPLETED') { 
        // Allow ADMIN and SUPER_ADMIN to reopen/edit
        const hasReopenAccess = user?.role === 'SUPER_ADMIN' || (user?.role === 'ADMIN' && user?.allowed_menus?.includes('trans_wo_reopen'));
        
        if (!hasReopenAccess) {
             toast.error("Hanya Admin dengan izin khusus yang bisa membuka kembali WO.");
             return;
        }
    }

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

  // --- Billing / Finishing Logic ---

  const handleFinishWO = async (wo: WOWithDetails) => {
    setActiveWO(wo);
    setLoading(true);
    
    try {
      // 0. Fetch existing Goods Issues (The Source of Truth for Perbaikan Parts)
      const { data: issueData } = await supabase
        .from('goods_issues')
        .select(`
          goods_issue_items (
            quantity,
            goods (*)
          )
        `)
        .eq('work_order_id', wo.id);

      // 1. Try to fetch existing saved billings
      const { data: existingBillings } = await supabase
        .from('work_order_billings')
        .select('*')
        .eq('work_order_id', wo.id);

      let items: WOBillingItem[] = [];

      if (existingBillings && existingBillings.length > 0) {
        // Use existing billings but REFRESH "Perbaikan" parts from Goods Issue
        items = existingBillings.map(b => ({
          id: b.id,
          item_type: b.item_type as 'JOB' | 'PART',
          job_type_id: b.job_type_id,
          goods_id: b.goods_id,
          item_name: b.item_name,
          qty: b.qty,
          unit_price: b.unit_price,
          total_price: b.total_price,
          job_group: b.job_group,
          source: 'WO_INTERFACE', // Default
          is_info_only: b.is_info_only || false
        }));

        // Remove old Perbaikan parts (source: GOODS_ISSUE) from saved billing to avoid stale data
        // We will re-inject them from fresh issueData below.
        items = items.filter(i => !(i.job_group === 'PERBAIKAN' && i.item_type === 'PART'));

      } else {
        // Fallback: Construct from Jobs (First time opening)
        const { data: entryData } = await supabase
            .from('vehicle_entries')
            .select(`
            vehicle_entry_jobs (
                job_types (*)
            )
            `)
            .eq('id', wo.vehicle_entry_id || '')
            .single();

        if (entryData?.vehicle_entry_jobs) {
            entryData.vehicle_entry_jobs.forEach((j: any) => {
            if (j.job_types) {
                items.push({
                item_type: 'JOB',
                job_type_id: j.job_types.id,
                goods_id: null,
                item_name: j.job_types.job_name,
                job_group: j.job_types.job_group,
                qty: 1,
                unit_price: j.job_types.selling_price || 0,
                total_price: j.job_types.selling_price || 0,
                source: 'WO_INTERFACE',
                is_info_only: false
                });
            }
            });
        }
      }

      // 2. INJECT Issued Goods (Perbaikan) - Always fresh from Goods Issue
      if (issueData) {
        issueData.forEach((issue: any) => {
          if (issue.goods_issue_items) {
            issue.goods_issue_items.forEach((item: any) => {
              if (item.goods) {
                // Only inject if not Service Ringan (Service Ringan is handled in WO Interface)
                // But wait, user said "Perbaikan" parts come from Goods Issue.
                // We assume anything issued manually is "Perbaikan" or general part.
                // We should display it here as Read-Only.
                
                // Check if this good is already in items (e.g. added as Service Ringan).
                // If it is Service Ringan, we leave it alone (it's managed by WO).
                // If it's NOT Service Ringan, we add it as Perbaikan (Read Only).
                
                const exists = items.find(i => i.goods_id === item.goods.id && isServiceRingan(i.job_group));
                if (!exists) {
                     items.push({
                        item_type: 'PART',
                        job_type_id: null,
                        goods_id: item.goods.id,
                        item_name: `Penggantian ${item.goods.name}`,
                        job_group: 'PERBAIKAN',
                        qty: item.quantity,
                        unit_price: item.goods.selling_price || 0,
                        total_price: (item.goods.selling_price || 0) * item.quantity,
                        source: 'GOODS_ISSUE', // Flag as from Goods Issue
                        is_info_only: item.is_info_only || false
                    });
                }
              }
            });
          }
        });
      }

      setBillingItems(items);
      setIsBillingOpen(true);

    } catch (error) {
      console.error(error);
      toast.error("Gagal memuat detail pekerjaan");
    } finally {
      setLoading(false);
    }
  };

  const handleBillingItemChange = (index: number, field: keyof WOBillingItem, value: any) => {
    const newItems = [...billingItems];
    const item = newItems[index];

    (item as any)[field] = value;

    // Recalculate total if price or qty changes
    if (field === 'qty' || field === 'unit_price') {
      item.total_price = item.qty * item.unit_price;
    }

    setBillingItems(newItems);
  };

    const handleBillingPartSelect = (index: number, goods: Goods) => {
    const newItems = [...billingItems];
    const item = newItems[index];
    
    item.goods_id = goods.id;
    // item.item_name = `Ganti ${goods.name}`; 
    item.unit_price = goods.selling_price || 0;
    item.total_price = item.qty * (goods.selling_price || 0);
    item.source = 'WO_INTERFACE'; // Mark as added in WO interface

    setBillingItems(newItems);
    setItemSearchOpen(false);
    setActiveBillingIndex(null);
  };

  const handleSaveBilling = async (): Promise<boolean> => {
    if (!activeWO) return false;
    setLoading(true);

    try {
        // 1. Save Billing Items to DB
        
        // Delete old billings first (simple overwrite strategy)
        await supabase.from('work_order_billings').delete().eq('work_order_id', activeWO.id);

        const { error: billingError } = await supabase
            .from('work_order_billings')
            .insert(billingItems.map(item => ({
                work_order_id: activeWO.id,
                item_type: item.item_type,
                job_type_id: item.job_type_id,
                goods_id: item.goods_id,
                item_name: item.item_name,
                qty: item.qty,
                unit_price: item.unit_price,
                total_price: item.total_price,
                job_group: item.job_group,
                is_info_only: item.is_info_only
            })));

        if (billingError) throw billingError;

        // 2. ROBUST STOCK SYNC LOGIC
        // Ensure all billed parts are reflected in Goods Issues and Stock is deducted.
        
        // A. Fetch existing Goods Issues for this WO
        const { data: existingIssues } = await supabase
            .from('goods_issues')
            .select('*, items:goods_issue_items(*)')
            .eq('work_order_id', activeWO.id);

        // B. Find or Create "Auto-generated" Issue Header
        let targetIssueId: string;
        // Fix: 'notes' column does not exist. Use 'issue_number' pattern to identify auto-generated issues.
        const autoIssue = existingIssues?.find(i => i.issue_number?.includes('GI-WO-AUTO-'));
        
        if (autoIssue) {
            targetIssueId = autoIssue.id;
        } else {
            // Create new header if we have parts to process
            const hasParts = billingItems.some(i => i.goods_id);
            if (hasParts) {
                const { data: newIssue, error: createError } = await supabase
                    .from('goods_issues')
                    .insert([{
                        issue_number: `GI-WO-AUTO-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                        work_order_id: activeWO.id,
                        issue_date: new Date().toISOString().split('T')[0]
                        // Removed 'notes' field as it doesn't exist in DB schema
                    }])
                    .select()
                    .single();
                
                if (createError) throw createError;
                targetIssueId = newIssue.id;
            } else {
                targetIssueId = ''; // No parts, no issue needed
            }
        }

        // C. Map existing issued items for quick lookup: goods_id -> quantity
        const issuedMap = new Map<string, number>();
        if (existingIssues) {
            existingIssues.forEach(issue => {
                if (issue.items) {
                    issue.items.forEach((item: any) => {
                        if (item.goods_id) {
                            const current = issuedMap.get(item.goods_id) || 0;
                            issuedMap.set(item.goods_id, current + item.quantity);
                        }
                    });
                }
            });
        }

        // D. Sync Billing Items to Stock
        if (targetIssueId) {
            // Optimization: Process in parallel to reduce delay
            const promises = billingItems.map(async (item) => {
                // STRICTLY FOLLOW RULE: Only "Service Ringan" items trigger auto-stock deduction in WO.
                if (!isServiceRingan(item.job_group)) return;

                if (item.goods_id) {
                    const billedQty = item.qty;
                    const alreadyIssuedQty = issuedMap.get(item.goods_id) || 0;
                    const diff = billedQty - alreadyIssuedQty;

                    if (diff > 0) { // Only handle POSITIVE diff (Deduction)
                        // 1. Adjust Stock (ONLY IF NOT INFO ONLY)
                        if (!item.is_info_only) {
                            const { data: currentGood } = await supabase
                                .from('goods')
                                .select('current_stock')
                                .eq('id', item.goods_id)
                                .single();

                            if (currentGood) {
                                await supabase
                                    .from('goods')
                                    .update({ current_stock: (currentGood.current_stock || 0) - diff })
                                    .eq('id', item.goods_id);
                            }
                        }

                        // 2. Add/Update Goods Issue Item
                        const { data: existingTargetItem } = await supabase
                            .from('goods_issue_items')
                            .select('*')
                            .eq('issue_id', targetIssueId)
                            .eq('goods_id', item.goods_id)
                            .single();

                        if (existingTargetItem) {
                            await supabase
                                .from('goods_issue_items')
                                .update({ 
                                    quantity: existingTargetItem.quantity + diff,
                                    is_info_only: item.is_info_only 
                                })
                                .eq('id', existingTargetItem.id);
                        } else {
                             await supabase
                                 .from('goods_issue_items')
                                 .insert({
                                     issue_id: targetIssueId,
                                     goods_id: item.goods_id,
                                     quantity: diff,
                                     is_info_only: item.is_info_only
                                 });
                        }
                    }
                }
            });

            await Promise.all(promises);
        }

        // --- E. AUTO JOURNALING (Piutang vs Pendapatan) ---
        // Debit: Piutang Usaha (Grand Total)
        // Credit: Pendapatan Jasa (Total Service)
        // Credit: Pendapatan Sparepart (Total Parts)
        
        try {
             // 1. Calculate Totals
             let totalService = 0;
             let totalParts = 0;
             
             billingItems.forEach(item => {
                 // Skip Info Only items from Journal? Usually yes, as they are not billed.
                 if (item.is_info_only) return;

                 if (item.item_type === 'JOB') {
                     totalService += item.total_price || 0;
                 } else {
                     totalParts += item.total_price || 0;
                 }
             });
             
             const grandTotal = totalService + totalParts;

             if (grandTotal > 0) {
               // 2. Find Accounts
               const { data: accounts } = await supabase
                   .from('chart_of_accounts')
                   .select('id, account_name, account_code, account_type, category');
               
               const isDetail = (a: any) => (a?.account_type || '').toUpperCase() === 'DETAIL';
               const isRevenue = (a: any) => {
                    const c = (a?.category || '').toUpperCase();
                    return c === 'PENDAPATAN' || c === 'PENJUALAN';
               };
               const findByCode = (code: string) => accounts?.find(a => isDetail(a) && a?.account_code === code);
               const findByName = (keyword: string, revenueOnly = false) => accounts?.find(a => {
                    if (!isDetail(a)) return false;
                    if (revenueOnly && !isRevenue(a)) return false;
                    return (a?.account_name || '').toLowerCase().includes(keyword.toLowerCase());
               });

               const accReceivable = findByName('Piutang Usaha') || findByName('Piutang') || findByName('Receivable');
               const accServiceRev = findByCode('4100101') || findByName('Pendapatan Jasa', true) || findByName('Jasa', true) || findByName('Service', true);
               const accPartsRev = findByCode('4100102') || findByName('Pendapatan Sparepart', true) || findByName('Sparepart', true) || accServiceRev;

                if (accReceivable && accServiceRev) {
                    // 3. Create Journal Header
                    const { data: journal, error: jErr } = await supabase
                        .from('journal_entries')
                        .insert([{
                            entry_date: new Date().toISOString(),
                            description: `Jurnal Otomatis WO ${activeWO.wo_number}`,
                            reference_number: activeWO.wo_number,
                            total_amount: grandTotal,
                            status: 'POSTED',
                            entry_type: 'AUTOMATIC' // FIX: Required field
                        }])
                        .select()
                        .single();

                    if (!jErr && journal) {
                        const journalItems = [];

                        // DEBIT: Piutang
                        journalItems.push({
                            journal_entry_id: journal.id,
                            account_id: accReceivable.id,
                            debit: grandTotal,
                            credit: 0,
                            description: `Piutang WO ${activeWO.wo_number}`
                        });

                        // CREDIT: Pendapatan Jasa
                        if (totalService > 0) {
                            journalItems.push({
                                journal_entry_id: journal.id,
                                account_id: accServiceRev.id,
                                debit: 0,
                                credit: totalService,
                                description: `Pendapatan Jasa WO ${activeWO.wo_number}`
                            });
                        }

                        // CREDIT: Pendapatan Sparepart
                        if (totalParts > 0) {
                             journalItems.push({
                                journal_entry_id: journal.id,
                                account_id: accPartsRev?.id || accServiceRev.id,
                                debit: 0,
                                credit: totalParts,
                                description: `Pendapatan Sparepart WO ${activeWO.wo_number}`
                            });
                        }

                        await supabase.from('journal_entry_items').insert(journalItems);
                        toast.success("Jurnal Otomatis Berhasil Dibuat");
                    }
                } else {
                    toast.warning("Jurnal Otomatis GAGAL: Akun Piutang/Pendapatan belum disetting di COA.");
                }
             }
        } catch (jError) {
            console.error("Auto Journal Error:", jError);
            toast.error("Gagal membuat jurnal otomatis (Data WO tetap tersimpan).");
        }

        // 3. Update WO Status to COMPLETED
        await supabase
            .from('work_orders')
            .update({ status: 'COMPLETED' } as any)
            .eq('id', activeWO.id);
        
        // 4. Update Vehicle Entry Status to COMPLETED
        if (activeWO.vehicle_entry_id) {
            await supabase
                .from('vehicle_entries')
                .update({ status: 'COMPLETED' } as any)
                .eq('id', activeWO.vehicle_entry_id);
        }
        
        toast.success("WO Selesai & Tagihan Disimpan (Stok Terupdate)");
        setIsBillingOpen(false);
        fetchWOs();
        return true;

    } catch (error: any) {
        toast.error("Gagal menyimpan: " + error.message);
        return false;
    } finally {
        setLoading(false);
    }
  };

  const calculateGrandTotal = () => {
    return billingItems.reduce((acc, item) => acc + (item.total_price || 0), 0);
  };

  const handleDelete = async (id: string) => {
    // Check permission: SUPER_ADMIN or ADMIN with 'trans_wo_delete' (assuming we add this key or reuse reopen for advanced actions)
    // Using 'trans_wo_reopen' as a proxy for "Advanced WO Admin" for now as per request "admin yang diberikan bisa lakukan itu"
    const hasDeleteAccess = user?.role === 'SUPER_ADMIN' || (user?.role === 'ADMIN' && user?.allowed_menus?.includes('trans_wo_reopen'));

    if (!hasDeleteAccess) {
        toast.error("Anda tidak memiliki izin untuk menghapus WO.");
        return;
    }

    if (!confirm('PERINGATAN: Apakah Anda yakin ingin MENGHAPUS Work Order ini secara permanen? Data yang dihapus tidak dapat dikembalikan.')) return;
    
    setLoading(true);
    try {
      // 1. Get all related Goods Issues
      const { data: issues } = await supabase
        .from('goods_issues')
        .select('id, items:goods_issue_items(goods_id, quantity)')
        .eq('work_order_id', id);

      const issueIds = issues?.map(i => i.id) || [];

      // 2. Restore Stock Logic (Must be done before deleting items)
      if (issues) {
        for (const issue of issues) {
          if (issue.items) {
            for (const item of issue.items) {
               if (item.goods_id) {
                 const { data: currentGood } = await supabase
                   .from('goods')
                   .select('current_stock')
                   .eq('id', item.goods_id)
                   .single();
                  
                 if (currentGood) {
                   await supabase
                     .from('goods')
                     .update({ current_stock: (currentGood.current_stock || 0) + item.quantity })
                     .eq('id', item.goods_id);
                 }
               }
            }
          }
        }
      }

      // 3. Delete ALL Goods Issue Items (Bulk Delete for safety)
      if (issueIds.length > 0) {
          const { error: itemsError } = await supabase
            .from('goods_issue_items')
            .delete()
            .in('issue_id', issueIds);
          
          if (itemsError) throw itemsError;
      }

      // 4. Delete Goods Issues
      const { error: issuesError } = await supabase
        .from('goods_issues')
        .delete()
        .eq('work_order_id', id);

      if (issuesError) throw issuesError;

      // 5. Delete Billings & Images
      await supabase.from('work_order_billings').delete().eq('work_order_id', id);
      await supabase.from('work_order_images').delete().eq('work_order_id', id);

      // 6. Unlink Purchase Orders (Set work_order_id to NULL instead of deleting PO)
      // This prevents FK violation if a PO exists for this WO
      await supabase
        .from('purchase_orders')
        .update({ work_order_id: null } as any)
        .eq('work_order_id', id);

      // 7. Delete Work Order
      const { error } = await supabase.from('work_orders').delete().eq('id', id);
      if (error) throw error;
      
      toast.success('Work Order berhasil dihapus');
      fetchWOs();
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes('goods_issues_work_order_id_fkey')) {
          toast.error('GAGAL HAPUS: Masih ada Barang Keluar yang terkait. Kemungkinan Anda tidak memiliki izin untuk menghapus Barang Keluar tersebut (RLS). Hubungi IT untuk menjalankan script "ON DELETE CASCADE".');
      } else {
          toast.error('Gagal menghapus WO: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFixStock = async (wo: WOWithDetails) => {
    if (!confirm(`Jalankan 'Fix Stock' untuk WO ${wo.wo_number}? Ini akan mengecek tagihan dan memastikan stok terpotong.`)) return;
    
    setLoading(true);
    try {
        // 1. Fetch Billings
        const { data: billings } = await supabase.from('work_order_billings').select('*').eq('work_order_id', wo.id);
        
        if (!billings || billings.length === 0) {
            toast.error("Tidak ada data tagihan ditemukan untuk WO ini.");
            setLoading(false);
            return;
        }

        // 2. Fetch Existing Issues
        const { data: existingIssues } = await supabase
            .from('goods_issues')
            .select('*, items:goods_issue_items(*)')
            .eq('work_order_id', wo.id);

        // 3. Prepare Issue Header
        let targetIssueId: string;
        // Fix: Use issue_number pattern instead of notes
        const autoIssue = existingIssues?.find(i => i.issue_number?.includes('GI-WO-AUTO-'));
        
        if (autoIssue) {
            targetIssueId = autoIssue.id;
        } else {
             // Create new header if needed
             const hasParts = billings.some(i => i.goods_id);
             if (hasParts) {
                 const { data: newIssue, error: createError } = await supabase
                    .from('goods_issues')
                    .insert([{
                        issue_number: `GI-WO-AUTO-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                        work_order_id: wo.id,
                        issue_date: new Date().toISOString().split('T')[0]
                        // Removed notes
                    }])
                    .select()
                    .single();
                 
                 if (createError) throw createError;
                 targetIssueId = newIssue.id;
             } else {
                 toast.info("Tidak ada sparepart dalam tagihan.");
                 setLoading(false);
                 return;
             }
        }

        // 4. Map Existing Issued Items
        const issuedMap = new Map<string, number>();
        if (existingIssues) {
            existingIssues.forEach(issue => {
                if (issue.items) {
                    issue.items.forEach((item: any) => {
                        if (item.goods_id) {
                            const current = issuedMap.get(item.goods_id) || 0;
                            issuedMap.set(item.goods_id, current + item.quantity);
                        }
                    });
                }
            });
        }

        // 5. Sync
        let updatedCount = 0;
        if (targetIssueId) {
            for (const item of billings) {
                // STRICTLY FOLLOW RULE: Only "Service Ringan" items trigger auto-stock deduction.
                if (!isServiceRingan(item.job_group)) continue;

                if (item.goods_id) {
                    const billedQty = item.qty;
                    const alreadyIssuedQty = issuedMap.get(item.goods_id) || 0;
                    const diff = billedQty - alreadyIssuedQty;

                    if (diff > 0) { // Only handle positive diff
                        // Adjust Stock (ONLY IF NOT INFO ONLY)
                        if (!item.is_info_only) {
                            const { data: currentGood } = await supabase
                                .from('goods')
                                .select('current_stock, name')
                                .eq('id', item.goods_id)
                                .single();

                            if (currentGood) {
                                await supabase
                                    .from('goods')
                                    .update({ current_stock: (currentGood.current_stock || 0) - diff })
                                    .eq('id', item.goods_id);
                            }
                        }

                        // Update/Insert Issue Item
                        const { data: existingTargetItem } = await supabase
                            .from('goods_issue_items')
                            .select('*')
                            .eq('issue_id', targetIssueId)
                            .eq('goods_id', item.goods_id)
                            .single();

                        if (existingTargetItem) {
                            await supabase
                                .from('goods_issue_items')
                                .update({ 
                                    quantity: existingTargetItem.quantity + diff,
                                    is_info_only: item.is_info_only // Update flag if needed (though usually insert)
                                })
                                .eq('id', existingTargetItem.id);
                        } else {
                            if (diff > 0) {
                                await supabase
                                    .from('goods_issue_items')
                                    .insert({
                                        issue_id: targetIssueId,
                                        goods_id: item.goods_id,
                                        quantity: diff,
                                        is_info_only: item.is_info_only // Pass the flag
                                    });
                            }
                        }
                        updatedCount++;
                        console.log(`Fixed Stock for ${currentGood?.name}: Diff ${diff}`);
                    }
                }
            }
        }

        if (updatedCount > 0) {
            toast.success(`Berhasil memperbaiki stok untuk ${updatedCount} item.`);
        } else {
            toast.info("Stok sudah sinkron. Tidak ada perubahan.");
        }

    } catch (e: any) {
        toast.error("Gagal fix stock: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  const handleSyncJournal = async (wo: WOWithDetails) => {
    if (!confirm(`Buat Jurnal Otomatis untuk WO ${wo.wo_number}? (Hanya jika belum ada)`)) return;
    
    setLoading(true);
    try {
        // 1. Check if journal exists
        const { data: existingJournal } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('reference_number', wo.wo_number)
            .maybeSingle(); // Use maybeSingle to avoid error if not found

        if (existingJournal) {
            toast.info("Jurnal sudah ada untuk WO ini.");
            setLoading(false);
            return;
        }

        // 2. Fetch Billings to calculate totals
        const { data: billings } = await supabase
            .from('work_order_billings')
            .select('*')
            .eq('work_order_id', wo.id);
        
        if (!billings || billings.length === 0) {
            toast.error("Tidak ada data tagihan di WO ini.");
            setLoading(false);
            return;
        }

        let totalService = 0;
        let totalParts = 0;
        
        billings.forEach(item => {
            if (item.is_info_only) return;
            if (item.item_type === 'JOB') {
                totalService += item.total_price || 0;
            } else {
                totalParts += item.total_price || 0;
            }
        });
        
        const grandTotal = totalService + totalParts;

        if (grandTotal <= 0) {
            toast.info("Total tagihan 0, tidak perlu jurnal.");
            setLoading(false);
            return;
        }

        // 3. Find Accounts
        const { data: accounts } = await supabase
            .from('chart_of_accounts')
            .select('id, account_name, account_code, account_type, category');
        
        const isDetail = (a: any) => (a?.account_type || '').toUpperCase() === 'DETAIL';
        const isRevenue = (a: any) => {
            const c = (a?.category || '').toUpperCase();
            return c === 'PENDAPATAN' || c === 'PENJUALAN';
        };
        const findByCode = (code: string) => accounts?.find(a => isDetail(a) && a?.account_code === code);
        const findByName = (keyword: string, revenueOnly = false) => accounts?.find(a => {
            if (!isDetail(a)) return false;
            if (revenueOnly && !isRevenue(a)) return false;
            return (a?.account_name || '').toLowerCase().includes(keyword.toLowerCase());
        });

        const accReceivable = findByName('Piutang Usaha') || findByName('Piutang') || findByName('Receivable');
        const accServiceRev = findByCode('4100101') || findByName('Pendapatan Jasa', true) || findByName('Jasa', true) || findByName('Service', true);
        const accPartsRev = findByCode('4100102') || findByName('Pendapatan Sparepart', true) || findByName('Sparepart', true) || accServiceRev;

        if (!accReceivable || !accServiceRev) {
            toast.error("Gagal: Akun Piutang/Pendapatan tidak ditemukan di COA.");
            setLoading(false);
            return;
        }

        // 4. Create Journal
        const { data: journal, error: jErr } = await supabase
            .from('journal_entries')
            .insert([{
                entry_date: wo.work_date, // Use WO date for backfill? Or current date? Usually WO date is better for accrual.
                description: `Jurnal Otomatis WO ${wo.wo_number}`,
                reference_number: wo.wo_number,
                total_amount: grandTotal,
                status: 'POSTED',
                entry_type: 'AUTOMATIC' // FIX: Required field
            }])
            .select()
            .single();

        if (jErr) throw jErr;

        const journalItems = [];

        // DEBIT
        journalItems.push({
            journal_entry_id: journal.id,
            account_id: accReceivable.id,
            debit: grandTotal,
            credit: 0,
            description: `Piutang WO ${wo.wo_number}`
        });

        // CREDIT Service
        if (totalService > 0) {
            journalItems.push({
                journal_entry_id: journal.id,
                account_id: accServiceRev.id,
                debit: 0,
                credit: totalService,
                description: `Pendapatan Jasa WO ${wo.wo_number}`
            });
        }

        // CREDIT Parts
        if (totalParts > 0) {
                journalItems.push({
                journal_entry_id: journal.id,
                account_id: accPartsRev?.id || accServiceRev.id,
                debit: 0,
                credit: totalParts,
                description: `Pendapatan Sparepart WO ${wo.wo_number}`
            });
        }

        await supabase.from('journal_entry_items').insert(journalItems);
        toast.success("Jurnal Berhasil Disinkronisasi (Backfill)");

    } catch (e: any) {
        toast.error("Gagal sync jurnal: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  const filteredWOs = wos.filter(w => 
    w.wo_number.toLowerCase().includes(search.toLowerCase()) ||
    w.vehicle_entries?.vehicles?.license_plate.toLowerCase().includes(search.toLowerCase()) ||
    w.vehicle_entries?.vehicles?.brand_type?.toLowerCase().includes(search.toLowerCase())
  );

  const isServiceRingan = (group: string | null | undefined) => {
    if (!group) return false;
    return group.toUpperCase().replace(/_/g, ' ').includes('SERVICE RINGAN');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-blue-700">Work Order (WO) - DEBUG MODE</h2>
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
                  <Label>Referensi Entry (Pilih Kendaraan Masuk)</Label>
                  {isEditing ? (
                     <div className="border p-2 rounded-md bg-gray-100 text-sm">
                        {entries.find(e => e.id === formData.vehicle_entry_id)?.vehicles?.license_plate || 'Unknown'} - {entries.find(e => e.id === formData.vehicle_entry_id)?.entry_number || 'Unknown'}
                     </div>
                  ) : (
                    <Button 
                        variant="outline" 
                        role="combobox" 
                        className="w-full justify-between font-normal"
                        onClick={(e) => { e.preventDefault(); setIsEntrySearchOpen(true); }}
                    >
                        {formData.vehicle_entry_id 
                            ? `${entries.find(e => e.id === formData.vehicle_entry_id)?.entry_number} - ${entries.find(e => e.id === formData.vehicle_entry_id)?.vehicles?.license_plate}`
                            : "Cari Nopol / No. Entry..."}
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  )}
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
                                {job.job_types?.job_group.includes('PERBAIKAN') ? 'PRB' : 'SRV'}
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

      {/* Entry Search Dialog */}
      <Dialog open={isEntrySearchOpen} onOpenChange={setIsEntrySearchOpen}>
        <DialogContent className="sm:max-w-[600px] p-0">
            <Command>
                <CommandInput 
                    placeholder="Cari Nopol, No. Entry, atau Nota Dinas..." 
                    value={entrySearchQuery} 
                    onChange={(e) => setEntrySearchQuery(e.target.value)} 
                />
                <CommandList>
                    <CommandEmpty>Tidak ditemukan data entry yang belum diproses.</CommandEmpty>
                    <CommandGroup heading="Kendaraan Masuk (Belum WO)">
                        {entries
                            .filter(e => 
                                e.vehicles?.license_plate.toLowerCase().includes(entrySearchQuery.toLowerCase()) ||
                                e.entry_number.toLowerCase().includes(entrySearchQuery.toLowerCase()) ||
                                (e.nota_dinas_number && e.nota_dinas_number.toLowerCase().includes(entrySearchQuery.toLowerCase()))
                            )
                            .map(e => (
                                <CommandItem key={e.id} onSelect={() => {
                                    handleSelectChange('vehicle_entry_id', e.id);
                                    setIsEntrySearchOpen(false);
                                }}>
                                    <div className="flex flex-col w-full">
                                        <div className="flex justify-between">
                                            <span className="font-bold">{e.vehicles?.license_plate}</span>
                                            <span className="text-xs text-muted-foreground">{e.entry_number}</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>{e.vehicles?.brand_type}</span>
                                            <span>{formatDate(e.entry_date)}</span>
                                        </div>
                                        {e.nota_dinas_number && <span className="text-xs text-blue-600">ND: {e.nota_dinas_number}</span>}
                                    </div>
                                    {formData.vehicle_entry_id === e.id && <Check className="ml-auto h-4 w-4" />}
                                </CommandItem>
                            ))
                        }
                    </CommandGroup>
                </CommandList>
            </Command>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Daftar Work Order</CardTitle>
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex items-center gap-2">
                 <Input 
                    type="date" 
                    className="w-auto" 
                    value={dateRange.start} 
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} 
                 />
                 <span>-</span>
                 <Input 
                    type="date" 
                    className="w-auto" 
                    value={dateRange.end} 
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} 
                 />
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Cari No. WO / Nopol / Kendaraan..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
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
                          <span className="text-xs text-muted-foreground">{item.vehicle_entries?.vehicles?.brand_type}</span>
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
                          {/* EMERGENCY SYNC BUTTON - ALWAYS SHOW FOR CLOSED WO */}
                          {item.status === 'CLOSED' && (
                             <Button 
                                variant="destructive" 
                                size="sm" 
                                className="bg-pink-600 hover:bg-pink-700 text-white font-bold animate-pulse" 
                                onClick={() => handleSyncJournal(item)} 
                                title="SYNC JURNAL SEKARANG"
                              >
                                  SYNC JURNAL
                              </Button>
                          )}

                          {item.status === 'OPEN' && (
                            <Button size="sm" variant="outline" onClick={() => handleStatusChange(item.id, 'IN_PROGRESS')}>
                              <Play className="h-4 w-4 mr-1" /> Mulai
                            </Button>
                          )}
                          {item.status === 'IN_PROGRESS' && (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleFinishWO(item)}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Selesai
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-8" onClick={() => handlePrint(item)}>
                             <ClipboardCheck className="h-4 w-4 mr-1" /> SPK
                          </Button>
                          {item.status === 'COMPLETED' && (
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleStatusChange(item.id, 'CLOSED')}>
                              <XCircle className="h-4 w-4 mr-1" /> Tutup WO
                            </Button>
                          )}
                          {item.status === 'CLOSED' && (
                            <>
                              {(user?.role === 'SUPER_ADMIN' || (user?.role === 'ADMIN' && user?.allowed_menus?.includes('trans_wo_reopen'))) && (
                                <Button size="sm" variant="outline" className="text-orange-500 border-orange-200 hover:bg-orange-50" onClick={() => handleStatusChange(item.id, 'IN_PROGRESS')}>
                                  <RefreshCw className="h-4 w-4" /> Re-open
                                </Button>
                              )}
                            </>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handlePrintSuratJalan(item.id)} title="Cetak Surat Jalan / WO">
                              <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { 
                              setActiveWO(item); 
                              fetchWOImages(item.id); 
                              setIsImageDialogOpen(true); 
                          }} title="Foto Dokumentasi">
                              <Camera className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Eye className="h-4 w-4" /></Button>
                          {/* Edit button for OPEN & IN_PROGRESS */}
                          {(item.status === 'OPEN' || item.status === 'IN_PROGRESS') && (
                             <Button variant="ghost" size="icon" onClick={() => handleEdit(item)} title="Edit WO">
                               <Pencil className="h-4 w-4" />
                             </Button>
                          )}
                          {(user?.role === 'SUPER_ADMIN' || (user?.role === 'ADMIN' && user?.allowed_menus?.includes('trans_wo_reopen'))) && (
                            <Button variant="destructive" size="icon" onClick={() => handleDelete(item.id)} title="Hapus WO">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {/* Fix Stock & Sync Journal Buttons for Closed WO - DEBUG MODE: ALWAYS SHOW */}
                          {item.status === 'CLOSED' && (
                              <div className="flex gap-1">
                                  <Button variant="outline" size="icon" className="text-purple-600 border-purple-200 hover:bg-purple-50" onClick={() => handleFixStock(item)} title="Fix Stock / Sinkronisasi Stok">
                                      <Wrench className="h-4 w-4" />
                                  </Button>
                                  
                                  <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    className="h-8 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white" 
                                    onClick={() => handleSyncJournal(item)} 
                                    title="KLIK DISINI UNTUK SYNC JURNAL"
                                  >
                                      SYNC JURNAL
                                  </Button>
                              </div>
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

      {/* Billing / Completion Dialog */}
      <Dialog open={isBillingOpen} onOpenChange={setIsBillingOpen}>
        <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Penyelesaian Work Order & Tagihan</DialogTitle>
                <DialogDescription>
                    WO: {activeWO?.wo_number} | {activeWO?.vehicle_entries?.vehicles?.license_plate}
                </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto py-4">
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[10%]">Group</TableHead>
                            <TableHead className="w-[20%]">Daftar Pengerjaan</TableHead>
                            <TableHead className="w-[20%]">Sparepart</TableHead>
                            <TableHead className="w-[8%] text-center">Info Only</TableHead>
                            <TableHead className="w-[15%]">Harga Pagu</TableHead>
                            <TableHead className="w-[8%]">Qty</TableHead>
                            <TableHead className="w-[17%] text-right">Nominal</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {billingItems.map((item, index) => (
                            <TableRow key={index} className={item.is_info_only ? 'bg-yellow-50 hover:bg-yellow-100' : ''}>
                                <TableCell>
                                    <Badge variant="outline" className={isServiceRingan(item.job_group) ? 'bg-blue-50' : 'bg-orange-50'}>
                                        {item.job_group || (isServiceRingan(item.job_group) ? 'Service Ringan' : 'Perbaikan')}
                                    </Badge>
                                </TableCell>
                                <TableCell className="font-medium">{item.item_name}</TableCell>
                                <TableCell>
                                    {/* Sparepart Selection Logic */}
                                    {isServiceRingan(item.job_group) ? (
                                        // Service Ringan: Must Select Part (Search filtered by 'Oli' if job name implies oil)
                                        <div className="relative">
                                            <Button 
                                                variant="outline" 
                                                role="combobox" 
                                                className={cn("w-full justify-between text-xs h-8", !item.goods_id && "text-muted-foreground")}
                                                onClick={() => { 
                                                    setActiveBillingIndex(index); 
                                                    // Auto-filter for Service Ringan (Show OLI and FILTER items)
                                                    if (isServiceRingan(item.job_group)) {
                                                        setItemSearchQuery('');
                                                        setServiceRinganFilter(true);
                                                    } else {
                                                        setItemSearchQuery('');
                                                        setServiceRinganFilter(false);
                                                    }
                                                    setItemSearchOpen(true); 
                                                }}
                                            >
                                                {item.goods_id 
                                                    ? goodsList.find(g => g.id === item.goods_id)?.name 
                                                    : "Pilih Part..."}
                                                <Search className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                            </Button>
                                        </div>
                                    ) : (
                                        // Perbaikan: Read-only part name (if from Goods Issue) or Disabled (if pure Job)
                                        <span className="text-xs text-gray-500 italic">
                                            {item.item_type === 'PART' ? item.item_name.replace('Penggantian ', '') : '(Tidak ada part)'}
                                        </span>
                                    )}
                                    {/* INFO ONLY INDICATOR */}
                                    {item.is_info_only && (
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 border border-yellow-500 shadow-sm" title="Info Only"></div>
                                            <span className="text-[10px] text-yellow-700 font-medium bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100">Info Only</span>
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell className="text-center">
                                    <div className="flex justify-center items-center h-full">
                                        <Checkbox 
                                            checked={item.is_info_only} 
                                            onCheckedChange={(checked) => handleBillingItemChange(index, 'is_info_only', checked)}
                                            title="Info Only (Tidak Potong Stok)"
                                        />
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="text" 
                                        inputMode="numeric"
                                        className="h-8 text-right bg-gray-50"
                                        value={item.unit_price}
                                        readOnly={true} 
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="text"
                                        inputMode="numeric" 
                                        className={cn("h-8 text-center min-w-[60px]", !isServiceRingan(item.job_group) && "bg-gray-100 text-gray-500")}
                                        value={item.qty} 
                                        readOnly={!isServiceRingan(item.job_group)} // Read-only for Perbaikan
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                            handleBillingItemChange(index, 'qty', val ? parseInt(val) : 0);
                                        }}
                                    />
                                </TableCell>
                                <TableCell className="text-right font-bold">
                                    {formatCurrency(item.total_price)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                 </Table>
            </div>

            <div className="flex justify-between items-center border-t pt-4">
                <div className="text-xl font-bold">
                    Total Estimasi Biaya: {formatCurrency(calculateGrandTotal())}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsBillingOpen(false)}>Batal</Button>
                    <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSaveBilling}>
                        <CheckCircle className="mr-2 h-4 w-4" /> Simpan
                    </Button>
                    <Button variant="secondary" onClick={async () => {
                        const success = await handleSaveBilling();
                        if (success && activeWO) window.open(`/print/invoice/${activeWO.id}`, '_blank');
                    }}>
                        <Printer className="mr-2 h-4 w-4" /> Simpan & Cetak
                    </Button>
                </div>
            </div>

            {/* Sparepart Search Dialog for Billing */}
            <Dialog open={itemSearchOpen} onOpenChange={setItemSearchOpen}>
                <DialogContent className="sm:max-w-[500px] p-0">
                    <Command>
                        <CommandInput placeholder="Cari sparepart (oli, filter, dll)..." value={itemSearchQuery} onChange={(e) => setItemSearchQuery(e.target.value)} />
                        <CommandList>
                            <CommandEmpty>Tidak ditemukan.</CommandEmpty>
                            <CommandGroup heading="Spareparts">
                                {goodsList
                                    .filter(g => {
                                        if (itemSearchQuery) return g.name.toLowerCase().includes(itemSearchQuery.toLowerCase());
                                        if (serviceRinganFilter) {
                                            const n = g.name.toLowerCase();
                                            return n.includes('oli') || n.includes('filter');
                                        }
                                        return true;
                                    })
                                    .map(g => (
                                        <CommandItem key={g.id} onSelect={() => activeBillingIndex !== null && handleBillingPartSelect(activeBillingIndex, g)}>
                                            <div className="flex flex-col">
                                                <span>{g.name}</span>
                                                <span className="text-xs text-gray-500">Stok: {g.current_stock} | {formatCurrency(g.selling_price || 0)}</span>
                                            </div>
                                            {activeBillingIndex !== null && billingItems[activeBillingIndex]?.goods_id === g.id && <Check className="ml-auto h-4 w-4" />}
                                        </CommandItem>
                                    ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </DialogContent>
            </Dialog>

        </DialogContent>
      </Dialog>

      {/* Image Gallery Dialog */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>Dokumentasi WO: {activeWO?.wo_number}</DialogTitle>
                <DialogDescription>Upload foto kendaraan atau progress pekerjaan.</DialogDescription>
            </DialogHeader>
            
            <div className="flex flex-col gap-4">
                {/* Upload Controls */}
                <div className="flex gap-4 border-b pb-4">
                    <Button variant="outline" className="relative" disabled={uploadingImage}>
                        <input 
                            type="file" 
                            accept="image/jpeg, image/png" 
                            multiple
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={(e) => activeWO && handleImageUpload(e, activeWO.id)}
                        />
                        <Upload className="mr-2 h-4 w-4" /> 
                        {uploadingImage ? 'Uploading...' : 'Upload Foto (File - Multi)'}
                    </Button>
                    <Button variant="outline" className="relative" disabled={uploadingImage}>
                         <input 
                            type="file" 
                            accept="image/jpeg, image/png" 
                            capture="environment"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={(e) => activeWO && handleImageUpload(e, activeWO.id)}
                        />
                        <Camera className="mr-2 h-4 w-4" /> 
                        {uploadingImage ? 'Uploading...' : 'Ambil Foto (Kamera)'}
                    </Button>
                </div>
                
                {/* Max Size Info */}
                <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded border border-blue-100 flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 text-[10px] font-bold">i</div>
                    <span>Sistem akan otomatis mengkompresi foto agar aman disimpan di database. Kualitas tetap terjaga.</span>
                </div>

                {/* Gallery Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-1">
                    {activeWOImages.length === 0 ? (
                        <div className="col-span-full text-center py-10 text-gray-500 border-2 border-dashed rounded-lg">
                            <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-20" />
                            Belum ada foto dokumentasi.
                        </div>
                    ) : (
                        activeWOImages.map((img) => (
                            <div key={img.id} className="relative group border rounded-lg overflow-hidden shadow-sm aspect-video bg-gray-100">
                                <img src={img.image_url} alt="WO Doc" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    {activeWO && (activeWO.status === 'OPEN' || activeWO.status === 'IN_PROGRESS') && (
                                        <Button variant="destructive" size="icon" onClick={() => handleDeleteImage(img.id, img.image_url)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button variant="secondary" size="icon" className="ml-2" onClick={() => window.open(img.image_url, '_blank')}>
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 truncate">
                                    {new Date(img.created_at).toLocaleString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </DialogContent>
      </Dialog>

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

                {/* Catatan Umum (Entry Note) */}
                {printData.entry.notes && (
                    <div className="border p-3 rounded bg-gray-50">
                        <h3 className="font-bold text-sm mb-1">Catatan Keluhan / Masalah Awal:</h3>
                        <p className="text-sm italic">{printData.entry.notes}</p>
                    </div>
                )}

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
                                    <td className="py-2 font-medium">{part.item_name}</td>
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
