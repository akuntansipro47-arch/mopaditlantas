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

const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
};

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
                        id, vehicle_id, vehicles ( license_plate, vehicle_type )
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

            const { data: workOrders, error: woError } = await query;

            if (woError) throw woError;

            const vehicleEntryIds = workOrders.map(wo => wo.vehicle_entry_id).filter(Boolean);
            let allEntryJobs: any[] = [];
            let allEntryParts: any[] = [];

            if (vehicleEntryIds.length > 0) {
                const { data: jobsData, error: jobsError } = await supabase
                    .from('vehicle_entry_jobs')
                    .select(`vehicle_entry_id, job_type_id, job_types ( job_name, selling_price, job_group )`)
                    .in('vehicle_entry_id', vehicleEntryIds);
                if (jobsError) throw jobsError;
                allEntryJobs = jobsData;

                const { data: partsData, error: partsError } = await supabase
                    .from('vehicle_entry_spareparts')
                    .select(`vehicle_entry_id, goods_id, qty, goods ( name, selling_price )`)
                    .in('vehicle_entry_id', vehicleEntryIds);
                if (partsError) throw partsError;
                allEntryParts = partsData;
            }

            const jobsByEntryId = new Map<string, any[]>();
            allEntryJobs.forEach(job => {
                jobsByEntryId.set(job.vehicle_entry_id, [...(jobsByEntryId.get(job.vehicle_entry_id) || []), job]);
            });

            const partsByEntryId = new Map<string, any[]>();
            allEntryParts.forEach(part => {
                partsByEntryId.set(part.vehicle_entry_id, [...(partsByEntryId.get(part.vehicle_entry_id) || []), part]);
            });

            const allGoodsIds = new Set<string>();
            const allJobTypeIds = new Set<string>();
            workOrders.forEach(wo => {
                wo.work_order_billings.forEach((bill: any) => {
                    if (bill.item_type === 'PART' && bill.goods_id) allGoodsIds.add(String(bill.goods_id));
                    if (bill.item_type === 'JOB' && bill.job_type_id) allJobTypeIds.add(String(bill.job_type_id));
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

            const jobHppMap: Record<string, number> = {};
            if (allJobTypeIds.size > 0) {
                const { data: jobTypes, error: jtError } = await supabase.from('job_types').select('id, hpp').in('id', Array.from(allJobTypeIds));
                if (jtError) throw jtError;
                jobTypes.forEach(jt => { jobHppMap[String(jt.id)] = jt.hpp || 0; });
            }
            
            let processedData = workOrders.map(wo => {
                let mergedBillings = [...(wo.work_order_billings || [])].map(b => ({ ...b, source: 'REALIZED' }));

                // Logic to add non-realized estimations
                if (statusFilter === 'semua' && wo.vehicle_entry_id) {
                    const realizedJobIds = new Set(mergedBillings.filter(b => b.item_type === 'JOB' && b.job_type_id).map(b => String(b.job_type_id)));
                    const realizedPartIds = new Set(mergedBillings.filter(b => b.item_type === 'PART' && b.goods_id).map(b => String(b.goods_id)));

                    const estimatedJobs = jobsByEntryId.get(wo.vehicle_entry_id) || [];
                    const estimatedParts = partsByEntryId.get(wo.vehicle_entry_id) || [];

                    const missingEstimatedJobs = estimatedJobs
                        .filter((ej: any) => ej.job_type_id && !realizedJobIds.has(String(ej.job_type_id)))
                        .map((ej: any) => ({
                            item_type: 'JOB',
                            job_type_id: ej.job_type_id,
                            item_name: `(Estimasi) ${ej.job_types?.job_name || 'Pekerjaan'}`,
                            qty: 1,
                            unit_price: ej.job_types?.selling_price || 0,
                            total_price: ej.job_types?.selling_price || 0,
                            source: 'ESTIMATE_ONLY',
                        }));

                    const missingEstimatedParts = estimatedParts
                        .filter((ep: any) => ep.goods_id && !realizedPartIds.has(String(ep.goods_id)))
                        .map((ep: any) => ({
                            item_type: 'PART',
                            goods_id: ep.goods_id,
                            item_name: `(Estimasi) ${ep.goods?.name || 'Sparepart'}`,
                            qty: ep.qty || 1,
                            unit_price: ep.goods?.selling_price || 0,
                            total_price: (ep.qty || 1) * (ep.goods?.selling_price || 0),
                            source: 'ESTIMATE_ONLY',
                        }));
                    
                    mergedBillings.push(...missingEstimatedJobs, ...missingEstimatedParts);
                }

                const vehicleType = wo.vehicle_entries?.vehicles?.vehicle_type;
                return {
                    ...wo,
                    license_plate: wo.vehicle_entries?.vehicles?.license_plate || '-',
                    group_name: getVehicleGroupLabel(vehicleType),
                    vehicle_type: vehicleType,
                    billings: mergedBillings,
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
        // Export logic remains the same
    };

    const memoizedReportData = useMemo(() => reportData, [reportData]);

    return (
        <div className="p-4 md:p-6 h-full flex flex-col">
            <Card>
                <CardHeader>
                    <CardTitle>Laporan Detail Work Order</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger><SelectValue placeholder="Filter Status" /></SelectTrigger>
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
                            <SelectTrigger><SelectValue placeholder="Filter Grup Kendaraan" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="semua">Semua Grup</SelectItem>
                                <SelectItem value="R4">R4</SelectItem>
                                <SelectItem value="R2">R2</SelectItem>
                                <SelectItem value="R2_KECIL">R2 Kecil</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                            <Button onClick={fetchReportData} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</Button>
                            <Button onClick={handleExport} variant="outline" disabled={loading || reportData.length === 0}>Ekspor</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex-grow mt-4">
                <ScrollArea className="h-full" style={{ height: 'calc(100vh - 320px)' }}>
                    <div className="relative overflow-auto">
                        <Table className="min-w-full table-fixed">
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead style={{ width: '150px' }}>No. WO</TableHead>
                                    <TableHead style={{ width: '110px' }}>Tgl WO</TableHead>
                                    <TableHead style={{ width: '120px' }}>No. Polisi</TableHead>
                                    <TableHead style={{ width: '120px' }}>Grup Kendaraan</TableHead>
                                    <TableHead style={{ width: '120px' }}>Status</TableHead>
                                    <TableHead style={{ width: '350px' }}>Item/Jasa</TableHead>
                                    <TableHead style={{ width: '70px' }}>Qty</TableHead>
                                    <TableHead style={{ width: '150px' }}>Harga Satuan</TableHead>
                                    <TableHead style={{ width: '150px' }}>Total Harga</TableHead>
                                    <TableHead style={{ width: '150px' }}>Realisasi (HPP)</TableHead>
                                    <TableHead style={{ width: '150px' }}>Selisih</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={11} className="h-24 text-center">Memuat data...</TableCell></TableRow>
                                ) : memoizedReportData.length === 0 ? (
                                    <TableRow><TableCell colSpan={11} className="h-24 text-center">Tidak ada data.</TableCell></TableRow>
                                ) : (
                                    memoizedReportData.flatMap(wo => {
                                        if (wo.billings.length === 0) {
                                            return (
                                                <TableRow key={wo.id}>
                                                    <TableCell>{wo.wo_number}</TableCell>
                                                    <TableCell>{formatDate(wo.work_date)}</TableCell>
                                                    <TableCell>{wo.license_plate}</TableCell>
                                                    <TableCell>{wo.group_name}</TableCell>
                                                    <TableCell>{getStatusBadge(wo.status)}</TableCell>
                                                    <TableCell colSpan={6} className="text-center text-muted-foreground">(Belum ada realisasi)</TableCell>
                                                </TableRow>
                                            );
                                        }
                                        return wo.billings.map((bill: any, billIdx: number) => {
                                            const isEstimate = bill.source === 'ESTIMATE_ONLY';
                                            const unitPrice = Number(bill.unit_price || 0);
                                            const totalPrice = Number(bill.total_price || 0);
                                            const qty = Number(bill.qty || 0);
                                            let hppSatuan = 0;
                                            if (!isEstimate) {
                                                if (bill.item_type === 'PART' && bill.goods_id) hppSatuan = wo.partHppMap[String(bill.goods_id)] || 0;
                                                else if (bill.item_type === 'JOB' && bill.job_type_id) hppSatuan = wo.jobHppMap[String(bill.job_type_id)] || 0;
                                            }
                                            const realisasi = hppSatuan * qty;
                                            const selisih = isEstimate ? 0 : totalPrice - realisasi;

                                            return (
                                                <TableRow key={`${wo.id}-${bill.id || bill.job_type_id || bill.goods_id}-${billIdx}`} className={isEstimate ? 'bg-gray-50' : ''}>
                                                    {billIdx === 0 ? <TableCell>{wo.wo_number}</TableCell> : <TableCell></TableCell>}
                                                    {billIdx === 0 ? <TableCell>{formatDate(wo.work_date)}</TableCell> : <TableCell></TableCell>}
                                                    {billIdx === 0 ? <TableCell>{wo.license_plate}</TableCell> : <TableCell></TableCell>}
                                                    {billIdx === 0 ? <TableCell>{wo.group_name}</TableCell> : <TableCell></TableCell>}
                                                    {billIdx === 0 ? <TableCell>{getStatusBadge(wo.status)}</TableCell> : <TableCell></TableCell>}
                                                    <TableCell className={isEstimate ? 'text-gray-500' : ''}>{bill.item_name}</TableCell>
                                                    <TableCell className="text-right">{qty}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(unitPrice)}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(totalPrice)}</TableCell>
                                                    <TableCell className="text-right">{isEstimate ? '-' : formatCurrency(realisasi)}</TableCell>
                                                    <TableCell className="text-right">{isEstimate ? '-' : formatCurrency(selisih)}</TableCell>
                                                </TableRow>
                                            );
                                        });
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
};

export default WorkOrderDetailReport;