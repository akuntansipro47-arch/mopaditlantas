import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { DateRange } from 'react-day-picker';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

type ReportDataItem = {
    item_type: 'JOB' | 'PART';
    item_name: string;
    qty: number;
    unit_price: number;
    total_price: number;
    hpp: number;
    profit: number;
    source: 'REALIZED' | 'ESTIMATE_ONLY';
};

type ReportData = {
    work_order_id: string;
    work_order_date: string;
    vehicle_plat_number: string;
    vehicle_type_name: string;
    customer_name: string;
    items: ReportDataItem[];
    total_billing: number;
    total_hpp: number;
    profit: number;
};

const WorkOrderDetailReport = () => {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [statusFilter, setStatusFilter] = useState('semua');
    const [vehicleGroupFilter, setVehicleGroupFilter] = useState('semua');
    const [reportData, setReportData] = useState<ReportData[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchReportData = async () => {
        if (!dateRange?.from || !dateRange?.to) {
            toast.error('Silakan pilih rentang tanggal.');
            return;
        }

        setLoading(true);
        setReportData([]);

        try {
            const startDate = format(dateRange.from, 'yyyy-MM-dd');
            const endDate = format(dateRange.to, 'yyyy-MM-dd');

            // 1. Fetch Work Orders
            let woQuery = supabase
                .from('work_orders')
                .select('id, wo_number, created_at, status, vehicle_entry_id')
                .gte('created_at', startDate)
                .lte('created_at', `${endDate} 23:59:59`);

            if (statusFilter !== 'semua') {
                woQuery = woQuery.eq('status', statusFilter.toUpperCase());
            }

            const { data: workOrders, error: woError } = await woQuery;
            if (woError) throw woError;
            if (!workOrders || workOrders.length === 0) {
                setReportData([]);
                return;
            }

            const vehicleEntryIds = [...new Set(workOrders.map(wo => wo.vehicle_entry_id).filter(id => id))];

            // 2. Fetch related data in parallel
            const [
                { data: vehicleEntries, error: veError },
                { data: woBillings, error: wbError },
                { data: goodsIssues, error: giError },
                { data: vehicleEntryJobs, error: vejError },
                { data: vehicleEntryParts, error: vepError }
            ] = await Promise.all([
                supabase.from('vehicle_entries').select('id, vehicle_id, service_group').in('id', vehicleEntryIds),
                supabase.from('work_order_billings').select('*').in('work_order_id', workOrders.map(wo => wo.id)),
                supabase.from('goods_issues').select('id, work_order_id, goods_issue_items(id, quantity, goods_id)').in('work_order_id', workOrders.map(wo => wo.id)),
                supabase.from('vehicle_entry_jobs').select('vehicle_entry_id, job_type_id').in('vehicle_entry_id', vehicleEntryIds),
                supabase.from('vehicle_entry_spareparts').select('vehicle_entry_id, good_id, quantity').in('vehicle_entry_id', vehicleEntryIds)
            ]);

            if (veError || wbError || giError || vejError || vepError) {
                throw veError || wbError || giError || vejError || vepError;
            }

            const vehicleIds = [...new Set(vehicleEntries.map(ve => ve.vehicle_id).filter(id => id))];
            const allGoodsIds = [
                ...new Set(woBillings.map(item => item.goods_id)),
                ...new Set(goodsIssues.flatMap(gi => gi.goods_issue_items.map(item => item.goods_id))),
                ...new Set(vehicleEntryParts.map(item => item.good_id))
            ].filter(id => id);
            const allJobTypeIds = [...new Set(vehicleEntryJobs.map(j => j.job_type_id).filter(id => id))];

            const [
                { data: vehicles, error: vError },
                { data: goods, error: gError },
                { data: jobTypes, error: jtError },
                { data: poItems, error: poError }
            ] = await Promise.all([
                supabase.from('vehicles').select('id, license_plate, owner_name, vehicle_type').in('id', vehicleIds),
                supabase.from('goods').select('id, name, selling_price').in('id', allGoodsIds),
                supabase.from('job_types').select('id, name, hpp, price').in('id', allJobTypeIds),
                supabase.from('purchase_order_items').select('goods_id, unit_price').in('goods_id', allGoodsIds).order('created_at', { ascending: false })
            ]);

            if (vError || gError || jtError || poError) {
                throw vError || gError || jtError || poError;
            }

            // 3. Create Maps for efficient lookup
            const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
            const vehicleEntryMap = new Map(vehicleEntries.map(ve => [ve.id, ve]));
            const goodsMap = new Map(goods.map(g => [g.id, { name: g.name, selling_price: g.selling_price || 0 }]));
            const jobTypeMap = new Map(jobTypes.map(jt => [jt.id, { name: jt.name, hpp: jt.hpp || 0, price: jt.price || 0 }]));
            const hppGoodsMap = new Map<string, number>();
            poItems.forEach(item => { if (!hppGoodsMap.has(item.goods_id)) hppGoodsMap.set(item.goods_id, item.unit_price || 0); });

            // 4. Process Data
            const finalReportData = workOrders.map(wo => {
                const vehicleEntry = vehicleEntryMap.get(wo.vehicle_entry_id);
                const vehicle = vehicleEntry ? vehicleMap.get(vehicleEntry.vehicle_id) : null;
                
                let allItems: ReportDataItem[] = [];

                // a. Get Realized Items from Goods Issues (Parts) and WO Billings (Jobs)
                const realizedItems = new Map<string, ReportDataItem>();

                goodsIssues
                    .filter(gi => gi.work_order_id === wo.id)
                    .flatMap(gi => gi.goods_issue_items)
                    .forEach(item => {
                        const key = `PART-${item.goods_id}`;
                        const existing = realizedItems.get(key);
                        const billingItem = woBillings.find(b => b.goods_id === item.goods_id && b.work_order_id === wo.id);
                        const unit_price = billingItem?.unit_price || 0;
                        
                        if (existing) {
                            existing.qty += item.quantity;
                            existing.total_price += item.quantity * unit_price;
                        } else {
                            realizedItems.set(key, {
                                item_type: 'PART',
                                item_name: goodsMap.get(item.goods_id)?.name || 'Unknown Part',
                                qty: item.quantity,
                                unit_price: unit_price,
                                total_price: item.quantity * unit_price,
                                hpp: hppGoodsMap.get(item.goods_id) || 0,
                                profit: 0, // will calculate later
                                source: 'REALIZED',
                            });
                        }
                    });

                woBillings
                    .filter(b => b.work_order_id === wo.id && b.item_type === 'JOB')
                    .forEach(item => {
                        const key = `JOB-${item.job_type_id}`;
                        realizedItems.set(key, {
                            item_type: 'JOB',
                            item_name: jobTypeMap.get(item.job_type_id)?.name || 'Unknown Job',
                            qty: item.qty,
                            unit_price: item.unit_price,
                            total_price: item.total_price,
                            hpp: jobTypeMap.get(item.job_type_id)?.hpp || 0,
                            profit: 0, // will calculate later
                            source: 'REALIZED',
                        });
                    });
                
                allItems = Array.from(realizedItems.values());

                // b. If status is 'semua', add non-realized estimation items
                if (statusFilter === 'semua') {
                    const estimationJobs = vehicleEntryJobs.filter(j => j.vehicle_entry_id === wo.vehicle_entry_id);
                    const estimationParts = vehicleEntryParts.filter(p => p.vehicle_entry_id === wo.vehicle_entry_id);

                    estimationJobs.forEach(estJob => {
                        if (!realizedItems.has(`JOB-${estJob.job_type_id}`)) {
                            allItems.push({
                                item_type: 'JOB',
                                item_name: jobTypeMap.get(estJob.job_type_id)?.name || 'Unknown Job',
                                qty: 1, // Estimation qty is typically 1 for jobs
                                unit_price: jobTypeMap.get(estJob.job_type_id)?.price || 0,
                                total_price: jobTypeMap.get(estJob.job_type_id)?.price || 0,
                                hpp: jobTypeMap.get(estJob.job_type_id)?.hpp || 0,
                                profit: 0,
                                source: 'ESTIMATE_ONLY',
                            });
                        }
                    });

                    estimationParts.forEach(estPart => {
                        if (!realizedItems.has(`PART-${estPart.good_id}`)) {
                            allItems.push({
                                item_type: 'PART',
                                item_name: goodsMap.get(estPart.good_id)?.name || 'Unknown Part',
                                qty: estPart.quantity,
                                unit_price: goodsMap.get(estPart.good_id)?.selling_price || 0,
                                total_price: (estPart.quantity || 0) * (goodsMap.get(estPart.good_id)?.selling_price || 0),
                                hpp: hppGoodsMap.get(estPart.good_id) || 0,
                                profit: 0,
                                source: 'ESTIMATE_ONLY',
                            });
                        }
                    });
                }

                // c. Calculate totals and profit
                allItems.forEach(item => {
                    item.profit = item.total_price - (item.hpp * item.qty);
                });

                const total_billing = allItems.reduce((sum, item) => sum + item.total_price, 0);
                const total_hpp = allItems.reduce((sum, item) => sum + (item.hpp * item.qty), 0);

                return {
                    work_order_id: wo.wo_number,
                    work_order_date: format(new Date(wo.created_at), 'dd-MM-yyyy'),
                    vehicle_plat_number: vehicle?.license_plate || '-',
                    vehicle_type_name: getVehicleGroupLabel(vehicle?.vehicle_type, vehicleEntry?.service_group),
                    customer_name: vehicle?.owner_name || 'N/A',
                    items: allItems,
                    total_billing,
                    total_hpp,
                    profit: total_billing - total_hpp,
                };
            });

            setReportData(finalReportData);

        } catch (error: any) {
            toast.error('Gagal mengambil data laporan: ' + error.message);
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const getVehicleGroupLabel = (vehicleType: string | null | undefined, serviceGroup: string | null | undefined): string => {
        const sg = String(serviceGroup || '').toUpperCase();
        if (sg.includes('R2_KECIL') || sg.includes('R2 KECIL') || sg.includes('KECIL')) return 'R2 Kecil';
        if (sg.includes('R4')) return 'R4';
        if (sg.includes('R2')) return 'R2';
        
        const vt = String(vehicleType || '').toUpperCase();
        if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
        if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
        if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
        
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
            <div className="flex flex-wrap gap-4 mb-4 p-4 border rounded-md items-center">
                <div className="flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm">
                    <Calendar className="h-4 w-4 text-gray-500 ml-2" />
                    <Input 
                        type="date" 
                        className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" 
                        value={dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : ''} 
                        onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value ? parseISO(e.target.value) : undefined }))}
                    />
                    <span className="text-gray-400 font-medium">-</span>
                    <Input 
                        type="date" 
                        className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" 
                        value={dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : ''}
                        onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value ? parseISO(e.target.value) : undefined }))}
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="semua">Semua (Estimasi vs Realisasi)</SelectItem>
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={vehicleGroupFilter} onValueChange={setVehicleGroupFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter Grup Kendaraan" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="semua">Semua Grup</SelectItem>
                        <SelectItem value="R4">R4</SelectItem>
                        <SelectItem value="R2">R2</SelectItem>
                        <SelectItem value="R2 Kecil">R2 Kecil</SelectItem>
                        <SelectItem value="Lainnya">Lainnya</SelectItem>
                    </SelectContent>
                </Select>
                <Button onClick={fetchReportData} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Tampilkan
                </Button>
                <Button onClick={handleExport} variant="outline" disabled={reportData.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                </Button>
            </div>

            <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                <Table className="w-full">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-[150px]">No. WO</TableHead>
                            <TableHead className="min-w-[120px]">Tanggal</TableHead>
                            <TableHead className="min-w-[120px]">No. Polisi</TableHead>
                            <TableHead className="min-w-[150px]">Grup Kendaraan</TableHead>
                            <TableHead className="min-w-[200px]">Customer</TableHead>
                            <TableHead className="min-w-[150px]">Tipe Item</TableHead>
                            <TableHead className="min-w-[250px]">Nama Item</TableHead>
                            <TableHead className="text-right min-w-[80px]">Qty</TableHead>
                            <TableHead className="text-right min-w-[120px]">Harga Satuan</TableHead>
                            <TableHead className="text-right min-w-[120px]">Total</TableHead>
                            <TableHead className="text-right min-w-[120px]">HPP</TableHead>
                            <TableHead className="text-right min-w-[120px]">Profit</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                             <TableRow>
                                <TableCell colSpan={12} className="text-center h-24">
                                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : filteredReportData.length > 0 ? (
                            filteredReportData.map((wo) => (
                                <>
                                    {wo.items.map((item, itemIndex) => (
                                        <TableRow key={`${wo.work_order_id}-${itemIndex}`} className={item.source === 'ESTIMATE_ONLY' ? 'bg-yellow-50' : ''}>
                                            {itemIndex === 0 ? (
                                                <>
                                                    <TableCell rowSpan={wo.items.length} className="font-semibold align-top border-b">{wo.work_order_id}</TableCell>
                                                    <TableCell rowSpan={wo.items.length} className="align-top border-b">{wo.work_order_date}</TableCell>
                                                    <TableCell rowSpan={wo.items.length} className="align-top border-b">{wo.vehicle_plat_number}</TableCell>
                                                    <TableCell rowSpan={wo.items.length} className="align-top border-b">{wo.vehicle_type_name}</TableCell>
                                                    <TableCell rowSpan={wo.items.length} className="align-top border-b">{wo.customer_name}</TableCell>
                                                </>
                                            ) : null}
                                            <TableCell className={item.source === 'ESTIMATE_ONLY' ? 'text-yellow-700' : ''}>
                                                {item.source === 'ESTIMATE_ONLY' ? '(Estimasi) ' : ''}{item.item_type === 'JOB' ? 'Jasa' : 'Sparepart'}
                                            </TableCell>
                                            <TableCell>{item.item_name}</TableCell>
                                            <TableCell className="text-right">{item.qty}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(item.unit_price)}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(item.total_price)}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(item.hpp * item.qty)}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(item.profit)}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-gray-200 font-bold">
                                        <TableCell colSpan={9} className="text-right">Subtotal</TableCell>
                                        <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(wo.total_billing)}</TableCell>
                                        <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(wo.total_hpp)}</TableCell>
                                        <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(wo.profit)}</TableCell>
                                    </TableRow>
                                </>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={12} className="text-center h-24">
                                    Tidak ada data untuk ditampilkan.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    {!loading && filteredReportData.length > 0 && (
                        <TableFooter>
                            <TableRow className="bg-gray-300 font-bold text-lg">
                                <TableCell colSpan={9} className="text-right">Grand Total</TableCell>
                                <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(filteredReportData.reduce((sum, wo) => sum + wo.total_billing, 0))}</TableCell>
                                <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(filteredReportData.reduce((sum, wo) => sum + wo.total_hpp, 0))}</TableCell>
                                <TableCell className="text-right">{new Intl.NumberFormat('id-ID').format(filteredReportData.reduce((sum, wo) => sum + wo.profit, 0))}</TableCell>
                            </TableRow>
                        </TableFooter>
                    )}
                </Table>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div>
    );
};

export default WorkOrderDetailReport;
