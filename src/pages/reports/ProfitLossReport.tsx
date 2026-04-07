import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Printer, Calendar as CalendarIcon, RefreshCw, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportPrintHeader from '@/components/reports/ReportPrintHeader';

export default function ProfitLossReport() {
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);
  const [reportData, setReportData] = useState<any>({
      revenue: [],
      cogs: [],
      expenses: [],
      other_revenue: [],
      other_expenses: []
  });
  
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      fetchReport();
    }, 250);
    return () => window.clearTimeout(t);
  }, [dateFilter.startDate, dateFilter.endDate]);

  const fetchOperationalHppTotal = async (startDate: string, endDate: string) => {
    const { data: wos, error: woErr } = await supabase
      .from('work_orders')
      .select(`
        id,
        work_date,
        status,
        work_order_billings (
          item_type,
          qty,
          goods_id,
          job_type_id
        )
      `)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .in('status', ['CLOSED', 'COMPLETED']);
    if (woErr) throw woErr;

    const goodsIds = new Set<string>();
    const jobTypeIds = new Set<string>();

    (wos || []).forEach((wo: any) => {
      const bills = Array.isArray(wo.work_order_billings) ? wo.work_order_billings : [];
      bills.forEach((b: any) => {
        const type = String(b.item_type || '').toUpperCase();
        if (type === 'PART' && b.goods_id) goodsIds.add(String(b.goods_id));
        if (type === 'JOB' && b.job_type_id) jobTypeIds.add(String(b.job_type_id));
      });
    });

    const partCostMap: Record<string, number> = {};
    if (goodsIds.size > 0) {
      const { data: poItems, error: poErr } = await supabase
        .from('purchase_order_items')
        .select('goods_id, unit_price, created_at')
        .in('goods_id', Array.from(goodsIds))
        .order('created_at', { ascending: false });
      if (poErr) throw poErr;
      (poItems || []).forEach((it: any) => {
        const gid = String(it.goods_id || '');
        if (!gid) return;
        if (partCostMap[gid] !== undefined) return;
        partCostMap[gid] = Number(it.unit_price || 0);
      });
    }

    const jobCostMap: Record<string, number> = {};
    if (jobTypeIds.size > 0) {
      const { data: jobs, error: jobErr } = await supabase
        .from('job_types')
        .select('id, hpp')
        .in('id', Array.from(jobTypeIds));
      if (jobErr) throw jobErr;
      (jobs || []).forEach((j: any) => {
        jobCostMap[String(j.id)] = Number(j.hpp || 0);
      });
    }

    let total = 0;
    (wos || []).forEach((wo: any) => {
      const bills = Array.isArray(wo.work_order_billings) ? wo.work_order_billings : [];
      bills.forEach((b: any) => {
        const qty = Number(b.qty || 0);
        if (qty <= 0) return;
        const type = String(b.item_type || '').toUpperCase();
        if (type === 'PART' && b.goods_id) {
          const hpp = partCostMap[String(b.goods_id)] || 0;
          total += hpp * qty;
        } else if (type === 'JOB' && b.job_type_id) {
          const hpp = jobCostMap[String(b.job_type_id)] || 0;
          total += hpp * qty;
        }
      });
    });
    return total;
  };

  async function fetchReport() {
    const currentReq = ++requestSeq.current;
    setLoading(true);
    try {
        const { data, error } = await supabase
            .from('journal_entry_items')
            .select(`
                debit, credit,
                account:chart_of_accounts (
                    id, account_code, account_name, category, sub_category
                ),
                journal_entries!inner (entry_date)
            `)
            .gte('journal_entries.entry_date', dateFilter.startDate)
            .lte('journal_entries.entry_date', dateFilter.endDate);

        if (error) throw error;

        // Grouping
        const grouped: any = {
            revenue: {},
            cogs: {},
            expenses: {},
            other_revenue: {},
            other_expenses: {}
        };

        (data || [])?.forEach((item: any) => {
            const cat = item.account.category;
            const sub = item.account.sub_category;
            const accId = item.account.id;
            const accCode = item.account.account_code || '';
            const accName = `${accCode} - ${item.account.account_name}`;
            
            let groupKey = '';
            let amount = 0;

            // Logic Filter based on Category OR Account Code Prefix
            // 4: Revenue, 5: COGS, 6: Expenses, 7: Other Income/Expense (or 8,9 depending on convention)
            
            if (cat === 'PENDAPATAN' || cat === 'PENJUALAN' || accCode.startsWith('4')) {
                if (sub === 'PENDAPATAN_LAINNYA' || accCode.startsWith('42') || accCode.startsWith('71')) { 
                     // Convention: 71 often Other Income, or just sub category check
                     groupKey = 'other_revenue';
                } else {
                     groupKey = 'revenue';
                }
                amount = (item.credit || 0) - (item.debit || 0);
            } else if (cat === 'HPP' || accCode.startsWith('5')) {
                groupKey = 'cogs';
                amount = (item.debit || 0) - (item.credit || 0);
            } else if (cat === 'BEBAN' || accCode.startsWith('6')) {
                if (sub === 'BEBAN_LAINNYA') groupKey = 'other_expenses';
                else groupKey = 'expenses';
                amount = (item.debit || 0) - (item.credit || 0);
            } else if (accCode.startsWith('7') || accCode.startsWith('8') || accCode.startsWith('9')) {
                // Catch-all for Other Income/Expenses if not categorized properly
                const net = (item.credit || 0) - (item.debit || 0);
                if (net > 0) {
                    groupKey = 'other_revenue';
                    amount = net;
                } else {
                    groupKey = 'other_expenses';
                    amount = -net;
                }
            } else if ((item.account.account_name || '').toUpperCase().includes('PENDAPATAN') || (item.account.account_name || '').toUpperCase().includes('PENJUALAN')) {
                // Fallback: Smart detection by name if category/code is missing
                groupKey = 'revenue';
                amount = (item.credit || 0) - (item.debit || 0);
            } else {
                return; // Skip Assets (1), Liabilities (2), Equity (3)
            }

            if (groupKey && !grouped[groupKey][accId]) {
                grouped[groupKey][accId] = { name: accName, amount: 0 };
            }
            if (groupKey) grouped[groupKey][accId].amount += amount;
        });

        // Convert to arrays
        const operationalHppTotal = await fetchOperationalHppTotal(dateFilter.startDate, dateFilter.endDate);

        const result = {
            revenue: Object.values(grouped.revenue),
            cogs: operationalHppTotal > 0 ? [{ name: 'HPP (Realisasi WO)', amount: operationalHppTotal }] : [],
            expenses: Object.values(grouped.expenses),
            other_revenue: Object.values(grouped.other_revenue),
            other_expenses: Object.values(grouped.other_expenses),
        };

        if (currentReq === requestSeq.current) setReportData(result);

    } catch (error: any) {
        if (currentReq === requestSeq.current) toast.error("Gagal memuat laporan: " + error.message);
    } finally {
        if (currentReq === requestSeq.current) setLoading(false);
    }
  }

  const sumTotal = (items: any[]) => {
      if (!Array.isArray(items)) return 0;
      return items.reduce((acc, curr) => acc + (curr?.amount || 0), 0);
  };

  const safeMap = (items: any[], render: (item: any, idx: number) => any) => {
      if (!Array.isArray(items)) return null;
      return items.map(render);
  };

  const totalRevenue = sumTotal(reportData?.revenue);
  const totalCOGS = sumTotal(reportData?.cogs);
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpenses = sumTotal(reportData?.expenses);
  const operatingProfit = grossProfit - totalExpenses;
  const totalOtherRevenue = sumTotal(reportData?.other_revenue);
  const totalOtherExpenses = sumTotal(reportData?.other_expenses);
  const netProfit = operatingProfit + totalOtherRevenue - totalOtherExpenses;

  const exportToExcel = () => {
    const rows = [
      ['LAPORAN LABA RUGI'],
      [`Periode: ${formatDate(dateFilter.startDate)} s/d ${formatDate(dateFilter.endDate)}`],
      [''],
      ['Keterangan', 'Jumlah (Rp)'],
      ['PENDAPATAN USAHA', ''],
      ...reportData.revenue.map((i: any) => [i.name, i.amount]),
      ['Total Pendapatan', totalRevenue],
      [''],
      ['HARGA POKOK PENJUALAN (HPP)', ''],
      ...reportData.cogs.map((i: any) => [i.name, i.amount]),
      ['Total HPP', totalCOGS],
      [''],
      ['LABA KOTOR', grossProfit],
      [''],
      ['BEBAN OPERASIONAL', ''],
      ...reportData.expenses.map((i: any) => [i.name, i.amount]),
      ['Total Beban', totalExpenses],
      [''],
      ['LABA OPERASIONAL', operatingProfit],
      [''],
      ['PENDAPATAN & BEBAN LAINNYA', ''],
      ...reportData.other_revenue.map((i: any) => [i.name, i.amount]),
      ...reportData.other_expenses.map((i: any) => [i.name, -i.amount]), // Expenses as negative for clarity
      [''],
      ['LABA BERSIH (NET PROFIT)', netProfit]
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laba Rugi");
    XLSX.writeFile(wb, `Laporan_Laba_Rugi_${dateFilter.startDate}_${dateFilter.endDate}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-3xl font-bold tracking-tight">Laporan Laba Rugi</h2>
        <div className="flex gap-2">
            <Button variant="outline" onClick={exportToExcel} className="print:hidden">
                <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="print:hidden">
                <Printer className="mr-2 h-4 w-4" /> Cetak
            </Button>
            <Button onClick={fetchReport} disabled={loading} className="print:hidden">
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="pb-3 print:hidden">
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border w-fit">
                <span className="text-sm font-medium">Periode:</span>
                <Input 
                    type="date" 
                    className="w-auto h-8 bg-white" 
                    value={dateFilter.startDate}
                    onChange={e => setDateFilter(prev => ({...prev, startDate: e.target.value}))}
                />
                <span className="text-gray-400">-</span>
                <Input 
                    type="date" 
                    className="w-auto h-8 bg-white" 
                    value={dateFilter.endDate}
                    onChange={e => setDateFilter(prev => ({...prev, endDate: e.target.value}))}
                />
            </div>
        </CardHeader>
        
        <CardContent>
            <ReportPrintHeader title="Laporan Laba Rugi" periodStart={dateFilter.startDate} periodEnd={dateFilter.endDate} />

            <div className="space-y-4 text-sm">
                {/* REVENUE */}
                <div>
                    <h3 className="font-bold bg-slate-100 p-2 uppercase">Pendapatan Usaha</h3>
                    <Table>
                        <TableBody>
                            {(!reportData?.revenue || reportData.revenue.length === 0) ? (
                                <TableRow><TableCell className="italic text-gray-500">Tidak ada pendapatan</TableCell></TableRow>
                            ) : (
                                reportData.revenue.map((item: any, idx: number) => (
                                    <TableRow key={idx}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                            <TableRow className="font-bold border-t-2">
                                <TableCell>Total Pendapatan</TableCell>
                                <TableCell className="text-right">{formatCurrency(totalRevenue)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* COGS */}
                <div>
                    <h3 className="font-bold bg-slate-100 p-2 uppercase">Harga Pokok Penjualan (HPP)</h3>
                    <Table>
                        <TableBody>
                            {(!reportData?.cogs || reportData.cogs.length === 0) ? (
                                <TableRow><TableCell className="italic text-gray-500">Tidak ada HPP</TableCell></TableRow>
                            ) : (
                                reportData.cogs.map((item: any, idx: number) => (
                                    <TableRow key={idx}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                            <TableRow className="font-bold border-t-2">
                                <TableCell>Total HPP</TableCell>
                                <TableCell className="text-right">{formatCurrency(totalCOGS)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* GROSS PROFIT */}
                <div className="flex justify-between items-center p-2 bg-blue-50 font-bold text-blue-800 border-y border-blue-200">
                    <span>LABA KOTOR</span>
                    <span>{formatCurrency(grossProfit)}</span>
                </div>

                {/* EXPENSES */}
                <div>
                    <h3 className="font-bold bg-slate-100 p-2 uppercase">Beban Operasional</h3>
                    <Table>
                        <TableBody>
                            {(!reportData?.expenses || reportData.expenses.length === 0) ? (
                                <TableRow><TableCell className="italic text-gray-500">Tidak ada beban</TableCell></TableRow>
                            ) : (
                                reportData.expenses.map((item: any, idx: number) => (
                                    <TableRow key={idx}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                            <TableRow className="font-bold border-t-2">
                                <TableCell>Total Beban</TableCell>
                                <TableCell className="text-right">{formatCurrency(totalExpenses)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* OPERATING PROFIT */}
                <div className="flex justify-between items-center p-2 bg-slate-100 font-bold border-y border-slate-300">
                    <span>LABA OPERASIONAL</span>
                    <span>{formatCurrency(operatingProfit)}</span>
                </div>

                {/* OTHER INCOME/EXPENSES */}
                {((reportData?.other_revenue?.length || 0) > 0 || (reportData?.other_expenses?.length || 0) > 0) && (
                    <div>
                        <h3 className="font-bold bg-slate-100 p-2 uppercase">Pendapatan & Beban Lainnya</h3>
                        <Table>
                            <TableBody>
                                {reportData.other_revenue?.map((item: any, idx: number) => (
                                    <TableRow key={`or-${idx}`}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right text-green-600">+{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))}
                                {reportData.other_expenses?.map((item: any, idx: number) => (
                                    <TableRow key={`oe-${idx}`}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right text-red-600">-{formatCurrency(item.amount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* NET PROFIT */}
                <div className="flex justify-between items-center p-4 bg-emerald-100 font-bold text-emerald-900 border border-emerald-300 text-lg rounded-md mt-4">
                    <span>LABA BERSIH (NET PROFIT)</span>
                    <span>{formatCurrency(netProfit)}</span>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
