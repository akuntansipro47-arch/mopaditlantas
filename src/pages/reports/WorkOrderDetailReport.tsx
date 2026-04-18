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

            let query = supabase
                .from('work_orders')
                .select(`
                    id,
                    work_order_number,
                    created_at,
                    vehicle_entry_id,
                    vehicle_entries (
                        id,
                        vehicles (
                            plat_number,
                            vehicle_type,
                            service_group,
                            customers ( name )
                        )
                    ),
                    goods_issues (
                        id,
                        goods_issue_details (
                            qty,
                            unit_price,
                            goods ( id, name )
                        )
                    ),
                    service_billings (
                        id,
                        service_billing_details (
                            qty,
                            unit_price,
                            job_types ( id, job_name )
                        )
                    )
                `)
                .gte('created_at', startDate)
                .lte('created_at', endDate)
                .order('created_at', { ascending: false });

            if (statusFilter !== 'semua') {
                query = query.eq('status', statusFilter);
            }

            const { data: workOrders, error: woError } = await query;
            if (woError) throw woError;

            const vehicleEntryIds = workOrders.map(wo => wo.vehicle_entry_id).filter(id => id);
            let allEntryJobs: any[] = [];
            let allEntryParts: any[] = [];

            if (statusFilter === 'semua' && vehicleEntryIds.length > 0) {
                const { data: jobsData, error: jobsError } = await supabase
                    .from('vehicle_entry_jobs')
                    .select(`vehicle_entry_id, job_type_id, job_types ( job_name, selling_price )`)
                    .in('vehicle_entry_id', vehicleEntryIds);
                if (jobsError) throw jobsError;
                allEntryJobs = jobsData;

                const { data: partsData, error: partsError } = await supabase
                    .from('vehicle_entry_spareparts')
                    .select(`vehicle_entry_id, job_type_id, item_name, qty, estimated_price`)
                    .in('vehicle_entry_id', vehicleEntryIds);
                if (partsError) throw partsError;
                allEntryParts = partsData || [];
            }

            const jobsByEntryId = new Map<string, any[]>();
            allEntryJobs.forEach(job => {
                if (!jobsByEntryId.has(job.vehicle_entry_id)) {
                    jobsByEntryId.set(job.vehicle_entry_id, []);
                }
                jobsByEntryId.get(job.vehicle_entry_id)!.push(job);
            });

            const partsByEntryId = new Map<string, any[]>();
            allEntryParts.forEach(part => {
                if (!partsByEntryId.has(part.vehicle_entry_id)) {
                    partsByEntryId.set(part.vehicle_entry_id, []);
                }
                partsByEntryId.get(part.vehicle_entry_id)!.push(part);
            });

            const goodsIds = new Set<string>();
            const jobTypeIds = new Set<string>();

            workOrders.forEach(wo => {
                wo.goods_issues.forEach(gi => {
                    gi.goods_issue_details.forEach(gid => {
                        if (gid.goods?.id) goodsIds.add(gid.goods.id);
                    });
                });
                wo.service_billings.forEach(sb => {
                    sb.service_billing_details.forEach(sbd => {
                        if (sbd.job_types?.id) jobTypeIds.add(sbd.job_types.id);
                    });
                });
            });

            const hppGoodsMap = new Map<string, number>();
            if (goodsIds.size > 0) {
                const { data: poItems, error: poError } = await supabase
                    .from('purchase_order_items')
                    .select('goods_id, price')
                    .in('goods_id', Array.from(goodsIds))
                    .order('created_at', { ascending: false });
                if (poError) throw poError;

                poItems.forEach(item => {
                    if (!hppGoodsMap.has(item.goods_id)) {
                        hppGoodsMap.set(item.goods_id, item.price || 0);
                    }
                });
            }

            const hppJobsMap = new Map<string, number>();
            if (jobTypeIds.size > 0) {
                const { data: jobs, error: jobsError } = await supabase
                    .from('job_types')
                    .select('id, hpp')
                    .in('id', Array.from(jobTypeIds));
                if (jobsError) throw jobsError;
                jobs.forEach(job => hppJobsMap.set(job.id, job.hpp || 0));
            }

            const processedData = workOrders.map(wo => {
                const realizedPartIds = new Set<string>();
                const realizedJobIds = new Set<string>();

                const realizedParts = wo.goods_issues.flatMap(gi =>
                    gi.goods_issue_details.map(gid => {
                        if (gid.goods?.id) realizedPartIds.add(gid.goods.id);
                        const hpp = hppGoodsMap.get(gid.goods?.id) || 0;
                        const total_price = (gid.qty || 0) * (gid.unit_price || 0);
                        const total_hpp = (gid.qty || 0) * hpp;
                        return {
                            item_type: 'PART' as const,
                            item_name: gid.goods?.name || 'N/A',
                            qty: gid.qty || 0,
                            unit_price: gid.unit_price || 0,
                            total_price: total_price,
                            hpp: total_hpp,
                            profit: total_price - total_hpp,
                            source: 'REALIZED' as const,
                        };
                    })
                );

                const realizedJobs = wo.service_billings.flatMap(sb =>
                    sb.service_billing_details.map(sbd => {
                        if (sbd.job_types?.id) realizedJobIds.add(sbd.job_types.id);
                        const hpp = hppJobsMap.get(sbd.job_types?.id) || 0;
                        const total_price = (sbd.qty || 0) * (sbd.unit_price || 0);
                        const total_hpp = (sbd.qty || 0) * hpp;
                        return {
                            item_type: 'JOB' as const,
                            item_name: sbd.job_types?.job_name || 'N/A',
                            qty: sbd.qty || 0,
                            unit_price: sbd.unit_price || 0,
                            total_price: total_price,
                            hpp: total_hpp,
                            profit: total_price - total_hpp,
                            source: 'REALIZED' as const,
                        };
                    })
                );

                let mergedBillings = [...realizedParts, ...realizedJobs];

                if (statusFilter === 'semua' && wo.vehicle_entry_id) {
                    const estimatedJobs = jobsByEntryId.get(wo.vehicle_entry_id) || [];
                    const estimatedParts = partsByEntryId.get(wo.vehicle_entry_id) || [];

                    const allEstimatedJobs = estimatedJobs
                        .map((ej: any) => ({
                            item_type: 'JOB' as const,
                            job_type_id: ej.job_type_id,
                            item_name: `(Estimasi) ${ej.job_types?.job_name || 'Pekerjaan Tanpa Nama'}`,
                            qty: 1,
                            unit_price: ej.job_types?.selling_price || 0,
                            total_price: ej.job_types?.selling_price || 0,
                            hpp: 0,
                            profit: ej.job_types?.selling_price || 0,
                            source: 'ESTIMATE_ONLY' as const,
                        }));

                    const allEstimatedParts = estimatedParts
                        .map((ep: any) => ({
                            item_type: 'PART' as const,
                            goods_id: null,
                            item_name: `(Estimasi) ${ep.item_name || 'Sparepart Tanpa Nama'}`,
                            qty: ep.qty || 1,
                            unit_price: ep.estimated_price || 0,
                            total_price: (ep.qty || 1) * (ep.estimated_price || 0),
                            hpp: 0,
                            profit: (ep.qty || 1) * (ep.estimated_price || 0),
                            source: 'ESTIMATE_ONLY' as const,
                        }));
                    
                    mergedBillings.push(...allEstimatedJobs, ...allEstimatedParts);
                }

                const vehicleType = wo.vehicle_entries?.vehicles?.vehicle_type;
                const serviceGroup = wo.vehicle_entries?.vehicles?.service_group;
                
                const total_billing = mergedBillings.reduce((sum, item) => sum + item.total_price, 0);
                const total_hpp = mergedBillings.reduce((sum, item) => sum + item.hpp, 0);

                return {
                    work_order_id: wo.work_order_number,
                    work_order_date: format(new Date(wo.created_at), 'dd-MM-yyyy'),
                    vehicle_plat_number: wo.vehicle_entries?.vehicles?.plat_number || 'N/A',
                    vehicle_type_name: getVehicleGroupLabel(vehicleType, serviceGroup),
                    customer_name: wo.vehicle_entries?.vehicles?.customers?.name || 'N/A',
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
                                filteredReportData.map((wo, woIndex) => (
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
