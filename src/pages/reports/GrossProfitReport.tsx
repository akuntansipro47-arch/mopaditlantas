import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Calendar, Search, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export default function GrossProfitReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // Default current month
    end: new Date().toISOString().split('T')[0]
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [missingHppColumn, setMissingHppColumn] = useState(false);
  const [missingPoHistory, setMissingPoHistory] = useState(false);
  
  const vehicleGroupLabel = (vehicleType?: string | null) => {
    const vt = String(vehicleType || '').toUpperCase();
    if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
    if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
    if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
    return '-';
  };

  const normalizeText = (v: string) =>
    String(v || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

  const isNameMatch = (a: string, b: string) => {
    const aa = normalizeText(a);
    const bb = normalizeText(b);
    if (!aa || !bb) return false;
    if (aa === bb) return true;
    return aa.includes(bb) || bb.includes(aa);
  };

  useEffect(() => {
    checkDatabaseSchema();
  }, []);

  useEffect(() => {
    if (dateRange.start && dateRange.end) {
        fetchData();
    } else {
        setData([]);
    }
  }, [dateRange]);

  async function checkDatabaseSchema() {
    // Check if 'hpp' column exists in job_types
    const { error } = await supabase.from('job_types').select('hpp').limit(1);
    if (error && error.message.includes('does not exist')) {
        setMissingHppColumn(true);
    } else {
        setMissingHppColumn(false);
    }
  }

  async function handleSyncData() {
    setIsSyncing(true);
    try {
        // 1. Fetch COMPLETED WOs (no time filter for sync)
        const { data: wos } = await supabase
            .from('work_orders')
            .select(`
                id, wo_number, vehicle_entry_id
            `)
            .in('status', ['COMPLETED', 'CLOSED']); // Fetch CLOSED too!
        
        if (!wos || wos.length === 0) {
             toast.info("Tidak ada WO Completed.");
             return;
        }

        let updatedCount = 0;

        for (const wo of wos) {
            // ALWAYS DELETE existing billings first to force refresh
            await supabase.from('work_order_billings').delete().eq('work_order_id', wo.id);
            
            // Re-generate billings for this WO
            // A. Fetch Job Types
            const { data: entryData } = await supabase
                .from('vehicle_entries')
                .select(`
                vehicle_entry_jobs (
                    estimated_price,
                    job_types (*)
                )
                `)
                .eq('id', wo.vehicle_entry_id || '')
                .single();

            // B. Fetch Issued Goods
            const { data: issueData } = await supabase
                .from('goods_issues')
                .select(`
                goods_issue_items (
                    quantity,
                    goods (*)
                )
                `)
                .eq('work_order_id', wo.id);

            const items: any[] = [];

            // Add Jobs
            if (entryData?.vehicle_entry_jobs) {
                entryData.vehicle_entry_jobs.forEach((j: any) => {
                if (j.job_types) {
                    const est = Number(j.estimated_price || 0);
                    const sp = Number(j.job_types.selling_price || 0);
                    const unit = est > 0 ? est : sp;
                    items.push({
                        work_order_id: wo.id,
                        item_type: 'JOB',
                        job_type_id: j.job_types.id,
                        goods_id: null,
                        item_name: j.job_types.job_name,
                        job_group: j.job_types.job_group,
                        qty: 1,
                        unit_price: unit,
                        total_price: unit
                    });
                }
                });
            }

            // Add Parts
            if (issueData) {
                issueData.forEach((issue: any) => {
                if (issue.goods_issue_items) {
                    issue.goods_issue_items.forEach((item: any) => {
                    if (item.goods) {
                        items.push({
                            work_order_id: wo.id,
                            item_type: 'PART',
                            job_type_id: null,
                            goods_id: item.goods.id,
                            item_name: `Penggantian ${item.goods.name}`,
                            job_group: 'PERBAIKAN',
                            qty: item.quantity,
                            unit_price: item.goods.selling_price || 0,
                            total_price: (item.goods.selling_price || 0) * item.quantity
                        });
                    }
                    });
                }
                });
            }

            if (items.length > 0) {
                const { error } = await supabase.from('work_order_billings').insert(items);
                if (!error) updatedCount++;
            }
        }

        if (updatedCount > 0) {
            toast.success(`Berhasil sinkronisasi ulang ${updatedCount} WO.`);
            fetchData();
        } else {
            toast.info("Sinkronisasi selesai.");
        }

    } catch (error: any) {
        toast.error("Gagal sinkronisasi: " + error.message);
    } finally {
        setIsSyncing(false);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      let wos: any[] | null = null;
      {
        const { data, error } = await supabase
          .from('work_orders')
          .select(`
            *,
            goods_issues (
              goods_issue_items (
                quantity,
                is_info_only,
                value_only,
                goods (id, name, selling_price, unit, item_code)
              )
            ),
            vehicle_entries (
              nota_dinas_number,
              service_group,
              vehicles (license_plate, brand_type, vehicle_type),
              vehicle_entry_spareparts (
                item_name,
                qty,
                estimated_price,
                value_only
              ),
              vehicle_entry_jobs (
                job_type_id,
                estimated_price,
                value_only,
                job_types (
                  job_name,
                  job_group,
                  selling_price
                )
              )
            ),
            billings:work_order_billings (
              item_type,
              item_name,
              qty,
              unit_price,
              total_price,
              goods_id,
              job_type_id,
              job_group,
              goods (name, unit, item_code)
            )
          `)
          .in('status', ['COMPLETED', 'CLOSED'])
          .gte('work_date', dateRange.start)
          .lte('work_date', dateRange.end)
          .order('work_date', { ascending: false });

        if (!error) wos = (data as any[]) || [];
        else {
          const { data: fallback, error: fallbackErr } = await supabase
            .from('work_orders')
            .select(`
              *,
              goods_issues (
                goods_issue_items (
                  quantity,
                  is_info_only,
                  value_only,
                  goods (id, name, selling_price, unit, item_code)
                )
              ),
              vehicle_entries (
                nota_dinas_number,
                service_group,
                vehicles (license_plate, brand_type, vehicle_type),
                vehicle_entry_spareparts (
                  item_name,
                  qty,
                  estimated_price,
                  value_only
                ),
                vehicle_entry_jobs (
                  job_type_id,
                  estimated_price,
                  value_only,
                  job_types (
                    job_name,
                    job_group,
                    selling_price
                  )
                )
              ),
              billings:work_order_billings (
                item_type,
                item_name,
                qty,
                unit_price,
                total_price,
                goods_id,
                job_type_id,
                job_group,
                goods (name, unit, item_code)
              )
            `)
            .in('status', ['COMPLETED', 'CLOSED'])
            .gte('work_date', dateRange.start)
            .lte('work_date', dateRange.end)
            .order('work_date', { ascending: false });
          if (fallbackErr) throw fallbackErr;
          wos = (fallback as any[]) || [];
        }
      }

      // 2. Prepare Maps for HPP
      const goodsIds = new Set<string>();
      const jobTypeIds = new Set<string>();

      wos?.forEach(wo => {
        wo.billings?.forEach((bill: any) => {
          if (bill.goods_id) goodsIds.add(bill.goods_id);
          if (bill.job_type_id) jobTypeIds.add(bill.job_type_id);
        });
      });

      // 3. Fetch Last Purchase Price for PARTS
      const partHppMap: Record<string, number> = {};
      let hasPoHistory = false;

      if (goodsIds.size > 0) {
        const { data: poItems } = await supabase
          .from('purchase_order_items')
          .select('goods_id, unit_price, created_at')
          .in('goods_id', Array.from(goodsIds))
          .order('created_at', { ascending: false });
        
        if (poItems && poItems.length > 0) {
            hasPoHistory = true;
            poItems.forEach(item => {
                if (item.goods_id && partHppMap[item.goods_id] === undefined) {
                    partHppMap[item.goods_id] = item.unit_price;
                }
            });
        }
      }
      setMissingPoHistory(!hasPoHistory && goodsIds.size > 0);

      // 4. Fetch COGS (HPP) for JOBS from job_types table
      const jobHppMap: Record<string, number> = {};
      if (jobTypeIds.size > 0) {
        try {
          // Explicitly select hpp. If column missing, this might fail or return null.
          const { data: jobs, error } = await supabase
            .from('job_types')
            .select('id, hpp')
            .in('id', Array.from(jobTypeIds));
            
          if (error) {
             console.warn("Could not fetch HPP:", error.message);
             // If error is strictly about column missing, we already setMissingHppColumn via checkDatabaseSchema
          } else if (jobs) {
              jobs.forEach((j: any) => {
                  jobHppMap[j.id] = j.hpp || 0;
              });
          }
        } catch (err) {
            console.error("Error fetching job HPP:", err);
        }
      }

      // 5. Build Report Rows
      const reportRows: any[] = [];
      wos?.forEach(wo => {
        if (!wo.billings || wo.billings.length === 0) return;

        // --- NEW LOGIC: MURNI GROUP WO (Dengan Fallback Cerdas) ---
        
        // 1. Ambil Group WO
        let woFinalGroup = (wo.vehicle_entries?.service_group || '').toUpperCase();

        // 2. Fallback HANYA JIKA Kosong
        if (!woFinalGroup || woFinalGroup === '-') {
            const hasServiceItem = wo.billings.some((b: any) => {
                const name = (b.item_name || '').toUpperCase();
                return name.includes('TUNE UP') || name.includes('SERVICE') || name.includes('SERVIS');
            });

            const vType = (wo.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
            const isR4 = vType === 'R4' || vType.includes('MOBIL');
            const suffix = isR4 ? 'R4' : 'R2';

            if (hasServiceItem) {
                woFinalGroup = `SERVICE RINGAN ${suffix}`;
            } else {
                woFinalGroup = `PERBAIKAN ${suffix}`;
            }
        }

        const valueOnlyParts = Array.isArray(wo.vehicle_entries?.vehicle_entry_spareparts)
          ? wo.vehicle_entries.vehicle_entry_spareparts.filter((p: any) => Boolean((p as any).value_only) && String(p.item_name || '').trim())
          : [];

        const valueOnlyJobs = Array.isArray(wo.vehicle_entries?.vehicle_entry_jobs)
          ? wo.vehicle_entries.vehicle_entry_jobs.filter((j: any) => Boolean((j as any).value_only) && j.job_type_id)
          : [];

        const billingJobs = new Set<string>();
        const billingPartNames: string[] = [];

        const issueItems =
          (wo.goods_issues || [])
            .flatMap((gi: any) => gi?.goods_issue_items || [])
            .filter((it: any) => !it?.is_info_only && !it?.value_only && it?.goods?.id);

        const issuedByGoodsId = new Map<string, { qty: number; unit: number; name: string; item_code: string; unitLabel: string }>();
        issueItems.forEach((it: any) => {
          const gid = String(it.goods.id);
          const qty = Number(it.quantity || 0);
          const unit = Number(it.goods?.selling_price || 0);
          const prev = issuedByGoodsId.get(gid);
          issuedByGoodsId.set(gid, {
            qty: (prev?.qty || 0) + qty,
            unit: unit,
            name: String(it.goods?.name || ''),
            item_code: String(it.goods?.item_code || ''),
            unitLabel: String(it.goods?.unit || ''),
          });
        });

        wo.billings.forEach((bill: any) => {
            const billQty = Number(bill.qty || 0);
            const billUnit = Number(bill.unit_price || 0);
            let totalHarga = Number(bill.total_price ?? billUnit * billQty);
            if (!Number.isFinite(totalHarga)) totalHarga = 0;
            let hargaPagu = billUnit;

            let hppSatuan = 0;
            let hppSource = '-';
            
            if (bill.item_type === 'PART' && bill.goods_id) {
                issuedByGoodsId.delete(String(bill.goods_id));
                const isValueOnly = valueOnlyParts.some((p: any) => isNameMatch(p.item_name, bill.goods?.name || bill.item_name || ''));
                billingPartNames.push(String(bill.goods?.name || bill.item_name || ''));
                if (isValueOnly) {
                  hppSatuan = 0;
                  hppSource = 'N/A';
                  const matched = valueOnlyParts.find((p: any) => isNameMatch(p.item_name, bill.goods?.name || bill.item_name || ''));
                  const ep = Number(matched?.estimated_price || 0);
                  const q = Number(matched?.qty || billQty || 0);
                  if (ep > 0) {
                    hargaPagu = ep;
                    totalHarga = ep * (q || 0);
                  }
                } else {
                hppSatuan = partHppMap[bill.goods_id] || 0;
                hppSource = partHppMap[bill.goods_id] !== undefined ? 'PO Terakhir' : 'Tidak Ada PO';
                }
            } else if (bill.item_type === 'JOB' && bill.job_type_id) {
                const isValueOnlyJob = valueOnlyJobs.some((j: any) => String(j.job_type_id) === String(bill.job_type_id));
                billingJobs.add(String(bill.job_type_id));
                if (isValueOnlyJob) {
                  hppSatuan = 0;
                  hppSource = 'N/A';
                  const matchedJob = valueOnlyJobs.find((j: any) => String(j.job_type_id) === String(bill.job_type_id));
                  const ep = Number(matchedJob?.estimated_price || 0);
                  if (ep > 0) {
                    hargaPagu = ep;
                    totalHarga = ep * (billQty || 1);
                  }
                } else {
                  hppSatuan = jobHppMap[bill.job_type_id] || 0;
                  hppSource = 'Master Jasa';
                }
            }

            if (totalHarga === 0 && billQty > 0 && hargaPagu > 0) totalHarga = hargaPagu * billQty;

            const hppTotal = hppSatuan * (billQty || 0);
            const margin = (totalHarga || 0) - hppTotal;
            const marginPercent = totalHarga ? (margin / totalHarga) * 100 : 0;

            reportRows.push({
                tgl: wo.work_date, 
                nopol: wo.vehicle_entries?.vehicles?.license_plate || '-',
                merk_type: wo.vehicle_entries?.vehicles?.brand_type || '-',
                group_kendaraan: vehicleGroupLabel(wo.vehicle_entries?.vehicles?.vehicle_type),
                nota_dinas: wo.vehicle_entries?.nota_dinas_number || '-',
                group: woFinalGroup, // Gunakan Group Final WO
                klasifikasi: woFinalGroup, 
                sku: bill.goods?.item_code || '-',
                item: bill.item_name,
                qty: billQty,
                satuan: bill.goods?.unit || 'Jasa',
                harga_pagu: hargaPagu,
                total_harga: totalHarga,
                hpp_satuan: hppSatuan,
                hpp_total: hppTotal,
                hpp_source: hppSource,
                margin: margin,
                margin_percent: marginPercent
            });
        });

        issuedByGoodsId.forEach((v, gid) => {
          const billQty = Number(v.qty || 0);
          const hargaPagu = Number(v.unit || 0);
          const totalHarga = hargaPagu * billQty;

          const hppSatuan = partHppMap[gid] || 0;
          const hppSource = partHppMap[gid] !== undefined ? 'PO Terakhir' : 'Tidak Ada PO';
          const hppTotal = hppSatuan * billQty;
          const margin = totalHarga - hppTotal;
          const marginPercent = totalHarga ? (margin / totalHarga) * 100 : 0;

          reportRows.push({
            tgl: wo.work_date,
            nopol: wo.vehicle_entries?.vehicles?.license_plate || '-',
            merk_type: wo.vehicle_entries?.vehicles?.brand_type || '-',
            group_kendaraan: vehicleGroupLabel(wo.vehicle_entries?.vehicles?.vehicle_type),
            nota_dinas: wo.vehicle_entries?.nota_dinas_number || '-',
            group: woFinalGroup,
            klasifikasi: woFinalGroup,
            sku: v.item_code || '-',
            item: `Penggantian ${v.name || 'Sparepart'}`,
            qty: billQty,
            satuan: v.unitLabel || '-',
            harga_pagu: hargaPagu,
            total_harga: totalHarga,
            hpp_satuan: hppSatuan,
            hpp_total: hppTotal,
            hpp_source: hppSource,
            margin,
            margin_percent: marginPercent,
          });
        });

        valueOnlyJobs.forEach((j: any) => {
          const id = String(j.job_type_id || '');
          if (!id || billingJobs.has(id)) return;
          const ep = Number(j.estimated_price || (j.job_types as any)?.selling_price || 0);
          const qty = 1;
          const totalHarga = ep * qty;
          reportRows.push({
            tgl: wo.work_date,
            nopol: wo.vehicle_entries?.vehicles?.license_plate || '-',
            merk_type: wo.vehicle_entries?.vehicles?.brand_type || '-',
            group_kendaraan: vehicleGroupLabel(wo.vehicle_entries?.vehicles?.vehicle_type),
            nota_dinas: wo.vehicle_entries?.nota_dinas_number || '-',
            group: woFinalGroup,
            klasifikasi: woFinalGroup,
            sku: '-',
            item: (j.job_types as any)?.job_name || 'Pekerjaan (Nilai Saja)',
            qty,
            satuan: 'Jasa',
            harga_pagu: ep,
            total_harga: totalHarga,
            hpp_satuan: 0,
            hpp_total: 0,
            hpp_source: 'N/A',
            margin: totalHarga,
            margin_percent: totalHarga ? 100 : 0,
          });
        });

        valueOnlyParts.forEach((p: any) => {
          const name = String(p.item_name || '').trim();
          if (!name) return;
          const exists = billingPartNames.some((b) => isNameMatch(name, b));
          if (exists) return;
          const ep = Number(p.estimated_price || 0);
          const qty = Number(p.qty || 0);
          const totalHarga = ep * qty;
          reportRows.push({
            tgl: wo.work_date,
            nopol: wo.vehicle_entries?.vehicles?.license_plate || '-',
            merk_type: wo.vehicle_entries?.vehicles?.brand_type || '-',
            group_kendaraan: vehicleGroupLabel(wo.vehicle_entries?.vehicles?.vehicle_type),
            nota_dinas: wo.vehicle_entries?.nota_dinas_number || '-',
            group: woFinalGroup,
            klasifikasi: woFinalGroup,
            sku: '-',
            item: name,
            qty,
            satuan: '-',
            harga_pagu: ep,
            total_harga: totalHarga,
            hpp_satuan: 0,
            hpp_total: 0,
            hpp_source: 'N/A',
            margin: totalHarga,
            margin_percent: totalHarga ? 100 : 0,
          });
        });
      });

      setData(reportRows);

    } catch (error) {
      console.error('Error fetching Gross Profit report:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data.filter(item => 
    item.nopol.toLowerCase().includes(search.toLowerCase()) ||
    item.nota_dinas.toLowerCase().includes(search.toLowerCase()) ||
    item.item.toLowerCase().includes(search.toLowerCase())
  );

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.map(item => ({
      'Tgl': formatDate(item.tgl),
      'No.Pol': item.nopol,
      'Group Kendaraan': item.group_kendaraan,
      'Merk/Type': item.merk_type,
      'No. Nota Dinas': item.nota_dinas,
      'Group': item.group,
      'Klasifikasi': item.klasifikasi,
      'No. SKU': item.sku,
      'Item': item.item,
      'Qty': item.qty,
      'Satuan': item.satuan,
      'Harga Pagu': item.harga_pagu,
      'Total Harga': item.total_harga,
      'HPP Satuan': item.hpp_satuan,
      'HPP Total': item.hpp_total,
      'Sumber HPP': item.hpp_source,
      'Margin': item.margin,
      'Dalam %': `${item.margin_percent.toFixed(2)}%`
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Laba Kotor");
    XLSX.writeFile(wb, `Laporan_Laba_Kotor_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  const totalRevenue = filteredData.reduce((sum, item) => sum + item.total_harga, 0);
  const totalHPP = filteredData.reduce((sum, item) => sum + item.hpp_total, 0);
  const totalMargin = totalRevenue - totalHPP;
  const totalMarginPercent = totalRevenue ? (totalMargin / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Laporan Laba Kotor</h2>
        <div className="flex flex-wrap gap-2">
           <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm">
              <Calendar className="h-4 w-4 text-gray-500 ml-2" />
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
              <span className="text-gray-400 font-medium">-</span>
              <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
           </div>
           <Button variant="outline" onClick={exportToExcel}><Download className="mr-2 h-4 w-4" /> Export</Button>
           <Button variant="outline" onClick={handleSyncData} disabled={isSyncing}>
                {isSyncing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync Data
           </Button>
        </div>
      </div>

      {/* Diagnostics Alerts */}
      {(missingHppColumn || missingPoHistory) && (
        <div className="space-y-2">
            {missingHppColumn && (
                <div className="bg-red-50 text-red-900 border border-red-200 rounded-md p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                        <h4 className="font-semibold">Konfigurasi Database Belum Lengkap</h4>
                        <p className="text-sm mt-1">
                            Kolom <b>'hpp'</b> pada tabel Master Pekerjaan tidak ditemukan. Perhitungan margin jasa tidak akurat (dianggap 100%).
                            <br/>
                            Silakan hubungi IT untuk menambahkan kolom ini atau jalankan SQL: <code className="bg-red-100 px-1 py-0.5 rounded">ALTER TABLE job_types ADD COLUMN hpp NUMERIC DEFAULT 0;</code>
                        </p>
                    </div>
                </div>
            )}
            {missingPoHistory && (
                <div className="bg-yellow-50 text-yellow-900 border border-yellow-200 rounded-md p-4 flex items-start gap-3">
                    <Info className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                        <h4 className="font-semibold">Riwayat Pembelian Kosong</h4>
                        <p className="text-sm mt-1">
                            Beberapa barang belum memiliki riwayat Purchase Order (PO). HPP barang tersebut dianggap 0.
                            Pastikan Anda telah menginput PO untuk barang-barang yang digunakan agar perhitungan HPP akurat.
                        </p>
                    </div>
                </div>
            )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Pendapatan</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-blue-600">{formatCurrency(totalRevenue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total HPP</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-gray-600">{formatCurrency(totalHPP)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Margin (Rp)</CardTitle></CardHeader>
          <CardContent><div className={`text-xl font-bold ${totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalMargin)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Margin (%)</CardTitle></CardHeader>
          <CardContent><div className={`text-xl font-bold ${totalMarginPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{totalMarginPercent.toFixed(2)}%</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Analisis Profit</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Cari Nopol / Item..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <div className="max-h-[600px] overflow-auto">
            <Table className="whitespace-nowrap relative">
                <TableHeader className="sticky top-0 bg-white shadow-sm z-10">
                <TableRow>
                    <TableHead>Tgl</TableHead>
                    <TableHead>No.Pol</TableHead>
                    <TableHead>Group Kendaraan</TableHead>
                    <TableHead>Merk/Tipe</TableHead>
                    <TableHead>No. Nota</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Klasifikasi</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Harga Pagu</TableHead>
                    <TableHead className="text-right">Total Harga</TableHead>
                    <TableHead className="text-right bg-gray-50">HPP Satuan</TableHead>
                    <TableHead className="text-right bg-gray-50">HPP Total</TableHead>
                    <TableHead className="text-center bg-gray-50">Sumber HPP</TableHead>
                    <TableHead className="text-right font-bold bg-green-50">Margin</TableHead>
                    <TableHead className="text-right font-bold bg-green-50">%</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {filteredData.length === 0 ? (
                    <TableRow><TableCell colSpan={16} className="text-center py-8">Tidak ada data.</TableCell></TableRow>
                ) : (
                    filteredData.map((item, idx) => (
                    <TableRow key={idx}>
                        <TableCell>{formatDate(item.tgl)}</TableCell>
                        <TableCell className="font-medium">{item.nopol}</TableCell>
                        <TableCell>
                            <span className="text-xs bg-slate-100 px-2 py-1 rounded">
                                {item.group_kendaraan}
                            </span>
                        </TableCell>
                        <TableCell>{item.merk_type}</TableCell>
                        <TableCell>{item.nota_dinas}</TableCell>
                        <TableCell>
                            <span className="text-xs bg-slate-100 px-2 py-1 rounded">
                                {item.group?.replace(/_/g, ' ')}
                            </span>
                        </TableCell>
                        <TableCell>{item.klasifikasi?.replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                            <div className="flex flex-col">
                                <span>{item.item}</span>
                                <span className="text-[10px] text-gray-400">{item.sku}</span>
                            </div>
                        </TableCell>
                        <TableCell className="text-center">{item.qty} {item.satuan}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.harga_pagu)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(item.total_harga)}</TableCell>
                        <TableCell className="text-right bg-gray-50 text-gray-600">{formatCurrency(item.hpp_satuan)}</TableCell>
                        <TableCell className="text-right bg-gray-50 text-gray-600">{formatCurrency(item.hpp_total)}</TableCell>
                        <TableCell className="text-center bg-gray-50 text-[10px] text-gray-500">{item.hpp_source}</TableCell>
                        <TableCell className={`text-right bg-green-50 font-bold ${item.margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrency(item.margin)}
                        </TableCell>
                        <TableCell className={`text-right bg-green-50 font-bold ${item.margin_percent >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {item.margin_percent.toFixed(1)}%
                        </TableCell>
                    </TableRow>
                    ))
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
