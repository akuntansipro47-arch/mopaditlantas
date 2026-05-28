import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Printer, FileDown, RefreshCw } from 'lucide-react';
import { formatCurrency, formatDate, matchesFreeSearch } from '@/lib/utils';
import * as XLSX from 'xlsx';

import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportPrintHeader from '@/components/reports/ReportPrintHeader';

export default function EstimationVsRealizationReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

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

  const pickWorkOrder = (workOrders: any[] | null | undefined) => {
    const arr = Array.isArray(workOrders) ? workOrders : [];
    if (arr.length === 0) return null;
    const statusRank = (s: any) => {
      const v = String(s || '').toUpperCase();
      if (v === 'CLOSED') return 3;
      if (v === 'COMPLETED') return 2;
      if (v === 'IN_PROGRESS') return 1;
      if (v === 'OPEN') return 0;
      return -1;
    };
    return [...arr].sort((a, b) => {
      const sr = statusRank(b.status) - statusRank(a.status);
      if (sr !== 0) return sr;
      const ta = new Date(a.work_date || a.created_at || 0).getTime();
      const tb = new Date(b.work_date || b.created_at || 0).getTime();
      return tb - ta;
    })[0];
  };

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

  const getJobEstimation = (j: any) => {
    const epRaw = (j as any)?.estimated_price;
    const ep = Number(epRaw);
    const sp = Number(j?.job_types?.selling_price || 0);
    if (Number.isFinite(ep) && ep > 0) return ep;
    if ((!Number.isFinite(ep) || epRaw === null || epRaw === undefined) && sp > 0) return sp;
    if (Number.isFinite(ep) && ep === 0 && sp > 0) return sp;
    return Number.isFinite(ep) ? ep : 0;
  };

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch ALL Work Orders + Include Entries without WO
      const { data: woData, error } = await supabase
        .from('vehicle_entries')
        .select(`
          *,
          work_orders (
            id,
            wo_number,
            status,
            work_date,
            created_at,
            work_order_billings (
              item_type,
              item_name,
              qty,
              unit_price,
              total_price
            )
          ),
          vehicle_entry_jobs (
            *,
            job_types (selling_price)
          ),
          vehicle_entry_spareparts (
            item_name,
            qty,
            estimated_price
          ),
          vehicles (license_plate, brand_type, vehicle_type)
        `)
        .gte('entry_date', dateFilter.startDate)
        .lte('entry_date', dateFilter.endDate)
        .order('entry_date', { ascending: false });

      if (error) throw error;

      // Process Data
      const processedData = (woData || []).map(entry => {
        // Estimation Calculation
        let estJob = 0;
        let estPart = 0;
        
        entry.vehicle_entry_jobs?.forEach((j: any) => {
             estJob += getJobEstimation(j);
        });
        
        entry.vehicle_entry_spareparts?.forEach((p: any) => {
             estPart += (p.estimated_price || 0) * (p.qty || 0);
        });
        
        const totalEst = estJob + estPart;

        // Realization Calculation (Check if WO exists)
        let realJob = 0;
        let realPart = 0;
        let woInfo: any = null;

        if (entry.work_orders && entry.work_orders.length > 0) {
          woInfo = pickWorkOrder(entry.work_orders);
          const bills = Array.isArray(woInfo?.work_order_billings) ? woInfo.work_order_billings : [];
          const entryParts = Array.isArray(entry.vehicle_entry_spareparts) ? entry.vehicle_entry_spareparts : [];

          bills.forEach((b: any) => {
            const total = Number(b.total_price || 0);
            const qty = Number(b.qty || 0);
            const unit = Number(b.unit_price || 0);
            const type = String(b.item_type || '').toUpperCase();

            if (type === 'JOB') {
              realJob += total;
              return;
            }

            if (type === 'PART') {
              if (total > 0) {
                realPart += total;
                return;
              }

              if (unit > 0 && qty > 0) {
                realPart += unit * qty;
                return;
              }

              const billName = String(b.item_name || '').replace(/^Penggantian\s+/i, '').trim();
              const matched = entryParts.find((p: any) => isNameMatch(String(p.item_name || ''), billName));
              const ep = Number(matched?.estimated_price || 0);
              const q = Number(matched?.qty || qty || 0);
              if (ep > 0 && q > 0) {
                realPart += ep * q;
                return;
              }

              realPart += 0;
            }
          });
        }
        
        const totalReal = realJob + realPart;
        const variance = totalReal - totalEst;
        const percentage = totalEst > 0 ? (variance / totalEst) * 100 : 0;

        return {
            id: entry.id,
            date: entry.entry_date, // Use entry date, not WO date
            wo_number: woInfo ? woInfo.wo_number : '-',
            status: woInfo ? woInfo.status : entry.status, // Fallback to Entry Status if no WO
            license_plate: entry.vehicles?.license_plate || '-',
            brand: entry.vehicles?.brand_type || '-',
            nota_dinas: entry.nota_dinas_number || '-',
            group: getVehicleGroupLabel(entry),
            
            est_job: estJob,
            est_part: estPart,
            total_est: totalEst,
            
            real_job: realJob,
            real_part: realPart,
            total_real: totalReal,
            
            variance: variance,
            percentage: percentage
        };
      });

      setData(processedData);
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  }

  const getGroupKey = (label: string) => {
    if (label === 'R2') return 'R2';
    if (label === 'R4') return 'R4';
    if (label === 'R2 Kecil') return 'R2_KECIL';
    return '';
  };

  const filteredData = data.filter(item => {
    const matchSearch = matchesFreeSearch(search, [
      item.date,
      item.wo_number,
      item.status,
      item.license_plate,
      item.group,
      item.nota_dinas,
      item.est_job,
      item.est_part,
      item.total_est,
      item.real_job,
      item.real_part,
      item.total_real,
      item.diff,
    ]);
    const matchGroup = groupFilter === 'ALL' ? true : getGroupKey(item.group) === groupFilter;
    return matchSearch && matchGroup;
  });

  const exportToExcel = () => {
    const exportData = filteredData.map((item, index) => ({
      'No': index + 1,
      'Tanggal': formatDate(item.date),
      'No. WO': item.wo_number,
      'Status': item.status,
      'Nopol': item.license_plate,
      'Group': item.group,
      'Nota Dinas': item.nota_dinas,
      'Est. Jasa': item.est_job,
      'Est. Part': item.est_part,
      'Total Estimasi': item.total_est,
      'Real. Jasa': item.real_job,
      'Real. Part': item.real_part,
      'Total Realisasi': item.total_real,
      'Selisih (Rp)': item.variance,
      'Selisih (%)': `${item.percentage.toFixed(2)}%`
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Estimasi vs Realisasi");
    XLSX.writeFile(wb, `Laporan_Estimasi_Vs_Realisasi_${dateFilter.startDate}_${dateFilter.endDate}.xlsx`);
  };

  const grandTotal = filteredData.reduce((acc, curr) => ({
      est: acc.est + curr.total_est,
      real: acc.real + curr.total_real,
      var: acc.var + curr.variance
  }), { est: 0, real: 0, var: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Laporan Estimasi vs Realisasi</h2>
          <p className="text-muted-foreground">Monitoring unit masuk dan perbandingan nilai estimasi vs realisasi.</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Segarkan
            </Button>
            <Button variant="outline" onClick={exportToExcel}>
                <FileDown className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Cetak
            </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="pb-3 print:hidden">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Periode:</span>
                    <Input 
                        type="date" 
                        value={dateFilter.startDate}
                        onChange={(e) => setDateFilter({...dateFilter, startDate: e.target.value})}
                        className="w-auto"
                    />
                    <span>s/d</span>
                    <Input 
                        type="date" 
                        value={dateFilter.endDate}
                        onChange={(e) => setDateFilter({...dateFilter, endDate: e.target.value})}
                        className="w-auto"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Group:</span>
                        <Select value={groupFilter} onValueChange={setGroupFilter}>
                            <SelectTrigger className="w-[140px] bg-white"><SelectValue placeholder="Semua" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Semua</SelectItem>
                                <SelectItem value="R2">R2</SelectItem>
                                <SelectItem value="R4">R4</SelectItem>
                                <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Cari bebas berdasarkan kolom laporan..." 
                            className="pl-8" 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </CardHeader>
        <CardContent>
          <ReportPrintHeader title="Laporan Estimasi vs Realisasi" periodStart={dateFilter.startDate} periodEnd={dateFilter.endDate} />
            <div className="rounded-md border overflow-hidden">
                <div className="max-h-[600px] overflow-auto">
                    <Table className="relative w-full">
                        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                            <TableRow className="bg-slate-50">
                                <TableHead className="w-[50px] font-semibold text-slate-700">No</TableHead>
                                <TableHead className="font-semibold text-slate-700">Tanggal</TableHead>
                                <TableHead className="font-semibold text-slate-700">No. WO / Status</TableHead>
                                <TableHead className="font-semibold text-slate-700">Kendaraan</TableHead>
                                <TableHead className="font-semibold text-slate-700">Group</TableHead>
                                <TableHead className="text-right font-semibold text-orange-700 bg-orange-50/50">Total Estimasi</TableHead>
                                <TableHead className="text-right font-semibold text-green-700 bg-green-50/50">Total Realisasi</TableHead>
                                <TableHead className="text-right font-semibold text-slate-700">Selisih</TableHead>
                                <TableHead className="text-center font-semibold text-slate-700">%</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={9} className="text-center h-24 text-muted-foreground">Memuat data...</TableCell></TableRow>
                            ) : filteredData.length === 0 ? (
                                <TableRow><TableCell colSpan={9} className="text-center h-24 text-muted-foreground">Tidak ada data.</TableCell></TableRow>
                            ) : (
                                filteredData.map((item, index) => (
                                    <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="text-center">{index + 1}</TableCell>
                                        <TableCell className="text-sm">{formatDate(item.date)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="font-medium text-slate-900">{item.wo_number}</span>
                                                <Badge variant="outline" className={`w-fit text-[10px] px-1.5 py-0 border-0 ${
                                                    item.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                                    item.status === 'CLOSED' ? 'bg-slate-100 text-slate-700' :
                                                    item.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {item.status}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-900">{item.license_plate}</span>
                                                <span className="text-xs text-muted-foreground">{item.brand}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                                {item.group}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right font-medium text-orange-700 bg-orange-50/30">
                                            {formatCurrency(item.total_est)}
                                        </TableCell>
                                        <TableCell className="text-right font-medium text-green-700 bg-green-50/30">
                                            {formatCurrency(item.total_real)}
                                        </TableCell>
                                        <TableCell className={`text-right font-bold ${item.variance > 0 ? 'text-green-600' : item.variance < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                            {formatCurrency(item.variance)}
                                        </TableCell>
                                        <TableCell className={`text-center text-xs ${Math.abs(item.percentage) > 10 ? 'font-bold text-red-500' : 'text-slate-500'}`}>
                                            {item.percentage.toFixed(1)}%
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                        {filteredData.length > 0 && (
                            <TableBody>
                                <TableRow className="bg-slate-100 border-t-2 border-slate-300 font-bold sticky bottom-0 shadow-inner z-10">
                                    <TableCell colSpan={5} className="text-right text-slate-700">GRAND TOTAL</TableCell>
                                    <TableCell className="text-right text-orange-800">{formatCurrency(grandTotal.est)}</TableCell>
                                    <TableCell className="text-right text-green-800">{formatCurrency(grandTotal.real)}</TableCell>
                                    <TableCell className={`text-right ${grandTotal.var >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(grandTotal.var)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            </TableBody>
                        )}
                    </Table>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
