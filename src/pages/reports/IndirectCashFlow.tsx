import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface IndirectCashFlowProps {
    startDate: string;
    endDate: string;
    categorizedFlows?: any;
}

type Adjustments = {
    [key: string]: number;
};

export const IndirectCashFlow: React.FC<IndirectCashFlowProps> = ({ startDate, endDate, categorizedFlows }) => {
    const [loading, setLoading] = useState(false);
    const [netIncome, setNetIncome] = useState(0);
    const [adjustments, setAdjustments] = useState<Adjustments>({});
    const [nonCashBreakdown, setNonCashBreakdown] = useState<Array<{ name: string; amount: number }>>([]);
    const [workingCapitalRows, setWorkingCapitalRows] = useState<Array<{ name: string; type: 'ASSET' | 'LIABILITY'; delta: number; cash_effect: number }>>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Langkah 1: Hitung Laba Bersih (Pendapatan - Beban)
            const { data: incomeStatementItems, error: isError } = await supabase
                .from('journal_entry_items')
                .select(`
                    credit,
                    debit,
                    chart_of_accounts(category),
                    journal_entries(entry_date)
                `)
                .in('chart_of_accounts.category', ['PENDAPATAN', 'HPP', 'BEBAN'])
                .gte('journal_entries.entry_date', startDate)
                .lte('journal_entries.entry_date', endDate);

            if (isError) {
                throw new Error(`Gagal mengambil data Laba Rugi: ${isError.message}`);
            }
            
            let totalRevenue = 0;
            let totalExpense = 0;

            // Menggunakan (data || []) untuk keamanan maksimum
            (incomeStatementItems || []).forEach((item: any) => {
                const coa = Array.isArray(item?.chart_of_accounts) ? item.chart_of_accounts[0] : item?.chart_of_accounts;
                if (!coa) return;
                const cat = String(coa.category || '').toUpperCase();
                if (cat === 'PENDAPATAN') {
                    totalRevenue += Number(item.credit || 0) - Number(item.debit || 0);
                } else if (['HPP', 'BEBAN'].includes(cat)) {
                    totalExpense += Number(item.debit || 0) - Number(item.credit || 0);
                }
            });

            const calculatedNetIncome = totalRevenue - totalExpense;
            setNetIncome(calculatedNetIncome);

            // Langkah 2: Hitung Penyesuaian
            const depreciationResult = await supabase
                .from('journal_entry_items')
                .select(`debit, credit, chart_of_accounts(account_name), journal_entries(entry_date)`)
                .ilike('chart_of_accounts.account_name', '%penyusutan%')
                .gte('journal_entries.entry_date', startDate)
                .lte('journal_entries.entry_date', endDate);
            
            if (depreciationResult.error) {
                toast.warning(`Gagal mengambil data penyusutan: ${depreciationResult.error.message}`);
            }

            const depByName: Record<string, number> = {};
            (depreciationResult.data || []).forEach((it: any) => {
                const name = String(it?.chart_of_accounts?.account_name || 'Penyusutan');
                const amt = Number(it?.debit || 0) - Number(it?.credit || 0);
                depByName[name] = (depByName[name] || 0) + amt;
            });
            const depRows = Object.entries(depByName)
                .map(([name, amount]) => ({ name, amount }))
                .filter((x) => x.amount !== 0)
                .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            setNonCashBreakdown(depRows);
            const totalDepreciation = depRows.reduce((s, r) => s + r.amount, 0);

            const wcResult = await supabase
                .from('journal_entry_items')
                .select(
                    `debit, credit, chart_of_accounts(account_name, balance_type, category, sub_category), journal_entries(entry_date)`
                )
                .gte('journal_entries.entry_date', startDate)
                .lte('journal_entries.entry_date', endDate)
                .in('chart_of_accounts.sub_category', ['AKTIVA_LANCAR', 'HUTANG']);
            if (wcResult.error) throw new Error(`Gagal mengambil data modal kerja: ${wcResult.error.message}`);

            const rowsByAccount: Record<string, { name: string; type: 'ASSET' | 'LIABILITY'; delta: number }> = {};
            (wcResult.data || []).forEach((it: any) => {
                const coa = it?.chart_of_accounts;
                if (!coa) return;
                const name = String(coa.account_name || '');
                const n = name.toLowerCase();
                const isCashBank = n.includes('kas') || n.includes('bank');
                const sub = String(coa.sub_category || '');
                const type: 'ASSET' | 'LIABILITY' =
                    sub === 'HUTANG' || String(coa.category || '') === 'PASSIVA' ? 'LIABILITY' : 'ASSET';
                if (type === 'ASSET' && sub === 'AKTIVA_LANCAR' && isCashBank) return;

                const bt = String(coa.balance_type || 'DEBIT');
                const delta = bt === 'CREDIT'
                    ? Number(it.credit || 0) - Number(it.debit || 0)
                    : Number(it.debit || 0) - Number(it.credit || 0);

                const key = `${type}|${name}`;
                if (!rowsByAccount[key]) rowsByAccount[key] = { name, type, delta: 0 };
                rowsByAccount[key].delta += delta;
            });

            const wcRows = Object.values(rowsByAccount)
                .filter((r) => r.name && r.delta !== 0)
                .map((r) => ({
                    ...r,
                    cash_effect: r.type === 'ASSET' ? -r.delta : r.delta,
                }))
                .sort((a, b) => Math.abs(b.cash_effect) - Math.abs(a.cash_effect));

            setWorkingCapitalRows(wcRows);

            const totalWorkingCapitalEffect = wcRows.reduce((s, r) => s + r.cash_effect, 0);

            const newAdjustments = {
                depreciation: totalDepreciation,
                working_capital: totalWorkingCapitalEffect,
            };
            setAdjustments(newAdjustments);

        } catch (error: any) {
            toast.error(error.message);
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    if (loading) {
        return <div className="p-4 text-center">Memuat data...</div>;
    }

    const netCashFromOps = netIncome + (adjustments.depreciation || 0) + (adjustments.working_capital || 0);
    const orderedDetails = (details: Record<string, number>) =>
        Object.entries(details || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

    return (
        <div className="p-4 border rounded-lg mt-4 space-y-4">
            <div>
                <h3 className="font-semibold text-lg">Arus Kas dari Aktivitas Operasi</h3>
                <p className="text-sm text-muted-foreground">Metode Tidak Langsung</p>
            </div>

            <div className="space-y-2">
                {/* Net Income */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="font-semibold">Laba Bersih</div>
                    <div className="text-right font-semibold">{formatCurrency(netIncome)}</div>
                </div>

                {/* Adjustments */}
                <div className="pt-2">
                    <div className="font-medium mb-1">Penyesuaian untuk merekonsiliasi laba bersih ke kas bersih:</div>
                    <div className="pl-4 space-y-1 text-sm">
                        <div className="grid grid-cols-2 gap-1">
                            <div className="text-muted-foreground">Biaya Penyusutan</div>
                            <div className="text-right">{formatCurrency(adjustments.depreciation || 0)}</div>
                        </div>
                        {nonCashBreakdown.length > 0 && (
                            <div className="pl-4 mt-1 space-y-1">
                                {nonCashBreakdown.map((r) => (
                                    <div key={r.name} className="grid grid-cols-2 gap-1 text-sm">
                                        <div className="text-muted-foreground">{r.name}</div>
                                        <div className="text-right">{formatCurrency(r.amount)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-1 mt-2">
                            <div className="text-muted-foreground">Perubahan Modal Kerja (net)</div>
                            <div className="text-right">{formatCurrency(adjustments.working_capital || 0)}</div>
                        </div>
                        {workingCapitalRows.length > 0 && (
                            <div className="mt-1 border rounded-lg overflow-x-auto">
                                <table className="min-w-[700px] w-full text-sm">
                                    <thead className="bg-slate-50">
                                        <tr className="text-left">
                                            <th className="px-3 py-2 font-semibold text-slate-700">Akun</th>
                                            <th className="px-3 py-2 font-semibold text-slate-700">Tipe</th>
                                            <th className="px-3 py-2 font-semibold text-right text-slate-700">Perubahan Saldo</th>
                                            <th className="px-3 py-2 font-semibold text-right text-slate-700">Dampak ke Kas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {workingCapitalRows.map((r) => (
                                            <tr key={`${r.type}-${r.name}`} className="border-t">
                                                <td className="px-3 py-2">{r.name}</td>
                                                <td className="px-3 py-2">{r.type === 'ASSET' ? 'Aktiva Lancar (Non Kas/Bank)' : 'Hutang'}</td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(r.delta)}</td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(r.cash_effect)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {/* Placeholder untuk item lainnya */}
                    </div>
                </div>
                
                {/* Net Cash from Operating Activities */}
                <div className="grid grid-cols-2 gap-4 text-sm font-semibold pt-2 border-t">
                    <div>Arus Kas Bersih dari Aktivitas Operasi</div>
                    <div className="text-right">{formatCurrency(netCashFromOps)}</div>
                </div>
            </div>

            {(categorizedFlows as any)?.investing && (
                <div className="border-t pt-4 space-y-2">
                    <div className="font-semibold text-lg">Aktivitas Investasi</div>
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Penerimaan Kas</div>
                        {orderedDetails((categorizedFlows as any).investing.inflows).map(([name, amount]) => (
                            <div key={name} className="grid grid-cols-2 gap-2 text-sm pl-4">
                                <div className="text-muted-foreground">{name}</div>
                                <div className="text-right">{formatCurrency(amount)}</div>
                            </div>
                        ))}
                        <div className="text-sm font-medium mt-2">Pembayaran Kas</div>
                        {orderedDetails((categorizedFlows as any).investing.outflows).map(([name, amount]) => (
                            <div key={name} className="grid grid-cols-2 gap-2 text-sm pl-4">
                                <div className="text-muted-foreground">{name}</div>
                                <div className="text-right text-red-600">({formatCurrency(amount)})</div>
                            </div>
                        ))}
                        <div className="grid grid-cols-2 gap-4 text-sm font-semibold pt-2 border-t">
                            <div>Arus Kas Bersih dari Aktivitas Investasi</div>
                            <div className="text-right">{formatCurrency(Number((categorizedFlows as any).investing.net || 0))}</div>
                        </div>
                    </div>
                </div>
            )}

            {(categorizedFlows as any)?.financing && (
                <div className="border-t pt-4 space-y-2">
                    <div className="font-semibold text-lg">Aktivitas Pendanaan</div>
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Penerimaan Kas</div>
                        {orderedDetails((categorizedFlows as any).financing.inflows).map(([name, amount]) => (
                            <div key={name} className="grid grid-cols-2 gap-2 text-sm pl-4">
                                <div className="text-muted-foreground">{name}</div>
                                <div className="text-right">{formatCurrency(amount)}</div>
                            </div>
                        ))}
                        <div className="text-sm font-medium mt-2">Pembayaran Kas</div>
                        {orderedDetails((categorizedFlows as any).financing.outflows).map(([name, amount]) => (
                            <div key={name} className="grid grid-cols-2 gap-2 text-sm pl-4">
                                <div className="text-muted-foreground">{name}</div>
                                <div className="text-right text-red-600">({formatCurrency(amount)})</div>
                            </div>
                        ))}
                        <div className="grid grid-cols-2 gap-4 text-sm font-semibold pt-2 border-t">
                            <div>Arus Kas Bersih dari Aktivitas Pendanaan</div>
                            <div className="text-right">{formatCurrency(Number((categorizedFlows as any).financing.net || 0))}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
