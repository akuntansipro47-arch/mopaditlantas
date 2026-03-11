import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Calendar, Search, Check } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
    Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from "@/components/ui/command";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";

type Transaction = {
    date: string;
    type: 'IN' | 'OUT';
    ref_number: string; // PO Number or Issue Number
    secondary_ref: string; // Supplier or WO Number
    tertiary_ref: string; // - or License Plate
    qty_in: number;
    qty_out: number;
    balance: number;
    description: string;
    is_info_only?: boolean;
};

export default function ItemHistoryReport() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Item Search
    const [goodsList, setGoodsList] = useState<any[]>([]);
    const [selectedGood, setSelectedGood] = useState<any>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [dateRange, setDateRange] = useState({
        // Default: A VERY wide range to ensure data visibility during testing
        start: '2024-01-01',
        end: new Date().toISOString().split('T')[0]
    });
    const [showAllHistory, setShowAllHistory] = useState(false); // New toggle

    // Add Debug State
    // const [debugInfo, setDebugInfo] = useState<{incoming: number, outgoing: number, error?: string} | null>(null);
    // const [diagnostic, setDiagnostic] = useState<any>(null); // New diagnostic state

    useEffect(() => {
        fetchGoodsList();
    }, []);

    useEffect(() => {
        if (selectedGood) {
            fetchHistory();
        } else {
            setTransactions([]);
        }
    }, [selectedGood, dateRange, showAllHistory]); // Added showAllHistory

    async function fetchGoodsList() {
        const { data } = await supabase
            .from('goods')
            .select('id, name, item_code, current_stock, unit')
            .order('name');
        setGoodsList(data || []);
    }

    async function fetchHistory() {
        if (!selectedGood) return;
        setLoading(true);
        // setDebugInfo(null);
        // setDiagnostic({ loading: true, good_id: selectedGood.id, good_code: selectedGood.item_code });
        
        try {
            // DIAGNOSTIC STEP REMOVED

            // 1. Fetch Incoming (Goods Receipt)
            console.log("Fetching history for:", selectedGood.id, dateRange);
            
            // Remove !inner to allow left join, filter manually if needed or use simple filter
            const { data: incoming, error: inError } = await supabase
                .from('goods_receipt_items')
                .select(`
                    quantity: quantity_received,
                    created_at,
                    goods_receipts (
                        receipt_date,
                        receipt_number,
                        purchase_orders (
                            po_number,
                            suppliers (name)
                        )
                    )
                `)
                .eq('goods_id', selectedGood.id);
                // Removed server-side date filter on nested table to avoid join issues
                // .gte('goods_receipts.receipt_date', dateRange.start)
                // .lte('goods_receipts.receipt_date', dateRange.end);

            if (inError) {
                console.error("Error fetching incoming:", inError);
                throw inError;
            }

            // 2. Fetch Outgoing (Goods Issue)
            const { data: outgoing, error: outError } = await supabase
                .from('goods_issue_items')
                .select(`
                    quantity,
                    created_at,
                    is_info_only,
                    goods_issues (
                        issue_date,
                        issue_number,
                        work_orders (
                            wo_number,
                            vehicle_entries (
                                vehicles (license_plate)
                            )
                        )
                    )
                `)
                .eq('goods_id', selectedGood.id);
                // Removed server-side date filter on nested table
                // .gte('goods_issues.issue_date', dateRange.start)
                // .lte('goods_issues.issue_date', dateRange.end);

            if (outError) {
                console.error("Error fetching outgoing:", outError);
                throw outError;
            }

            // setDebugInfo({ incoming: incoming?.length || 0, outgoing: outgoing?.length || 0 });

            // 3. Calculate Initial Balance (Saldo Awal)
            // Fetch SUM(IN) - SUM(OUT) before start date
            // Note: This is complex in Supabase without aggregation function.
            // Simplified: We assume current_stock is correct, and we calculate backwards? 
            // Or better: Fetch ALL transactions and filter in JS? (might be heavy)
            // Alternative: Use a stored procedure or just show period movement. 
            // User requested "Balance".
            
            // Let's try to fetch previous transactions sum for initial balance
            // A. Previous In
            // NOTE: This requires raw SQL or complex filtering.
            // For now, let's start with 0 or try to approximate.
            // Ideally, we should have a 'stock_movements' table, but we don't.
            
            // Let's rely on calculating running balance from the transactions we fetched 
            // BUT we need the starting balance.
            // Let's assume user wants to see movement in period.
            // To get accurate balance, we need (Current Stock) + (Total Out > Now) - (Total In > Now).
            // OR (Initial Stock) + (In) - (Out).
            
            // Let's Try: Back-calculation from Current Stock
            // Current Stock is Known.
            // Transactions AFTER End Date:
            // Future In
            // Future Out
            
            // This is getting complicated. Let's stick to "Period Movement" first, 
            // and if possible, estimate opening balance.
            // For accurate opening balance, we really need to sum ALL history before startDate.
            
            // Let's do a separate simplified query for "Pre-period Sum"
            // This might be slow if data is huge, but it's the only way without a ledger table.
            
            // Pre-In
            // We can't easily sum with nested filters in one go in Supabase JS client.
            // Let's fetch ALL history for this item (it shouldn't be millions yet) and calculate in JS.
            // It's safer.
            
            // RE-FETCH ALL TIME HISTORY for this item
             const { data: allIncoming } = await supabase
                .from('goods_receipt_items')
                .select(`
                    quantity: quantity_received,
                    goods_receipts (receipt_date)
                `)
                .eq('goods_id', selectedGood.id);
                
             const { data: allOutgoing } = await supabase
                .from('goods_issue_items')
                .select(`
                    quantity,
                    is_info_only,
                    goods_issues (issue_date)
                `)
                .eq('goods_id', selectedGood.id);

            // Calculate Opening Balance
            let openingBalance = 0;
            const start = new Date(dateRange.start);
            
            allIncoming?.forEach((item: any) => {
                const d = new Date(item.goods_receipts?.receipt_date);
                if (d < start) {
                    openingBalance += item.quantity;
                }
            });
            
            allOutgoing?.forEach((item: any) => {
                const d = new Date(item.goods_issues?.issue_date);
                // Info Only does NOT reduce stock
                if (d < start && !item.is_info_only) {
                    openingBalance -= item.quantity;
                }
            });

            // 4. Map & Combine Transactions
            let combined: Transaction[] = [];

            // Map Incoming
            incoming?.forEach((item: any) => {
                 const d = new Date(item.goods_receipts?.receipt_date);
                 const inRange = d >= new Date(dateRange.start) && d <= new Date(dateRange.end);
                 
                 if (showAllHistory || inRange) {
                    combined.push({
                        date: item.goods_receipts?.receipt_date,
                        type: 'IN',
                        ref_number: item.goods_receipts?.purchase_orders?.po_number || item.goods_receipts?.receipt_number || '-',
                        secondary_ref: item.goods_receipts?.purchase_orders?.suppliers?.name || 'Supplier Umum',
                        tertiary_ref: '-',
                        qty_in: item.quantity,
                        qty_out: 0,
                        balance: 0, 
                        description: 'Pembelian / Masuk'
                    });
                 }
            });

            // Map Outgoing
            outgoing?.forEach((item: any) => {
                 const d = new Date(item.goods_issues?.issue_date);
                 const inRange = d >= new Date(dateRange.start) && d <= new Date(dateRange.end);
                 
                 if (showAllHistory || inRange) {
                    combined.push({
                        date: item.goods_issues?.issue_date,
                        type: 'OUT',
                        ref_number: item.goods_issues?.work_orders?.wo_number || item.goods_issues?.issue_number || '-',
                        secondary_ref: '-',
                        tertiary_ref: item.goods_issues?.work_orders?.vehicle_entries?.vehicles?.license_plate || '-',
                        qty_in: 0,
                        qty_out: item.is_info_only ? 0 : item.quantity,
                        balance: 0,
                        description: item.is_info_only ? 'Info Only (Pemakaian)' : 'Pemakaian / Keluar',
                        is_info_only: item.is_info_only
                    });
                 }
            });

            // Sort by Date ASC
            combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Calculate Running Balance
            let currentBalance = openingBalance;
            
            // Add Opening Balance Row
            const finalData = [
                {
                    date: dateRange.start,
                    type: 'IN' as const, // Dummy
                    ref_number: '-',
                    secondary_ref: '-',
                    tertiary_ref: '-',
                    qty_in: 0,
                    qty_out: 0,
                    balance: openingBalance,
                    description: 'Saldo Awal'
                },
                ...combined.map(t => {
                    currentBalance = currentBalance + t.qty_in - t.qty_out;
                    return { ...t, balance: currentBalance };
                })
            ];

            setTransactions(finalData);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    const exportToExcel = () => {
        if (!selectedGood) return;
        const ws = XLSX.utils.json_to_sheet(transactions.map(item => ({
            'Tanggal': formatDate(item.date),
            'Keterangan': item.description,
            'No. Ref / PO / WO': item.ref_number,
            'Supplier / Relasi': item.secondary_ref,
            'No. Polisi': item.tertiary_ref,
            'Masuk': item.qty_in,
            'Keluar': item.is_info_only ? `(${item.qty_out})*` : item.qty_out,
            'Saldo': item.balance
        })));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Kartu Stok");
        XLSX.writeFile(wb, `Kartu_Stok_${selectedGood.item_code}_${dateRange.start}_${dateRange.end}.xlsx`);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold">History Item / Kartu Stok</h2>
                    <p className="text-gray-500">Lacak pergerakan masuk dan keluar barang per item.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                     <div className="flex items-center space-x-2 bg-white px-2 rounded-md border border-gray-300">
                        <input 
                            type="checkbox" 
                            id="showAll" 
                            checked={showAllHistory} 
                            onChange={e => setShowAllHistory(e.target.checked)} 
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="showAll" className="text-sm font-medium text-gray-700 cursor-pointer select-none">Semua Riwayat</label>
                     </div>

                     <div className={`flex items-center gap-2 bg-white border border-gray-300 p-1.5 rounded-md shadow-sm ${showAllHistory ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Calendar className="h-4 w-4 text-gray-500 ml-2" />
                        <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
                        <span className="text-gray-400 font-medium">-</span>
                        <Input type="date" className="border-0 h-9 w-36 focus-visible:ring-0 cursor-pointer" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
                     </div>
                     <Button variant="outline" onClick={exportToExcel} disabled={!selectedGood}><Download className="mr-2 h-4 w-4" /> Export</Button>
                </div>
            </div>

            {/* Item Selector */}
            <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-6 flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <Button 
                            variant="outline" 
                            className="w-full justify-between text-left font-normal h-12 text-lg"
                            onClick={() => setIsSearchOpen(true)}
                        >
                            {selectedGood ? (
                                <div className="flex flex-col items-start">
                                    <span className="font-bold text-gray-900">{selectedGood.name}</span>
                                    <span className="text-xs text-gray-500">{selectedGood.item_code} | Unit: {selectedGood.unit} | Stok Skrg: {selectedGood.current_stock}</span>
                                </div>
                            ) : (
                                <span className="text-gray-500">Pilih Barang untuk melihat history...</span>
                            )}
                            <Search className="ml-2 h-5 w-5 opacity-50" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Transaction Table */}
            <Card>
                <CardHeader className="pb-3 border-b bg-gray-50/50">
                    <CardTitle className="text-base font-medium">Rincian Transaksi</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[120px]">Tanggal</TableHead>
                                    <TableHead className="w-[150px]">No. PO / Ref</TableHead>
                                    <TableHead className="w-[180px]">Supplier</TableHead>
                                    <TableHead className="w-[150px]">No. WO</TableHead>
                                    <TableHead className="w-[120px]">No. Polisi</TableHead>
                                    <TableHead className="text-right w-[100px] text-green-600">Masuk (Debit)</TableHead>
                                    <TableHead className="text-right w-[100px] text-red-600">Keluar (Kredit)</TableHead>
                                    <TableHead className="text-right w-[120px] font-bold">Saldo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={8} className="text-center h-24">Memuat data...</TableCell></TableRow>
                                ) : transactions.length === 0 ? (
                                    <TableRow><TableCell colSpan={8} className="text-center h-24 text-gray-500">{selectedGood ? 'Tidak ada transaksi pada periode ini.' : 'Silakan pilih barang terlebih dahulu.'}</TableCell></TableRow>
                                ) : (
                                    transactions.map((t, i) => (
                                        <TableRow key={i} className={t.description === 'Saldo Awal' ? 'bg-gray-100 font-medium' : ''}>
                                            <TableCell>{formatDate(t.date)}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{t.type === 'IN' ? t.ref_number : '-'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{t.secondary_ref}</TableCell>
                                            <TableCell>{t.type === 'OUT' ? t.ref_number : '-'}</TableCell>
                                            <TableCell>{t.tertiary_ref}</TableCell>
                                            <TableCell className="text-right">
                                                {t.qty_in > 0 ? <span className="text-green-600 font-medium">+{t.qty_in}</span> : '-'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {t.qty_out > 0 ? (
                                                    <span className="text-red-600 font-medium">-{t.qty_out}</span>
                                                ) : t.is_info_only ? (
                                                    <span className="text-blue-500 text-xs italic">Info Only</span>
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-bold bg-slate-50">{t.balance}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Item Search Dialog */}
            <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <DialogContent className="sm:max-w-[500px] p-0">
                    <Command>
                        <CommandInput 
                            placeholder="Cari nama barang atau kode..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <CommandList>
                            <CommandEmpty>Barang tidak ditemukan.</CommandEmpty>
                            <CommandGroup heading="Daftar Barang">
                                {goodsList
                                    .filter(g => 
                                        g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                        (g.item_code && g.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
                                    )
                                    .map(g => (
                                        <CommandItem 
                                            key={g.id} 
                                            onSelect={() => {
                                                setSelectedGood(g);
                                                setIsSearchOpen(false);
                                                setSearchQuery('');
                                            }}
                                            className="cursor-pointer"
                                        >
                                            <div className="flex flex-col w-full">
                                                <div className="flex justify-between">
                                                    <span className="font-bold">{g.name}</span>
                                                    <span className="text-xs font-mono bg-gray-100 px-1 rounded">{g.item_code}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                                    <span>Unit: {g.unit}</span>
                                                    <span>Stok: {g.current_stock}</span>
                                                </div>
                                            </div>
                                            {selectedGood?.id === g.id && <Check className="ml-2 h-4 w-4" />}
                                        </CommandItem>
                                    ))
                                }
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </DialogContent>
            </Dialog>
        </div>
    );
}
