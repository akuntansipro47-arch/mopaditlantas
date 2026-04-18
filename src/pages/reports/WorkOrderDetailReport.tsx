import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePickerWithRange as DateRangePicker } from "@/components/ui/date-picker-with-range";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import * as XLSX from 'xlsx';
import { ScrollArea } from '@/components/ui/scroll-area';

// Helper function to format currency
const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
};

// Helper function to format date
const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return format(date, 'dd MMM yyyy');
    } catch (error) {
        console.error("Invalid date format:", dateString, error);
        return 'Invalid Date';
    }
};

// CORRECT LOGIC: Found in other report files
const getVehicleGroupLabel = (vehicleType: string | null | undefined) => {
    const vt = String(vehicleType || '').toUpperCase();
    if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
    if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
    if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
    return 'Umum';
};

const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { text: string; className: string } } = {
        OPEN: { text: 'Open', className: 'bg-blue-100 text-blue-800' },
        IN_PROGRESS: { text: 'In Progress', className: 'bg-yellow-100 text-yellow-800' },
        COMPLETED: { text: 'Completed', className: 'bg-green-100 text-green-800' },
        INVOICED: { text: 'Invoiced', className: 'bg-purple-100 text-purple-800' },
        PAID: { text: 'Paid', className: 'bg-pink-100 text-pink-800' },
        CANCELLED: { text: 'Cancelled', className: 'bg-gray-100 text-gray-800' },
    };
    const { text, className } = statusMap[status] || { text: status, className: 'bg-gray-100 text-gray-800' };
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${className}`}>{text}</span>;
};

const WorkOrderDetailReport = () => {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 29),
        to: new Date(),
    });
    const [statusFilter, setStatusFilter] = useState<string>('semua');
    const [vehicleGroupFilter, setVehicleGroupFilter] = useState<string>('semua');
    const [reportData, setReportData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchReportData = async () => {
        if (!dateRange?.from || !dateRange?.to) {
            toast.error("Silakan pilih rentang tanggal.");
            return;
        }

        setLoading(true);
        try {
            const fromDate = format(dateRange.from, 'yyyy-MM-dd');
            const toDate = format(dateRange.to, 'yyyy-MM-dd');

            let query = supabase
                .from('work_orders')
                .select(`
                    id,
                    wo_number,
                    work_date,
                    status,
                    vehicle_entry_id,
                    vehicle_entries (
                        id,
                        vehicle_id,
                        vehicles (
                            license_plate,
                            vehicle_type
                        )
                    ),
                    work_order_billings (
                        id,
                        item_type,
                        item_name,
                        qty,
                        unit_price,
                        total_price,
                        job_type_id,
                        goods_id
                    )
                `)
                .gte('work_date', fromDate)
                .lte('work_date', toDate)
                .order('work_date', { ascending: false });

            if (statusFilter !== 'semua') {
                query = query.eq('status', statusFilter);
            }
            
            if (vehicleGroupFilter !== 'semua') {
                // This filter is now applied client-side after fetching
            }

            const { data: workOrders, error: woError } = await query;

            if (woError) throw woError;

            const allGoodsIds = new Set<string>();
            const allJobTypeIds = new Set<string>();
            workOrders.forEach(wo => {
                wo.work_order_billings.forEach((bill: any) => {
                    if (bill.item_type === 'PART' && bill.goods_id) {
                        allGoodsIds.add(String(bill.goods_id));
                    }
                    if (bill.item_type === 'JOB' && bill.job_type_id) {
                        allJobTypeIds.add(String(bill.job_type_id));
                    }
                });
            });

            const partHppMap: Record<string, number> = {};
            if (allGoodsIds.size > 0) {
                const { data: poItems, error: poError } = await supabase
                    .from('purchase_order_items')
                    .select('goods_id, unit_price, created_at')
                    .in('goods_id', Array.from(allGoodsIds))
                    .order('created_at', { ascending: false });

                if (poError) throw poError;
                
                if (poItems) {
                    poItems.forEach(item => {
                        if (item.goods_id && partHppMap[item.goods_id] === undefined) {
                            partHppMap[item.goods_id] = item.unit_price || 0;
                        }
                    });
                }
            }

            const { data: jobTypes, error: jtError } = await supabase
                .from('job_types')
                .select('id, capital_price')
                .in('id', Array.from(allJobTypeIds));

            if (jtError) throw jtError;

            const jobHppMap: { [key: string]: number } = {};
            jobTypes.forEach(jt => {
                jobHppMap[String(jt.id)] = jt.capital_price || 0;
            });
            
            let processedData = workOrders.map(wo => {
                const vehicleType = wo.vehicle_entries?.vehicles?.vehicle_type;
                return {
                    ...wo,
                    license_plate: wo.vehicle_entries?.vehicles?.license_plate || '-',
                    group_name: getVehicleGroupLabel(vehicleType),
                    vehicle_type: vehicleType,
                    billings: [...(wo.work_order_billings || [])],
                    partHppMap,
                    jobHppMap,
                };
            });

            if (vehicleGroupFilter !== 'semua') {
                processedData = processedData.filter(wo => wo.vehicle_type === vehicleGroupFilter);
            }

            setReportData(processedData);

        } catch (error: any) {
            console.error("Error fetching report data:", error);
            toast.error("Gagal mengambil data laporan: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        if (reportData.length === 0) {
            toast.info("Tidak ada data untuk diekspor.");
            return;
        }
    
        const wb = XLSX.utils.book_new();
        const ws_data: any[][] = [];
    
        ws_data.push([ "Laporan Detail Work Order" ]);
        ws_data.push([ `Periode: ${dateRange?.from ? formatDate(dateRange.from.toISOString()) : ''} - ${dateRange?.to ? formatDate(dateRange.to.toISOString()) : ''}` ]);
        ws_data.push([]);
    
        ws_data.push([
            "No. WO", "Tgl WO", "No. Polisi", "Grup Kendaraan", "Status",
            "Item/Jasa", "Qty", "Harga Satuan", "Total Harga", "Realisasi (HPP)", "Selisih"
        ]);
    
        reportData.forEach(wo => {
            const { billings, partHppMap, jobHppMap } = wo;
    
            if (billings && billings.length > 0) {
                billings.forEach((bill: any, idx: number) => {
                    const unitPrice = Number(bill.unit_price || 0);
                    const totalPrice = Number(bill.total_price || 0);
                    const qty = Number(bill.qty || 0);
                    let hppSatuan = 0;
    
                    if (bill.item_type === 'PART' && bill.goods_id) {
                        hppSatuan = partHppMap[String(bill.goods_id)] || 0;
                    } else if (bill.item_type === 'JOB' && bill.job_type_id) {
                        hppSatuan = jobHppMap[String(bill.job_type_id)] || 0;
                    }
    
                    const realisasi = hppSatuan * qty;
                    const selisih = totalPrice - realisasi;
    
                    const row = [
                        idx === 0 ? wo.wo_number : "",
                        idx === 0 ? formatDate(wo.work_date) : "",
                        idx === 0 ? wo.license_plate : "",
                        idx === 0 ? wo.group_name : "",
                        idx === 0 ? wo.status : "",
                        bill.item_name,
                        bill.qty,
                        unitPrice,
                        totalPrice,
                        realisasi,
                        selisih,
                    ];
                    ws_data.push(row);
                });
            } else {
                ws_data.push([
                    wo.wo_number,
                    formatDate(wo.work_date),
                    wo.license_plate,
                    wo.group_name,
                    wo.status,
                    "(Belum ada realisasi)",
                    "", "", "", "", ""
                ]);
            }
        });
    
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
    
        ws['!cols'] = [
            { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
            { wch: 40 }, { wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
        ];
    
        XLSX.utils.book_append_sheet(wb, ws, "Detail WO");
        XLSX.writeFile(wb, `Laporan_Detail_WO_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    const memoizedReportData = useMemo(() => reportData, [reportData]);

    return (
        <div className="p-4 md:p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Laporan Detail Work Order</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <DateRangePicker
                            date={dateRange}
                            onDateChange={setDateRange}
                        />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="semua">Semua Status</SelectItem>
                                <SelectItem value="OPEN">Open</SelectItem>
                                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                                <SelectItem value="COMPLETED">Completed</SelectItem>
                                <SelectItem value="INVOICED">Invoiced</SelectItem>
                                <SelectItem value="PAID">Paid</SelectItem>
                                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={vehicleGroupFilter} onValueChange={setVehicleGroupFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter Grup Kendaraan" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="semua">Semua Grup</SelectItem>
                                <SelectItem value="R4">R4</SelectItem>
                                <SelectItem value="R2">R2</SelectItem>
                                <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                            <Button onClick={fetchReportData} disabled={loading}>
                                {loading ? 'Memuat...' : 'Tampilkan'}
                            </Button>
                            <Button onClick={handleExport} variant="outline" disabled={loading || reportData.length === 0}>
                                Ekspor ke Excel
                            </Button>
                        </div>
                    </div>

                    <ScrollArea style={{ height: 'calc(100vh - 300px)' }}>
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead>No. WO</TableHead>
                                    <TableHead>Tgl WO</TableHead>
                                    <TableHead>No. Polisi</TableHead>
                                    <TableHead>Grup Kendaraan</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Item/Jasa</TableHead>
                                    <TableHead style={{ minWidth: '50px' }}>Qty</TableHead>
                                    <TableHead>Harga Satuan</TableHead>
                                    <TableHead>Total Harga</TableHead>
                                    <TableHead>Realisasi (HPP)</TableHead>
                                    <TableHead>Selisih</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {memoizedReportData.map(wo => (
                                    <>
                                     <TableRow key={wo.id}>
                                         <TableCell rowSpan={wo.billings.length || 1}>{wo.wo_number}</TableCell>
                                         <TableCell rowSpan={wo.billings.length || 1}>{formatDate(wo.work_date)}</TableCell>
                                         <TableCell rowSpan={wo.billings.length || 1}>{wo.license_plate}</TableCell>
                                         <TableCell rowSpan={wo.billings.length || 1}>{wo.group_name}</TableCell>
                                         <TableCell rowSpan={wo.billings.length || 1}>{getStatusBadge(wo.status)}</TableCell>
                                         {wo.billings.length === 0 && (
                                            <>
                                                <TableCell colSpan={6} className="text-center text-muted-foreground">
                                                    (Belum ada realisasi)
                                                </TableCell>
                                            </>
                                         )}
                                     </TableRow>
                                     {wo.billings.length > 0 && (
                                         wo.billings.map((bill: any, billIdx: number) => {
                                            const unitPrice = Number(bill.unit_price || 0);
                                            const totalPrice = Number(bill.total_price || 0);
                                            const qty = Number(bill.qty || 0);
                                            let hppSatuan = 0;
                            
                                            if (bill.item_type === 'PART' && bill.goods_id) {
                                                hppSatuan = wo.partHppMap[String(bill.goods_id)] || 0;
                                            } else if (bill.item_type === 'JOB' && bill.job_type_id) {
                                                hppSatuan = wo.jobHppMap[String(bill.job_type_id)] || 0;
                                            }
                            
                                            const realisasi = hppSatuan * qty;
                                            const selisih = totalPrice - realisasi;

                                            return (
                                                <TableRow key={`${wo.id}-${bill.id || billIdx}`}>
                                                    {billIdx > 0 && <TableCell colSpan={5}></TableCell>}
                                                    <TableCell>{bill.item_name}</TableCell>
                                                    <TableCell>{bill.qty}</TableCell>
                                                    <TableCell>{formatCurrency(unitPrice)}</TableCell>
                                                    <TableCell>{formatCurrency(totalPrice)}</TableCell>
                                                    <TableCell>{formatCurrency(realisasi)}</TableCell>
                                                    <TableCell>{formatCurrency(selisih)}</TableCell>
                                                </TableRow>
                                            )
                                         })
                                     )}
                                    </>
                                ))}
                                {!loading && reportData.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={11} className="h-24 text-center">
                                            Tidak ada data untuk ditampilkan.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
};

export default WorkOrderDetailReport;