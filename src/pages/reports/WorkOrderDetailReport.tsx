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

            // Step 3: Fetch all necessary data in parallel
            const allGoodsIds = estimationParts?.map(p => p.goods_id).filter(Boolean) || [];
            const allJobTypeIds = estimationJobs?.map(j => j.job_type_id).filter(Boolean) || [];
            const allVehicleIds = vehicleEntriesData?.map(ve => ve.vehicle_id).filter(Boolean) || [];

            const [
                { data: receivedPoItems, error: receivedPoError },
                { data: vehiclesData, error: vehiclesError },
                { data: jobTypesData, error: jobTypesError },
                { data: goodsData, error: goodsError },
            ] = await Promise.all([
                supabase
                    .from('purchase_order_items')
                    .select('goods_id, job_type_id, service_name, line_type, quantity, unit_price, purchase_orders!inner(id, created_at, status, work_order_id)')
                    .in('purchase_orders.status', ['RECEIVED_PART', 'RECEIVED_FULL'])
                    .not('unit_price', 'is', null),
                supabase
                    .from('vehicles')
                    .select('id, license_plate, brand_type, vehicle_type, owner_name')
                    .in('id', allVehicleIds),
                supabase.from('job_types').select('id, job_name, hpp, selling_price').in('id', allJobTypeIds),
                supabase.from('goods').select('id, name'), // Fetch all goods for the name->id map
            ]);

            if (receivedPoError) throw new Error(`Gagal mengambil data HPP: ${receivedPoError.message}`);
            if (vehiclesError) throw new Error(`Gagal mengambil data kendaraan: ${vehiclesError.message}`);
            if (jobTypesError) throw new Error(`Gagal mengambil data jenis pekerjaan: ${jobTypesError.message}`);
            if (goodsError) throw new Error(`Gagal mengambil data barang: ${goodsError.message}`);

            // Step 4: Pre-process data into fast-lookup maps
            const goodsMap = new Map(goodsData.map(g => [g.id, g.name]));
            const goodsIdByNameMap = new Map(goodsData.map(g => [g.name, g.id]));
            
            const normalizeText = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
            const receivedItems = (receivedPoItems || []) as any[];
            const receivedPartItems = receivedItems.filter((it) => (it.line_type || 'PART') === 'PART' && it.goods_id);
            const receivedJobItems = receivedItems.filter((it) => it.line_type === 'JASA');

            const partHppByWoGoods = new Map<string, { sumQty: number; sumValue: number }>();
            const partFallbackByGoods = new Map<string, { maxQty: number; unitPrice: number }>();
            receivedPartItems.forEach((it) => {
                const woId = it.purchase_orders?.work_order_id;
                const goodsId = it.goods_id;
                const qty = Number(it.quantity || 0);
                const price = Number(it.unit_price || 0);
                if (woId && goodsId && qty > 0 && price > 0) {
                    const key = `${woId}:${goodsId}`;
                    const cur = partHppByWoGoods.get(key) || { sumQty: 0, sumValue: 0 };
                    cur.sumQty += qty;
                    cur.sumValue += qty * price;
                    partHppByWoGoods.set(key, cur);
                }
                if (goodsId && qty > 0 && price > 0) {
                    const cur = partFallbackByGoods.get(goodsId);
                    if (!cur || qty > cur.maxQty) {
                        partFallbackByGoods.set(goodsId, { maxQty: qty, unitPrice: price });
                    }
                }
            });

            const jobHppByWoJobType = new Map<string, { sumQty: number; sumValue: number }>();
            const jobHppByWoName = new Map<string, { sumQty: number; sumValue: number }>();
            receivedJobItems.forEach((it) => {
                const woId = it.purchase_orders?.work_order_id;
                const qty = Number(it.quantity || 0);
                const price = Number(it.unit_price || 0);
                if (!woId || qty <= 0 || price <= 0) return;
                const jobTypeId = it.job_type_id ? String(it.job_type_id) : '';
                const serviceName = normalizeText(String(it.service_name || ''));
                if (jobTypeId) {
                    const key = `${woId}:${jobTypeId}`;
                    const cur = jobHppByWoJobType.get(key) || { sumQty: 0, sumValue: 0 };
                    cur.sumQty += qty;
                    cur.sumValue += qty * price;
                    jobHppByWoJobType.set(key, cur);
                } else if (serviceName) {
                    const key = `${woId}:${serviceName}`;
                    const cur = jobHppByWoName.get(key) || { sumQty: 0, sumValue: 0 };
                    cur.sumQty += qty;
                    cur.sumValue += qty * price;
                    jobHppByWoName.set(key, cur);
                }
            });

            // Step 5: Create helper maps
            const vehicleEntryMap = new Map(vehicleEntriesData?.map(e => [e.id, e]));
            const vehicleMap = new Map(vehiclesData?.map(v => [v.id, v]));
            const woIdsByVeId = new Map<string, string[]>();
            woData.forEach((wo) => {
                const veId = wo.vehicle_entry_id ? String(wo.vehicle_entry_id) : '';
                if (!veId) return;
                const cur = woIdsByVeId.get(veId) || [];
                woIdsByVeId.set(veId, [...cur, String(wo.id)]);
            });
            const jobTypesMap = new Map(jobTypesData?.map(jt => [jt.id, jt.job_name]));
            const jobTypesHppMap = new Map(jobTypesData?.map(jt => [jt.id, Number((jt as any).hpp || 0)]));
            const jobTypesSellMap = new Map(jobTypesData?.map(jt => [jt.id, Number((jt as any).selling_price || 0)]));

            const getPartHpp = (woId: string | undefined, goodsId: string | null): number => {
                if (!goodsId) return 0;
                if (woId) {
                    const agg = partHppByWoGoods.get(`${woId}:${goodsId}`);
                    if (agg && agg.sumQty > 0) return agg.sumValue / agg.sumQty;
                }
                const fb = partFallbackByGoods.get(goodsId);
                return fb ? fb.unitPrice : 0;
            };

            const getJobHpp = (woId: string | undefined, jobTypeId: string | null, jobName: string): number => {
                if (woId && jobTypeId) {
                    const agg = jobHppByWoJobType.get(`${woId}:${jobTypeId}`);
                    if (agg && agg.sumQty > 0) return agg.sumValue / agg.sumQty;
                }
                if (woId) {
                    const key = `${woId}:${normalizeText(jobName)}`;
                    const agg = jobHppByWoName.get(key);
                    if (agg && agg.sumQty > 0) return agg.sumValue / agg.sumQty;
                }
                if (jobTypeId) return Number(jobTypesHppMap.get(jobTypeId) || 0);
                return 0;
            };

            const getHpp = (goodsId: string | null): number => {
                if (!goodsId) return 0;
                const fb = partFallbackByGoods.get(goodsId);
                return fb ? fb.unitPrice : 0;
            };

            // Step 6: Group items by WO from Estimation data
            const reportItemsByWo = new Map<string, ReportItem[]>();

            // Process Estimated items
            const processEstimatedItems = (items: any[], type: 'PART' | 'JOB') => {
                items.forEach(item => {
                    const veId = item.vehicle_entry_id ? String(item.vehicle_entry_id) : '';
                    const woIds = veId ? (woIdsByVeId.get(veId) || []) : [];
                    if (woIds.length === 0) return;

                    const isPart = type === 'PART';
                    
                    let goodsId = isPart ? item.goods_id : null;
                    const jobTypeId = !isPart && item.job_type_id ? String(item.job_type_id) : '';
                    const itemName = isPart
                        ? (item.item_name || goodsMap.get(goodsId))
                        : (jobTypesMap.get(jobTypeId) || String(item.notes || '').trim() || 'Jasa Umum');

                    // Workaround: If goods_id is missing from estimation, try to find it by item_name
                    if (isPart && !goodsId && itemName) {
                        const foundGoodsId = goodsIdByNameMap.get(itemName);
                        if (foundGoodsId) {
                            goodsId = foundGoodsId;
                        }
                    }

                    woIds.forEach((woId) => {
                        const hpp = isPart
                            ? getPartHpp(woId, goodsId)
                            : getJobHpp(woId, jobTypeId ? String(jobTypeId) : null, itemName);
                        
                        const sellingPrice = isPart
                            ? Number(item.estimated_price || 0)
                            : Number(item.estimated_price || jobTypesSellMap.get(jobTypeId) || 0);
                        
                        const qty = item.qty || (isPart ? 0 : 1);
                        const totalSellingPrice = sellingPrice * qty;
                        const totalHpp = hpp * qty;
    
                        const reportItem: ReportItem = {
                            item_type: type,
                            item_name: itemName,
                            qty, unit_price: sellingPrice, total_price: totalSellingPrice,
                            hpp, total_hpp: totalHpp, profit: totalSellingPrice - totalHpp,
                            source: 'ESTIMATE_ONLY',
                        };
    
                        if (!reportItemsByWo.has(woId)) reportItemsByWo.set(woId, []);
                        reportItemsByWo.get(woId)?.push(reportItem);
                    });
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
