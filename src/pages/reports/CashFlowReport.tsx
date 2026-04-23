import { useEffect, useMemo, useState } from 'react';
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

type CashMovement = {
    entry_id: string;
    entry_date: string;
    voucher_no: string | null;
    entry_description: string | null;
    cash_accounts: string[];
    counter_account: string;
    activity: keyof CategorizedFlow;
    direction: 'INFLOW' | 'OUTFLOW';
    amount: number;
};

const CashFlowReport = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const [initialBalance, setInitialBalance] = useState(0);
    const [movements, setMovements] = useState<CashMovement[]>([]);
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
                    voucher_no,
                    description,
                    journal_entry_items (
                        id,
                        debit,
                        credit,
                        description,
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

            const movementRows: CashMovement[] = [];
            const isCashAccount = (coa: any) => {
                const name = String(coa?.account_name || '').toLowerCase();
                return (
                    String(coa?.category || '') === 'AKTIVA' &&
                    (String(coa?.sub_category || '') === 'AKTIVA_LANCAR' || name.includes('kas') || name.includes('bank'))
                );
            };

            for (const entry of (journalEntries || []) as any[]) {
                const items = (entry?.journal_entry_items || []) as any[];
                const cashItems = items.filter((it) => isCashAccount(it?.chart_of_accounts));
                if (cashItems.length === 0) continue;

                const cashNet = cashItems.reduce((sum, it) => sum + (Number(it.debit || 0) - Number(it.credit || 0)), 0);
                if (!cashNet) continue;

                const direction: 'INFLOW' | 'OUTFLOW' = cashNet > 0 ? 'INFLOW' : 'OUTFLOW';
                const cashAccounts = cashItems
                    .map((it) => String(it?.chart_of_accounts?.account_name || 'Kas/Bank'))
                    .filter(Boolean);

                const otherItems = items.filter((it) => !isCashAccount(it?.chart_of_accounts) && it?.chart_of_accounts);
                if (otherItems.length === 0) continue;

                for (const otherItem of otherItems) {
                    const coa = otherItem.chart_of_accounts;
                    const activity = getCashFlowCategory(coa?.category ?? null, coa?.sub_category ?? null);
                    if (!activity) continue;

                    const amount = direction === 'INFLOW' ? Number(otherItem.credit || 0) : Number(otherItem.debit || 0);
                    if (!(amount > 0)) continue;

                    const counter = String(coa?.account_name || 'Lain-lain');
                    const targetFlow = direction === 'INFLOW' ? flows[activity].inflows : flows[activity].outflows;
                    targetFlow[counter] = (targetFlow[counter] || 0) + amount;

                    movementRows.push({
                        entry_id: String(entry.id),
                        entry_date: String(entry.entry_date || ''),
                        voucher_no: entry.voucher_no ? String(entry.voucher_no) : null,
                        entry_description: entry.description ? String(entry.description) : null,
                        cash_accounts: cashAccounts,
                        counter_account: counter,
                        activity,
                        direction,
                        amount,
                    });
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
            setMovements(movementRows);

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

    const orderedDetails = (details: FlowDetails) =>
        Object.entries(details).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

    const netCashChange = categorizedFlows.operating.net + categorizedFlows.investing.net + categorizedFlows.financing.net;
    const endingBalance = initialBalance + netCashChange;

    const movementByActivity = useMemo(() => {
        const out: Record<string, CashMovement[]> = { operating: [], investing: [], financing: [] };
        (movements || []).forEach((m) => {
            out[m.activity] = out[m.activity] || [];
            out[m.activity].push(m);
        });
        (Object.keys(out) as Array<keyof CategorizedFlow>).forEach((k) => {
            out[k].sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));
        });
        return out as Record<keyof CategorizedFlow, CashMovement[]>;
    }, [movements]);

    const renderMovementTable = (rows: CashMovement[]) => {
        if (!rows || rows.length === 0) {
            return <div className="text-sm text-muted-foreground py-2">Tidak ada transaksi.</div>;
        }
        return (
            <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm">
                    <thead className="bg-slate-50">
                        <tr className="text-left">
                            <th className="px-3 py-2 font-semibold text-slate-700">Tanggal</th>
                            <th className="px-3 py-2 font-semibold text-slate-700">Voucher</th>
                            <th className="px-3 py-2 font-semibold text-slate-700">Kas/Bank</th>
                            <th className="px-3 py-2 font-semibold text-slate-700">Akun Lawan</th>
                            <th className="px-3 py-2 font-semibold text-slate-700">Keterangan</th>
                            <th className="px-3 py-2 font-semibold text-right text-slate-700">Masuk</th>
                            <th className="px-3 py-2 font-semibold text-right text-slate-700">Keluar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={`${r.entry_id}-${r.counter_account}-${r.direction}-${r.amount}`} className="border-t">
                                <td className="px-3 py-2 whitespace-nowrap">{r.entry_date}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{r.voucher_no || '-'}</td>
                                <td className="px-3 py-2">{r.cash_accounts.join(', ')}</td>
                                <td className="px-3 py-2">{r.counter_account}</td>
                                <td className="px-3 py-2">{r.entry_description || '-'}</td>
                                <td className="px-3 py-2 text-right">{r.direction === 'INFLOW' ? formatCurrency(r.amount) : '-'}</td>
                                <td className="px-3 py-2 text-right">{r.direction === 'OUTFLOW' ? formatCurrency(r.amount) : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

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
                            <div className="border rounded-lg p-4 space-y-6">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="font-semibold">Saldo Kas Awal Periode</div>
                                    <div className="text-right font-semibold">{formatCurrency(initialBalance)}</div>
                                    <div className="font-semibold">Kenaikan/Penurunan Bersih Kas</div>
                                    <div className="text-right font-semibold">{formatCurrency(netCashChange)}</div>
                                    <div className="font-bold text-base">Saldo Kas Akhir Periode</div>
                                    <div className="text-right font-bold text-base border-t-2 border-black pt-1">{formatCurrency(endingBalance)}</div>
                                </div>
                                
                                {/* Operating Activities */}
                                <div>
                                    <div className="font-semibold text-base mb-2">Arus Kas dari Aktivitas Operasi</div>
                                    <div className="pl-4 space-y-1">
                                        <div className="font-medium">Penerimaan Kas:</div>
                                        {orderedDetails(categorizedFlows.operating.inflows).map(([name, amount]) => (
                                            <div key={name} className="grid grid-cols-2 gap-1 text-sm pl-4">
                                                <div className="text-muted-foreground">{name}</div>
                                                <div className="text-right">{formatCurrency(amount)}</div>
                                            </div>
                                        ))}
                                        <div className="font-medium mt-2">Pembayaran Kas:</div>
                                        {orderedDetails(categorizedFlows.operating.outflows).map(([name, amount]) => (
                                            <div key={name} className="grid grid-cols-2 gap-1 text-sm pl-4">
                                                <div className="text-muted-foreground">{name}</div>
                                                <div className="text-right text-red-600">({formatCurrency(amount)})</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-sm font-semibold mt-2 pl-4 border-t pt-2">
                                        <div>Arus Kas Bersih dari Aktivitas Operasi</div>
                                        <div className="text-right">{formatCurrency(categorizedFlows.operating.net)}</div>
                                    </div>
                                    <details className="mt-3 pl-4">
                                        <summary className="cursor-pointer text-sm font-medium text-slate-700">Rincian transaksi</summary>
                                        <div className="mt-2">{renderMovementTable(movementByActivity.operating)}</div>
                                    </details>
                                </div>

                                {/* Investing Activities */}
                                <div>
                                    <div className="font-semibold text-base mb-2">Arus Kas dari Aktivitas Investasi</div>
                                     <div className="pl-4 space-y-1">
                                        <div className="font-medium">Penerimaan Kas:</div>
                                        {orderedDetails(categorizedFlows.investing.inflows).map(([name, amount]) => (
                                            <div key={name} className="grid grid-cols-2 gap-1 text-sm pl-4">
                                                <div className="text-muted-foreground">{name}</div>
                                                <div className="text-right">{formatCurrency(amount)}</div>
                                            </div>
                                        ))}
                                        <div className="font-medium mt-2">Pembayaran Kas:</div>
                                        {orderedDetails(categorizedFlows.investing.outflows).map(([name, amount]) => (
                                            <div key={name} className="grid grid-cols-2 gap-1 text-sm pl-4">
                                                <div className="text-muted-foreground">{name}</div>
                                                <div className="text-right text-red-600">({formatCurrency(amount)})</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-sm font-semibold mt-2 pl-4 border-t pt-2">
                                        <div>Arus Kas Bersih dari Aktivitas Investasi</div>
                                        <div className="text-right">{formatCurrency(categorizedFlows.investing.net)}</div>
                                    </div>
                                    <details className="mt-3 pl-4">
                                        <summary className="cursor-pointer text-sm font-medium text-slate-700">Rincian transaksi</summary>
                                        <div className="mt-2">{renderMovementTable(movementByActivity.investing)}</div>
                                    </details>
                                </div>

                                {/* Financing Activities */}
                                <div>
                                    <div className="font-semibold text-base mb-2">Arus Kas dari Aktivitas Pendanaan</div>
                                     <div className="pl-4 space-y-1">
                                        <div className="font-medium">Penerimaan Kas:</div>
                                        {orderedDetails(categorizedFlows.financing.inflows).map(([name, amount]) => (
                                            <div key={name} className="grid grid-cols-2 gap-1 text-sm pl-4">
                                                <div className="text-muted-foreground">{name}</div>
                                                <div className="text-right">{formatCurrency(amount)}</div>
                                            </div>
                                        ))}
                                        <div className="font-medium mt-2">Pembayaran Kas:</div>
                                        {orderedDetails(categorizedFlows.financing.outflows).map(([name, amount]) => (
                                            <div key={name} className="grid grid-cols-2 gap-1 text-sm pl-4">
                                                <div className="text-muted-foreground">{name}</div>
                                                <div className="text-right text-red-600">({formatCurrency(amount)})</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-sm font-semibold mt-2 pl-4 border-t pt-2">
                                        <div>Arus Kas Bersih dari Aktivitas Pendanaan</div>
                                        <div className="text-right">{formatCurrency(categorizedFlows.financing.net)}</div>
                                    </div>
                                    <details className="mt-3 pl-4">
                                        <summary className="cursor-pointer text-sm font-medium text-slate-700">Rincian transaksi</summary>
                                        <div className="mt-2">{renderMovementTable(movementByActivity.financing)}</div>
                                    </details>
                                </div>
                            </div>
                        </TabsContent>
                        <TabsContent value="indirect">
                            <IndirectCashFlow startDate={startDate} endDate={endDate} categorizedFlows={categorizedFlows} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
};

export default CashFlowReport;
