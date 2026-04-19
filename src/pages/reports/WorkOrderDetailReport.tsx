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

            // Step 2: Fetch Billings (Harga Jual) and Vehicle Entries
            const [
                { data: billingsData, error: billingsError },
                { data: vehicleEntriesData, error: entriesError },
            ] = await Promise.all([
                supabase.from('work_order_billings').select('*, goods_id').in('work_order_id', workOrderIds),
                supabase.from('vehicle_entries').select('id, entry_date, vehicle_id').in('id', vehicleEntryIds),
            ]);

            if (billingsError) throw new Error(`Gagal mengambil data tagihan (billings): ${billingsError.message}`);
            if (entriesError) throw new Error(`Gagal mengambil data vehicle entries: ${entriesError.message}`);

            // Step 3: Fetch HPP data sources
            const goodsIdsForHpp = billingsData?.filter(b => b.item_type === 'PART' && b.goods_id).map(b => b.goods_id) || [];

            const [
                // HPP Source 1: POs linked to our WOs
                { data: woLinkedPos, error: woPoError },
                // HPP Source 2: Latest POs for all involved goods
                { data: latestPoItems, error: latestPoError },
                // Vehicle Details
                { data: vehiclesData, error: vehiclesError },
            ] = await Promise.all([
                supabase
                    .from('purchase_orders')
                    .select('work_order_id, status, purchase_order_items(goods_id, unit_price)')
                    .in('work_order_id', workOrderIds)
                    .in('status', ['RECEIVED_PART', 'RECEIVED_FULL']),
                supabase
                    .from('purchase_order_items')
                    .select('goods_id, unit_price, purchase_orders!inner(created_at, status)')
                    .in('goods_id', goodsIdsForHpp)
                    .in('purchase_orders.status', ['RECEIVED_PART', 'RECEIVED_FULL'])
                    .order('created_at', { foreignTable: 'purchase_orders', ascending: false }),
                supabase
                    .from('vehicles')
                    .select('id, license_plate, brand_type, vehicle_type, owner_name')
                    .in('id', vehicleEntriesData?.map(ve => ve.vehicle_id).filter(Boolean) || []),
            ]);

            if (woPoError) throw new Error(`Gagal mengambil HPP P1: ${woPoError.message}`);
            if (latestPoError) throw new Error(`Gagal mengambil HPP P2: ${latestPoError.message}`);
            if (vehiclesError) throw new Error(`Gagal mengambil data kendaraan: ${vehiclesError.message}`);

            // Step 4: Pre-process HPP data into fast-lookup maps
            const hppP1Map = new Map<string, Map<string, number>>(); // wo_id -> goods_id -> price
            woLinkedPos?.forEach(po => {
                if (po.work_order_id && !hppP1Map.has(po.work_order_id)) {
                    hppP1Map.set(po.work_order_id, new Map());
                }
                const goodsMap = hppP1Map.get(po.work_order_id!);
                (po.purchase_order_items as any[]).forEach(item => {
                    goodsMap?.set(item.goods_id, item.unit_price);
                });
            });

            const hppP2Map = new Map<string, number>(); // goods_id -> latest price
            latestPoItems?.forEach(item => {
                if (item.goods_id && !hppP2Map.has(item.goods_id)) {
                    hppP2Map.set(item.goods_id, item.unit_price);
                }
            });

            // Step 5: Create maps for vehicle data
            const vehicleEntryMap = new Map(vehicleEntriesData?.map(e => [e.id, e]));
            const vehicleMap = new Map(vehiclesData?.map(v => [v.id, v]));

            // Step 6: Group items by WO and calculate HPP/Profit per item
            const reportItemsByWo = new Map<string, ReportItem[]>();
            billingsData?.forEach(billing => {
                const woId = billing.work_order_id;
                let hpp = 0;
                if (billing.item_type === 'PART' && billing.goods_id) {
                    const p1Price = hppP1Map.get(woId)?.get(billing.goods_id);
                    if (p1Price !== undefined) {
                        hpp = p1Price;
                    } else {
                        const p2Price = hppP2Map.get(billing.goods_id);
                        if (p2Price !== undefined) {
                            hpp = p2Price;
                        }
                    }
                }

                const sellingPrice = billing.unit_price || 0;
                const qty = billing.qty || 0;

                const reportItem: ReportItem = {
                    item_type: billing.item_type,
                    item_name: billing.item_name,
                    qty: qty,
                    unit_price: sellingPrice,
                    total_price: sellingPrice * qty,
                    hpp: hpp,
                    profit: (sellingPrice * qty) - (hpp * qty),
                    source: 'REALIZED',
                };

                if (!reportItemsByWo.has(woId)) {
                    reportItemsByWo.set(woId, []);
                }
                reportItemsByWo.get(woId)?.push(reportItem);
            });

            // Step 7: Combine all data into the final report structure
            const finalReportData = woData.map(wo => {
                const vehicleEntry = vehicleEntryMap.get(wo.vehicle_entry_id);
                const vehicle = vehicleEntry ? vehicleMap.get(vehicleEntry.vehicle_id) : undefined;
                
                const items = reportItemsByWo.get(wo.id) || [];
                
                const total_realized = items.reduce((sum, item) => sum + item.total_price, 0);
                const total_hpp = items.reduce((sum, item) => sum + (item.hpp * item.qty), 0);
                const total_profit = items.reduce((sum, item) => sum + item.profit, 0);

                return {
                    wo_id: wo.id,
                    vehicle_entry_id: wo.vehicle_entry_id,
                    entry_date: vehicleEntry ? format(new Date(vehicleEntry.entry_date), 'dd-MM-yyyy') : '',
                    wo_number: wo.wo_number,
                    plate_number: vehicle?.license_plate || 'N/A',
                    brand_type: vehicle?.brand_type || null,
                    vehicle_type: vehicle?.vehicle_type || null,
                    service_group: vehicle?.vehicle_type || null, // FIX: Use vehicle_type for Group
                    customer_name: vehicle?.owner_name || 'N/A',
                    total_realized,
                    total_hpp,
                    total_profit,
                    items: items,
                };
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
                                        <TableHead className="text-right">HPP</TableHead>
                                        <TableHead className="text-right">Profit</TableHead>
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
                                                    <TableCell className="text-right">{(item.hpp * item.qty).toLocaleString('id-ID')}</TableCell>
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
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default WorkOrderDetailReport;