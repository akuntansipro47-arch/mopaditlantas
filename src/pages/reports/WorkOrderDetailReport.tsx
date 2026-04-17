import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// import { DatePickerWithRange as DateRangePicker } from "@/components/ui/date-picker-with-range";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from '@/supabaseClient';
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
    const [vehicleGroups, setVehicleGroups] = useState<any[]>([]);

    useEffect(() => {
        const fetchVehicleGroups = async () => {
            const { data, error } = await supabase
                .from('vehicle_groups')
                .select('id, group_name');
            if (error) {
                console.error('Error fetching vehicle groups:', error);
            } else {
                setVehicleGroups(data);
            }
        };
        fetchVehicleGroups();
    }, []);

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
                            id,
                            license_plate,
                            brand_type,
                            vehicle_group_id
                        ),
                        vehicle_entry_jobs (
                            job_type_id,
                            job_types (
                                job_name,
                                selling_price,
                                job_group
                            )
                        ),
                        vehicle_entry_spareparts (
                            item_name,
                            qty,
                            estimated_price
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

            const { data: workOrders, error: woError } = await query;

            if (woError) throw woError;

            let filteredWorkOrders = workOrders;
            if (vehicleGroupFilter !== 'semua') {
                filteredWorkOrders = workOrders.filter(wo =>
                    String(wo.vehicle_entries?.vehicles?.vehicle_group_id) === vehicleGroupFilter
                );
            }

            // Get all unique goods_ids and job_type_ids from billings for HPP lookup
            const allGoodsIds = new Set<string>();
            const allJobTypeIds = new Set<string>();
            filteredWorkOrders.forEach(wo => {
                wo.work_order_billings.forEach((bill: any) => {
                    if (bill.item_type === 'PART' && bill.goods_id) {
                        allGoodsIds.add(String(bill.goods_id));
                    }
                    if (bill.item_type === 'JOB' && bill.job_type_id) {
                        allJobTypeIds.add(String(bill.job_type_id));
                    }
                });
            });

            // Fetch HPP for parts from goods_issues
            const { data: goodsIssues, error: giError } = await supabase
                .from('goods_issues')
                .select('goods_id, hpp')
                .in('goods_id', Array.from(allGoodsIds));

            if (giError) throw giError;

            const partHppMap: { [key: string]: number } = {};
            goodsIssues.forEach(gi => {
                partHppMap[String(gi.goods_id)] = gi.hpp || 0;
            });

            // Fetch HPP for jobs from job_types
            const { data: jobTypes, error: jtError } = await supabase
                .from('job_types')
                .select('id, capital_price')
                .in('id', Array.from(allJobTypeIds));

            if (jtError) throw jtError;

            const jobHppMap: { [key: string]: number } = {};
            jobTypes.forEach(jt => {
                jobHppMap[String(jt.id)] = jt.capital_price || 0;
            });
            
            // Fetch all goods issues within the date range to find items not in billings
            const { data: allGoodsIssues, error: allGiError } = await supabase
                .from('goods_issues')
                .select(`
                    id,
                    work_order_id,
                    goods_id,
                    qty,
                    hpp,
                    goods (
                        name
                    )
                `)
                .in('work_order_id', filteredWorkOrders.map(wo => wo.id));

            if (allGiError) throw allGiError;

            const issuesByWoId = new Map<string, any[]>();
            allGoodsIssues.forEach(issue => {
                const woId = String(issue.work_order_id);
                if (!issuesByWoId.has(woId)) {
                    issuesByWoId.set(woId, []);
                }
                issuesByWoId.get(woId)?.push(issue);
            });


            const processedData = filteredWorkOrders.map(wo => {
                let mergedBillings = [...(wo.work_order_billings || [])];
                
                const billedGoodsIds = new Set(
                    mergedBillings
                        .filter((b: any) => b.item_type === 'PART' && b.goods_id)
                        .map((b: any) => String(b.goods_id))
                );
                
                // START: Logic to add non-realized estimations for control
                if (wo.vehicle_entries) {
                  const realizedJobIds = new Set(mergedBillings.filter(b => b.item_type === 'JOB' && b.job_type_id).map(b => String(b.job_type_id)));
                  
                  const missingEstimatedJobs = (wo.vehicle_entries.vehicle_entry_jobs || [])
                    .filter((ej: any) => ej.job_type_id && !realizedJobIds.has(String(ej.job_type_id)))
                    .map((ej: any) => ({
                      item_type: 'JOB',
                      job_type_id: ej.job_type_id,
                      goods_id: null,
                      item_name: `(Estimasi) ${ej.job_types?.job_name || 'Pekerjaan'}`,
                      qty: 1,
                      unit_price: ej.job_types?.selling_price || 0,
                      total_price: ej.job_types?.selling_price || 0, // Show estimated price
                      job_group: ej.job_types?.job_group || 'LAINNYA',
                      source: 'ESTIMATE_ONLY', // Flag for rendering
                    }));
      
                  // Note: Matching estimated parts (by name) to realized parts (by goods_id) is unreliable.
                  // For now, we only add missing estimated jobs to avoid creating confusing duplicate part entries.
      
                  if (missingEstimatedJobs.length > 0) {
                    mergedBillings = [...mergedBillings, ...missingEstimatedJobs];
                  }
                }
                // END: Logic to add non-realized estimations
      
                // Inject goods issue items that are not already in billings
                const injected = (issuesByWoId.get(String(wo.id)) || [])
                    .filter(issue => !billedGoodsIds.has(String(issue.goods_id)))
                    .map(issue => ({
                        item_type: 'PART',
                        item_name: `(Unbilled) ${issue.goods?.name || 'Part'}`,
                        qty: issue.qty,
                        unit_price: 0, // Not billed, so price is 0
                        total_price: 0,
                        goods_id: issue.goods_id,
                        source: 'UNBILLED_ISSUE'
                    }));
                
                if (injected.length > 0) {
                    mergedBillings = [...mergedBillings, ...injected];
                }

                return {
                    ...wo,
                    billings: mergedBillings,
                    partHppMap,
                    jobHppMap,
                };
            });

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
    
        // Header
        ws_data.push([
            "Laporan Detail Work Order",
            "", "", "", "", "", "", "", "", "", ""
        ]);
        ws_data.push([
            `Periode: ${dateRange?.from ? formatDate(dateRange.from.toISOString()) : ''} - ${dateRange?.to ? formatDate(dateRange.to.toISOString()) : ''}`,
            "", "", "", "", "", "", "", "", "", ""
        ]);
        ws_data.push([]); // Spacer
    
        // Table Header
        ws_data.push([
            "No. WO",
            "Tgl WO",
            "Status",
            "No. Polisi",
            "Grup Kendaraan",
            "Item/Jasa",
            "Qty",
            "Harga Satuan",
            "Total Harga",
            "Realisasi (HPP)",
            "Selisih"
        ]);
    
        // Table Body
        reportData.forEach(wo => {
            const { billings, partHppMap, jobHppMap } = wo;
            const vehicleGroup = vehicleGroups.find(g => String(g.id) === String(wo.vehicle_entries?.vehicles?.vehicle_group_id))?.group_name || 'Umum';
    
            if (billings && billings.length > 0) {
                billings.forEach((bill: any, idx: number) => {
                    const unitPrice = Number(bill.unit_price || 0);
                    const totalPrice = Number(bill.total_price || 0);
                    const qty = Number(bill.qty || 0);
                    let hppSatuan = 0;
    
                    if (bill.source === 'ESTIMATE_ONLY') {
                        hppSatuan = 0; // No real cost for estimate-only items
                    } else if (bill.item_type === 'PART' && bill.goods_id) {
                        hppSatuan = partHppMap[String(bill.goods_id)] || 0;
                    } else if (bill.item_type === 'JOB' && bill.job_type_id) {
                        hppSatuan = jobHppMap[String(bill.job_type_id)] || 0;
                    }
    
                    const realisasi = hppSatuan * qty;
                    const selisih = totalPrice - realisasi;
    
                    const row = [
                        idx === 0 ? wo.wo_number : "",
                        idx === 0 ? formatDate(wo.work_date) : "",
                        idx === 0 ? wo.status : "",
                        idx === 0 ? wo.vehicle_entries?.vehicles?.license_plate : "",
                        idx === 0 ? vehicleGroup : "",
                        bill.item_name,
                        bill.qty,
                        unitPrice,
                        totalPrice,
                        bill.source === 'ESTIMATE_ONLY' ? '-' : realisasi,
                        bill.source === 'ESTIMATE_ONLY' ? '-' : selisih,
                    ];
                    ws_data.push(row);
                });
            } else {
                // Show WO even if it has no billings (e.g., only estimations)
                const vehicleGroup = vehicleGroups.find(g => String(g.id) === String(wo.vehicle_entries?.vehicles?.vehicle_group_id))?.group_name || 'Umum';
                ws_data.push([
                    wo.wo_number,
                    formatDate(wo.work_date),
                    wo.status,
                    wo.vehicle_entries?.vehicles?.license_plate,
                    vehicleGroup,
                    "(Belum ada realisasi/estimasi)",
                    "", "", "", "", ""
                ]);
            }
        });
    
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
    
        // Styling (basic width)
        ws['!cols'] = [
            { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 },
            { wch: 40 }, { wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
        ];
    
        XLSX.utils.book_append_sheet(wb, ws, "Detail WO");
        XLSX.writeFile(wb, `Laporan_Detail_WO_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    const getVehicleGroupLabel = (wo: any) => {
        if (!wo.vehicle_entries?.vehicles?.vehicle_group_id) return 'Umum';
        const group = vehicleGroups.find(g => String(g.id) === String(wo.vehicle_entries.vehicles.vehicle_group_id));
        return group ? group.group_name : 'Umum';
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
                        {/* <DateRangePicker
                            date={dateRange}
                            onDateChange={setDateRange}
                        /> */}
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
                                {vehicleGroups.map(group => (
                                    <SelectItem key={group.id} value={String(group.id)}>{group.group_name}</SelectItem>
                                ))}
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
                                    <TableHead>Status</TableHead>
                                    <TableHead>No. Polisi</TableHead>
                                    <TableHead>Grup Kendaraan</TableHead>
                                    <TableHead>Item/Jasa</TableHead>
                                    <TableHead className="text-center">Qty</TableHead>
                                    <TableHead className="text-right">Harga Satuan</TableHead>
                                    <TableHead className="text-right">Total Harga</TableHead>
                                    <TableHead className="text-right">Realisasi (HPP)</TableHead>
                                    <TableHead className="text-right">Selisih</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={11} className="text-center">Memuat data...</TableCell>
                                    </TableRow>
                                ) : memoizedReportData.length > 0 ? (
                                    memoizedReportData.map(wo => {
                                        const { billings, partHppMap, jobHppMap } = wo;
                                        return (billings && billings.length > 0) ? billings.map((bill: any, idx: number) => {
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
                           
                                            return (
                                               <TableRow key={`${wo.id}-${idx}`} className={bill.source === 'ESTIMATE_ONLY' ? 'bg-gray-50/50 text-gray-500' : ''}>
                                                    {idx === 0 && (
                                                        <>
                                                            <TableCell rowSpan={billings.length} className="align-top border-r">{wo.wo_number}</TableCell>
                                                            <TableCell rowSpan={billings.length} className="align-top border-r">{formatDate(wo.work_date)}</TableCell>
                                                            <TableCell rowSpan={billings.length} className="align-top border-r">{getStatusBadge(wo.status)}</TableCell>
                                                            <TableCell rowSpan={billings.length} className="align-top border-r">
                                                                <div className="font-medium">{wo.vehicle_entries?.vehicles?.license_plate}</div>
                                                                <div className="text-xs text-muted-foreground">{wo.vehicle_entries?.vehicles?.brand_type}</div>
                                                            </TableCell>
                                                            <TableCell rowSpan={billings.length} className="align-top border-r">{getVehicleGroupLabel(wo)}</TableCell>
                                                        </>
                                                    )}
                                                    <TableCell>{bill.item_name}</TableCell>
                                                    <TableCell className="text-center">{bill.qty}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(unitPrice)}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(totalPrice)}</TableCell>
                                                   <TableCell className="text-right bg-gray-100">
                                                     {bill.source === 'ESTIMATE_ONLY' ? '-' : formatCurrency(realisasi)}
                                                   </TableCell>
                                                   <TableCell className="text-right bg-green-50/50">
                                                     {bill.source === 'ESTIMATE_ONLY' ? '-' : formatCurrency(totalPrice - realisasi)}
                                                   </TableCell>
                                                </TableRow>
                                            )
                                        }) : (
                                            <TableRow key={wo.id}>
                                                <TableCell className="border-r">{wo.wo_number}</TableCell>
                                                <TableCell className="border-r">{formatDate(wo.work_date)}</TableCell>
                                                <TableCell className="border-r">{getStatusBadge(wo.status)}</TableCell>
                                                <TableCell className="border-r">
                                                    <div className="font-medium">{wo.vehicle_entries?.vehicles?.license_plate}</div>
                                                    <div className="text-xs text-muted-foreground">{wo.vehicle_entries?.vehicles?.brand_type}</div>
                                                </TableCell>
                                                <TableCell className="border-r">{getVehicleGroupLabel(wo)}</TableCell>
                                                <TableCell colSpan={6} className="text-center text-muted-foreground italic">
                                                    Belum ada realisasi/estimasi yang tercatat.
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={11} className="text-center">Tidak ada data untuk ditampilkan.</TableCell>
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