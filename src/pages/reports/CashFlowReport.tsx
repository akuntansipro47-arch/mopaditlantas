import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndirectCashFlow } from './IndirectCashFlow';

type FlowDetails = { [key: string]: number };

type CategorizedFlow = {
    operating: { inflows: FlowDetails; outflows: FlowDetails; net: number; };
    investing: { inflows: FlowDetails; outflows: FlowDetails; net: number; };
    financing: { inflows: FlowDetails; outflows: FlowDetails; net: number; };
};

const CashFlowReport = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const [initialBalance, setInitialBalance] = useState(0);
    const [categorizedFlows, setCategorizedFlows] = useState<CategorizedFlow>({
        operating: { inflows: {}, outflows: {}, net: 0 },
        investing: { inflows: {}, outflows: {}, net: 0 },
        financing: { inflows: {}, outflows: {}, net: 0 },
    });

    const urlMethod = searchParams.get('method') === 'indirect' ? 'indirect' : 'direct';
    const [method, setMethod] = useState<'direct' | 'indirect'>(urlMethod);

    useEffect(() => {
        setMethod(urlMethod);
    }, [urlMethod]);

    const fetchReportData = async () => {
        setLoading(true);
        try {
            // 1. Get initial balance using RPC
            const { data: initialData, error: initialError } = await supabase
                .rpc('get_initial_cash_balance', { p_start_date: startDate });

            if (initialError) throw new Error(`Gagal mengambil saldo awal: ${initialError.message}`);
            
            const initial = initialData || 0;
            setInitialBalance(initial);

            // 2. Get all journal entries with details
            const { data: journalEntries, error: entriesError } = await supabase
                .from('journal_entries')
                .select(`
                    id,
                    entry_date,
                    journal_entry_items (
                        id,
                        debit,
                        credit,
                        chart_of_accounts (
                            account_name,
                            category,
                            sub_category
                        )
                    )
                `)
                .gte('entry_date', startDate)
                .lte('entry_date', endDate);

            if (entriesError) throw new Error(`Gagal mengambil entri jurnal: ${entriesError.message}`);

            const flows: CategorizedFlow = {
                operating: { inflows: {}, outflows: {}, net: 0 },
                investing: { inflows: {}, outflows: {}, net: 0 },
                financing: { inflows: {}, outflows: {}, net: 0 },
            };

            const getCashFlowCategory = (category: string | null, subCategory: string | null): keyof Omit<CategorizedFlow, 'net'> | null => {
                if (!category) return 'operating';
                const opCats = ['PENDAPATAN', 'PENJUALAN', 'HPP', 'BEBAN'];
                const opSubCats = ['HUTANG', 'PIUTANG'];
                if (opCats.includes(category) || (subCategory && opSubCats.includes(subCategory))) {
                    return 'operating';
                }
                if (category === 'AKTIVA' && subCategory === 'AKTIVA_TETAP') {
                    return 'investing';
                }
                if (category === 'MODAL' || (category === 'PASSIVA' && subCategory !== 'HUTANG')) {
                    return 'financing';
                }
                return 'operating';
            };

            for (const entry of (journalEntries || [])) {
                const cashItem = (entry.journal_entry_items || []).find(item =>
                    item.chart_of_accounts?.category === 'AKTIVA' && (item.chart_of_accounts.sub_category === 'AKTIVA_LANCAR' || item.chart_of_accounts.account_name?.toLowerCase().includes('kas') || item.chart_of_accounts.account_name?.toLowerCase().includes('bank'))
                );

                if (!cashItem) continue;

                const otherItems = (entry.journal_entry_items || []).filter(item => item.id !== cashItem.id && item.chart_of_accounts);

                if (otherItems.length === 0) continue;

                const is_inflow = cashItem.debit > 0;

                for (const otherItem of otherItems) {
                    const category = getCashFlowCategory(otherItem.chart_of_accounts.category, otherItem.chart_of_accounts.sub_category);
                    if (category) {
                        const amount = is_inflow ? otherItem.credit : otherItem.debit;
                        const accountName = otherItem.chart_of_accounts.account_name || 'Lain-lain';
                        
                        if (amount > 0) {
                            const targetFlow = is_inflow ? flows[category].inflows : flows[category].outflows;
                            targetFlow[accountName] = (targetFlow[accountName] || 0) + amount;
                        }
                    }
                }
            }

            // Calculate net flows
            Object.keys(flows).forEach(catString => {
                const cat = catString as keyof CategorizedFlow;
                const totalInflows = Object.values(flows[cat].inflows).reduce((s, a) => s + a, 0);
                const totalOutflows = Object.values(flows[cat].outflows).reduce((s, a) => s + a, 0);
                flows[cat].net = totalInflows - totalOutflows;
            });

            setCategorizedFlows(flows);

        } catch (error: any) {
            toast.error(error.message);
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReportData();
    }, [startDate, endDate]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(value);
    };

    const renderFlowDetails = (details: FlowDetails, isOutflow = false) => {
        return Object.entries(details).map(([name, amount]) => (
            <div key={name} className="grid grid-cols-2 gap-1 text-sm pl-8">
                <div className="text-muted-foreground">{name}</div>
                <div className={`text-right ${isOutflow ? 'text-red-600' : ''}`}>
                    {isOutflow ? `(${formatCurrency(amount)})` : formatCurrency(amount)}
                </div>
            </div>
        ));
    };

    const netCashChange = categorizedFlows.operating.net + categorizedFlows.investing.net + categorizedFlows.financing.net;
    const endingBalance = initialBalance + netCashChange;

    return (
        <div className="p-4">
            <Card>
                <CardHeader>
                    <CardTitle>Laporan Arus Kas</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Menunjukkan pergerakan kas dari aktivitas operasi, investasi, dan pendanaan.
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-end gap-4 mb-6">
                        <div className="space-y-1">
                            <label htmlFor="start-date" className="text-sm font-medium">Tanggal Mulai</label>
                            <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="end-date" className="text-sm font-medium">Tanggal Selesai</label>
                            <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                        </div>
                        <Button onClick={fetchReportData} disabled={loading}>
                            {loading ? 'Memuat...' : 'Tampilkan Laporan'}
                        </Button>
                    </div>

                    <Tabs
                        value={method}
                        onValueChange={(value) => {
                            const nextMethod = value as 'direct' | 'indirect';
                            setMethod(nextMethod);
                            const next = new URLSearchParams(searchParams);
                            next.set('tab', 'cash_flow');
                            next.set('method', nextMethod);
                            setSearchParams(next);
                        }}
                        className="w-full"
                    >
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="direct">Metode Langsung</TabsTrigger>
                            <TabsTrigger value="indirect">Metode Tidak Langsung</TabsTrigger>
                        </TabsList>
                        <TabsContent value="direct">
                            <div className="border rounded-lg p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="font-semibold">Saldo Kas Awal Periode</div>
                                    <div className="text-right font-semibold">{formatCurrency(initialBalance)}</div>
                                </div>
                                
                                {/* Operating Activities */}
                                <div>
                                    <div className="font-semibold text-base mb-2">Arus Kas dari Aktivitas Operasi</div>
                                    <div className="pl-4 space-y-1">
                                        <div className="font-medium">Penerimaan Kas:</div>
                                        {renderFlowDetails(categorizedFlows.operating.inflows)}
                                        <div className="font-medium mt-2">Pembayaran Kas:</div>
                                        {renderFlowDetails(categorizedFlows.operating.outflows, true)}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-sm font-semibold mt-2 pl-4 border-t pt-2">
                                        <div>Arus Kas Bersih dari Aktivitas Operasi</div>
                                        <div className="text-right">{formatCurrency(categorizedFlows.operating.net)}</div>
                                    </div>
                                </div>

                                {/* Investing Activities */}
                                <div>
                                    <div className="font-semibold text-base mb-2">Arus Kas dari Aktivitas Investasi</div>
                                     <div className="pl-4 space-y-1">
                                        <div className="font-medium">Penerimaan Kas:</div>
                                        {renderFlowDetails(categorizedFlows.investing.inflows)}
                                        <div className="font-medium mt-2">Pembayaran Kas:</div>
                                        {renderFlowDetails(categorizedFlows.investing.outflows, true)}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-sm font-semibold mt-2 pl-4 border-t pt-2">
                                        <div>Arus Kas Bersih dari Aktivitas Investasi</div>
                                        <div className="text-right">{formatCurrency(categorizedFlows.investing.net)}</div>
                                    </div>
                                </div>

                                {/* Financing Activities */}
                                <div>
                                    <div className="font-semibold text-base mb-2">Arus Kas dari Aktivitas Pendanaan</div>
                                     <div className="pl-4 space-y-1">
                                        <div className="font-medium">Penerimaan Kas:</div>
                                        {renderFlowDetails(categorizedFlows.financing.inflows)}
                                        <div className="font-medium mt-2">Pembayaran Kas:</div>
                                        {renderFlowDetails(categorizedFlows.financing.outflows, true)}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-sm font-semibold mt-2 pl-4 border-t pt-2">
                                        <div>Arus Kas Bersih dari Aktivitas Pendanaan</div>
                                        <div className="text-right">{formatCurrency(categorizedFlows.financing.net)}</div>
                                    </div>
                                </div>

                                {/* Summary */}
                                <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                                    <div className="font-semibold">Kenaikan/Penurunan Bersih Kas</div>
                                    <div className="text-right font-semibold">{formatCurrency(netCashChange)}</div>
                                    <div className="font-bold text-base">Saldo Kas Akhir Periode</div>
                                    <div className="text-right font-bold text-base border-t-2 border-black pt-1">{formatCurrency(endingBalance)}</div>
                                </div>
                            </div>
                        </TabsContent>
                        <TabsContent value="indirect">
                            <IndirectCashFlow startDate={startDate} endDate={endDate} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
};

export default CashFlowReport;
