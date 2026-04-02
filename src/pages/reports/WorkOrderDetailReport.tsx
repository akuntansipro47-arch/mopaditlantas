import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Calendar, Filter, RefreshCw } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function WorkOrderDetailReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  
  // Filters
  // Fix timezone issue by manually adjusting date
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const formatDateForInput = (date: Date) => {
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - (offset * 60 * 1000));
      return localDate.toISOString().split('T')[0];
  };

  const [dateRange, setDateRange] = useState({
    start: formatDateForInput(firstDay),
    end: formatDateForInput(today)
  });
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, [dateRange, statusFilter]);

  async function fetchData() {
    setLoading(true);
    setErrorMsg('');
    try {
      let query = supabase
        .from('work_orders')
        .select(`
          *,
          vehicle_entries (
            nota_dinas_number,
            service_group,
            vehicles (license_plate, brand_type, vehicle_type),
            vehicle_entry_jobs (
                job_types (
                    job_name,
                    job_group,
                    selling_price
                )
            ),
            vehicle_entry_spareparts (
                item_name,
                qty,
                estimated_price
            )
          ),
          mechanics (name),
          work_order_billings (
            item_type,
            item_name,
            qty,
            unit_price,
            total_price,
            job_group,
            goods_id
          )
        `)
        .order('work_date', { ascending: false });

      // Only apply date filter if valid dates are present
      if (dateRange.start) {
          // Start of the day (00:00:00)
          query = query.gte('work_date', `${dateRange.start} 00:00:00`);
      }
      if (dateRange.end) {
          // End of the day (23:59:59) - Fix missing data on the last day
          query = query.lte('work_date', `${dateRange.end} 23:59:59`);
      }

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data: wos, error } = await query;

      if (error) {
          console.error("Supabase Error fetching Detail WO:", error);
          throw error;
      }
      
      const woIds = (wos || []).map((wo: any) => wo.id).filter(Boolean);
      const issuesByWoId = new Map<string, any[]>();
      if (woIds.length > 0) {
        const { data: issues, error: issueErr } = await supabase
          .from('goods_issues')
          .select('id, work_order_id')
          .in('work_order_id', woIds);

        if (issueErr) {
          console.error('Supabase Error fetching goods issues headers for Detail WO:', issueErr);
        } else {
          const issueIdToWoId = new Map<string, string>();
          const issueIds: string[] = [];
          (issues || []).forEach((gi: any) => {
            const issueId = String(gi.id || '');
            const woId = String(gi.work_order_id || '');
            if (!issueId || !woId) return;
            issueIdToWoId.set(issueId, woId);
            issueIds.push(issueId);
          });

          if (issueIds.length > 0) {
            const { data: issueItems, error: itemsErr } = await supabase
              .from('goods_issue_items')
              .select(`
                issue_id,
                quantity,
                is_info_only,
                value_only,
                goods (id, name, selling_price)
              `)
              .in('issue_id', issueIds);

            if (itemsErr) {
              console.error('Supabase Error fetching goods issue items for Detail WO:', itemsErr);
            } else {
              (issueItems || []).forEach((it: any) => {
                const issueId = String(it.issue_id || '');
                const woId = issueIdToWoId.get(issueId);
                if (!woId) return;
                const prev = issuesByWoId.get(woId) || [];
                issuesByWoId.set(woId, [...prev, it]);
              });
            }
          }
        }
      }

      // Process WOs to map billings or fallback to estimates
      const processedWOs = wos?.map((wo: any) => {
          let mergedBillings = wo.work_order_billings || [];
          const goodsIdInBilling = new Set<string>(
            (mergedBillings || [])
              .filter((b: any) => b?.item_type === 'PART' && b?.goods_id)
              .map((b: any) => String(b.goods_id))
          );
          
          // If no billings yet (e.g. status OPEN/IN_PROGRESS), use estimation data from entry
          if (mergedBillings.length === 0 && wo.vehicle_entries) {
              const entryJobs = wo.vehicle_entries.vehicle_entry_jobs || [];
              const entryParts = wo.vehicle_entries.vehicle_entry_spareparts || [];
              
              const estimatedJobs = entryJobs.map((ej: any) => ({
                  item_type: 'JOB',
                  item_name: ej.job_types?.job_name || 'Pekerjaan',
                  qty: 1,
                  unit_price: ej.job_types?.selling_price || 0,
                  total_price: ej.job_types?.selling_price || 0,
                  job_group: ej.job_types?.job_group || 'Umum',
                  is_estimation: true
              }));
              
              const estimatedParts = entryParts.map((ep: any) => ({
                  item_type: 'PART',
                  item_name: ep.item_name || 'Sparepart',
                  qty: ep.qty || 1,
                  unit_price: ep.estimated_price || 0,
                  total_price: (ep.qty || 1) * (ep.estimated_price || 0),
                  job_group: 'Sparepart',
                  is_estimation: true
              }));
              
              mergedBillings = [...estimatedJobs, ...estimatedParts];
          }

          const issueItems = (issuesByWoId.get(String(wo.id)) || [])
            .filter((it: any) => it?.goods?.id);

          if (issueItems.length > 0) {
            const injected = issueItems
              .filter((it: any) => !goodsIdInBilling.has(String(it.goods.id)))
              .map((it: any) => {
                const qty = Number(it.quantity || 0);
                const unit = Number(it.goods?.selling_price || 0);
                return {
                  item_type: 'PART',
                  item_name: `Penggantian ${it.goods?.name || 'Sparepart'}`,
                  qty,
                  unit_price: unit,
                  total_price: unit * qty,
                  job_group: 'PERBAIKAN',
                  goods_id: it.goods.id,
                  source: 'GOODS_ISSUE'
                };
              });
            mergedBillings = [...mergedBillings, ...injected];
          }
          
          return {
              ...wo,
              merged_billings: mergedBillings
          };
      });

      console.log("Fetched WOs for Detail Report:", processedWOs?.length, "Range:", dateRange);
      setData(processedWOs || []);

    } catch (error: any) {
      console.error('Error fetching WO Detail report:', error);
      setErrorMsg(error.message || 'Gagal mengambil data.');
    } finally {
      setLoading(false);
    }
  }

  const fetchByWoNumber = async () => {
    const q = serverSearch.trim();
    if (!q) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const { data: wos, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          vehicle_entries (
            nota_dinas_number,
            service_group,
            vehicles (license_plate, brand_type, vehicle_type),
            vehicle_entry_jobs (
                job_types (
                    job_name,
                    job_group,
                    selling_price
                )
            ),
            vehicle_entry_spareparts (
                item_name,
                qty,
                estimated_price
            )
          ),
          mechanics (name),
          work_order_billings (
            item_type,
            item_name,
            qty,
            unit_price,
            total_price,
            job_group,
            goods_id
          )
        `)
        .ilike('wo_number', `%${q}%`)
        .order('work_date', { ascending: false })
        .limit(20);

      if (error) throw error;

      const woIds = (wos || []).map((wo: any) => wo.id).filter(Boolean);
      const issuesByWoId = new Map<string, any[]>();
      if (woIds.length > 0) {
        const { data: issues } = await supabase
          .from('goods_issues')
          .select('id, work_order_id')
          .in('work_order_id', woIds);

        const issueIdToWoId = new Map<string, string>();
        const issueIds: string[] = [];
        (issues || []).forEach((gi: any) => {
          const issueId = String(gi.id || '');
          const woId = String(gi.work_order_id || '');
          if (!issueId || !woId) return;
          issueIdToWoId.set(issueId, woId);
          issueIds.push(issueId);
        });

        if (issueIds.length > 0) {
          const { data: issueItems } = await supabase
            .from('goods_issue_items')
            .select(`
              issue_id,
              quantity,
              is_info_only,
              value_only,
              goods (id, name, selling_price)
            `)
            .in('issue_id', issueIds);

          (issueItems || []).forEach((it: any) => {
            const issueId = String(it.issue_id || '');
            const woId = issueIdToWoId.get(issueId);
            if (!woId) return;
            const prev = issuesByWoId.get(woId) || [];
            issuesByWoId.set(woId, [...prev, it]);
          });
        }
      }

      const processed = (wos || []).map((wo: any) => {
        let mergedBillings = wo.work_order_billings || [];
        const goodsIdInBilling = new Set<string>(
          (mergedBillings || [])
            .filter((b: any) => b?.item_type === 'PART' && b?.goods_id)
            .map((b: any) => String(b.goods_id))
        );

        if (mergedBillings.length === 0 && wo.vehicle_entries) {
          const entryJobs = wo.vehicle_entries.vehicle_entry_jobs || [];
          const entryParts = wo.vehicle_entries.vehicle_entry_spareparts || [];

          const estimatedJobs = entryJobs.map((ej: any) => ({
            item_type: 'JOB',
            item_name: ej.job_types?.job_name || 'Pekerjaan',
            qty: 1,
            unit_price: ej.job_types?.selling_price || 0,
            total_price: ej.job_types?.selling_price || 0,
            job_group: ej.job_types?.job_group || 'Umum',
            is_estimation: true,
          }));

          const estimatedParts = entryParts.map((ep: any) => ({
            item_type: 'PART',
            item_name: ep.item_name || 'Sparepart',
            qty: ep.qty || 1,
            unit_price: ep.estimated_price || 0,
            total_price: (ep.qty || 1) * (ep.estimated_price || 0),
            job_group: 'Sparepart',
            is_estimation: true,
          }));

          mergedBillings = [...estimatedJobs, ...estimatedParts];
        }

        const issueItems = (issuesByWoId.get(String(wo.id)) || []).filter((it: any) => it?.goods?.id);

        if (issueItems.length > 0) {
          const injected = issueItems
            .filter((it: any) => !goodsIdInBilling.has(String(it.goods.id)))
            .map((it: any) => {
              const qty = Number(it.quantity || 0);
              const unit = Number(it.goods?.selling_price || 0);
              return {
                item_type: 'PART',
                item_name: `Penggantian ${it.goods?.name || 'Sparepart'}`,
                qty,
                unit_price: unit,
                total_price: unit * qty,
                job_group: 'PERBAIKAN',
                goods_id: it.goods.id,
                source: 'GOODS_ISSUE',
              };
            });
          mergedBillings = [...mergedBillings, ...injected];
        }

        return { ...wo, merged_billings: mergedBillings };
      });

      const existingIds = new Set((data || []).map((x: any) => String(x.id)));
      const merged = [...(data || [])];
      processed.forEach((wo: any) => {
        const id = String(wo.id);
        if (!existingIds.has(id)) merged.unshift(wo);
      });
      setData(merged);
    } catch (e: any) {
      setErrorMsg(e.message || 'Gagal mencari WO.');
    } finally {
      setLoading(false);
    }
  };

  const getVehicleGroupLabel = (wo: any) => {
      const sg = String(wo.vehicle_entries?.service_group || '').toUpperCase();
      if (sg.includes('R2_KECIL') || sg.includes('R2 KECIL') || sg.includes('KECIL')) return 'R2 Kecil';
      if (sg.includes('R4')) return 'R4';
      if (sg.includes('R2')) return 'R2';

      const billingsToCheck = wo.merged_billings || wo.work_order_billings || [];
      const hasServiceItem = billingsToCheck.some((b: any) => {
          const name = (b.item_name || '').toUpperCase();
          return name.includes('TUNE UP') || name.includes('SERVICE') || name.includes('SERVIS');
      });

      const vType = String(wo.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
      if (vType.includes('R2_KECIL') || vType.includes('R2 KECIL') || vType.includes('KECIL')) return 'R2 Kecil';
      if (vType === 'R4' || vType.includes('R4') || vType.includes('MOBIL')) return hasServiceItem ? 'R4' : 'R4';
      if (vType === 'R2' || vType.includes('R2') || vType.includes('MOTOR')) return hasServiceItem ? 'R2' : 'R2';
      return hasServiceItem ? '-' : '-';
  };

  const getVehicleGroupKey = (wo: any) => {
      const label = getVehicleGroupLabel(wo);
      if (label === 'R2') return 'R2';
      if (label === 'R4') return 'R4';
      if (label === 'R2 Kecil') return 'R2_KECIL';
      return '';
  };

  const filteredWos = data.filter(wo => {
      if (!(groupFilter === 'ALL' ? true : getVehicleGroupKey(wo) === groupFilter)) return false;
      const s = search.trim().toLowerCase();
      if (!s) return true;
      const woNumber = String(wo.wo_number || '').toLowerCase();
      const nopol = String(wo.vehicle_entries?.vehicles?.license_plate || '').toLowerCase();
      const nota = String(wo.vehicle_entries?.nota_dinas_number || '').toLowerCase();
      const merk = String(wo.vehicle_entries?.vehicles?.brand_type || '').toLowerCase();
      const itemText = (wo.merged_billings || wo.work_order_billings || [])
        .map((b: any) => String(b?.item_name || ''))
        .join(' ')
        .toLowerCase();
      return woNumber.includes(s) || nopol.includes(s) || nota.includes(s) || merk.includes(s) || itemText.includes(s);
  });

  const exportToExcel = () => {
    // Flatten data for Excel
    const rows: any[] = [];
    
    filteredWos.forEach(wo => {
        const groupName = getVehicleGroupLabel(wo);
        const billingsToExport = wo.merged_billings || wo.work_order_billings || [];

        // If WO has no billings, still show one row
        if (billingsToExport.length === 0) {
            rows.push({
                'No. WO': wo.wo_number,
                'Tanggal': formatDate(wo.work_date),
                'Status': wo.status,
                'No. Polisi': wo.vehicle_entries?.vehicles?.license_plate || '-',
                'Kendaraan': wo.vehicle_entries?.vehicles?.brand_type || '-',
                'Tipe': wo.vehicle_entries?.vehicles?.vehicle_type || '-',
                'Group': groupName,
                'Mekanik': wo.mechanics?.name || '-',
                'Item': '-',
                'Tipe Item': '-',
                'Qty': 0,
                'Harga Satuan': 0,
                'Total Harga': 0
            });
        } else {
            billingsToExport.forEach((bill: any) => {
                rows.push({
                    'No. WO': wo.wo_number,
                    'Tanggal': formatDate(wo.work_date),
                    'Status': wo.status,
                    'No. Polisi': wo.vehicle_entries?.vehicles?.license_plate || '-',
                    'Kendaraan': wo.vehicle_entries?.vehicles?.brand_type || '-',
                    'Tipe': wo.vehicle_entries?.vehicles?.vehicle_type || '-',
                    'Group': groupName,
                    'Mekanik': wo.mechanics?.name || '-',
                    'Item': bill.item_name,
                    'Tipe Item': bill.item_type,
                    'Qty': bill.qty,
                    'Harga Satuan': bill.unit_price,
                    'Total Harga': bill.total_price
                });
            });
        }
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detail WO");
    XLSX.writeFile(wb, `Laporan_Detail_WO_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Open</Badge>;
      case 'IN_PROGRESS': return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Proses</Badge>;
      case 'COMPLETED': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Selesai</Badge>;
      case 'CLOSED': return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Tutup</Badge>;
      case 'CANCELLED': return <Badge variant="destructive">Batal</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Laporan Detail Work Order (Revisi)</h2>
          <p className="text-muted-foreground">Laporan rinci transaksi WO per item pekerjaan/barang.</p>
          <p className="text-xs text-blue-600 font-medium mt-1">Total Data: {filteredWos.length} WO ditemukan</p>
          {errorMsg && (
            <div className="mt-2 p-3 bg-red-100 border border-red-200 text-red-700 rounded-md">
                Error: {errorMsg}
            </div>
          )}
        </div>
        <div className="flex gap-2">
           <Button variant="outline" onClick={exportToExcel} disabled={filteredWos.length === 0}>
             <Download className="mr-2 h-4 w-4" /> Export Excel
           </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-md border">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-500">Cari:</span>
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="No WO / Nopol / Nota Dinas / Item..."
                        className="w-[260px] bg-white"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-500">Cari WO (server):</span>
                    <Input
                        value={serverSearch}
                        onChange={e => setServerSearch(e.target.value)}
                        placeholder="WO-2026..."
                        className="w-[220px] bg-white"
                    />
                    <Button variant="outline" size="sm" onClick={fetchByWoNumber} disabled={loading || !serverSearch.trim()}>
                        Cari
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-500"><Filter className="h-4 w-4 inline mr-1"/> Filter:</span>
                    <Input 
                        type="date" 
                        value={dateRange.start} 
                        onChange={e => setDateRange({...dateRange, start: e.target.value})} 
                        className="w-auto bg-white"
                    />
                    <span className="text-gray-400">-</span>
                    <Input 
                        type="date" 
                        value={dateRange.end} 
                        onChange={e => setDateRange({...dateRange, end: e.target.value})} 
                        className="w-auto bg-white"
                    />
                </div>
                
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-500">Status:</span>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[150px] bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Semua Status</SelectItem>
                            <SelectItem value="OPEN">Open</SelectItem>
                            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                            <SelectItem value="CLOSED">Closed</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-500">Group:</span>
                    <Select value={groupFilter} onValueChange={setGroupFilter}>
                        <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Semua</SelectItem>
                            <SelectItem value="R2">R2</SelectItem>
                            <SelectItem value="R4">R4</SelectItem>
                            <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading} className="ml-auto">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border overflow-hidden">
                <div className="max-h-[600px] overflow-auto">
                <Table className="whitespace-nowrap">
                    <TableHeader className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                        <TableRow>
                            <TableHead>No. WO</TableHead>
                            <TableHead>Tanggal</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Kendaraan</TableHead>
                            <TableHead>Group</TableHead>
                            <TableHead>Item Pekerjaan / Barang</TableHead>
                            <TableHead className="text-center">Qty</TableHead>
                            <TableHead className="text-right">Harga</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={9} className="text-center h-32">Memuat data...</TableCell></TableRow>
                        ) : filteredWos.length === 0 ? (
                            <TableRow><TableCell colSpan={9} className="text-center h-32 text-muted-foreground">Tidak ada data ditemukan.</TableCell></TableRow>
                        ) : (
                            filteredWos.map((wo) => {
                                const billings = wo.merged_billings || wo.work_order_billings || [];
                                const rowSpan = billings.length > 0 ? billings.length : 1;
                                
                                return (
                                    <>
                                    {billings.length > 0 ? (
                                        billings.map((bill: any, idx: number) => (
                                            <TableRow key={`${wo.id}-${idx}`} className="hover:bg-slate-50">
                                                {/* Parent Columns - Render only on first row */}
                                                {idx === 0 && (
                                                    <>
                                                        <TableCell rowSpan={rowSpan} className="font-medium align-top border-r bg-white">
                                                            {wo.wo_number}
                                                            <div className="text-xs text-gray-400 mt-1">{wo.mechanics?.name || 'No Mechanic'}</div>
                                                        </TableCell>
                                                        <TableCell rowSpan={rowSpan} className="align-top border-r bg-white">{formatDate(wo.work_date)}</TableCell>
                                                        <TableCell rowSpan={rowSpan} className="align-top border-r bg-white">{getStatusBadge(wo.status)}</TableCell>
                                                        <TableCell rowSpan={rowSpan} className="align-top border-r bg-white">
                                                            <div className="font-bold">{wo.vehicle_entries?.vehicles?.license_plate}</div>
                                                            <div className="text-xs text-gray-500">{wo.vehicle_entries?.vehicles?.brand_type}</div>
                                                        </TableCell>
                                                        <TableCell rowSpan={rowSpan} className="align-top border-r bg-white text-xs">
                                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                                                {getVehicleGroupLabel(wo)}
                                                            </span>
                                                        </TableCell>
                                                    </>
                                                )}
                                                
                                                {/* Child Columns */}
                                                <TableCell className="py-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${bill.item_type === 'JOB' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                            {bill.item_type}
                                                        </span>
                                                        <span>{bill.item_name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center py-2">{bill.qty}</TableCell>
                                                <TableCell className="text-right py-2 text-gray-500">{formatCurrency(bill.unit_price)}</TableCell>
                                                <TableCell className="text-right py-2 font-medium">{formatCurrency(bill.total_price)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow key={wo.id}>
                                            <TableCell className="font-medium border-r">{wo.wo_number}</TableCell>
                                            <TableCell className="border-r">{formatDate(wo.work_date)}</TableCell>
                                            <TableCell className="border-r">{getStatusBadge(wo.status)}</TableCell>
                                            <TableCell className="border-r">
                                                <div className="font-bold">{wo.vehicle_entries?.vehicles?.license_plate}</div>
                                                <div className="text-xs text-gray-500">{wo.vehicle_entries?.vehicles?.brand_type}</div>
                                            </TableCell>
                                            <TableCell className="border-r text-xs">
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                                    {getVehicleGroupLabel(wo)}
                                                </span>
                                            </TableCell>
                                            <TableCell colSpan={4} className="text-center text-gray-400 italic">Belum ada rincian biaya</TableCell>
                                        </TableRow>
                                    )}
                                    
                                    {/* Separator Row */}
                                    {/* <TableRow className="h-2 bg-gray-50 border-t"><TableCell colSpan={9}></TableCell></TableRow> */}
                                    </>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
