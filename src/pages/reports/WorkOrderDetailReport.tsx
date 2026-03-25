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
            vehicles (license_plate, brand_type, vehicle_type)
          ),
          mechanics (name),
          work_order_billings (
            item_type,
            item_name,
            qty,
            unit_price,
            total_price,
            job_group
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
      
      console.log("Fetched WOs for Detail Report:", wos?.length, "Range:", dateRange);
      setData(wos || []);

    } catch (error: any) {
      console.error('Error fetching WO Detail report:', error);
      setErrorMsg(error.message || 'Gagal mengambil data.');
    } finally {
      setLoading(false);
    }
  }

  const getVehicleGroupLabel = (wo: any) => {
      const sg = String(wo.vehicle_entries?.service_group || '').toUpperCase();
      if (sg.includes('R2_KECIL') || sg.includes('R2 KECIL') || sg.includes('KECIL')) return 'R2 Kecil';
      if (sg.includes('R4')) return 'R4';
      if (sg.includes('R2')) return 'R2';

      const hasServiceItem = (wo.work_order_billings || []).some((b: any) => {
          const name = (b.item_name || '').toUpperCase();
          return name.includes('TUNE UP') || name.includes('SERVICE') || name.includes('SERVIS');
      });

      const vType = String(wo.vehicle_entries?.vehicles?.vehicle_type || '').toUpperCase();
      if (vType.includes('R2_KECIL') || vType.includes('R2 KECIL') || vType.includes('KECIL')) return 'R2 Kecil';
      if (vType === 'R4' || vType.includes('R4') || vType.includes('MOBIL')) return hasServiceItem ? 'R4' : 'R4';
      if (vType === 'R2' || vType.includes('R2') || vType.includes('MOTOR')) return hasServiceItem ? 'R2' : 'R2';
      return hasServiceItem ? '-' : '-';
  };

  const exportToExcel = () => {
    // Flatten data for Excel
    const rows: any[] = [];
    
    data.forEach(wo => {
        const groupName = getVehicleGroupLabel(wo);

        // If WO has no billings, still show one row
        if (!wo.work_order_billings || wo.work_order_billings.length === 0) {
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
            wo.work_order_billings.forEach((bill: any) => {
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
          <p className="text-xs text-blue-600 font-medium mt-1">Total Data: {data.length} WO ditemukan</p>
          {errorMsg && (
            <div className="mt-2 p-3 bg-red-100 border border-red-200 text-red-700 rounded-md">
                Error: {errorMsg}
            </div>
          )}
        </div>
        <div className="flex gap-2">
           <Button variant="outline" onClick={exportToExcel} disabled={data.length === 0}>
             <Download className="mr-2 h-4 w-4" /> Export Excel
           </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-md border">
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
                        ) : data.length === 0 ? (
                            <TableRow><TableCell colSpan={9} className="text-center h-32 text-muted-foreground">Tidak ada data ditemukan.</TableCell></TableRow>
                        ) : (
                            data.map((wo) => {
                                const billings = wo.work_order_billings || [];
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
