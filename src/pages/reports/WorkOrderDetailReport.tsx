import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from "@/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-picker-with-range";
import { DateRange } from "react-day-picker";
import { addDays, format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from 'xlsx';

type ReportData = {
    work_order_id: string;
    work_order_date: string;
    vehicle_plat_number: string;
    vehicle_type_name: string;
    customer_name: string;
    total_billing: number;
    total_hpp: number;
    profit: number;
    items: {
        item_type: 'PART' | 'JOB';
        item_name: string;
        qty: number;
        unit_price: number;
        total_price: number;
        hpp: number;
        profit: number;
        source: 'REALIZED' | 'ESTIMATE_ONLY';
    }[];
};

const WorkOrderDetailReport = () => {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: addDays(new Date(), -30),
        to: new Date(),
    });
    const [statusFilter, setStatusFilter] = useState('semua');
    const [vehicleGroupFilter, setVehicleGroupFilter] = useState('semua');
    const [reportData, setReportData] = useState<ReportData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchReportData = async () => {
        if (!dateRange?.from || !dateRange?.to) {
            setError("Silakan pilih rentang tanggal.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const startDate = format(dateRange.from, 'yyyy-MM-dd');
            const endDate = format(dateRange.to, 'yyyy-MM-dd');

            // 1. Get base Work Orders
            let woQuery = supabase
                .from('work_orders')
                .select('id, wo_number, created_at, vehicle_entry_id')
                .gte('created_at', startDate)
                .lte('created_at', endDate)
                .order('created_at', { ascending: false });

            if (statusFilter !== 'semua') {
                woQuery = woQuery.eq('status', statusFilter);
            }
            
            const { data: workOrders, error: woError } = await woQuery;
            if (woError) throw woError;
            if (!workOrders || workOrders.length === 0) {
                setReportData([]);
                setLoading(false);
                return;
            }

            const workOrderIds = workOrders.map(wo => wo.id);
            
            // 2. Fetch all related data in separate, flat queries based on actual schema
            const { data: vehicleEntries, error: veError } = await supabase.from('vehicle_entries').select('id, vehicle_id, service_group').in('id', workOrders.map(wo => wo.vehicle_entry_id).filter(Boolean));
            if (veError) throw veError;
            
            // CORRECTED: Select owner_name directly, remove customer_id
            const { data: vehicles, error: vError } = await supabase.from('vehicles').select('id, license_plate, vehicle_type, owner_name').in('id', vehicleEntries.map(ve => ve.vehicle_id).filter(Boolean));
            if (vError) throw vError;

            // REMOVED: No longer need to fetch from 'customers' table

            const { data: goodsIssues, error: giError } = await supabase.from('goods_issues').select('id, work_order_id').in('work_order_id', workOrderIds);
            if (giError) throw giError;

            const { data: goodsIssueDetails, error: gidError } = await supabase.from('goods_issue_details').select('*, goods(id, name)').in('goods_issue_id', goodsIssues.map(gi => gi.id));
            if (gidError) throw gidError;

            const { data: serviceBillings, error: sbError } = await supabase.from('service_billings').select('id, work_order_id').in('work_order_id', workOrderIds);
            if (sbError) throw sbError;

            const { data: serviceBillingDetails, error: sbdError } = await supabase.from('service_billing_details').select('*, job_types(id, job_name)').in('service_billing_id', serviceBillings.map(sb => sb.id));
            if (sbdError) throw sbdError;

            const allGoodsIds = goodsIssueDetails.map(d => d.goods?.id).filter(Boolean);
            const allJobTypeIds = serviceBillingDetails.map(d => d.job_types?.id).filter(Boolean);

            const { data: poItems, error: poError } = await supabase.from('purchase_order_items').select('goods_id, price').in('goods_id', allGoodsIds).order('created_at', { ascending: false });
            if (poError) throw poError;

            const { data: jobsHpp, error: jobsHppError } = await supabase.from('job_types').select('id, hpp').in('id', allJobTypeIds);
            if(jobsHppError) throw jobsHppError;

            // Estimation Data
            let allEntryJobs: any[] = [], allEntryParts: any[] = [];
            if (statusFilter === 'semua') {
                const { data: jobsData, error: jobsError } = await supabase.from('vehicle_entry_jobs').select('*, job_types(job_name, selling_price)').in('vehicle_entry_id', workOrders.map(wo => wo.vehicle_entry_id).filter(Boolean));
                if (jobsError) throw jobsError;
                allEntryJobs = jobsData || [];

                const { data: partsData, error: partsError } = await supabase.from('vehicle_entry_spareparts').select('*').in('vehicle_entry_id', workOrders.map(wo => wo.vehicle_entry_id).filter(Boolean));
                if (partsError) throw partsError;
                allEntryParts = partsData || [];
            }

            // 3. Create Maps for efficient data stitching
            const vehicleEntryMap = new Map(vehicleEntries.map(ve => [ve.id, ve]));
            const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
            // REMOVED: customerMap is no longer needed
            const detailsByIssueId = goodsIssueDetails.reduce((acc, detail) => {
                (acc[detail.goods_issue_id] = acc[detail.goods_issue_id] || []).push(detail);
                return acc;
            }, {} as Record<string, typeof goodsIssueDetails>);
            const detailsByBillingId = serviceBillingDetails.reduce((acc, detail) => {
                (acc[detail.service_billing_id] = acc[detail.service_billing_id] || []).push(detail);
                return acc;
            }, {} as Record<string, typeof serviceBillingDetails>);
            const hppGoodsMap = new Map<string, number>();
            poItems.forEach(item => { if (!hppGoodsMap.has(item.goods_id)) hppGoodsMap.set(item.goods_id, item.price || 0); });
            const hppJobsMap = new Map(jobsHpp.map(j => [j.id, j.hpp || 0]));
            const jobsByEntryId = allEntryJobs.reduce((acc, job) => { (acc[job.vehicle_entry_id] = acc[job.vehicle_entry_id] || []).push(job); return acc; }, {});
            const partsByEntryId = allEntryParts.reduce((acc, part) => { (acc[part.vehicle_entry_id] = acc[part.vehicle_entry_id] || []).push(part); return acc; }, {});

            // 4. Process and combine data
            const processedData = workOrders.map(wo => {
                const vehicleEntry = wo.vehicle_entry_id ? vehicleEntryMap.get(wo.vehicle_entry_id) : null;
                const vehicle = vehicleEntry ? vehicleMap.get(vehicleEntry.vehicle_id) : null;
                // CORRECTED: Get customer name directly from vehicle.owner_name
                const customerName = vehicle?.owner_name || 'N/A';

                const woGoodsIssues = goodsIssues.filter(gi => gi.work_order_id === wo.id);
                const woServiceBillings = serviceBillings.filter(sb => sb.work_order_id === wo.id);

                const realizedParts = woGoodsIssues.flatMap(gi => (detailsByIssueId[gi.id] || []).map(gid => {
                    const hpp = hppGoodsMap.get(gid.goods?.id) || 0;
                    const total_price = (gid.qty || 0) * (gid.unit_price || 0);
                    const total_hpp = (gid.qty || 0) * hpp;
                    return { item_type: 'PART' as const, item_name: gid.goods?.name || 'N/A', qty: gid.qty || 0, unit_price: gid.unit_price || 0, total_price, hpp: total_hpp, profit: total_price - total_hpp, source: 'REALIZED' as const };
                }));

                const realizedJobs = woServiceBillings.flatMap(sb => (detailsByBillingId[sb.id] || []).map(sbd => {
                    const hpp = hppJobsMap.get(sbd.job_types?.id) || 0;
                    const total_price = (sbd.qty || 0) * (sbd.unit_price || 0);
                    const total_hpp = (sbd.qty || 0) * hpp;
                    return { item_type: 'JOB' as const, item_name: sbd.job_types?.job_name || 'N/A', qty: sbd.qty || 0, unit_price: sbd.unit_price || 0, total_price, hpp: total_hpp, profit: total_price - total_hpp, source: 'REALIZED' as const };
                }));

                let mergedBillings = [...realizedParts, ...realizedJobs];

                if (statusFilter === 'semua' && wo.vehicle_entry_id) {
                    const estimatedJobs = (jobsByEntryId[wo.vehicle_entry_id] || []).map((ej: any) => ({ item_type: 'JOB' as const, item_name: `(Estimasi) ${ej.job_types?.job_name || 'Pekerjaan'}`, qty: 1, unit_price: ej.job_types?.selling_price || 0, total_price: ej.job_types?.selling_price || 0, hpp: 0, profit: ej.job_types?.selling_price || 0, source: 'ESTIMATE_ONLY' as const }));
                    const estimatedParts = (partsByEntryId[wo.vehicle_entry_id] || []).map((ep: any) => ({ item_type: 'PART' as const, item_name: `(Estimasi) ${ep.item_name || 'Sparepart'}`, qty: ep.qty || 1, unit_price: ep.estimated_price || 0, total_price: (ep.qty || 1) * (ep.estimated_price || 0), hpp: 0, profit: (ep.qty || 1) * (ep.estimated_price || 0), source: 'ESTIMATE_ONLY' as const }));
                    mergedBillings.push(...estimatedJobs, ...estimatedParts);
                }

                const total_billing = mergedBillings.reduce((sum, item) => sum + item.total_price, 0);
                const total_hpp = mergedBillings.reduce((sum, item) => sum + item.hpp, 0);

                return {
                    work_order_id: wo.wo_number,
                    work_order_date: format(new Date(wo.created_at), 'dd-MM-yyyy'),
                    vehicle_plat_number: vehicle?.license_plate || 'N/A',
                    vehicle_type_name: getVehicleGroupLabel(vehicle?.vehicle_type, vehicleEntry?.service_group),
                    customer_name: customerName,
                    total_billing,
                    total_hpp,
                    profit: total_billing - total_hpp,
                    items: mergedBillings,
                };
            });

            setReportData(processedData);

        } catch (err: any) {
            console.error("Error fetching report data:", err);
            setError(`Gagal mengambil data laporan: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const getVehicleGroupLabel = (vehicleType: string | null | undefined, serviceGroup: string | null | undefined): string => {
        if (vehicleType === 'mobil') {
            return serviceGroup === 'pribadi' ? 'Mobil Pribadi' : 'Mobil Travel';
        } else if (vehicleType === 'motor') {
            return 'Motor';
        }
        return 'Lainnya';
    };

    const filteredReportData = useMemo(() => {
        if (vehicleGroupFilter === 'semua') {
            return reportData;
        }
        return reportData.filter(d => d.vehicle_type_name === vehicleGroupFilter);
    }, [reportData, vehicleGroupFilter]);

    const handleExport = () => {
        const dataToExport = filteredReportData.flatMap(wo => 
            wo.items.map(item => ({
                'No WO': wo.work_order_id,
                'Tanggal': wo.work_order_date,
                'No Polisi': wo.vehicle_plat_number,
                'Grup Kendaraan': wo.vehicle_type_name,
                'Customer': wo.customer_name,
                'Tipe Item': item.source === 'ESTIMATE_ONLY' ? 'ESTIMASI' : (item.item_type === 'JOB' ? 'Jasa' : 'Sparepart'),
                'Nama Item': item.item_name,
                'Qty': item.qty,
                'Harga Satuan': item.unit_price,
                'Total Harga': item.total_price,
                'HPP': item.hpp,
                'Profit': item.profit,
            }))
        );

        const grandTotal = {
            'No WO': 'GRAND TOTAL',
            'Total Harga': filteredReportData.reduce((sum, wo) => sum + wo.total_billing, 0),
            'HPP': filteredReportData.reduce((sum, wo) => sum + wo.total_hpp, 0),
            'Profit': filteredReportData.reduce((sum, wo) => sum + wo.profit, 0),
        };

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        XLSX.utils.sheet_add_json(worksheet, [grandTotal], { origin: -1, skipHeader: true });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Detail WO");
        XLSX.writeFile(workbook, "Laporan_Detail_WO.xlsx");
    };

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Laporan Detail Work Order</h1>
            <div className="flex flex-wrap gap-4 mb-4 p-4 border rounded-md">
                <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="semua">Semua Status</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={vehicleGroupFilter} onValueChange={setVehicleGroupFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter Grup Kendaraan" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="semua">Semua Grup</SelectItem>
                        <SelectItem value="Mobil Pribadi">Mobil Pribadi</SelectItem>
                        <SelectItem value="Mobil Travel">Mobil Travel</SelectItem>
                        <SelectItem value="Motor">Motor</SelectItem>
                    </SelectContent>
                </Select>
                <Button onClick={fetchReportData} disabled={loading}>
                    {loading ? 'Memuat...' : 'Tampilkan Laporan'}
                </Button>
                <Button onClick={handleExport} disabled={reportData.length === 0}>
                    Export ke Excel
                </Button>
            </div>

            {error && <p className="text-red-500">{error}</p>}

            <ScrollArea style={{ height: '60vh', width: '100%' }}>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[150px]">No. WO</TableHead>
                                <TableHead className="min-w-[120px]">Tanggal</TableHead>
                                <TableHead className="min-w-[120px]">No. Polisi</TableHead>
                                <TableHead className="min-w-[150px]">Grup Kendaraan</TableHead>
                                <TableHead className="min-w-[200px]">Customer</TableHead>
                                <TableHead className="min-w-[250px]">Nama Item</TableHead>
                                <TableHead className="text-right min-w-[80px]">Qty</TableHead>
                                <TableHead className="text-right min-w-[120px]">Harga Satuan</TableHead>
                                <TableHead className="text-right min-w-[120px]">Total</TableHead>
                                <TableHead className="text-right min-w-[120px]">HPP</TableHead>
                                <TableHead className="text-right min-w-[120px]">Profit</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredReportData.length > 0 ? (
                                filteredReportData.map((wo) => (
                                    <>
                                        {wo.items.map((item, itemIndex) => (
                                            <TableRow key={`${wo.work_order_id}-${itemIndex}`} className={item.source === 'ESTIMATE_ONLY' ? 'bg-gray-100' : ''}>
                                                {itemIndex === 0 ? (
                                                    <>
                                                        <TableCell rowSpan={wo.items.length} className="font-semibold align-top border-b">{wo.work_order_id}</TableCell>
                                                        <TableCell rowSpan={wo.items.length} className="align-top border-b">{wo.work_order_date}</TableCell>
                                                        <TableCell rowSpan={wo.items.length} className="align-top border-b">{wo.vehicle_plat_number}</TableCell>
                                                        <TableCell rowSpan={wo.items.length} className="align-top border-b">{wo.vehicle_type_name}</TableCell>
                                                        <TableCell rowSpan={wo.items.length} className="align-top border-b">{wo.customer_name}</TableCell>
                                                    </>
                                                ) : null}
                                                <TableCell>{item.item_name}</TableCell>
                                                <TableCell className="text-right">{item.qty}</TableCell>
                                                <TableCell className="text-right">{item.unit_price.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{item.total_price.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{item.hpp.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{item.profit.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-bold bg-slate-50">
                                            <TableCell colSpan={8} className="text-right">Subtotal</TableCell>
                                            <TableCell className="text-right">{wo.total_billing.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{wo.total_hpp.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{wo.profit.toLocaleString()}</TableCell>
                                        </TableRow>
                                    </>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={11} className="text-center">Tidak ada data untuk ditampilkan.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </ScrollArea>
        </div>
    );
};

export default WorkOrderDetailReport;
