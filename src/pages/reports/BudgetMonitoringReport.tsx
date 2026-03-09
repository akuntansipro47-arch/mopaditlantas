import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Download, Calendar, Search, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import * as XLSX from 'xlsx';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function BudgetMonitoringReport() {
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  
  const [reportData, setReportData] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear]);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Fetch Budget Allocations for the selected period
      const { data: periodData } = await supabase
        .from('budget_periods')
        .select('id')
        .eq('month', selectedMonth)
        .eq('year', parseInt(selectedYear))
        .single();

      let budgetService = 0;
      let budgetPerbaikan = 0;

      if (periodData) {
        const { data: allocations } = await supabase
          .from('budget_allocations')
          .select('*')
          .eq('period_id', periodData.id);

        if (allocations) {
          allocations.forEach(a => {
            const group = a.service_group || '';
            const groupUpper = group.toUpperCase();

            // Logic Pagu Sederhana:
            // 1. Service Ringan (Gabungan R2/R4)
            if (groupUpper.includes('SERVICE') || groupUpper.includes('SERVIS')) {
                budgetService += a.amount || 0;
            } 
            // 2. Perbaikan (Gabungan R2/R4)
            else {
                budgetPerbaikan += a.amount || 0;
            }
          });
        }
      }

      // 2. Fetch Usage (Realization) from Work Orders
      // Need to determine date range for the selected Month/Year
      const monthIndex = MONTHS.indexOf(selectedMonth);
      
      // Use the timezone-offset method which was confirmed working previously
      const startDate = new Date(parseInt(selectedYear), monthIndex, 1);
      const startDateStr = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
      
      const endDate = new Date(parseInt(selectedYear), monthIndex + 1, 0);
      const endDateStr = new Date(endDate.getTime() - (endDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

      console.log("Fetching WO Usage for range:", startDateStr, "to", endDateStr);

      const { data: wos, error: woError } = await supabase
        .from('work_orders')
        .select(`
          id,
          status,
          work_date,
          vehicle_entries (
            service_group,
            vehicles (vehicle_type)
          ),
          work_order_billings (
            total_price,
            job_group,
            item_type,
            item_name
          )
        `)
        .in('status', ['COMPLETED', 'CLOSED'])
        .gte('work_date', startDateStr)
        .lte('work_date', endDateStr);

      if (woError) {
          console.error("WO Fetch Error:", woError);
      }

      let usageService = 0;
      let usagePerbaikan = 0;

      if (wos) {
        console.log("Found WOs:", wos.length);
        wos.forEach((wo: any) => {
            // LOGIC BARU: MURNI GROUP WO (Dengan Fallback Cerdas jika Kosong)
            
            // 1. Ambil Group WO
            let group = (wo.vehicle_entries?.service_group || '').toUpperCase();

            // 2. Fallback HANYA JIKA Group WO Kosong
            if (!group || group === '-') {
                const hasServiceItem = (wo.work_order_billings || []).some((b: any) => {
                    const name = (b.item_name || '').toUpperCase();
                    return name.includes('TUNE UP') || name.includes('SERVICE') || name.includes('SERVIS');
                });

                if (hasServiceItem) {
                    group = 'SERVICE RINGAN';
                } else {
                    group = 'PERBAIKAN';
                }
            }

            // 3. Hitung Total Amount WO ini
            const woTotal = (wo.work_order_billings || []).reduce((sum: number, b: any) => sum + (b.total_price || 0), 0);

            // 4. Distribusi Pagu
            if (woTotal > 0) {
                if (group.includes('SERVICE')) {
                    usageService += woTotal;
                } else {
                    // Semua PERBAIKAN atau group lain masuk sini
                    usagePerbaikan += woTotal;
                }
            }
        });
      }

      // 3. Compile Report Rows
      const rows = [
        {
            group: 'Service Ringan',
            pagu: budgetService,
            usage: usageService,
        },
        {
            group: 'Perbaikan',
            pagu: budgetPerbaikan,
            usage: usagePerbaikan,
        }
      ];

      const processedRows = rows.map(r => {
          const balance = r.pagu - r.usage;
          const percentage = r.pagu > 0 ? (r.usage / r.pagu) * 100 : 0;
          return { ...r, balance, percentage };
      });

      setReportData(processedRows);

    } catch (error) {
      console.error("Error fetching budget monitoring:", error);
    } finally {
      setLoading(false);
    }
  }

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reportData.map(item => ({
      'Group': item.group,
      'Pagu': item.pagu,
      'Pemakaian': item.usage,
      'Balance': item.balance,
      'Dlm %': `${item.percentage.toFixed(2)}%`
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monitoring Pagu");
    XLSX.writeFile(wb, `Monitoring_Pagu_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const grandTotalPagu = reportData.reduce((acc, curr) => acc + curr.pagu, 0);
  const grandTotalUsage = reportData.reduce((acc, curr) => acc + curr.usage, 0);
  const grandTotalBalance = grandTotalPagu - grandTotalUsage;
  const grandTotalPercent = grandTotalPagu > 0 ? (grandTotalUsage / grandTotalPagu) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Monitoring Pagu Anggaran</h2>
          <p className="text-muted-foreground">Monitoring realisasi penggunaan anggaran per group.</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={exportToExcel}>
                <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-md border">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Periode:</span>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Input 
                        type="number" 
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="w-[100px] bg-white"
                    />
                </div>
                <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border">
                <Table>
                    <TableHeader className="bg-slate-100">
                        <TableRow>
                            <TableHead className="w-[30%]">Group</TableHead>
                            <TableHead className="text-right">Pagu</TableHead>
                            <TableHead className="text-right">Pemakaian</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                            <TableHead className="text-center">Dlm %</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24">Memuat data...</TableCell></TableRow>
                        ) : reportData.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24">Tidak ada data anggaran/transaksi.</TableCell></TableRow>
                        ) : (
                            <>
                                {reportData.map((row, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell className="font-medium">{row.group}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(row.pagu)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(row.usage)}</TableCell>
                                        <TableCell className={`text-right font-bold ${row.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {formatCurrency(row.balance)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${row.percentage > 100 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                {row.percentage.toFixed(2)}%
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {/* Grand Total Row */}
                                <TableRow className="bg-slate-50 font-bold border-t-2 border-slate-300">
                                    <TableCell>TOTAL</TableCell>
                                    <TableCell className="text-right">{formatCurrency(grandTotalPagu)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(grandTotalUsage)}</TableCell>
                                    <TableCell className={`text-right ${grandTotalBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {formatCurrency(grandTotalBalance)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {grandTotalPercent.toFixed(2)}%
                                    </TableCell>
                                </TableRow>
                            </>
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
