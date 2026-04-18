import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

type ReportData = {
    id: string;
    entry_date: string;
    wo_number: string;
    plate_number: string;
    vehicle_type: string | null;
    service_group: string | null;
    customer_name: string;
    total_realized: number;
    total_profit: number;
    items: ReportItem[];
};

type ReportItem = {
    item_type: 'JOB' | 'PART';
    item_name: string;
    qty: number;
    unit_price: number;
    total_price: number;
    hpp: number;
    profit: number;
    source: 'REALIZED' | 'ESTIMATE_ONLY';
};

const WorkOrderDetailReport = () => {
    const [reportData, setReportData] = useState<ReportData[]>([]);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [statusFilter, setStatusFilter] = useState('semua');
    const [vehicleGroupFilter, setVehicleGroupFilter] = useState('semua');

    const fetchReportData = async () => {
        setLoading(true);
        try {
            const { data: woData, error: woError } = await supabase
                .from('work_orders')
                .select(`
                    id,
                    wo_number,
                    vehicle_entry:vehicle_entry_id (
                        id,
                        entry_date,
                        vehicle:vehicle_id ( plate_number, vehicle_type ),
                        customer:customer_id ( name ),
                        service_group
                    )
                `)
                .gte('wo_date', startDate)
                .lte('wo_date', endDate)
                .order('wo_date', { ascending: true });

            if (woError) throw woError;
            if (!woData) {
                setReportData([]);
                toast.info("Tidak ada data pada rentang tanggal yang dipilih.");
                return;
            }

            const vehicleEntryIds = woData.map(wo => wo.vehicle_entry?.id).filter(Boolean) as string[];
            if (vehicleEntryIds.length === 0) {
                setReportData([]);
                return;
            }

            // Fetch all related data in parallel
            const [
                { data: realizedJobs, error: realizedJobsError },
                { data: realizedParts, error: realizedPartsError },
                { data: estimationJobs, error: estimationJobsError },
                { data: estimationParts, error: estimationPartsError },
                { data: jobTypes, error: jobTypesError },
                { data: goods, error: goodsError },
                { data: hppData, error: hppError }
            ] = await Promise.all([
                supabase.from('work_order_billings').select('vehicle_entry_id, job_type_id, price').eq('item_type', 'JOB').in('vehicle_entry_id', vehicleEntryIds),
                supabase.from('work_order_billings').select('vehicle_entry_id, goods_id, quantity, price').eq('item_type', 'PART').in('vehicle_entry_id', vehicleEntryIds),
                supabase.from('vehicle_entry_jobs').select('vehicle_entry_id, job_type_id').in('vehicle_entry_id', vehicleEntryIds),
                supabase.from('vehicle_entry_spareparts').select('vehicle_entry_id, goods_id, quantity').in('vehicle_entry_id', vehicleEntryIds),
                supabase.from('job_types').select('id, job_name, price'),
                supabase.from('goods').select('id, name, selling_price'),
                supabase.from('goods_issue_items').select('goods_id, hpp').in('goods_id', 
                    [...new Set([...(realizedParts || []).map(p => p.goods_id), ...(estimationParts || []).map(p => p.goods_id)])].filter(Boolean)
                )
            ]);

            if (realizedJobsError) throw new Error(`Gagal mengambil data realisasi jasa: ${realizedJobsError.message}`);
            if (realizedPartsError) throw new Error(`Gagal mengambil data realisasi sparepart: ${realizedPartsError.message}`);
            if (estimationJobsError) throw new Error(`Gagal mengambil data estimasi jasa: ${estimationJobsError.message}`);
            if (estimationPartsError) throw new Error(`Gagal mengambil data estimasi sparepart: ${estimationPartsError.message}`);
            if (jobTypesError) throw new Error(`Gagal mengambil data master jasa: ${jobTypesError.message}`);
            if (goodsError) throw new Error(`Gagal mengambil data master barang: ${goodsError.message}`);
            if (hppError) throw new Error(`Gagal mengambil data HPP: ${hppError.message}`);

            // Create maps for efficient data lookup
            const jobTypesMap = new Map(jobTypes.map(j => [j.id, j]));
            const goodsMap = new Map(goods.map(g => [g.id, g]));
            const hppGoodsMap = new Map<string, number>();
            hppData.forEach(item => hppGoodsMap.set(item.goods_id, item.hpp));

            const initialReportData = woData.map(wo => ({
                id: wo.vehicle_entry?.id || '',
                entry_date: wo.vehicle_entry?.entry_date ? format(new Date(wo.vehicle_entry.entry_date), 'dd-MM-yyyy') : '',
                wo_number: wo.wo_number,
                plate_number: wo.vehicle_entry?.vehicle?.plate_number || 'N/A',
                vehicle_type: wo.vehicle_entry?.vehicle?.vehicle_type || null,
                service_group: wo.vehicle_entry?.service_group || null,
                customer_name: wo.vehicle_entry?.customer?.name || 'N/A',
                total_realized: 0,
                total_profit: 0,
                items: [],
            }));

            // Map realized items for quick lookup
            const realizedItems = new Set<string>();
            realizedJobs.forEach(job => realizedItems.add(`JOB-${job.job_type_id}`));
            realizedParts.forEach(part => realizedItems.add(`PART-${part.goods_id}`));

            const finalReportData = initialReportData.map(entry => {
                const allItems: ReportItem[] = [];

                // Add realized jobs and parts first
                const entryRealizedJobs = realizedJobs.filter(j => j.vehicle_entry_id === entry.id);
                const entryRealizedParts = realizedParts.filter(p => p.vehicle_entry_id === entry.id);

                entryRealizedJobs.forEach(job => {
                    allItems.push({
                        item_type: 'JOB',
                        item_name: jobTypesMap.get(job.job_type_id)?.job_name || 'Unknown Job',
                        qty: 1,
                        unit_price: job.price,
                        total_price: job.price,
                        hpp: 0,
                        profit: 0,
                        source: 'REALIZED',
                    });
                });

                entryRealizedParts.forEach(part => {
                    const unit_price = part.price;
                    const total_price = unit_price * part.quantity;
                    const hpp = hppGoodsMap.get(part.goods_id) || 0;
                    const profit = total_price - (hpp * part.quantity);
                    allItems.push({
                        item_type: 'PART',
                        item_name: goodsMap.get(part.goods_id)?.name || 'Unknown Part',
                        qty: part.quantity,
                        unit_price: unit_price,
                        total_price: total_price,
                        hpp: hpp,
                        profit: profit,
                        source: 'REALIZED',
                    });
                });

                // If status is "semua", add estimation-only items
                if (statusFilter === 'semua') {
                    const entryEstimationJobs = estimationJobs.filter(j => j.vehicle_entry_id === entry.id);
                    const entryEstimationParts = estimationParts.filter(p => p.vehicle_entry_id === entry.id);

                    entryEstimationJobs.forEach(estJob => {
                        if (!realizedItems.has(`JOB-${estJob.job_type_id}`)) {
                            allItems.push({
                                item_type: 'JOB',
                                item_name: jobTypesMap.get(estJob.job_type_id)?.job_name || 'Unknown Job',
                                qty: 1,
                                unit_price: jobTypesMap.get(estJob.job_type_id)?.price || 0,
                                total_price: jobTypesMap.get(estJob.job_type_id)?.price || 0,
                                hpp: 0,
                                profit: 0,
                                source: 'ESTIMATE_ONLY',
                            });
                        }
                    });

                    entryEstimationParts.forEach(estPart => {
                        if (!realizedItems.has(`PART-${estPart.goods_id}`)) {
                            allItems.push({
                                item_type: 'PART',
                                item_name: goodsMap.get(estPart.goods_id)?.name || 'Unknown Part',
                                qty: estPart.quantity,
                                unit_price: goodsMap.get(estPart.goods_id)?.selling_price || 0,
                                total_price: (estPart.quantity || 0) * (goodsMap.get(estPart.goods_id)?.selling_price || 0),
                                hpp: hppGoodsMap.get(estPart.goods_id) || 0,
                                profit: 0,
                                source: 'ESTIMATE_ONLY',
                            });
                        }
                    });
                }

                const total_realized = allItems.filter(i => i.source === 'REALIZED').reduce((sum, item) => sum + item.total_price, 0);
                const total_profit = allItems.filter(i => i.source === 'REALIZED').reduce((sum, item) => sum + item.profit, 0);

                return { ...entry, items: allItems, total_realized, total_profit };
            });

            setReportData(finalReportData);

        } catch (error: any) {
            toast.error(`Gagal mengambil data laporan: ${error.message}`);
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const getVehicleGroupLabel = (vehicleType: string | null | undefined, serviceGroup: string | null | undefined): string => {
        if (serviceGroup) {
            if (serviceGroup.toUpperCase().includes('R4')) return 'R4';
            if (serviceGroup.toUpperCase().includes('R2')) return 'R2';
        }
        if (vehicleType) {
            if (['MOBIL', 'PICKUP', 'TRUCK'].includes(vehicleType.toUpperCase())) return 'R4';
            if (['MOTOR'].includes(vehicleType.toUpperCase())) return 'R2';
        }
        return 'Lainnya';
    };

    const filteredReportData = useMemo(() => {
        if (vehicleGroupFilter === 'semua') {
            return reportData;
        }
        return reportData.filter(entry => {
            const group = getVehicleGroupLabel(entry.vehicle_type, entry.service_group);
            return group === vehicleGroupFilter;
        });
    }, [reportData, vehicleGroupFilter]);

    const handleExport = () => {
        const dataToExport = filteredReportData.flatMap(entry =>
            entry.items.map(item => ({
                'Tgl Masuk': entry.entry_date,
                'No. WO': entry.wo_number,
                'No. Polisi': entry.plate_number,
                'Customer': entry.customer_name,
                'Grup Kendaraan': getVehicleGroupLabel(entry.vehicle_type, entry.service_group),
                'Tipe Item': item.item_type === 'JOB' ? 'Jasa' : 'Sparepart',
                'Nama Item': item.item_name,
                'Qty': item.qty,
                'Harga Satuan': item.unit_price,
                'Total Harga': item.total_price,
                'HPP': item.hpp,
                'Profit': item.profit,
                'Sumber': item.source === 'REALIZED' ? 'Realisasi' : 'Estimasi',
            }))
        );

        if (dataToExport.length === 0) {
            toast.warning("Tidak ada data untuk diekspor.");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Detail WO');
        XLSX.writeFile(workbook, `Laporan_Detail_WO_${startDate}_-_${endDate}.xlsx`);
    };

    return (
        <div className="p-4">
            <Card>
                <CardHeader>
                    <CardTitle>Laporan Detail Work Order</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-end gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <div className="space-y-1">
                                <label htmlFor="start-date" className="text-sm font-medium">Tanggal Mulai</label>
                                <Input
                                    id="start-date"
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-40"
                                />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="end-date" className="text-sm font-medium">Tanggal Selesai</label>
                                <Input
                                    id="end-date"
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-40"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="status-filter" className="text-sm font-medium">Status</label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[220px]" id="status-filter">
                                    <SelectValue placeholder="Pilih Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="semua">Semua (Estimasi vs Realisasi)</SelectItem>
                                    <SelectItem value="realisasi">Realisasi Saja</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="vehicle-group-filter" className="text-sm font-medium">Grup Kendaraan</label>
                            <Select value={vehicleGroupFilter} onValueChange={setVehicleGroupFilter}>
                                <SelectTrigger className="w-[180px]" id="vehicle-group-filter">
                                    <SelectValue placeholder="Pilih Grup" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="semua">Semua Grup</SelectItem>
                                    <SelectItem value="R4">R4</SelectItem>
                                    <SelectItem value="R2">R2</SelectItem>
                                    <SelectItem value="Lainnya">Lainnya</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={fetchReportData} disabled={loading}>
                            {loading ? 'Memuat...' : 'Tampilkan Laporan'}
                        </Button>
                        <Button onClick={handleExport} variant="outline" disabled={filteredReportData.length === 0}>
                            Ekspor ke Excel
                        </Button>
                    </div>

                    <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                        <div className="relative">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="sticky left-0 bg-white z-10 w-[200px]">No. WO</TableHead>
                                        <TableHead>Tgl Masuk</TableHead>
                                        <TableHead>No. Polisi</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Grup</TableHead>
                                        <TableHead>Tipe Item</TableHead>
                                        <TableHead>Nama Item</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Harga Satuan</TableHead>
                                        <TableHead className="text-right">Total Harga</TableHead>
                                        <TableHead className="text-right">HPP</TableHead>
                                        <TableHead className="text-right">Profit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredReportData.length > 0 ? (
                                        filteredReportData.map((entry, entryIndex) => (
                                            entry.items.map((item, itemIndex) => (
                                                <TableRow key={`${entry.id}-${itemIndex}`} className={item.source === 'ESTIMATE_ONLY' ? 'bg-yellow-100' : ''}>
                                                    {itemIndex === 0 && (
                                                        <TableCell rowSpan={entry.items.length} className="sticky left-0 bg-white z-10 font-medium align-top w-[200px]">
                                                            {entry.wo_number}
                                                        </TableCell>
                                                    )}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{entry.entry_date}</TableCell>}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{entry.plate_number}</TableCell>}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{entry.customer_name}</TableCell>}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{getVehicleGroupLabel(entry.vehicle_type, entry.service_group)}</TableCell>}
                                                    
                                                    <TableCell>{item.item_type === 'JOB' ? 'Jasa' : 'Sparepart'}</TableCell>
                                                    <TableCell>{item.item_name}</TableCell>
                                                    <TableCell className="text-right">{item.qty}</TableCell>
                                                    <TableCell className="text-right">{item.unit_price.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.total_price.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.hpp.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.profit.toLocaleString('id-ID')}</TableCell>
                                                </TableRow>
                                            ))
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={12} className="h-24 text-center">
                                                Tidak ada data untuk ditampilkan.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
};

export default WorkOrderDetailReport;
