import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface IndirectCashFlowProps {
    startDate: string;
    endDate: string;
}

type Adjustments = {
    [key: string]: number;
};

export const IndirectCashFlow: React.FC<IndirectCashFlowProps> = ({ startDate, endDate }) => {
    const [loading, setLoading] = useState(false);
    const [netIncome, setNetIncome] = useState(0);
    const [adjustments, setAdjustments] = useState<Adjustments>({});

    const fetchData = async () => {
        setLoading(true);
        try {
            // Helper function to get balance for a specific account sub-category on a given date
            const getBalance = async (subCategory: string, date: string): Promise<number> => {
                const { data, error } = await supabase
                    .from('journal_entry_items')
                    .select('debit, credit, chart_of_accounts(sub_category), journal_entries(entry_date)')
                    .eq('chart_of_accounts.sub_category', subCategory)
                    .lte('journal_entries.entry_date', date);
                
                if (error) {
                    toast.warning(`Gagal mengambil saldo ${subCategory}: ${error.message}`);
                    return 0;
                }
                // Pola (data || []) menjamin .reduce selalu berjalan pada array, mencegah crash
                return (data || []).reduce((sum, item) => sum + item.debit - item.credit, 0);
            };

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
            (incomeStatementItems || []).forEach(item => {
                if (!item.chart_of_accounts) return;

                if (item.chart_of_accounts.category === 'PENDAPATAN') {
                    totalRevenue += item.credit - item.debit;
                } else if (['HPP', 'BEBAN'].includes(item.chart_of_accounts.category)) {
                    totalExpense += item.debit - item.credit;
                }
            });

            const calculatedNetIncome = totalRevenue - totalExpense;
            setNetIncome(calculatedNetIncome);

            // Langkah 2: Hitung Penyesuaian
            const prevDate = new Date(startDate);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevDateStr = prevDate.toISOString().split('T')[0];

            const [
                depreciationResult,
                arStart,
                arEnd,
                apStart,
                apEnd
            ] = await Promise.all([
                supabase
                    .from('journal_entry_items')
                    .select(`debit, journal_entries(entry_date), chart_of_accounts(account_name)`)
                    .ilike('chart_of_accounts.account_name', '%penyusutan%')
                    .gte('journal_entries.entry_date', startDate)
                    .lte('journal_entries.entry_date', endDate),
                getBalance('PIUTANG', prevDateStr),
                getBalance('PIUTANG', endDate),
                getBalance('HUTANG', prevDateStr),
                getBalance('HUTANG', endDate)
            ]);
            
            if (depreciationResult.error) {
                toast.warning(`Gagal mengambil data penyusutan: ${depreciationResult.error.message}`);
            }

            // Menggunakan (data || []) untuk keamanan maksimum
            const totalDepreciation = (depreciationResult.data || []).reduce((sum, item) => sum + item.debit, 0);
            const changeInAR = arEnd - arStart;
            const changeInAP = apEnd - apStart;

            const newAdjustments = {
                depreciation: totalDepreciation,
                changeInAR: -changeInAR, // Kenaikan AR mengurangi kas
                changeInAP: changeInAP,   // Kenaikan AP menambah kas
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

    const netCashFromOps = netIncome 
        + (adjustments.depreciation || 0)
        + (adjustments.changeInAR || 0)
        + (adjustments.changeInAP || 0);

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
                        <div className="grid grid-cols-2 gap-1">
                            <div className="text-muted-foreground">Perubahan Piutang Usaha</div>
                            <div className="text-right">{formatCurrency(adjustments.changeInAR || 0)}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                            <div className="text-muted-foreground">Perubahan Hutang Usaha</div>
                            <div className="text-right">{formatCurrency(adjustments.changeInAP || 0)}</div>
                        </div>
                        {/* Placeholder untuk item lainnya */}
                    </div>
                </div>
                
                {/* Net Cash from Operating Activities */}
                <div className="grid grid-cols-2 gap-4 text-sm font-semibold pt-2 border-t">
                    <div>Arus Kas Bersih dari Aktivitas Operasi</div>
                    <div className="text-right">{formatCurrency(netCashFromOps)}</div>
                </div>
            </div>
             <p className="text-gray-500 mt-4 text-xs">
                *Hanya Arus Kas dari Aktivitas Operasi yang ditampilkan saat ini.
            </p>
        </div>
    );
};