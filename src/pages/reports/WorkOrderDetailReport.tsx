import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type ReportData = {
    wo_id: string;
    vehicle_entry_id: string;
    entry_date: string;
    wo_number: string;
    po_payment_summary: string;
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
    value_only: boolean;
    qty: number;
    unit_price: number;
    total_price: number;
    hpp: number;
    total_hpp: number;
    profit: number;
    po_info: string;
    source: 'REALIZED' | 'ESTIMATE_ONLY';
};

const WorkOrderDetailReport = () => {
    const [reportData, setReportData] = useState<ReportData[]>([]);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [statusFilter, setStatusFilter] = useState('semua');
    const [vehicleGroupFilter, setVehicleGroupFilter] = useState('semua');
    const [searchTerm, setSearchTerm] = useState('');
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const topScrollRef = useRef<HTMLDivElement>(null);
    const syncingRef = useRef<'top' | 'bottom' | null>(null);
    const [tableScrollWidth, setTableScrollWidth] = useState(1);
    const fetchSeqRef = useRef(0);
    const paymentWarnedRef = useRef(false);

    const scrollX = (delta: number) => {
        const el = scrollContainerRef.current;
        if (!el) return;
        el.scrollBy({ left: delta, behavior: 'smooth' });
    };

    useEffect(() => {
        const bottom = scrollContainerRef.current;
        const top = topScrollRef.current;
        if (!bottom || !top) return;

        const onBottomScroll = () => {
            if (syncingRef.current === 'top') return;
            syncingRef.current = 'bottom';
            top.scrollLeft = bottom.scrollLeft;
            syncingRef.current = null;
        };

        const onTopScroll = () => {
            if (syncingRef.current === 'bottom') return;
            syncingRef.current = 'top';
            bottom.scrollLeft = top.scrollLeft;
            syncingRef.current = null;
        };

        bottom.addEventListener('scroll', onBottomScroll, { passive: true });
        top.addEventListener('scroll', onTopScroll, { passive: true });

        return () => {
            bottom.removeEventListener('scroll', onBottomScroll);
            top.removeEventListener('scroll', onTopScroll);
        };
    }, []);

    useEffect(() => {
        const bottom = scrollContainerRef.current;
        if (!bottom) return;

        const update = () => {
            requestAnimationFrame(() => {
                setTableScrollWidth(Math.max(1, bottom.scrollWidth));
            });
        };
        update();
        setTimeout(update, 0);

        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(update);
        ro.observe(bottom);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('resize', update);
            ro.disconnect();
        };
    }, [reportData]);

    useEffect(() => {
        fetchReportData();
    }, [startDate, endDate]);

    const fetchReportData = async () => {
        const seq = ++fetchSeqRef.current;
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
                supabase
                    .from('vehicle_entry_spareparts')
                    .select('vehicle_entry_id, goods_id, item_name, qty, estimated_price, value_only')
                    .in('vehicle_entry_id', vehicleEntryIds),
                supabase
                    .from('vehicle_entry_jobs')
                    .select('vehicle_entry_id, job_type_id, estimated_price, value_only')
                    .in('vehicle_entry_id', vehicleEntryIds),
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
            const allGoodsIds = Array.from(new Set((estimationParts || []).map((p: any) => p.goods_id).filter(Boolean)));
            const allJobTypeIds = Array.from(new Set((estimationJobs || []).map((j: any) => j.job_type_id).filter(Boolean)));
            const allVehicleIds = vehicleEntriesData?.map(ve => ve.vehicle_id).filter(Boolean) || [];

            const [
                { data: receivedPoItemsWo, error: receivedPoWoError },
                { data: purchaseOrdersWo, error: purchaseOrdersWoError },
                { data: vehiclesData, error: vehiclesError },
                { data: jobTypesData, error: jobTypesError },
            ] = await Promise.all([
                supabase
                    .from('purchase_order_items')
                    .select('goods_id, job_type_id, service_name, line_type, quantity, unit_price, purchase_orders!inner(id, po_number, status, work_order_id)')
                    .in('purchase_orders.status', ['RECEIVED_PART', 'RECEIVED_FULL'])
                    .in('purchase_orders.work_order_id', workOrderIds)
                    .not('unit_price', 'is', null)
                    .limit(20000),
                supabase
                    .from('purchase_orders')
                    .select('id, po_number, work_order_id')
                    .in('work_order_id', workOrderIds),
                supabase
                    .from('vehicles')
                    .select('id, license_plate, brand_type, vehicle_type, owner_name')
                    .in('id', allVehicleIds),
                supabase.from('job_types').select('id, job_name, hpp, selling_price').in('id', allJobTypeIds),
            ]);

            if (receivedPoWoError) throw new Error(`Gagal mengambil data HPP (PO WO): ${receivedPoWoError.message}`);
            if (purchaseOrdersWoError) throw new Error(`Gagal mengambil data PO WO: ${purchaseOrdersWoError.message}`);
            if (vehiclesError) throw new Error(`Gagal mengambil data kendaraan: ${vehiclesError.message}`);
            if (jobTypesError) throw new Error(`Gagal mengambil data jenis pekerjaan: ${jobTypesError.message}`);

            const missingGoodsNames = Array.from(
                new Set(
                    (estimationParts || [])
                        .filter((p: any) => !p.goods_id && String(p.item_name || '').trim())
                        .map((p: any) => String(p.item_name || '').trim())
                )
            );

            const goodsRows: any[] = [];
            if (allGoodsIds.length > 0) {
                const { data, error } = await supabase.from('goods').select('id, name').in('id', allGoodsIds);
                if (error) throw new Error(`Gagal mengambil data barang: ${error.message}`);
                goodsRows.push(...(data || []));
            }
            if (missingGoodsNames.length > 0) {
                const { data, error } = await supabase.from('goods').select('id, name').in('name', missingGoodsNames);
                if (error) throw new Error(`Gagal mengambil data barang: ${error.message}`);
                goodsRows.push(...(data || []));
            }

            const goodsData = Array.from(new Map(goodsRows.map((g: any) => [String(g.id), g])).values());

            // Step 4: Pre-process data into fast-lookup maps
            const goodsMap = new Map(goodsData.map(g => [g.id, g.name]));
            const goodsIdByNameMap = new Map(goodsData.map(g => [g.name, g.id]));
            
            const normalizeText = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
            const receivedItems = ([] as any[]).concat(receivedPoItemsWo || []);
            const poIdByNumber = new Map<string, string>();
            const woPoIds = new Map<string, Set<string>>();
            receivedItems.forEach((it) => {
                const poId = String(it.purchase_orders?.id || '').trim();
                const poNumber = String(it.purchase_orders?.po_number || '').trim();
                if (poId && poNumber) {
                    poIdByNumber.set(poNumber, poId);
                    const woId = String(it.purchase_orders?.work_order_id || '').trim();
                    if (woId) {
                        const set = woPoIds.get(woId) || new Set<string>();
                        set.add(poId);
                        woPoIds.set(woId, set);
                    }
                }
            });

            (purchaseOrdersWo || []).forEach((po: any) => {
                const poId = String(po.id || '').trim();
                const poNumber = String(po.po_number || '').trim();
                const woId = String(po.work_order_id || '').trim();
                if (poId && poNumber) poIdByNumber.set(poNumber, poId);
                if (poId && woId) {
                    const set = woPoIds.get(woId) || new Set<string>();
                    set.add(poId);
                    woPoIds.set(woId, set);
                }
            });

            const poIds = Array.from(new Set(Array.from(poIdByNumber.values())));
            const poPaymentStatusById = new Map<string, string>();
            if (poIds.length > 0) {
                try {
                    const { data: invoiceRows, error: invoiceErr } = await supabase
                        .from('purchase_invoices')
                        .select('po_id, total_amount, paid_amount')
                        .in('po_id', poIds);
                    if (invoiceErr) throw invoiceErr;

                    const aggByPoId = new Map<string, { sumTotal: number; sumPaid: number; count: number }>();
                    (invoiceRows || []).forEach((inv: any) => {
                        const poId = String(inv.po_id || '').trim();
                        if (!poId) return;
                        const cur = aggByPoId.get(poId) || { sumTotal: 0, sumPaid: 0, count: 0 };
                        cur.sumTotal += Number(inv.total_amount || 0);
                        cur.sumPaid += Number(inv.paid_amount || 0);
                        cur.count += 1;
                        aggByPoId.set(poId, cur);
                    });

                    poIds.forEach((poId) => {
                        const agg = aggByPoId.get(poId);
                        if (!agg || agg.count === 0) {
                            poPaymentStatusById.set(poId, 'Belum Ditagih');
                            return;
                        }
                        if (agg.sumTotal > 0 && agg.sumPaid >= agg.sumTotal) {
                            poPaymentStatusById.set(poId, 'Lunas');
                            return;
                        }
                        if (agg.sumPaid > 0) {
                            poPaymentStatusById.set(poId, 'Bayar Sebagian');
                            return;
                        }
                        poPaymentStatusById.set(poId, 'Belum Lunas');
                    });
                } catch (e: any) {
                    console.error('Gagal mengambil status pembayaran PO:', e);
                    if (!paymentWarnedRef.current) {
                        paymentWarnedRef.current = true;
                        toast.warning('Status pembayaran PO gagal dimuat. Data tetap tampil tanpa status bayar.');
                    }
                }
            }

            const woPoPaymentSummary = new Map<string, string>();
            workOrderIds.forEach((woId) => {
                const poSet = woPoIds.get(String(woId)) || new Set<string>();
                const counts: Record<string, number> = {};
                Array.from(poSet).forEach((poId) => {
                    const st = poPaymentStatusById.get(String(poId)) || 'Belum Ditagih';
                    counts[st] = (counts[st] || 0) + 1;
                });
                const parts = ['Lunas', 'Belum Lunas', 'Bayar Sebagian', 'Belum Ditagih']
                    .filter((k) => (counts[k] || 0) > 0)
                    .map((k) => `${k}: ${counts[k]}`);
                woPoPaymentSummary.set(String(woId), parts.length > 0 ? `PO ${parts.join(' | ')}` : '');
            });

            const getPoNumberLabel = (poNumber: string) => {
                const poId = poIdByNumber.get(poNumber);
                const status = poId ? poPaymentStatusById.get(poId) : undefined;
                return status ? `${poNumber} (${status})` : poNumber;
            };
            const receivedPartItems = receivedItems.filter((it) => (it.line_type || 'PART') === 'PART' && it.goods_id);
            const receivedJobItems = receivedItems.filter((it) => it.line_type === 'JASA');

            const partHppByWoGoods = new Map<string, { sumQty: number; sumValue: number }>();
            const partPoByWoGoods = new Map<string, Set<string>>();
            receivedPartItems.forEach((it) => {
                const woId = it.purchase_orders?.work_order_id;
                const goodsId = it.goods_id;
                const qty = Number(it.quantity || 0);
                const price = Number(it.unit_price || 0);
                const poNumber = String(it.purchase_orders?.po_number || '').trim();
                if (woId && goodsId && qty > 0 && price > 0) {
                    const key = `${woId}:${goodsId}`;
                    const cur = partHppByWoGoods.get(key) || { sumQty: 0, sumValue: 0 };
                    cur.sumQty += qty;
                    cur.sumValue += qty * price;
                    partHppByWoGoods.set(key, cur);
                    if (poNumber) {
                        const set = partPoByWoGoods.get(key) || new Set<string>();
                        set.add(poNumber);
                        partPoByWoGoods.set(key, set);
                    }
                }
            });

            const jobHppByWoJobType = new Map<string, { sumQty: number; sumValue: number }>();
            const jobHppByWoName = new Map<string, { sumQty: number; sumValue: number }>();
            const jobPoByWoJobType = new Map<string, Set<string>>();
            const jobPoByWoName = new Map<string, Set<string>>();
            receivedJobItems.forEach((it) => {
                const woId = it.purchase_orders?.work_order_id;
                const qty = Number(it.quantity || 0);
                const price = Number(it.unit_price || 0);
                const poNumber = String(it.purchase_orders?.po_number || '').trim();
                if (!woId || qty <= 0 || price <= 0) return;
                const jobTypeId = it.job_type_id ? String(it.job_type_id) : '';
                const serviceName = normalizeText(String(it.service_name || ''));
                if (jobTypeId) {
                    const key = `${woId}:${jobTypeId}`;
                    const cur = jobHppByWoJobType.get(key) || { sumQty: 0, sumValue: 0 };
                    cur.sumQty += qty;
                    cur.sumValue += qty * price;
                    jobHppByWoJobType.set(key, cur);
                    if (poNumber) {
                        const set = jobPoByWoJobType.get(key) || new Set<string>();
                        set.add(poNumber);
                        jobPoByWoJobType.set(key, set);
                    }
                } else if (serviceName) {
                    const key = `${woId}:${serviceName}`;
                    const cur = jobHppByWoName.get(key) || { sumQty: 0, sumValue: 0 };
                    cur.sumQty += qty;
                    cur.sumValue += qty * price;
                    jobHppByWoName.set(key, cur);
                    if (poNumber) {
                        const set = jobPoByWoName.get(key) || new Set<string>();
                        set.add(poNumber);
                        jobPoByWoName.set(key, set);
                    }
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

            const getPoLabel = (poSet: Set<string> | undefined): string => {
                if (!poSet || poSet.size === 0) return '';
                if (poSet.size === 1) return getPoNumberLabel(Array.from(poSet)[0]);
                const statusCounts: Record<string, number> = {};
                Array.from(poSet).forEach((poNumber) => {
                    const poId = poIdByNumber.get(poNumber);
                    const status = (poId && poPaymentStatusById.get(poId)) || 'Unknown';
                    statusCounts[status] = (statusCounts[status] || 0) + 1;
                });
                const summary = Object.entries(statusCounts)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(', ');
                return summary ? `Multi PO (${poSet.size}) [${summary}]` : `Multi PO (${poSet.size})`;
            };

            const getPartHppInfo = (woId: string | undefined, goodsId: string | null): { hpp: number; po_info: string } => {
                if (!goodsId) return { hpp: 0, po_info: '' };
                if (woId) {
                    const agg = partHppByWoGoods.get(`${woId}:${goodsId}`);
                    if (agg && agg.sumQty > 0) {
                        const poLabel = getPoLabel(partPoByWoGoods.get(`${woId}:${goodsId}`));
                        return { hpp: agg.sumValue / agg.sumQty, po_info: poLabel ? `PO WO: ${poLabel}` : 'PO WO' };
                    }
                }
                return { hpp: 0, po_info: 'Belum ada PO WO' };
            };

            const getJobHppInfo = (woId: string | undefined, jobTypeId: string | null, jobName: string): { hpp: number; po_info: string } => {
                if (woId && jobTypeId) {
                    const agg = jobHppByWoJobType.get(`${woId}:${jobTypeId}`);
                    if (agg && agg.sumQty > 0) {
                        const poLabel = getPoLabel(jobPoByWoJobType.get(`${woId}:${jobTypeId}`));
                        return { hpp: agg.sumValue / agg.sumQty, po_info: poLabel ? `PO WO: ${poLabel}` : 'PO WO' };
                    }
                }
                if (woId) {
                    const key = `${woId}:${normalizeText(jobName)}`;
                    const agg = jobHppByWoName.get(key);
                    if (agg && agg.sumQty > 0) {
                        const poLabel = getPoLabel(jobPoByWoName.get(key));
                        return { hpp: agg.sumValue / agg.sumQty, po_info: poLabel ? `PO WO: ${poLabel}` : 'PO WO' };
                    }
                }
                if (jobTypeId) return { hpp: Number(jobTypesHppMap.get(jobTypeId) || 0), po_info: 'Master Jasa' };
                return { hpp: 0, po_info: '' };
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
                        : (jobTypesMap.get(jobTypeId) || 'Jasa Umum');

                    // Workaround: If goods_id is missing from estimation, try to find it by item_name
                    if (isPart && !goodsId && itemName) {
                        const foundGoodsId = goodsIdByNameMap.get(itemName);
                        if (foundGoodsId) {
                            goodsId = foundGoodsId;
                        }
                    }

                    woIds.forEach((woId) => {
                        const hppInfo = isPart
                            ? getPartHppInfo(woId, goodsId)
                            : getJobHppInfo(woId, jobTypeId ? String(jobTypeId) : null, itemName);
                        
                        const sellingPrice = isPart
                            ? Number(item.estimated_price || 0)
                            : Number(item.estimated_price || jobTypesSellMap.get(jobTypeId) || 0);
                        
                        const qty = item.qty || (isPart ? 0 : 1);
                        const totalSellingPrice = sellingPrice * qty;
                        const totalHpp = hppInfo.hpp * qty;
    
                        const reportItem: ReportItem = {
                            item_type: type,
                            item_name: itemName,
                            value_only: Boolean((item as any)?.value_only),
                            qty, unit_price: sellingPrice, total_price: totalSellingPrice,
                            hpp: hppInfo.hpp, total_hpp: totalHpp, profit: totalSellingPrice - totalHpp,
                            po_info: hppInfo.po_info,
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
                    po_payment_summary: woPoPaymentSummary.get(String(wo.id)) || '',
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

            if (seq === fetchSeqRef.current) setReportData(finalReportData);

        } catch (error: any) {
            toast.error(`Gagal mengambil data laporan: ${error.message}`);
            console.error(error);
        } finally {
            if (seq === fetchSeqRef.current) setLoading(false);
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

        if (statusFilter === 'realisasi') {
            filtered = filtered
                .map((entry) => ({
                    ...entry,
                    items: entry.items.filter((it) => it.source === 'REALIZED'),
                }))
                .filter((entry) => entry.items.length > 0);
        }

        return filtered;
    }, [reportData, statusFilter, vehicleGroupFilter, searchTerm]);

    const totals = useMemo(() => {
        let totalPagu = 0;
        let totalHpp = 0;
        filteredReportData.forEach((entry) => {
            entry.items.forEach((item) => {
                totalPagu += Number(item.total_price || 0);
                totalHpp += Number(item.total_hpp || 0);
            });
        });
        return { totalPagu, totalHpp };
    }, [filteredReportData]);

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
                        'Nilai Saja': item.value_only ? 'Ya' : 'Tidak',
                'Qty': item.qty,
                'Harga Satuan': item.unit_price,
                'Total Pagu': item.total_price,
                        'PO (Sumber HPP)': item.po_info,
                'HPP Satuan': item.hpp,
                'Total HPP': item.total_hpp,
                'Margin': item.profit,
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
                            {loading ? 'Memuat...' : 'Refresh'}
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <Card className="border-slate-200">
                            <CardHeader className="py-3">
                                <CardTitle className="text-sm font-semibold text-slate-700">Total Pagu (Sesuai Filter)</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3">
                                <div className="text-lg font-bold">{totals.totalPagu.toLocaleString('id-ID')}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-slate-200">
                            <CardHeader className="py-3">
                                <CardTitle className="text-sm font-semibold text-slate-700">Total HPP (Sesuai Filter)</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3">
                                <div className="text-lg font-bold">{totals.totalHpp.toLocaleString('id-ID')}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <div ref={topScrollRef} className="w-full overflow-x-auto overflow-y-hidden border rounded-md mb-2">
                        <div style={{ width: tableScrollWidth }} className="h-4" />
                    </div>

                    <div className="flex items-center justify-end gap-2 mb-2">
                        <Button type="button" variant="outline" size="icon" onClick={() => scrollX(-600)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon" onClick={() => scrollX(600)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <div ref={scrollContainerRef} className="w-full overflow-x-auto whitespace-nowrap rounded-md border">
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
                                        <TableHead>Nilai Saja</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Harga Satuan</TableHead>
                                        <TableHead className="text-right">Total Pagu</TableHead>
                                        <TableHead>PO</TableHead>
                                        <TableHead className="text-right">HPP Satuan</TableHead>
                                        <TableHead className="text-right">Total HPP</TableHead>
                                        <TableHead className="text-right">Margin</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredReportData.length > 0 ? (
                                        filteredReportData.map((entry, entryIndex) => (
                                            entry.items.map((item, itemIndex) => (
                                                <TableRow
                                                    key={`${entry.wo_id}-${itemIndex}`}
                                                    className={item.source === 'ESTIMATE_ONLY' ? 'bg-amber-50' : ''}
                                                >
                                                    {itemIndex === 0 && (
                                                        <TableCell rowSpan={entry.items.length} className="sticky left-0 bg-white z-10 font-medium align-top w-[200px]">
                                                            <div className="flex flex-col gap-1">
                                                                <div>{entry.wo_number}</div>
                                                                {entry.po_payment_summary ? (
                                                                    <div className="text-xs text-muted-foreground whitespace-normal">{entry.po_payment_summary}</div>
                                                                ) : null}
                                                            </div>
                                                        </TableCell>
                                                    )}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{entry.entry_date}</TableCell>}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{`${entry.plate_number} (${entry.brand_type || ''})`}</TableCell>}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{entry.customer_name}</TableCell>}
                                                    {itemIndex === 0 && <TableCell rowSpan={entry.items.length} className="align-top">{getVehicleGroupLabel(entry.vehicle_type, entry.service_group)}</TableCell>}
                                                    
                                                    <TableCell>{item.item_type === 'JOB' ? 'Jasa' : 'Sparepart'}</TableCell>
                                                    <TableCell>{item.item_name}</TableCell>
                                                    <TableCell>{item.value_only ? 'Ya' : 'Tidak'}</TableCell>
                                                    <TableCell className="text-right">{item.qty}</TableCell>
                                                    <TableCell className="text-right">{item.unit_price.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.total_price.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell>{item.po_info || '-'}</TableCell>
                                                    <TableCell className="text-right">{item.hpp.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.total_hpp.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right">{item.profit.toLocaleString('id-ID')}</TableCell>
                                                </TableRow>
                                            ))
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={15} className="h-24 text-center">
                                                Tidak ada data untuk ditampilkan.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-2">
                        <Button type="button" variant="outline" size="icon" onClick={() => scrollX(-600)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon" onClick={() => scrollX(600)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default WorkOrderDetailReport;
