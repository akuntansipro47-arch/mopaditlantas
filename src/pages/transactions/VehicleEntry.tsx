import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, Printer, Check, Eye, Paperclip } from 'lucide-react';
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
import { logActivity } from '@/lib/activityLog';

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
  goods_id?: string;
  item_code?: string;
  name: string;
  qty: number;
  price: number;
  value_only: boolean;
};

type EntryAttachment = {
  id: string;
  vehicle_entry_id: string;
  file_name: string;
  mime_type: string;
  data_url?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  size_original?: number | null;
  size_stored?: number | null;
  created_at?: string | null;
};

type PendingAttachment = {
  temp_id: string;
  file_name: string;
  mime_type: string;
  blob: Blob;
  size_original?: number;
  size_stored?: number;
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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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

  const [entryJobs, setEntryJobs] = useState<{ group: string, job_id: string; job_name?: string; notes: string; value_only: boolean; estimated_price: number; spareparts?: SparepartDraft[]; sparepart_enabled?: boolean }[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<EntryAttachment[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});

  const attachmentDialogFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAttachmentDialogOpen, setIsAttachmentDialogOpen] = useState(false);
  const [attachmentDialogEntry, setAttachmentDialogEntry] = useState<{ id: string; entry_number?: string | null } | null>(null);
  const [attachmentDialogAttachments, setAttachmentDialogAttachments] = useState<EntryAttachment[]>([]);
  
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
    const { data: j } = await supabase.from('job_types').select('*').or('is_active.is.null,is_active.eq.true');
    setJobs(j || []);
    const { data: g } = await supabase.from('goods').select('id, item_code, name, selling_price, current_stock').order('name');
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
      await fetchAttachmentCountsForEntries((data as any) || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data entry: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const fetchAttachmentCountsForEntries = async (rows: EntryWithDetails[]) => {
    try {
      const ids = (rows || []).map((r: any) => String(r?.id || '')).filter(Boolean);
      if (ids.length === 0) {
        setAttachmentCounts({});
        return;
      }

      const counts: Record<string, number> = {};
      const chunkSize = 250;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));

      for (const part of chunks) {
        const { data, error } = await supabase
          .from('vehicle_entry_attachments' as any)
          .select('vehicle_entry_id')
          .in('vehicle_entry_id', part);
        if (error) {
          const msg = String((error as any)?.message || '');
          if (isMissingAttachmentTable(msg)) throw error;
          break;
        }
        const rows = (data as any[]) || [];
        for (const r of rows) {
          const id = String((r as any)?.vehicle_entry_id || '');
          if (!id) continue;
          counts[id] = (counts[id] || 0) + 1;
        }
      }

      if (Object.keys(counts).length > 0) {
        setAttachmentCounts(counts);
        return;
      }

      const stCounts: Record<string, number> = {};
      const prefixOf = (id: string) => `vehicle-entries/${id}`;
      for (let i = 0; i < ids.length; i += 6) {
        const slice = ids.slice(i, i + 6);
        const results = await Promise.all(
          slice.map(async (id) => {
            try {
              const { data, error } = await supabase.storage
                .from(VEHICLE_ENTRY_ATTACHMENT_BUCKET)
                .list(prefixOf(id), { limit: 1, offset: 0 });
              if (error) return { id, n: 0 };
              return { id, n: (data || []).length > 0 ? 1 : 0 };
            } catch {
              return { id, n: 0 };
            }
          })
        );
        for (const r of results) {
          if (r.n > 0) stCounts[r.id] = r.n;
        }
      }
      setAttachmentCounts(stCounts);
    } catch {
      setAttachmentCounts({});
    }
  };

  const [isPartSearchOpen, setIsPartSearchOpen] = useState(false);
  const [activePartIndex, setActivePartIndex] = useState<number | null>(null);
  const [partSearchQuery, setPartSearchQuery] = useState('');

  const handleOpenSparepartDialog = (index: number) => {
    setActiveJobIndex(index);
    setTempSpareparts(entryJobs[index]?.spareparts ? [...(entryJobs[index].spareparts || [])] : []);
    setEntryJobs((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], sparepart_enabled: true };
      return next;
    });
    setIsSparepartDialogOpen(true);
  };

  const handleAddTempSparepart = () => {
    setTempSpareparts([...tempSpareparts, { goods_id: '', item_code: '', name: '', qty: 1, price: 0, value_only: false }]);
  };

  const handleRemoveTempSparepart = (idx: number) => {
    setTempSpareparts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleTempSparepartChange = (idx: number, field: string, value: any) => {
    const newParts = [...tempSpareparts];
    (newParts[idx] as any)[field] = value;
    setTempSpareparts(newParts);
  };

  const handleSelectGoodForSparepart = (good: any) => {
      if (activePartIndex !== null) {
          const newParts = [...tempSpareparts];
          newParts[activePartIndex].goods_id = String(good.id || '');
          newParts[activePartIndex].item_code = String(good.item_code || '');
          newParts[activePartIndex].name = good.name;
          newParts[activePartIndex].price = good.selling_price || 0;
          setTempSpareparts(newParts);
          setIsPartSearchOpen(false);
          setPartSearchQuery('');
      }
  };

  const handleSaveSpareparts = () => {
    const normalized = tempSpareparts.filter((p) => {
      if ((p as any).value_only) return true;
      const goodsId = String((p as any).goods_id || '').trim();
      const itemCode = String((p as any).item_code || '').trim();
      const name = String((p as any).name || '').trim();
      return Boolean(goodsId || itemCode || name);
    });

    const cleaned = normalized.map((p) => {
      const goodsId = String((p as any).goods_id || '').trim();
      const itemCode = String((p as any).item_code || '').trim();
      if (!goodsId && !itemCode) return { ...p, value_only: true };
      return p;
    });

    if (activeJobIndex !== null) {
      setEntryJobs((prev) => {
        const next = [...prev];
        if (!next[activeJobIndex]) return next;

        const prevParts = Array.isArray((next[activeJobIndex] as any).spareparts)
          ? ((next[activeJobIndex] as any).spareparts as any[])
          : [];

        if (cleaned.length === 0 && prevParts.length > 0) {
          const ok = confirm('Semua rincian sparepart akan dihapus. Lanjutkan?');
          if (!ok) return prev;
        }

        next[activeJobIndex] = {
          ...next[activeJobIndex],
          spareparts: cleaned,
          sparepart_enabled: cleaned.length > 0,
        };
        return next;
      });
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

  const displayJobName = (name?: string | null) => {
    const n = String(name || '').trim().toUpperCase();
    if (n === 'GANTI SPAREPART/BAN/LAINNYA') return 'GANTI SPAREPART';
    return String(name || '');
  };

  const needsSparepartDetail = (job: { group: string, job_id: string; job_name?: string }) => {
      const selectedJob = jobs.find(j => j.id === job.job_id);
      const jobName = (job.job_name || selectedJob?.job_name || '').toLowerCase();
      const groupName = job.group?.toUpperCase() || '';
      
      const isPerbaikan = groupName.includes('PERBAIKAN');
      const isGanti = jobName.includes('ganti sparepart');
      
      return isPerbaikan && isGanti;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
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
    setFormErrors({});
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
    setAttachments([]);
    setPendingAttachments([]);
  };

  const VEHICLE_ENTRY_ATTACHMENT_BUCKET = 'vehicle-entry-attachments';
  const MAX_ATTACHMENT_BYTES = 20_000_000;
  const TARGET_IMAGE_BYTES = 650_000;

  const sanitizeFileName = (name: string) => {
    const cleaned = String(name || 'attachment').replace(/[^\w.\-()]+/g, '_');
    return cleaned.length > 120 ? cleaned.slice(-120) : cleaned;
  };

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFileName(fileName || 'attachment');
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const openBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    triggerDownload(blob, fileName);
  };

  const getStoredAttachmentUrl = (a: EntryAttachment) => {
    if (a.data_url) return a.data_url;
    const bucket = String(a.storage_bucket || '');
    const path = String(a.storage_path || '');
    if (!bucket || !path) return '';
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl || '';
  };

  const openStoredAttachment = (a: EntryAttachment) => {
    const url = getStoredAttachmentUrl(a);
    if (!url) {
      toast.error('Lampiran tidak punya URL.');
      return;
    }
    window.open(url, '_blank');
  };

  const downloadStoredAttachment = async (a: EntryAttachment) => {
    try {
      if (a.data_url) {
        const res = await fetch(a.data_url);
        const blob = await res.blob();
        downloadBlob(blob, a.file_name);
        return;
      }
      const bucket = String(a.storage_bucket || '');
      const path = String(a.storage_path || '');
      if (!bucket || !path) {
        toast.error('Lampiran tidak punya file untuk di-download.');
        return;
      }
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw error;
      downloadBlob(data, a.file_name);
    } catch (e: any) {
      toast.error('Gagal download lampiran: ' + String(e?.message || e));
    }
  };

  const compressImageFileToJpegBlob = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    try {
      const w = bitmap.width || 0;
      const h = bitmap.height || 0;
      if (!w || !h) return file as unknown as Blob;

      const encode = async (maxSide: number, quality: number) => {
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Gagal memproses gambar');
        ctx.drawImage(bitmap, 0, 0, tw, th);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar'))),
            'image/jpeg',
            quality
          );
        });
        return blob;
      };

      let out = await encode(1800, 0.75);
      if (out.size > TARGET_IMAGE_BYTES) out = await encode(1600, 0.7);
      if (out.size > TARGET_IMAGE_BYTES) out = await encode(1400, 0.65);
      if (out.size > TARGET_IMAGE_BYTES) out = await encode(1200, 0.6);
      if (out.size > TARGET_IMAGE_BYTES) out = await encode(1000, 0.55);
      return out;
    } finally {
      (bitmap as any).close?.();
    }
  };

  const buildPendingAttachment = async (file: File): Promise<PendingAttachment> => {
    const mimeOriginal = String(file.type || '').toLowerCase();
    const originalSize = file.size;
    const isImage = mimeOriginal.startsWith('image/');
    const isPdf = mimeOriginal === 'application/pdf';
    if (!isImage && !isPdf) {
      throw new Error('Format file tidak didukung. Gunakan JPEG/PNG atau PDF.');
    }
    if (originalSize > MAX_ATTACHMENT_BYTES) {
      throw new Error('File terlalu besar. Silakan pilih file yang lebih kecil.');
    }

    let blob: Blob;
    let mimeStored = mimeOriginal || 'application/octet-stream';
    let fileName = file.name || 'attachment';
    if (isImage) {
      blob = await compressImageFileToJpegBlob(file);
      mimeStored = 'image/jpeg';
      const base = fileName.replace(/\.[^/.]+$/, '');
      fileName = `${base || 'attachment'}.jpg`;
    } else {
      blob = file;
    }

    const storedSize = blob.size;
    return {
      temp_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file_name: sanitizeFileName(fileName),
      mime_type: mimeStored,
      blob,
      size_original: originalSize,
      size_stored: storedSize,
    };
  };

  const isMissingAttachmentTable = (msg: string) => {
    const m = String(msg || '').toLowerCase();
    return (
      m.includes('schema cache') ||
      m.includes('could not find the table') ||
      m.includes('relation') ||
      m.includes('does not exist')
    );
  };

  const isAttachmentSchemaOutdated = (msg: string) => {
    const m = String(msg || '').toLowerCase();
    return (
      m.includes('null value') &&
      (m.includes('data_url') || m.includes('violates not-null constraint'))
    );
  };

  const isProbablyUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

  const isStorageNotReady = (msg: string) => {
    const m = String(msg || '').toLowerCase();
    return (
      m.includes('bucket') && m.includes('not found')
    ) || m.includes('not found') || m.includes('unauthorized') || m.includes('permission') || m.includes('access denied');
  };

  const fetchAttachmentMetaByStoragePath = async (entryId: string) => {
    try {
      const { data, error } = await supabase
        .from('vehicle_entry_attachments' as any)
        .select('id, vehicle_entry_id, file_name, mime_type, data_url, storage_bucket, storage_path, size_original, size_stored, created_at')
        .eq('vehicle_entry_id', entryId);
      if (error) throw error;
      const map = new Map<string, EntryAttachment>();
      (data || []).forEach((r: any) => {
        const p = String(r?.storage_path || '').trim();
        if (!p) return;
        map.set(p, r as any);
      });
      return map;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (isMissingAttachmentTable(msg) || isAttachmentSchemaOutdated(msg)) return new Map<string, EntryAttachment>();
      return new Map<string, EntryAttachment>();
    }
  };

  const fetchAttachmentsFromStorage = async (entryId: string) => {
    const prefix = `vehicle-entries/${entryId}`;
    const { data, error } = await supabase.storage.from(VEHICLE_ENTRY_ATTACHMENT_BUCKET).list(prefix, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (error) throw error;
    const metaByPath = await fetchAttachmentMetaByStoragePath(entryId);
    const mapped: EntryAttachment[] = (data || [])
      .filter((x: any) => x && x.name && !String(x.name).endsWith('/'))
      .map((x: any) => {
        const fullPath = `${prefix}/${x.name}`;
        const meta = (x as any)?.metadata || {};
        const mime = String(meta?.mimetype || meta?.contentType || '');
        const db = metaByPath.get(fullPath);
        return {
          id: db?.id ? String(db.id) : `${VEHICLE_ENTRY_ATTACHMENT_BUCKET}:${fullPath}`,
          vehicle_entry_id: entryId,
          file_name: db?.file_name ? String(db.file_name) : String(x.name),
          mime_type: db?.mime_type ? String(db.mime_type) : mime || 'application/octet-stream',
          data_url: db?.data_url ?? null,
          storage_bucket: VEHICLE_ENTRY_ATTACHMENT_BUCKET,
          storage_path: fullPath,
          size_original: db?.size_original ?? null,
          size_stored:
            db?.size_stored ??
            (Number.isFinite(Number(meta?.size)) ? Number(meta?.size) : null),
          created_at: db?.created_at ?? (x as any)?.created_at ?? (x as any)?.updated_at ?? null,
        };
      });
    return mapped;
  };

  const handleRenameAttachmentCore = async (a: EntryAttachment, entryId: string, setList: (updater: (prev: EntryAttachment[]) => EntryAttachment[]) => void) => {
    const current = String(a.file_name || '').trim();
    const raw = window.prompt('Ubah nama file', current);
    if (raw === null) return;
    let next = sanitizeFileName(String(raw || '').trim());
    if (!next) {
      toast.error('Nama file tidak boleh kosong.');
      return;
    }
    const currentExt = current.includes('.') ? current.split('.').pop() : '';
    const hasExt = next.includes('.');
    if (!hasExt && currentExt) next = `${next}.${currentExt}`;

    try {
      const patch = { file_name: next };
      if (isProbablyUuid(a.id)) {
        const { error } = await supabase.from('vehicle_entry_attachments' as any).update(patch).eq('id', a.id);
        if (error) throw error;
      } else if (a.storage_path) {
        const { error } = await supabase
          .from('vehicle_entry_attachments' as any)
          .update(patch)
          .eq('vehicle_entry_id', entryId)
          .eq('storage_path', a.storage_path);
        if (error) throw error;
      } else {
        toast.error('Lampiran ini tidak punya metadata untuk diubah.');
        return;
      }
      setList((prev) => prev.map((x) => (x.id === a.id || (a.storage_path && x.storage_path === a.storage_path) ? { ...x, file_name: next } : x)));
      toast.success('Nama file diperbarui');
      void logActivity({
        action: 'VE_ATTACHMENT_RENAME',
        module: 'VEHICLE_ENTRY',
        entity_type: 'vehicle_entry_attachments',
        entity_id: isProbablyUuid(a.id) ? String(a.id) : String(a.storage_path || ''),
        details: `Rename lampiran ${current} → ${next}`,
        meta: {
          entry_id: entryId,
          file_name_before: current,
          file_name_after: next,
          storage_bucket: a.storage_bucket || null,
          storage_path: a.storage_path || null,
        },
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (isMissingAttachmentTable(msg) || isAttachmentSchemaOutdated(msg)) {
        toast.error("Rename gagal: tabel lampiran belum siap. Jalankan migration lampiran lalu refresh schema cache Supabase.");
        return;
      }
      toast.error('Gagal ubah nama file: ' + msg);
    }
  };

  const uploadAttachmentsAndInsertRows = async (entryId: string, list: PendingAttachment[]) => {
    if (!entryId || list.length === 0) return;
    const uploadedPaths: string[] = [];
    try {
      const rows: any[] = [];
      for (const a of list) {
        const path = `vehicle-entries/${entryId}/${a.temp_id}-${sanitizeFileName(a.file_name)}`;
        const { error: upErr } = await supabase.storage.from(VEHICLE_ENTRY_ATTACHMENT_BUCKET).upload(path, a.blob, {
          contentType: a.mime_type,
          upsert: false,
        });
        if (upErr) throw upErr;
        uploadedPaths.push(path);
        rows.push({
          vehicle_entry_id: entryId,
          file_name: a.file_name,
          mime_type: a.mime_type,
          storage_bucket: VEHICLE_ENTRY_ATTACHMENT_BUCKET,
          storage_path: path,
          size_original: a.size_original,
          size_stored: a.size_stored,
        });
      }

      const { error: insErr } = await supabase.from('vehicle_entry_attachments' as any).insert(rows);
      if (insErr) {
        const msg = String((insErr as any)?.message || '');
        if (isMissingAttachmentTable(msg) || isAttachmentSchemaOutdated(msg)) {
          return;
        }
        throw insErr;
      }
    } catch (e) {
      if (uploadedPaths.length > 0) {
        try {
          await supabase.storage.from(VEHICLE_ENTRY_ATTACHMENT_BUCKET).remove(uploadedPaths);
        } catch {}
      }
      throw e;
    }
  };

  const fetchAttachments = async (entryId: string) => {
    try {
      try {
        const st = await fetchAttachmentsFromStorage(entryId);
        setAttachments(st);
        return;
      } catch (stErr: any) {
        const smsg = String(stErr?.message || stErr);
        if (isStorageNotReady(smsg)) {
          toast.error("Lampiran belum bisa dipakai: Storage/bucket belum siap. Jalankan migration 20260427_vehicle_entry_attachments_storage.sql (bucket + policy), lalu coba lagi.");
          setAttachments([]);
          return;
        }
      }

      const { data, error } = await supabase
        .from('vehicle_entry_attachments' as any)
        .select('id, vehicle_entry_id, file_name, mime_type, data_url, storage_bucket, storage_path, size_original, size_stored, created_at')
        .eq('vehicle_entry_id', entryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAttachments((data as any) || []);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (isMissingAttachmentTable(msg)) {
        toast.error("Lampiran belum bisa dipakai: tabel 'vehicle_entry_attachments' belum ada/Belum ke-refresh di Supabase. Jalankan migration 20260425_create_vehicle_entry_attachments.sql lalu refresh schema cache Supabase.");
      } else {
        toast.error('Gagal memuat lampiran: ' + msg);
      }
      setAttachments([]);
    }
  };

  const fetchAttachmentsForDialog = async (entryId: string) => {
    try {
      try {
        const st = await fetchAttachmentsFromStorage(entryId);
        setAttachmentDialogAttachments(st);
        return;
      } catch (stErr: any) {
        const smsg = String(stErr?.message || stErr);
        if (isStorageNotReady(smsg)) {
          toast.error("Lampiran belum bisa dipakai: Storage/bucket belum siap. Jalankan migration 20260427_vehicle_entry_attachments_storage.sql (bucket + policy), lalu coba lagi.");
          setAttachmentDialogAttachments([]);
          return;
        }
      }

      const { data, error } = await supabase
        .from('vehicle_entry_attachments' as any)
        .select('id, vehicle_entry_id, file_name, mime_type, data_url, storage_bucket, storage_path, size_original, size_stored, created_at')
        .eq('vehicle_entry_id', entryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAttachmentDialogAttachments((data as any) || []);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (isMissingAttachmentTable(msg)) {
        toast.error("Lampiran belum bisa dipakai: tabel 'vehicle_entry_attachments' belum ada/Belum ke-refresh di Supabase. Jalankan migration 20260425_create_vehicle_entry_attachments.sql lalu refresh schema cache Supabase.");
      } else {
        toast.error('Gagal memuat lampiran: ' + msg);
      }
      setAttachmentDialogAttachments([]);
    }
  };

  const openAttachmentDialog = async (item: EntryWithDetails) => {
    setAttachmentDialogEntry({ id: item.id, entry_number: (item as any)?.entry_number ?? null });
    setIsAttachmentDialogOpen(true);
    await fetchAttachmentsForDialog(item.id);
  };

  const handlePickFilesDialog = () => attachmentDialogFileInputRef.current?.click();

  const handleFilesSelectedDialog = async (files: FileList | null) => {
    const entryId = attachmentDialogEntry?.id;
    if (!entryId) return;
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const accepted = arr.filter((f) => {
      const mime = String(f.type || '').toLowerCase();
      if (mime.startsWith('image/')) return true;
      if (mime === 'application/pdf') return true;
      return false;
    });
    if (accepted.length === 0) {
      toast.error('Format file tidak didukung. Gunakan JPEG/PNG atau PDF.');
      return;
    }
    try {
      setLoading(true);
      const built = await Promise.all(accepted.map(buildPendingAttachment));
      await uploadAttachmentsAndInsertRows(entryId, built);
      toast.success('Lampiran tersimpan');
      void logActivity({
        action: 'VE_ATTACHMENT_UPLOAD',
        module: 'VEHICLE_ENTRY',
        entity_type: 'vehicle_entries',
        entity_id: String(entryId),
        details: `Upload lampiran (${built.length} file)`,
        meta: {
          entry_id: entryId,
          entry_number: attachmentDialogEntry?.entry_number || null,
          file_count: built.length,
          files: built.map((x) => ({ file_name: x.file_name, mime_type: x.mime_type, size_original: x.size_original || null, size_stored: x.size_stored || null })),
        },
      });
      await fetchAttachmentsForDialog(entryId);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (isMissingAttachmentTable(msg)) {
        toast.error("Lampiran gagal disimpan: tabel 'vehicle_entry_attachments' belum ada/Belum ke-refresh di Supabase. Jalankan migration 20260425_create_vehicle_entry_attachments.sql dan 20260427_vehicle_entry_attachments_storage.sql lalu refresh schema cache Supabase.");
      } else if (isAttachmentSchemaOutdated(msg)) {
        toast.error("Lampiran gagal disimpan: schema tabel lampiran belum update. Jalankan migration 20260427_vehicle_entry_attachments_storage.sql lalu refresh schema cache Supabase.");
      } else {
        toast.error('Lampiran gagal disimpan: ' + msg);
      }
    } finally {
      setLoading(false);
      if (attachmentDialogFileInputRef.current) attachmentDialogFileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachmentDialog = async (a: EntryAttachment) => {
    const entryId = attachmentDialogEntry?.id;
    if (!entryId) return;
    if (!confirm('Hapus lampiran ini?')) return;
    try {
      if (a.storage_bucket && a.storage_path) {
        const { error: stErr } = await supabase.storage.from(a.storage_bucket).remove([a.storage_path]);
        if (stErr) throw stErr;
      }
      if (isProbablyUuid(a.id)) {
        const { error } = await supabase.from('vehicle_entry_attachments' as any).delete().eq('id', a.id);
        if (error) {
          const msg = String((error as any)?.message || '');
          if (!isMissingAttachmentTable(msg)) throw error;
        }
      }
      toast.success('Lampiran dihapus');
      void logActivity({
        action: 'VE_ATTACHMENT_DELETE',
        module: 'VEHICLE_ENTRY',
        entity_type: 'vehicle_entry_attachments',
        entity_id: isProbablyUuid(a.id) ? String(a.id) : String(a.storage_path || ''),
        details: `Delete lampiran ${String(a.file_name || '').trim()}`,
        meta: { entry_id: entryId, file_name: a.file_name || null, storage_bucket: a.storage_bucket || null, storage_path: a.storage_path || null },
      });
      await fetchAttachmentsForDialog(entryId);
    } catch (e: any) {
      toast.error('Gagal menghapus lampiran: ' + String(e?.message || e));
    }
  };

  const handlePickFiles = () => fileInputRef.current?.click();

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const accepted = arr.filter((f) => {
      const mime = String(f.type || '').toLowerCase();
      if (mime.startsWith('image/')) return true;
      if (mime === 'application/pdf') return true;
      return false;
    });
    if (accepted.length === 0) {
      toast.error('Format file tidak didukung. Gunakan JPEG/PNG atau PDF.');
      return;
    }
    try {
      setLoading(true);
      const built = await Promise.all(accepted.map(buildPendingAttachment));
      setPendingAttachments((prev) => [...built, ...prev]);
    } catch (e: any) {
      toast.error('Gagal memproses lampiran: ' + String(e?.message || e));
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePendingAttachment = (tempId: string) => {
    setPendingAttachments((prev) => prev.filter((x) => x.temp_id !== tempId));
  };

  const handleRemoveAttachment = async (a: EntryAttachment) => {
    if (!confirm('Hapus lampiran ini?')) return;
    try {
      if (a.storage_bucket && a.storage_path) {
        const { error: stErr } = await supabase.storage.from(a.storage_bucket).remove([a.storage_path]);
        if (stErr) throw stErr;
      }
      if (isProbablyUuid(a.id)) {
        const { error } = await supabase.from('vehicle_entry_attachments' as any).delete().eq('id', a.id);
        if (error) {
          const msg = String((error as any)?.message || '');
          if (!isMissingAttachmentTable(msg)) throw error;
        }
      }
      setAttachments((prev) => prev.filter((x) => x.id !== a.id));
      toast.success('Lampiran dihapus');
      void logActivity({
        action: 'VE_ATTACHMENT_DELETE',
        module: 'VEHICLE_ENTRY',
        entity_type: 'vehicle_entry_attachments',
        entity_id: isProbablyUuid(a.id) ? String(a.id) : String(a.storage_path || ''),
        details: `Delete lampiran ${String(a.file_name || '').trim()}`,
        meta: { entry_id: a.vehicle_entry_id || null, file_name: a.file_name || null, storage_bucket: a.storage_bucket || null, storage_path: a.storage_path || null },
      });
    } catch (e: any) {
      toast.error('Gagal menghapus lampiran: ' + String(e?.message || e));
    }
  };

  const handlePrintEntry = (id: string) => {
    window.open(`/print/entry/${id}`, '_blank');
    const entry = entries.find((x: any) => String(x.id) === String(id)) as any;
    const entryNumber = String(entry?.entry_number || '').trim() || null;
    const plate = String(entry?.vehicles?.license_plate || '').trim() || null;
    void logActivity({
      action: 'PRINT',
      module: 'PRINT_ENTRY',
      entity_type: 'vehicle_entries',
      entity_id: String(id),
      details: `Cetak Entry${entryNumber ? ` ${entryNumber}` : ''}${plate ? ` • ${plate}` : ''}`.trim(),
      meta: { entry_id: id, entry_number: entryNumber, license_plate: plate },
    });
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
    setFormErrors({});
    
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
          goods_id: String((p as any).goods_id || ''),
          item_code: String((p as any).item_code || ''),
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
        sparepart_enabled: parts.length > 0,
      };
    });

    const knownJobTypeIds = new Set(mappedJobs.map(j => j.job_id).filter(Boolean));
    const unassignedParts = existingParts.filter(p => !p.job_type_id || !knownJobTypeIds.has(p.job_type_id));
    if (unassignedParts.length > 0) {
      const partsToAdd = unassignedParts.map(p => ({
        goods_id: String((p as any).goods_id || ''),
        item_code: String((p as any).item_code || ''),
        name: p.item_name,
        qty: p.qty,
        price: p.estimated_price,
        value_only: Boolean((p as any).value_only),
      }));

      const gantiJobIdx = mappedJobs.findIndex(j => needsSparepartDetail(j));
      if (gantiJobIdx >= 0) {
        mappedJobs[gantiJobIdx].spareparts = [...(mappedJobs[gantiJobIdx].spareparts || []), ...partsToAdd];
        mappedJobs[gantiJobIdx].sparepart_enabled = true;
      } else if (mappedJobs.length > 0) {
        mappedJobs.push({
          group: 'PERBAIKAN',
          job_id: '',
          job_name: 'Suku Cadang Tambahan',
          notes: 'Suku Cadang Tambahan',
          value_only: false,
          estimated_price: 0,
          spareparts: partsToAdd,
          sparepart_enabled: true,
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
          sparepart_enabled: true,
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
              goods_id: String((p as any).goods_id || ''),
              item_code: String((p as any).item_code || ''),
              name: p.item_name,
              qty: p.qty,
              price: p.estimated_price,
              value_only: Boolean((p as any).value_only),
            })),
            sparepart_enabled: true,
          },
        ]);
      } else {
        setEntryJobs([{ group: item.service_group as string, job_id: '', job_name: '', notes: '', value_only: false, estimated_price: 0, spareparts: [], sparepart_enabled: false }]);
      }
    } else {
      setEntryJobs(mappedJobs);
    }

    setIsEditing(true);
    setCurrentId(item.id);
    setIsDialogOpen(true);
    await fetchAttachments(item.id);
  };

  const handleAddJob = () => {
    setEntryJobs([...entryJobs, { group: 'PERBAIKAN', job_id: '', job_name: '', notes: '', value_only: false, estimated_price: 0, spareparts: [], sparepart_enabled: false }]);
    if (formErrors.entryJobs) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next.entryJobs;
        return next;
      });
    }
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
      const key = `job_${activeJobSearchIndex}`;
      if (formErrors[key]) {
        setFormErrors(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
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
      {
        const entry = entries.find((x: any) => String(x.id) === String(id)) as any;
        const entryNumber = String(entry?.entry_number || '').trim() || null;
        const plate = String(entry?.vehicles?.license_plate || '').trim() || null;
        const nota = String(entry?.nota_dinas_number || '').trim() || null;
        void logActivity({
          action: 'VE_DELETE',
          module: 'VEHICLE_ENTRY',
          entity_type: 'vehicle_entries',
          entity_id: String(id),
          details: `Delete Entry${entryNumber ? ` ${entryNumber}` : ''}${plate ? ` • ${plate}` : ''}`.trim(),
          meta: { entry_id: id, entry_number: entryNumber, license_plate: plate, nota_dinas_number: nota },
        });
      }
      fetchEntries();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!formData.entry_date) nextErrors.entry_date = 'Wajib diisi';
    if (!formData.nota_dinas_number) nextErrors.nota_dinas_number = 'Wajib diisi';
    if (!formData.estimated_finish_date) nextErrors.estimated_finish_date = 'Wajib diisi';
    if (!formData.vehicle_id) nextErrors.vehicle_id = 'Wajib dipilih';
    if (!entryJobs || entryJobs.length === 0) nextErrors.entryJobs = 'Minimal 1 pekerjaan wajib diisi';
    (entryJobs || []).forEach((j, idx) => {
      if (!j.job_id) nextErrors[`job_${idx}`] = 'Pilih pekerjaan';
      if (!j.group) nextErrors[`job_group_${idx}`] = 'Pilih group';
    });
    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      toast.error('Lengkapi kolom wajib sebelum menyimpan.');
      return;
    }

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
        (entryPayload as any).entry_number = (newEntry as any)?.entry_number || null;
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
                          goods_id: part.goods_id ? part.goods_id : null,
                          item_code: part.item_code ? part.item_code : null,
                          value_only: Boolean(part.value_only),
                      });
                  });
              }
          });

          if (allSpareparts.length > 0) {
            const supportsColumn = async (column: string) => {
              const { error } = await supabase.from('vehicle_entry_spareparts').select(column).limit(1);
              return !error;
            };

            const [supportsGoodsId, supportsItemCode, supportsValueOnly] = await Promise.all([
              supportsColumn('goods_id'),
              supportsColumn('item_code'),
              supportsColumn('value_only'),
            ]);

            const payload = allSpareparts.map((p) => {
              const base: any = {
                vehicle_entry_id: p.vehicle_entry_id,
                job_type_id: p.job_type_id,
                item_name: p.item_name,
                qty: p.qty,
                estimated_price: p.estimated_price,
              };
              if (supportsGoodsId) base.goods_id = p.goods_id;
              if (supportsItemCode) base.item_code = p.item_code;
              if (supportsValueOnly) base.value_only = Boolean(p.value_only);
              return base;
            });

            const { error: spError } = await supabase.from('vehicle_entry_spareparts').insert(payload);
            if (spError) throw spError;
          }
      }

      toast.success(isEditing ? 'Entry diperbarui' : 'Entry kendaraan berhasil');
      {
        const entry = targetId ? (entries.find((x: any) => String(x.id) === String(targetId)) as any) : null;
        const entryNumber = String((entryPayload as any)?.entry_number || entry?.entry_number || '').trim() || null;
        const plate =
          String(entry?.vehicles?.license_plate || vehicles.find((v: any) => String(v.id) === String(formData.vehicle_id))?.license_plate || '').trim() || null;
        const nota = String(formData.nota_dinas_number || '').trim() || null;
        void logActivity({
          action: isEditing ? 'VE_UPDATE' : 'VE_CREATE',
          module: 'VEHICLE_ENTRY',
          entity_type: 'vehicle_entries',
          entity_id: String(targetId || ''),
          details: `${isEditing ? 'Update' : 'Create'} Entry${entryNumber ? ` ${entryNumber}` : ''}${plate ? ` • ${plate}` : ''}`.trim(),
          meta: {
            entry_id: targetId,
            entry_number: entryNumber,
            vehicle_id: formData.vehicle_id || null,
            license_plate: plate,
            nota_dinas_number: nota,
            entry_date: formData.entry_date,
            estimated_finish_date: formData.estimated_finish_date || null,
            job_count: entryJobs.length,
          },
        });
      }

      if (targetId && pendingAttachments.length > 0) {
        try {
          await uploadAttachmentsAndInsertRows(targetId, pendingAttachments);
        } catch (e: any) {
          const msg = String(e?.message || '');
          if (isMissingAttachmentTable(msg)) {
            toast.error("Lampiran gagal disimpan: tabel 'vehicle_entry_attachments' belum ada/Belum ke-refresh di Supabase. Jalankan migration 20260425_create_vehicle_entry_attachments.sql dan 20260427_vehicle_entry_attachments_storage.sql lalu refresh schema cache Supabase.");
          } else if (isAttachmentSchemaOutdated(msg)) {
            toast.error("Lampiran gagal disimpan: schema tabel lampiran belum update. Jalankan migration 20260427_vehicle_entry_attachments_storage.sql lalu refresh schema cache Supabase.");
          } else {
            toast.error('Lampiran gagal disimpan: ' + msg);
          }
        }
      }
      
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
                      <Input
                        name="entry_date"
                        type="date"
                        value={formData.entry_date}
                        onChange={handleInputChange}
                        className={cn(formErrors.entry_date && 'border-red-500')}
                        required
                      />
                      {formErrors.entry_date && <p className="text-xs text-red-600">{formErrors.entry_date}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>No. Nota Dinas</Label>
                      <Input
                        name="nota_dinas_number"
                        value={formData.nota_dinas_number}
                        onChange={handleInputChange}
                        placeholder="ND-..."
                        className={cn(formErrors.nota_dinas_number && 'border-red-500')}
                        required
                      />
                      {formErrors.nota_dinas_number && <p className="text-xs text-red-600">{formErrors.nota_dinas_number}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Tgl Estimasi Unit Selesai</Label>
                    <Input
                      name="estimated_finish_date"
                      type="date"
                      value={formData.estimated_finish_date}
                      onChange={handleInputChange}
                      className={cn(formErrors.estimated_finish_date && 'border-red-500')}
                      required
                    />
                    {formErrors.estimated_finish_date && <p className="text-xs text-red-600">{formErrors.estimated_finish_date}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Pilih Kendaraan (Nopol)</Label>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between font-normal",
                        !formData.vehicle_id && "text-muted-foreground",
                        formErrors.vehicle_id && "border-red-500"
                      )}
                      onClick={(e) => { e.preventDefault(); setIsVehicleSearchOpen(true); }}
                    >
                      {formData.vehicle_id
                        ? vehicles.find(v => v.id === formData.vehicle_id)?.license_plate
                        : "Cari Nopol..."}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                    {formErrors.vehicle_id && <p className="text-xs text-red-600">{formErrors.vehicle_id}</p>}
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
                                  {displayJobName(j.job_name)}
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
                    {formErrors.entryJobs && <p className="text-xs text-red-600">{formErrors.entryJobs}</p>}
                    
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
                              !job.job_id && "text-muted-foreground",
                              formErrors[`job_${index}`] && "border-red-500"
                            )}
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveJobSearchIndex(index);
                              setIsJobSearchOpen(true);
                            }}
                          >
                            <span className="truncate">
                              {job.job_id
                                ? displayJobName(jobs.find(j => j.id === job.job_id)?.job_name)
                                : "Pilih Pekerjaan..."}
                            </span>
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                          {formErrors[`job_${index}`] && <p className="text-xs text-red-600">{formErrors[`job_${index}`]}</p>}
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
                                      {displayJobName(jobs.find((j) => j.id === job.job_id)?.job_name) || displayJobName(job.job_name) || '-'}
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
                        
                        {String(job.group || '').toUpperCase().includes('PERBAIKAN') && (
                          <div className="col-span-12 mt-2 pl-4 border-l-2 border-orange-200">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={Boolean(job.sparepart_enabled)}
                                  onCheckedChange={(v) => {
                                    const checked = Boolean(v);
                                    setEntryJobs((prev) => {
                                      const next = [...prev];
                                      if (next[index]) next[index] = { ...next[index], sparepart_enabled: checked };
                                      return next;
                                    });
                                    if (checked) handleOpenSparepartDialog(index);
                                  }}
                                />
                                <span className="text-xs text-orange-800 font-medium">Rincian Sparepart</span>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs bg-white"
                                onClick={() => handleOpenSparepartDialog(index)}
                              >
                                Input Rincian
                              </Button>
                            </div>
                          </div>
                        )}

                        {(Boolean(job.sparepart_enabled) || (job.spareparts && job.spareparts.length > 0)) && (
                            <div className="col-span-12 mt-2 pl-4 border-l-2 border-orange-200">
                                <div className="bg-orange-50 p-2 rounded-md">
                                    <div className="flex justify-between items-center mb-2">
                                        <Label className="text-xs font-bold text-orange-800">Rincian Sparepart (Estimasi)</Label>
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

                  <div className="space-y-2 border p-3 rounded-md bg-slate-50">
                    <div className="flex items-center justify-between">
                      <Label>Lampiran Dokumen</Label>
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          className="hidden"
                          onChange={(e) => handleFilesSelected(e.target.files)}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={handlePickFiles}>
                          Tambah Lampiran
                        </Button>
                      </div>
                    </div>

                    {(pendingAttachments.length === 0 && attachments.length === 0) ? (
                      <div className="text-xs text-muted-foreground italic">Belum ada lampiran.</div>
                    ) : (
                      <div className="space-y-2">
                        {pendingAttachments.map((a) => (
                          <div key={a.temp_id} className="flex items-center justify-between gap-2 bg-white border rounded-md px-2 py-1">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{a.file_name}</div>
                              <div className="text-[11px] text-muted-foreground">{a.mime_type}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => openBlob(a.blob)}>
                                Buka
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => downloadBlob(a.blob, a.file_name)}>
                                Download
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => handleRemovePendingAttachment(a.temp_id)}>
                                Hapus
                              </Button>
                            </div>
                          </div>
                        ))}

                        {attachments.map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-2 bg-white border rounded-md px-2 py-1">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{a.file_name}</div>
                              <div className="text-[11px] text-muted-foreground">{a.mime_type}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => currentId && handleRenameAttachmentCore(a, currentId, setAttachments)}
                                disabled={!currentId}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Ubah Nama
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => openStoredAttachment(a)}>
                                Buka
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => downloadStoredAttachment(a)}>
                                Download
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => handleRemoveAttachment(a)}>
                                Hapus
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleRemoveTempSparepart(idx)}>
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

        <Dialog open={isAttachmentDialogOpen} onOpenChange={(v) => { setIsAttachmentDialogOpen(v); if (!v) setAttachmentDialogEntry(null); }}>
          <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
              <DialogTitle>Lampiran Dokumen</DialogTitle>
              <DialogDescription>
                {attachmentDialogEntry?.entry_number ? `Entry: ${attachmentDialogEntry.entry_number}` : 'Lampiran untuk entry kendaraan.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  ref={attachmentDialogFileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesSelectedDialog(e.target.files)}
                />
                <Button type="button" variant="outline" size="sm" onClick={handlePickFilesDialog} disabled={loading}>
                  Tambah Lampiran
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => attachmentDialogEntry?.id && fetchAttachmentsForDialog(attachmentDialogEntry.id)}
                  disabled={loading || !attachmentDialogEntry?.id}
                >
                  Refresh
                </Button>
              </div>

              {attachmentDialogAttachments.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">Belum ada lampiran.</div>
              ) : (
                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {attachmentDialogAttachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 bg-white border rounded-md px-2 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{a.file_name}</div>
                        <div className="text-[11px] text-muted-foreground">{a.mime_type}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            attachmentDialogEntry?.id &&
                            handleRenameAttachmentCore(a, attachmentDialogEntry.id, setAttachmentDialogAttachments)
                          }
                          disabled={!attachmentDialogEntry?.id}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Ubah Nama
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => openStoredAttachment(a)}>
                          Buka
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => downloadStoredAttachment(a)}>
                          Download
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => handleRemoveAttachmentDialog(a)}>
                          Hapus
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                          {(attachmentCounts[item.id] || 0) > 0 && (
                            <span className="text-xs font-medium text-emerald-700">
                              Ada lampiran ({attachmentCounts[item.id]})
                            </span>
                          )}
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
                                  <span className="font-medium">{displayJobName(job.job_types?.job_name) || '-'}</span>
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
                              <Button variant="ghost" size="icon" onClick={() => openAttachmentDialog(item)} title="Lampiran">
                                <span className="relative inline-flex">
                                  <Paperclip className="h-4 w-4" />
                                  {(attachmentCounts[item.id] || 0) > 0 && (
                                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                                  )}
                                </span>
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
