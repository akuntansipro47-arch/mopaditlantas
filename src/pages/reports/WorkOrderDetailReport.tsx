import { useState, useEffect, useMemo, useRef } from 'react';
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
    wo_id: string;
    vehicle_entry_id: string;
    entry_date: string;
    wo_number: string;
    plate_number: string;
    brand_type: string | null;
    vehicle_type: string | null;
    service_group: string | null;
    customer_name: string;
    total_realized: number;
    total_hpp: number;
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
    total_hpp: number;
    profit: number;
    source: 'REALIZED' | 'ESTIMATE_ONLY';
};

// Custom hook for draggable scroll
const useDraggableScroll = () => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        let isDown = false;
        let startX: number;
        let scrollLeft: number;

        const onMouseDown = (e: MouseEvent) => {
            isDown = true;
            el.classList.add('active');
            startX = e.pageX - el.offsetLeft;
            scrollLeft = el.scrollLeft;
        };

        const onMouseLeave = () => {
            isDown = false;
            el.classList.remove('active');
        };

        const onMouseUp = () => {
            isDown = false;
            el.classList.remove('active');
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - el.offsetLeft;
            const walk = (x - startX) * 2; // scroll-fast
            el.scrollLeft = scrollLeft - walk;
        };

        el.addEventListener('mousedown', onMouseDown);
        el.addEventListener('mouseleave', onMouseLeave);
        el.addEventListener('mouseup', onMouseUp);
        el.addEventListener('mousemove', onMouseMove);

        return () => {
            el.removeEventListener('mousedown', onMouseDown);
            el.removeEventListener('mouseleave', onMouseLeave);
            el.removeEventListener('mouseup', onMouseUp);
            el.removeEventListener('mousemove', onMouseMove);
        };
    }, []);

    return ref;
};

