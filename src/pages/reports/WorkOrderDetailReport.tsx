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
    wo_id: string;
    vehicle_entry_id: string;
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

            // Step 2: Fetch related primary entities in parallel
            const [
                    { data: vehicleEntriesData, error: entriesError },
                    { data: poData, error: poError },
                ] = await Promise.all([
                    supabase.from('vehicle_entries').select('id, entry_date, service_group, vehicle_id').in('id', vehicleEntryIds),
                    supabase.from('purchase_orders').select('id, work_order_id').in('work_order_id', workOrderIds),
                ]);

                if (entriesError) throw new Error(`Gagal mengambil data vehicle entries: ${entriesError.message}`);
                if (poError) throw new Error(`Gagal mengambil data purchase orders: ${poError.message}`);
                // if (estimationJobsError) throw new Error(`Gagal mengambil data estimasi jasa: ${estimationJobsError.message}`);

            // Step 3: Fetch dependent entities based on results from Step 2
            const vehicleIds = vehicleEntriesData?.map(ve => ve.vehicle_id).filter(Boolean) || [];
                const poIds = poData?.map(po => po.id).filter(Boolean) || [];

                const [
                    { data: vehiclesData, error: vehiclesError },
                    { data: poItemsData, error: poItemsError },
                ] = await Promise.all([
                    supabase.from('vehicles').select('id, license_plate, vehicle_type, owner_name').in('id', vehicleIds),
                    supabase.from('purchase_order_items').select('id, po_id, goods_id, quantity, unit_price').in('po_id', poIds),
                ]);

                if (vehiclesError) throw new Error(`Gagal mengambil data kendaraan: ${vehiclesError.message}`);
                if (poItemsError) throw new Error(`Gagal mengambil data item PO: ${poItemsError.message}`);

                // Step 4: Fetch master data (goods and job types)
                const allGoodsIds = poItemsData?.map(item => item.goods_id).filter(Boolean) || [];
                
                const [
                    { data: goods, error: goodsError },
                ] = await Promise.all([
                    supabase.from('goods').select('id, name, unit, item_type').in('id', allGoodsIds),
                ]);

                if (goodsError) throw new Error(`Gagal mengambil data master barang: ${goodsError.message}`);

            // Step 5: Create maps for efficient data processing
                const vehicleMap = new Map(vehiclesData?.map(v => [v.id, v]));
                const vehicleEntryMap = new Map(vehicleEntriesData?.map(e => [e.id, e]));
                const goodsMap = new Map(goods?.map(g => [g.id, g]));
                
                const woToPoItemsMap = new Map<string, any[]>();
                const poIdToWoIdMap = new Map(poData?.map(po => [po.id, po.work_order_id]));
                poItemsData?.forEach(item => {
                    const woId = poIdToWoIdMap.get(item.po_id);
                    if (woId) {
                        if (!woToPoItemsMap.has(woId)) {
                            woToPoItemsMap.set(woId, []);
                        }
                        woToPoItemsMap.get(woId)?.push(item);
                    }
                });

            // Step 6: Combine all data into the final report structure
            const finalReportData = woData.map(wo => {
                const vehicleEntry = vehicleEntryMap.get(wo.vehicle_entry_id);
                const vehicle = vehicleEntry ? vehicleMap.get(vehicleEntry.vehicle_id) : undefined;
                
                const allItems: ReportItem[] = [];
                
                // Add Realized Items from Purchase Orders
                    const realizedPoItems = woToPoItemsMap.get(wo.id) || [];
                    realizedPoItems.forEach(item => {
                        const good = goodsMap.get(item.goods_id);
                        const hpp = item.unit_price || 0;
                        const total_price = hpp * item.quantity; // Assuming selling price is HPP for now
                        allItems.push({
                            item_type: good?.item_type === 'NON_PERSEDIAAN' ? 'JASA' : 'PART',
                            item_name: good?.name || 'Unknown Item',
                            qty: item.quantity,
                            unit_price: hpp,
                            total_price: total_price,
                            hpp: hpp,
                            profit: 0, // Profit logic needs clarification
                            source: 'REALIZED',
                        });
                    });

                const total_realized = allItems.filter(i => i.source === 'REALIZED').reduce((sum, item) => sum + item.total_price, 0);
                const total_profit = allItems.filter(i => i.source === 'REALIZED').reduce((sum, item) => sum + item.profit, 0);

                return {
                    wo_id: wo.id,
                    vehicle_entry_id: wo.vehicle_entry_id,
                    entry_date: vehicleEntry ? format(new Date(vehicleEntry.entry_date), 'dd-MM-yyyy') : '',
                    wo_number: wo.wo_number,
                    plate_number: vehicle?.license_plate || 'N/A',
                    vehicle_type: vehicle?.vehicle_type || null,
                    service_group: vehicleEntry?.service_group || null,
                    customer_name: vehicle?.owner_name || 'N/A',
                    total_realized,
                    total_profit,
                    items: allItems,
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
                                                <TableRow key={`${entry.wo_id}-${itemIndex}`} className={item.source === 'ESTIMATE_ONLY' ? 'bg-yellow-100' : ''}>
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