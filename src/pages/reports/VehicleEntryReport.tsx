import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatDate, matchesFreeSearch } from '@/lib/utils';
import { Printer, Search, Download, Calendar, Paperclip, ExternalLink } from 'lucide-react';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import * as XLSX from 'xlsx';
import ReportPrintHeader from '@/components/reports/ReportPrintHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function VehicleEntryReport() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [attachmentCountByEntryId, setAttachmentCountByEntryId] = useState<Record<string, number>>({});
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentEntry, setAttachmentEntry] = useState<any | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  
  // Date Filter
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Status Filter
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState('ALL');

  useEffect(() => {
    fetchEntries();
  }, [dateFilter, statusFilter]);

  const getVehicleGroupLabel = (entry: any) => {
    const sg = String(entry.service_group || '').toUpperCase();
    if (sg.includes('R2_KECIL') || sg.includes('R2 KECIL') || sg.includes('KECIL')) return 'R2 Kecil';
    if (sg.includes('R4')) return 'R4';
    if (sg.includes('R2')) return 'R2';
    const vt = String(entry.vehicles?.vehicle_type || '').toUpperCase();
    if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
    if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
    if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
    return '-';
  };

  const getVehicleGroupKey = (entry: any) => {
    const label = getVehicleGroupLabel(entry);
    if (label === 'R2') return 'R2';
    if (label === 'R4') return 'R4';
    if (label === 'R2 Kecil') return 'R2_KECIL';
    return '';
  };

  async function fetchEntries() {
    setLoading(true);
    try {
      let query = supabase
        .from('vehicle_entries')
        .select(`
          *,
          vehicles (license_plate, brand_type, vehicle_type),
          vehicle_entry_jobs (
            job_types (job_name, job_group),
            notes
          ),
          work_orders (wo_number, status)
        `)
        .gte('entry_date', dateFilter.startDate)
        .lte('entry_date', dateFilter.endDate)
        .order('entry_date', { ascending: false });

      // Custom Filter Logic
      // Because "Status Entry" is not enough (Entry stays OPEN/PROCESSED even if WO is Closed)
      // We need to filter based on JOINED Work Order status
      
      const { data, error } = await query;
      if (error) throw error;

      // 1. Deduplicate entries based on ID (Safety net for potential join duplicates)
      const uniqueEntries = Array.from(new Map((data as any[] || []).map(item => [item.id, item])).values());

      let finalData = uniqueEntries;

      // Filter Logic:
      // 1. OPEN (Belum WO): Entry status is OPEN AND no WO exists.
      // 2. WO_PROCESS: WO exists AND (status is OPEN or IN_PROGRESS)
      // 3. WO_COMPLETED: WO exists AND (status is COMPLETED or CLOSED)

      if (statusFilter === 'OPEN') {
          finalData = finalData.filter((e: any) => {
              const hasWO = e.work_orders && e.work_orders.length > 0;
              // Strict check: Must be OPEN and absolutely NO WO linked
              return e.status === 'OPEN' && !hasWO;
          });
      } else if (statusFilter === 'WO_PROCESS') {
          finalData = finalData.filter((e: any) => {
              const wo = e.work_orders?.[0];
              // If WO exists, check its status. 
              // ALSO, include cases where Entry is PROCESSED but WO might be missing/deleted (data anomaly safeguard)
              // OR Entry is OPEN but WO exists (which means it IS in process, despite entry status lag)
              
              if (wo) {
                  return (wo.status === 'OPEN' || wo.status === 'IN_PROGRESS');
              }
              // Fallback: If entry is PROCESSED but no WO found, treat as Process to avoid it disappearing
              return e.status === 'PROCESSED';
          });
      } else if (statusFilter === 'WO_COMPLETED') {
          finalData = finalData.filter((e: any) => {
              const wo = e.work_orders?.[0];
              return wo && (wo.status === 'COMPLETED' || wo.status === 'CLOSED');
          });
      }

      setEntries(finalData);
      const entryIds = (finalData || []).map((e: any) => e.id).filter(Boolean);
      if (entryIds.length > 0) {
        const { data: attRows, error: attErr } = await supabase
          .from('vehicle_entry_attachments')
          .select('vehicle_entry_id')
          .in('vehicle_entry_id', entryIds);
        if (attErr) throw attErr;
        const counts: Record<string, number> = {};
        (attRows || []).forEach((r: any) => {
          const k = String(r?.vehicle_entry_id || '').trim();
          if (!k) return;
          counts[k] = (counts[k] || 0) + 1;
        });
        setAttachmentCountByEntryId(counts);
      } else {
        setAttachmentCountByEntryId({});
      }
    } catch (error: any) {
      toast.error('Gagal mengambil data laporan: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const getAttachmentUrl = (a: any) => {
    if (a?.data_url) return String(a.data_url);
    const bucket = String(a?.storage_bucket || '').trim();
    const path = String(a?.storage_path || '').trim();
    if (!bucket || !path) return '';
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return String(data?.publicUrl || '');
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openAttachmentDialog = async (entry: any) => {
    setAttachmentEntry(entry);
    setAttachments([]);
    setAttachmentOpen(true);
    setAttachmentLoading(true);
    try {
      const { data, error } = await supabase
        .from('vehicle_entry_attachments')
        .select('id, file_name, mime_type, data_url, storage_bucket, storage_path, created_at')
        .eq('vehicle_entry_id', entry.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAttachments((data as any[]) || []);
    } catch (e: any) {
      toast.error('Gagal memuat lampiran: ' + e.message);
      setAttachments([]);
    } finally {
      setAttachmentLoading(false);
    }
  };

  const handleOpenAttachment = (a: any) => {
    const url = getAttachmentUrl(a);
    if (!url) {
      toast.error('Lampiran tidak memiliki URL.');
      return;
    }
    window.open(url, '_blank', 'noreferrer');
  };

  const handleDownloadAttachment = async (a: any) => {
    const filename = String(a?.file_name || 'attachment');
    try {
      if (a?.data_url) {
        const res = await fetch(String(a.data_url));
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, filename);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        return;
      }
      const bucket = String(a?.storage_bucket || '').trim();
      const path = String(a?.storage_path || '').trim();
      if (!bucket || !path) {
        toast.error('Lampiran tidak memiliki storage path.');
        return;
      }
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw error;
      const objectUrl = URL.createObjectURL(data);
      triggerDownload(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch (e: any) {
      toast.error('Gagal download lampiran: ' + e.message);
    }
  };

  const handleExportExcel = () => {
    const dataToExport = filteredEntries.map((item, index) => ({
      No: index + 1,
      'No. Entry': item.entry_number,
      'Tanggal': formatDate(item.entry_date),
      'Nopol': item.vehicles?.license_plate || '-',
      'Tipe Kendaraan': item.vehicles?.brand_type || '-',
      'Group': getVehicleGroupLabel(item),
      'Nota Dinas': item.nota_dinas_number || '-',
      'Daftar Pekerjaan': item.vehicle_entry_jobs?.map((j: any) => j.job_types?.job_name).join(', ') || '-',
      'Status Entry': item.status,
      'No. WO': item.work_orders?.[0]?.wo_number || '-',
      'Status WO': item.work_orders?.[0]?.status || '-',
      'Lampiran': attachmentCountByEntryId[String(item.id)] || 0,
      'Catatan': item.notes || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Kendaraan Masuk");
    XLSX.writeFile(wb, `Laporan_Kendaraan_Masuk_${dateFilter.startDate}_sd_${dateFilter.endDate}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredEntries = entries.filter(e => {
    const matchSearch = matchesFreeSearch(search, [
      e.entry_number,
      e.entry_date,
      e.vehicles?.license_plate,
      e.vehicles?.brand_type,
      e.vehicles?.vehicle_type,
      e.nota_dinas_number,
      e.status,
      e.notes,
      getVehicleGroupLabel(e),
      (e.vehicle_entry_jobs || []).map((j: any) => j.job_types?.job_name).filter(Boolean).join(' '),
      (e.work_orders || []).map((w: any) => w.wo_number).filter(Boolean).join(' '),
      (e.work_orders || []).map((w: any) => w.status).filter(Boolean).join(' '),
    ]);
    const matchGroup = groupFilter === 'ALL' ? true : getVehicleGroupKey(e) === groupFilter;
    return matchSearch && matchGroup;
  });

  return (
    <Card className="w-full print:shadow-none print:border-none">
      <CardHeader className="print:hidden">
        <div className="flex justify-between items-center print:hidden">
          <div>
            <CardTitle>Laporan Penerimaan Unit Kendaraan</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
                Periode: {formatDate(dateFilter.startDate)} s/d {formatDate(dateFilter.endDate)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button variant="secondary" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Cetak
            </Button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mt-4 print:hidden bg-slate-50 p-4 rounded-lg items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Periode:</span>
            <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm">
              <Calendar className="h-4 w-4 text-gray-500 ml-2" />
               <Input 
                 type="date" 
                 className="w-36 border-0 p-0 h-9 focus-visible:ring-0 cursor-pointer"
                 value={dateFilter.startDate} 
                 onChange={(e) => setDateFilter({...dateFilter, startDate: e.target.value})} 
               />
               <span className="text-slate-400 font-medium">-</span>
               <Input 
                 type="date" 
                 className="w-36 border-0 p-0 h-9 focus-visible:ring-0 cursor-pointer"
                 value={dateFilter.endDate} 
                 onChange={(e) => setDateFilter({...dateFilter, endDate: e.target.value})} 
               />
            </div>
          </div>

          <div className="flex items-center gap-2">
             <span className="text-sm font-medium">Status:</span>
             <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] bg-white h-8">
                    <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">Semua Status</SelectItem>
                    <SelectItem value="OPEN">Open (Belum WO)</SelectItem>
                    <SelectItem value="WO_PROCESS">Sedang Proses WO</SelectItem>
                    <SelectItem value="WO_COMPLETED">Selesai (WO Closed)</SelectItem>
                </SelectContent>
             </Select>
          </div>

          <div className="flex items-center gap-2">
             <span className="text-sm font-medium">Group:</span>
             <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger className="w-[140px] bg-white h-8">
                    <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">Semua</SelectItem>
                    <SelectItem value="R2">R2</SelectItem>
                    <SelectItem value="R4">R4</SelectItem>
                    <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                </SelectContent>
             </Select>
          </div>

          <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input 
                placeholder="Cari bebas berdasarkan kolom laporan..." 
                className="pl-8" 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <ReportPrintHeader title="Laporan Penerimaan Unit Kendaraan" periodStart={dateFilter.startDate} periodEnd={dateFilter.endDate} />
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">No</TableHead>
                <TableHead>No. Entry</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Kendaraan</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Nota Dinas</TableHead>
                <TableHead className="w-[30%]">Pekerjaan / Keluhan</TableHead>
                <TableHead>Lampiran</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center h-24">Tidak ada data.</TableCell></TableRow>
              ) : (
                filteredEntries.map((item, index) => (
                  <TableRow key={item.id} className="align-top">
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">
                        {item.entry_number}
                        {item.work_orders?.[0] && (
                            <div className="text-[10px] text-blue-600 mt-1">WO: {item.work_orders[0].wo_number}</div>
                        )}
                    </TableCell>
                    <TableCell>{formatDate(item.entry_date)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold">{item.vehicles?.license_plate}</span>
                        <span className="text-xs text-muted-foreground">{item.vehicles?.brand_type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {getVehicleGroupLabel(item)}
                      </span>
                    </TableCell>
                    <TableCell>{item.nota_dinas_number || '-'}</TableCell>
                    <TableCell>
                        <div className="text-xs space-y-1">
                            {item.vehicle_entry_jobs?.map((j: any, idx: number) => (
                                <div key={idx} className="flex gap-1">
                                    <span className="font-semibold">•</span>
                                    <span>{j.job_types?.job_name}</span>
                                </div>
                            ))}
                            {item.notes && (
                                <div className="italic text-slate-500 mt-1">Note: {item.notes}</div>
                            )}
                        </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const cnt = attachmentCountByEntryId[String(item.id)] || 0;
                        if (cnt <= 0) return <span className="text-xs text-slate-400">-</span>;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                              <Paperclip className="h-3 w-3" />
                              {cnt}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => openAttachmentDialog(item)}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              Lihat
                            </Button>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                        <div className="flex flex-col gap-1">
                            {/* Entry Status */}
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold border w-fit ${
                                item.status === 'OPEN' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                                Entry: {item.status}
                            </span>
                            
                            {/* WO Status */}
                            {item.work_orders?.[0] ? (
                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold border w-fit ${
                                    item.work_orders[0].status === 'COMPLETED' || item.work_orders[0].status === 'CLOSED'
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-purple-50 text-purple-700 border-purple-200'
                                }`}>
                                    WO: {item.work_orders[0].status}
                                </span>
                            ) : (
                                <span className="text-[10px] text-gray-400 italic">Belum ada WO</span>
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
      <Dialog open={attachmentOpen} onOpenChange={setAttachmentOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lampiran Unit Masuk</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>No. Entry: <span className="font-semibold text-slate-900">{attachmentEntry?.entry_number || '-'}</span></div>
              <div>Nopol: <span className="font-semibold text-slate-900">{attachmentEntry?.vehicles?.license_plate || '-'}</span></div>
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>File</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attachmentLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Memuat lampiran...
                      </TableCell>
                    </TableRow>
                  ) : attachments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Tidak ada lampiran.
                      </TableCell>
                    </TableRow>
                  ) : (
                    attachments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs font-medium">{a.file_name}</TableCell>
                        <TableCell className="text-xs text-slate-500">{a.mime_type || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => handleOpenAttachment(a)}>
                              Buka
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => void handleDownloadAttachment(a)}>
                              Download
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