const WorkOrderDetailReport = () => {
    const [reportData, setReportData] = useState<ReportData[]>([]);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [statusFilter, setStatusFilter] = useState('semua');
    const [vehicleGroupFilter, setVehicleGroupFilter] = useState('semua');
    const [searchTerm, setSearchTerm] = useState('');
    const scrollContainerRef = useDraggableScroll();

    const fetchReportData = async () => {
        setLoading(true);
        try {
            // Step 1: Fetch base Work Orders
            const { data: woData, error: woError } = await supabase
                .from('work_orders')
                .select('id, wo_number, work_date, vehicle_entry_id')
                .gte('work_date', startDate)
                .lte('work_date', endDate)
                .order('work_date', { ascending: true });

            if (woError) throw woError;
            if (!woData || woData.length === 0) {
                setReportData([]);
                toast.info("Tidak ada data pada rentang tanggal yang dipilih.");
                return;
            }

            const workOrderIds = woData.map(wo => wo.id);
            const vehicleEntryIds = woData.map(wo => wo.vehicle_entry_id).filter(Boolean) as string[];

            // Step 2: Fetch estimation and vehicle data in parallel
            const [
                entriesResult,
                estPartsResult,
                estJobsResult,
            ] = await Promise.allSettled([
                supabase.from('vehicle_entries').select('id, entry_date, vehicle_id').in('id', vehicleEntryIds),
                // The 'goods_id' column is confirmed to exist in 'vehicle_entry_spareparts'
                supabase.from('vehicle_entry_spareparts').select('*').in('vehicle_entry_id', vehicleEntryIds),
                supabase.from('vehicle_entry_jobs').select('*').in('vehicle_entry_id', vehicleEntryIds),
            ]);

            // Helper to check for errors and throw them
            const checkError = (result: PromiseSettledResult<any>, context: string) => {
                if (result.status === 'rejected') {
                    console.error(`Error fetching ${context}:`, result.reason);
                    throw new Error(`Gagal mengambil data ${context}: ${result.reason.message}`);
                }
                if (result.value.error) {
                    throw new Error(`Gagal mengambil data ${context}: ${result.value.error.message}`);
                }
                return result.value.data;
            };

            const vehicleEntriesData = checkError(entriesResult, 'entri kendaraan');
            const estimationParts = checkError(estPartsResult, 'estimasi sparepart');
            const estimationJobs = checkError(estJobsResult, 'estimasi jasa');

            // Step 3: Fetch HPP data sources (only from estimated parts)
            const estimatedGoodsIds = estimationParts?.filter(p => p.goods_id).map(p => p.goods_id) || [];
            const allGoodsIds = [...new Set(estimatedGoodsIds)];

            const [
                { data: woLinkedPos, error: woPoError },
                { data: latestPoItems, error: latestPoError },
                { data: vehiclesData, error: vehiclesError },
                { data: jobTypesData, error: jobTypesError },
                { data: goodsData, error: goodsError },
            ] = await Promise.all([
                supabase
                    .from('purchase_orders')
                    .select('work_order_id, status, purchase_order_items(goods_id, unit_price)')
                    .in('work_order_id', workOrderIds)
                    .in('status', ['RECEIVED_PART', 'RECEIVED_FULL']),
                supabase
                    .from('purchase_order_items')
                    .select('goods_id, unit_price, purchase_orders!inner(created_at, status)')
                    .in('goods_id', allGoodsIds)
                    .in('purchase_orders.status', ['RECEIVED_PART', 'RECEIVED_FULL'])
                    .order('created_at', { foreignTable: 'purchase_orders', ascending: false }),
                supabase
                    .from('vehicles')
                    .select('id, license_plate, brand_type, vehicle_type, owner_name')
                    .in('id', vehicleEntriesData?.map(ve => ve.vehicle_id).filter(Boolean) || []),
                supabase.from('job_types').select('id, job_name'),
                supabase.from('goods').select('id, name').in('id', allGoodsIds),
            ]);

            if (woPoError) throw new Error(`Gagal mengambil HPP P1: ${woPoError.message}`);
            if (latestPoError) throw new Error(`Gagal mengambil HPP P2: ${latestPoError.message}`);
            if (vehiclesError) throw new Error(`Gagal mengambil data kendaraan: ${vehiclesError.message}`);
            if (jobTypesError) throw new Error(`Gagal mengambil data jenis pekerjaan: ${jobTypesError.message}`);
            if (goodsError) throw new Error(`Gagal mengambil data barang: ${goodsError.message}`);

            // Step 4: Pre-process HPP data into fast-lookup maps
            const goodsMap = new Map(goodsData?.map(g => [g.id, g.name]));
            const hppP1Map_byGoodsId = new Map<string, Map<string, number>>();
            const hppP1Map_byItemName = new Map<string, Map<string, number>>();
            woLinkedPos?.forEach(po => {
                if (po.work_order_id) {
                    if (!hppP1Map_byGoodsId.has(po.work_order_id)) hppP1Map_byGoodsId.set(po.work_order_id, new Map());
                    if (!hppP1Map_byItemName.has(po.work_order_id)) hppP1Map_byItemName.set(po.work_order_id, new Map());
                    const goodsIdMap = hppP1Map_byGoodsId.get(po.work_order_id);
                    const nameMap = hppP1Map_byItemName.get(po.work_order_id);
                    (po.purchase_order_items as any[]).forEach(item => {
                        const itemName = goodsMap.get(item.goods_id);
                        if (item.goods_id) goodsIdMap?.set(item.goods_id, item.unit_price);
                        if (itemName) nameMap?.set(itemName, item.unit_price);
                    });
                }
            });

            const hppP2Map_byGoodsId = new Map<string, number>();
            const hppP2Map_byItemName = new Map<string, number>();
            latestPoItems?.forEach(item => {
                const itemName = goodsMap.get(item.goods_id);
                if (item.goods_id && !hppP2Map_byGoodsId.has(item.goods_id)) {
                    hppP2Map_byGoodsId.set(item.goods_id, item.unit_price);
                }
                if (itemName && !hppP2Map_byItemName.has(itemName)) {
                    hppP2Map_byItemName.set(itemName, item.unit_price);
                }
            });

            // Step 5: Create helper maps
            const vehicleEntryMap = new Map(vehicleEntriesData?.map(e => [e.id, e]));
            const vehicleMap = new Map(vehiclesData?.map(v => [v.id, v]));
            const woMapByVeId = new Map(woData.map(wo => [wo.vehicle_entry_id, wo.id]));
            const jobTypesMap = new Map(jobTypesData?.map(jt => [jt.id, jt.job_name]));

            const getHpp = (woId: string, goodsId: string | null, itemName: string | null): number => {
                if (goodsId) {
                    const p1Price = hppP1Map_byGoodsId.get(woId)?.get(goodsId);
                    if (p1Price !== undefined) return p1Price;
                }
                if (itemName) {
                    const p1PriceName = hppP1Map_byItemName.get(woId)?.get(itemName);
                    if (p1PriceName !== undefined) return p1PriceName;
                }
                if (goodsId) {
                    const p2Price = hppP2Map_byGoodsId.get(goodsId);
                    if (p2Price !== undefined) return p2Price;
                }
                if (itemName) {
                    const p2PriceName = hppP2Map_byItemName.get(itemName);
                    if (p2PriceName !== undefined) return p2PriceName;
                }
                return 0;
            };

            // Step 6: Group items by WO from Estimation data
            const reportItemsByWo = new Map<string, ReportItem[]>();

            // Process Estimated items
            const processEstimatedItems = (items: any[], type: 'PART' | 'JOB') => {
                items.forEach(item => {
                    const woId = woMapByVeId.get(item.vehicle_entry_id);
                    if (!woId) return; // Just skip if no corresponding WO

                    const isPart = type === 'PART';
                    const itemName = isPart ? (goodsMap.get(item.goods_id) || item.item_name) : (jobTypesMap.get(item.job_type_id) || 'Jasa Umum');
                    const hpp = isPart ? getHpp(woId, item.goods_id, goodsMap.get(item.goods_id) || item.item_name) : 0;
                    const sellingPrice = item.estimation_price || 0;
                    const qty = item.qty || (isPart ? 0 : 1);
                    const totalSellingPrice = sellingPrice * qty;
                    const totalHpp = hpp * qty;

                    const reportItem: ReportItem = {
                        item_type: type,
                        item_name: itemName,
                        qty, unit_price: sellingPrice, total_price: totalSellingPrice,
                        hpp, total_hpp: totalHpp, profit: totalSellingPrice - totalHpp,
                        source: 'ESTIMATE_ONLY', // Source is always estimate
                    };

                    if (!reportItemsByWo.has(woId)) reportItemsByWo.set(woId, []);
                    reportItemsByWo.get(woId)?.push(reportItem);
                });
            };

            processEstimatedItems(estimationParts || [], 'PART');
            processEstimatedItems(estimationJobs || [], 'JOB');

            // Step 7: Combine all data into the final report structure
            const finalReportData = woData.map(wo => {
                const vehicleEntry = vehicleEntryMap.get(wo.vehicle_entry_id);
                const vehicle = vehicleEntry ? vehicleMap.get(vehicleEntry.vehicle_id) : undefined;
                const items = reportItemsByWo.get(wo.id) || [];
                const total_realized = items.reduce((sum, item) => sum + item.total_price, 0);
                const total_hpp = items.reduce((sum, item) => sum + item.total_hpp, 0);
                const total_profit = items.reduce((sum, item) => sum + item.profit, 0);

                return {
                    wo_id: wo.id,
                    vehicle_entry_id: wo.vehicle_entry_id,
                    entry_date: vehicleEntry ? format(new Date(vehicleEntry.entry_date), 'dd-MM-yyyy') : '',
                    wo_number: wo.wo_number,
                    plate_number: vehicle?.license_plate || 'N/A',
                    brand_type: vehicle?.brand_type || null,
                    vehicle_type: vehicle?.vehicle_type || null,
                    service_group: vehicle?.vehicle_type || null,
                    customer_name: vehicle?.owner_name || 'N/A',
                    total_realized,
                    total_hpp,
                    total_profit,
                    items: items,
                };
            }).filter(d => d.items.length > 0); // Only show WOs with items

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
        let filtered = reportData;

        if (vehicleGroupFilter !== 'semua') {
            filtered = filtered.filter(entry => {
                const group = getVehicleGroupLabel(entry.vehicle_type, entry.service_group);
                return group === vehicleGroupFilter;
            });
        }

        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                item.wo_number?.toLowerCase().includes(lowercasedFilter) ||
                item.plate_number?.toLowerCase().includes(lowercasedFilter) ||
                item.brand_type?.toLowerCase().includes(lowercasedFilter)
            );
        }

        return filtered;
    }, [reportData, vehicleGroupFilter, searchTerm]);

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

                    <div className="mb-4">
                        <Input
                            placeholder="Cari No. WO / Nopol / Kendaraan..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="max-w-sm"
                        />
                    </div>

                    <div ref={scrollContainerRef} className="w-full overflow-x-auto whitespace-nowrap rounded-md border cursor-grab">
                        <div className="relative">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="sticky left-0 bg-white z-10 w-[200px]">No. WO</TableHead>
                                        <TableHead>Tgl Masuk</TableHead>
                                        <TableHead>Nopol & Kendaraan</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Grup</TableHead>
                                        <TableHead>Tipe Item</TableHead>
                                        <TableHead>Nama Item</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Harga Satuan</TableHead>
                                        <TableHead className="text-right">Total Harga</TableHead>
                                        <TableHead className="text-right">HPP (Unit)</TableHead>
                                        <TableHead className="text-right">Total HPP</TableHead>
                                        <TableHead className="text-right">Total Profit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredReportData.length > 0 ? (
                                        filteredReportData.map((entry, entryIndex) => (
                                            entry.items.map((item, itemIndex) => (
                                                <TableRow key={`${entry.wo_id}-${itemIndex}`} className={item.source === 'ESTIMATE_ONLY' ? 'bg-yellow-100' : ''}>
                                                    {itemIndex === 0 && (
                                                        <TableCell rowSpan={entry.items.length} className="sticky left-0 bg-white z-10 font-medium align-top w-[200px]">
                                                            {entry.wo_number}
                                                        </TableCell>
                                                    )}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{entry.entry_date}</TableCell>}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{`${entry.plate_number} (${entry.brand_type || ''})`}</TableCell>}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{entry.customer_name}</TableCell>}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{getVehicleGroupLabel(entry.vehicle_type, entry.service_group)}</TableCell>}
                                                    
                                                    <TableCell>{item.item_type === 'JOB' ? 'Jasa' : 'Sparepart'}</TableCell>
                                                    <TableCell>{item.item_name}</TableCell>
                                                    <TableCell className="text-right">{item.qty}</TableCell>
                                                    <TableCell className="text-right">{item.unit_price.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.total_price.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.hpp.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.total_hpp.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.profit.toLocaleString('id-ID')}</TableCell>
                                                </TableRow>
                                            ))
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={13} className="h-24 text-center">
                                                Tidak ada data untuk ditampilkan.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default WorkOrderDetailReport;