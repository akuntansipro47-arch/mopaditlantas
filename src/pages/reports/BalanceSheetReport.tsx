import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Printer, RefreshCw, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportPrintHeader from '@/components/reports/ReportPrintHeader';

export default function BalanceSheetReport() {
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [trialBalance, setTrialBalance] = useState({ debit: 0, credit: 0, diff: 0 });
  const [unbalancedJournals, setUnbalancedJournals] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any>({
      assets: [],
      liabilities: [],
      equity: [],
      currentEarnings: 0
  });
  
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchReport();
  }, [reportDate]);

  const fetchApAccount = async () => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .or('account_name.ilike.%hutang usaha%,account_name.ilike.%hutang dagang%')
      .limit(1)
      .maybeSingle();
    if (data) return data;
    const { data: data2 } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('sub_category', 'HUTANG')
      .eq('account_type', 'DETAIL')
      .limit(1)
      .maybeSingle();
    return data2 || null;
  };

  const fetchPersediaanAccount = async () => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .ilike('account_name', '%persediaan%')
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data || null;
  };

  const fetchAccountByCodePrefix = async (prefix: string) => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .ilike('account_code', `${prefix}%`)
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data || null;
  };

  const fetchAccountByName = async (nameLike: string) => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('account_type', 'DETAIL')
      .ilike('account_name', `%${nameLike}%`)
      .order('account_code', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data || null;
  };

  const accountCodeByGoodsType = (t: string) => {
    const type = String(t || '').toUpperCase();
    if (type === 'PERALATAN_WORKSHOP') return '1400101';
    if (type === 'INVENTARIS_KANTOR') return '1400102';
    if (type === 'FURNITURE') return '1400103';
    if (type === 'PERLENGKAPAN') return '1400104';
    return null;
  };

  const syncJurnalPenerimaan = async () => {
    if (!confirm(`Sinkronisasi jurnal dari Penerimaan Barang sampai tanggal ${formatDate(reportDate)}? Jurnal penerimaan yang sudah ada akan dibuat ulang.`)) return;
    setPosting(true);
    try {
      const apAcc = await fetchApAccount();
      if (!apAcc) throw new Error('Akun Hutang Usaha tidak ditemukan di COA.');
      const persAcc = await fetchPersediaanAccount();

      const { data: receipts, error: rErr } = await supabase
        .from('goods_receipts')
        .select(`
          id,
          receipt_number,
          receipt_date,
          po_id,
          items:goods_receipt_items (
            goods_id,
            quantity_received,
            goods (item_type)
          )
        `)
        .lte('receipt_date', reportDate);
      if (rErr) throw rErr;

      const receiptList = receipts || [];
      if (receiptList.length === 0) {
        toast.info('Tidak ada data penerimaan sampai tanggal ini.');
        return;
      }

      const poIds = Array.from(new Set(receiptList.map((r: any) => String(r.po_id || '')).filter(Boolean)));
      const unitPriceByPoGoods: Record<string, number> = {};
      if (poIds.length > 0) {
        const { data: poItems, error: pErr } = await supabase
          .from('purchase_order_items')
          .select('po_id, goods_id, unit_price, created_at')
          .in('po_id', poIds)
          .order('created_at', { ascending: false });
        if (pErr) throw pErr;
        (poItems || []).forEach((it: any) => {
          const key = `${String(it.po_id)}:${String(it.goods_id)}`;
          if (unitPriceByPoGoods[key] !== undefined) return;
          unitPriceByPoGoods[key] = Number(it.unit_price || 0);
        });
      }

      let rebuilt = 0;
      let skipped = 0;

      const accountCache = new Map<string, any>();
      const resolveDebitAccount = async (itemTypeRaw: string) => {
        const itemType = String(itemTypeRaw || '').toUpperCase();
        if (accountCache.has(itemType)) return accountCache.get(itemType) || null;

        let acc: any = null;
        if (itemType === 'PERSEDIAAN') {
          acc = persAcc;
        } else {
          const code = accountCodeByGoodsType(itemType);
          if (code) acc = await fetchAccountByCodePrefix(code);
          if (!acc) {
            const fallbackName =
              itemType === 'PERALATAN_WORKSHOP'
                ? 'peralatan workshop'
                : itemType === 'INVENTARIS_KANTOR'
                  ? 'inventaris kantor'
                  : itemType === 'FURNITURE'
                    ? 'furniture'
                    : itemType === 'PERLENGKAPAN'
                      ? 'perlengkapan'
                      : '';
            acc = fallbackName ? await fetchAccountByName(fallbackName) : null;
          }
        }

        accountCache.set(itemType, acc || null);
        return acc || null;
      };

      for (const r of receiptList) {
        const rid = String(r.id || '');
        if (!rid) continue;
        const items = Array.isArray(r.items) ? r.items : [];
        const debitByAccountId: Record<string, number> = {};
        let total = 0;

        for (const it of items) {
          const gid = String(it?.goods_id || '');
          const qty = Number(it?.quantity_received || 0);
          if (!gid || qty <= 0) continue;
          const poId = String(r.po_id || '');
          const unit = unitPriceByPoGoods[`${poId}:${gid}`] || 0;
          const amt = qty * unit;
          if (!amt) continue;

          const g: any = (it as any)?.goods;
          const itemType = String((Array.isArray(g) ? g[0]?.item_type : g?.item_type) || '');
          const acc = await resolveDebitAccount(itemType);
          if (!acc) continue;

          const aid = String(acc.id);
          debitByAccountId[aid] = (debitByAccountId[aid] || 0) + amt;
          total += amt;
        }

        const debitLines = Object.entries(debitByAccountId).filter(([, v]) => Number(v || 0) !== 0);
        if (debitLines.length === 0 || total <= 0) {
          skipped++;
          continue;
        }

        await supabase.from('journal_entries').delete().eq('reference', rid);

        const receiptNo = String(r.receipt_number || '').trim();
        const { data: entry, error: eErr } = await supabase
          .from('journal_entries')
          .insert([{
            entry_date: String(r.receipt_date),
            voucher_no: `GR-${receiptNo}`,
            description: `Penerimaan Barang ${receiptNo}`,
            entry_type: 'JOURNAL',
            total_amount: total,
            reference: rid,
          }])
          .select()
          .single();
        if (eErr) throw eErr;

        const itemsPayload: any[] = debitLines.map(([accountId, amt]) => ({
          journal_entry_id: entry.id,
          account_id: accountId,
          debit: amt,
          credit: 0,
          description: 'Penerimaan Barang',
        }));
        itemsPayload.push({
          journal_entry_id: entry.id,
          account_id: apAcc.id,
          debit: 0,
          credit: total,
          description: 'Hutang Usaha',
        });
        const { error: itemsErr } = await supabase.from('journal_entry_items').insert(itemsPayload);
        if (itemsErr) throw itemsErr;

        rebuilt++;
      }

      toast.success(`Sync jurnal penerimaan selesai. Dibuat ulang: ${rebuilt}, dilewati: ${skipped}`);
      fetchReport();
    } catch (e: any) {
      toast.error('Gagal sync jurnal penerimaan: ' + (e?.message || 'Unknown error'));
    } finally {
      setPosting(false);
    }
  };

  async function fetchReport() {
    setLoading(true);
    try {
        // 1. Fetch Accounts
        const { data: accounts, error: accError } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code, account_name, category, sub_category, balance_type, account_type')
            .order('account_code');
        if (accError) throw accError;

        // Filter relevant accounts (Aktiva/Passiva/Modal OR Code 1/2/3)
        const relevantAccounts = (accounts || []).filter((acc: any) => {
            const code = acc.account_code || '';
            return (
                ['AKTIVA', 'KEWAJIBAN', 'EKUITAS', 'MODAL', 'PASSIVA', 'ASSETS', 'LIABILITIES', 'EQUITY'].includes(acc.category) ||
                code.startsWith('1') || 
                code.startsWith('2') || 
                code.startsWith('3')
            );
        });

        // 2. Fetch Journals
        const { data: journals, error: jError } = await supabase
            .from('journal_entry_items')
            .select(`
                journal_entry_id, debit, credit, account_id,
                journal_entries!inner (entry_date, voucher_no, description)
            `)
            .lte('journal_entries.entry_date', reportDate);
        if (jError) throw jError;

        let totalDebit = 0;
        let totalCredit = 0;
        const byEntry = new Map<string, any>();
        (journals || [])?.forEach((j: any) => {
          const d = Number(j.debit || 0);
          const c = Number(j.credit || 0);
          totalDebit += d;
          totalCredit += c;
          const entryId = String(j.journal_entry_id || '');
          if (!entryId) return;
          const je = j.journal_entries || {};
          const prev = byEntry.get(entryId) || {
            journal_entry_id: entryId,
            entry_date: je.entry_date || '',
            voucher_no: je.voucher_no || '',
            description: je.description || '',
            debit: 0,
            credit: 0,
          };
          prev.debit += d;
          prev.credit += c;
          byEntry.set(entryId, prev);
        });

        const trialDiff = totalDebit - totalCredit;
        setTrialBalance({ debit: totalDebit, credit: totalCredit, diff: trialDiff });

        const unbalanced = Array.from(byEntry.values())
          .map((x: any) => ({ ...x, diff: Number(x.debit || 0) - Number(x.credit || 0) }))
          .filter((x: any) => Math.abs(Number(x.diff || 0)) > 0.01)
          .sort((a: any, b: any) => Math.abs(Number(b.diff || 0)) - Math.abs(Number(a.diff || 0)))
          .slice(0, 50);
        setUnbalancedJournals(unbalanced);

        // 3. Calculate Balances
        const balances: Record<string, number> = {};
        (journals || [])?.forEach((j: any) => {
            if (!balances[j.account_id]) balances[j.account_id] = 0;
            balances[j.account_id] += (j.debit || 0) - (j.credit || 0);
        });

        // 4. Calculate Current Earnings
        let totalRevenue = 0;
        let totalExpense = 0;
        let totalHpp = 0;
        (accounts || []).forEach((acc: any) => {
          const code = String(acc.account_code || '').trim();
          if (!code) return;
          const prefix = code[0] || '';
          if (prefix !== '4' && prefix !== '5' && prefix !== '6') return;
          if (String(acc.account_type || '').toUpperCase() !== 'DETAIL') return;
          const raw = Number(balances[acc.id] || 0);
          if (prefix === '4') totalRevenue += -raw;
          else if (prefix === '5') totalExpense += raw;
          else if (prefix === '6') totalHpp += raw;
        });
        const currentEarnings = totalRevenue - (totalExpense + totalHpp);

        // 5. Map to Report Structure
        const assets: any[] = [];
        const liabilities: any[] = [];
        const equity: any[] = [];

        const getBalance = (accId: string, accCode: string): number => {
            if (!accCode) return 0;
            if (balances[accId] !== undefined) return balances[accId];
            
            const descendants = relevantAccounts.filter((a: any) => 
                a.account_type === 'DETAIL' &&
                (a.account_code || '').startsWith(accCode)
            );
            
            let total = 0;
            descendants.forEach((d: any) => {
                total += (balances[d.id] || 0);
            });
            return total;
        };

        relevantAccounts.forEach((acc: any) => {
            let bal = 0;
            const code = String(acc.account_code || '').trim();
            
            if (acc.account_type === 'DETAIL') {
                bal = balances[acc.id] || 0;
            } else {
                bal = getBalance(acc.id, code);
            }
            
            const prefix = code[0] || '';
            const bucket =
              prefix === '1'
                ? 'ASSET'
                : prefix === '2'
                  ? 'LIABILITY'
                  : prefix === '3'
                    ? 'EQUITY'
                    : ['AKTIVA', 'ASSETS'].includes(acc.category)
                      ? 'ASSET'
                      : ['KEWAJIBAN', 'PASSIVA', 'LIABILITIES'].includes(acc.category)
                        ? 'LIABILITY'
                        : ['EKUITAS', 'MODAL', 'EQUITY'].includes(acc.category)
                          ? 'EQUITY'
                          : null;

            const normalized = bucket === 'ASSET' ? bal : -bal;
            const displayBalance = String(acc.account_type || '').toUpperCase() === 'DETAIL' ? normalized : 0;

            if (Math.abs(normalized) > 0.01) {
                const item = { ...acc, balance: displayBalance };
                if (bucket === 'ASSET') assets.push(item);
                else if (bucket === 'LIABILITY') liabilities.push(item);
                else if (bucket === 'EQUITY') equity.push(item);
            }
        });

        setReportData({
            assets,
            liabilities,
            equity,
            currentEarnings
        });

    } catch (error: any) {
        toast.error("Gagal memuat neraca: " + error.message);
    } finally {
        setLoading(false);
    }
  }

  const sumTotal = (items: any[]) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((acc, curr) => {
      const isDetail = String(curr?.account_type || '').toUpperCase() === 'DETAIL';
      if (!isDetail) return acc;
      return acc + (Number(curr?.balance || 0) || 0);
    }, 0);
  };

  const totalAssets = sumTotal(reportData?.assets);
  const totalLiabilities = sumTotal(reportData?.liabilities);
  const totalEquity = sumTotal(reportData?.equity) + (reportData?.currentEarnings || 0);
  const balanceDiff = totalAssets - (totalLiabilities + totalEquity);

  const exportToExcel = () => {
    // We'll create two columns: Left (Assets), Right (Liabilities + Equity)
    // Or just a simple list for Excel. Simple list is better for data.
    // Let's do a structured list: Assets, then Liabilities, then Equity.
    
    const rows: any[] = [];
    rows.push(['LAPORAN NERACA (BALANCE SHEET)']);
    rows.push([`Per Tanggal: ${formatDate(reportDate)}`]);
    rows.push(['']);
    
    rows.push(['AKTIVA (ASSETS)', '']);
    rows.push(['Kode Akun', 'Nama Akun', 'Saldo (Rp)']);
    (reportData?.assets || []).forEach((a: any) => rows.push([a.account_code, a.account_name, a.balance]));
    rows.push(['TOTAL AKTIVA', '', totalAssets]);
    rows.push(['']);

    rows.push(['KEWAJIBAN (LIABILITIES)', '']);
    rows.push(['Kode Akun', 'Nama Akun', 'Saldo (Rp)']);
    (reportData?.liabilities || []).forEach((l: any) => rows.push([l.account_code, l.account_name, l.balance]));
    rows.push(['TOTAL KEWAJIBAN', '', totalLiabilities]);
    rows.push(['']);

    rows.push(['MODAL (EQUITY)', '']);
    rows.push(['Kode Akun', 'Nama Akun', 'Saldo (Rp)']);
    (reportData?.equity || []).forEach((e: any) => rows.push([e.account_code, e.account_name, e.balance]));
    rows.push(['', 'Laba Tahun Berjalan', reportData?.currentEarnings || 0]);
    rows.push(['TOTAL MODAL', '', totalEquity]);
    rows.push(['']);

    rows.push(['TOTAL PASSIVA (KEWAJIBAN + MODAL)', '', totalLiabilities + totalEquity]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Neraca");
    XLSX.writeFile(wb, `Laporan_Neraca_Per_${reportDate}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-3xl font-bold tracking-tight">Laporan Neraca (Balance Sheet)</h2>
        <div className="flex gap-2">
            <Button variant="outline" onClick={syncJurnalPenerimaan} disabled={posting || loading} className="print:hidden">
                <RefreshCw className={`mr-2 h-4 w-4 ${posting ? 'animate-spin' : ''}`} /> Sync GR
            </Button>
            <Button variant="outline" onClick={exportToExcel} className="print:hidden">
                <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="print:hidden">
                <Printer className="mr-2 h-4 w-4" /> Cetak
            </Button>
            <Button onClick={fetchReport} disabled={loading} className="print:hidden">
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="pb-3 print:hidden">
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border w-fit">
                <span className="text-sm font-medium">Per Tanggal:</span>
                <Input 
                    type="date" 
                    className="w-auto h-8 bg-white" 
                    value={reportDate}
                    onChange={e => setReportDate(e.target.value)}
                />
            </div>
            {Math.abs(trialBalance.diff) > 0.01 && (
              <div className="mt-3 p-3 border rounded bg-red-50 text-red-900">
                Jurnal tidak seimbang: {formatCurrency(trialBalance.diff)} (Total Debit - Total Kredit).
              </div>
            )}
            {Math.abs(balanceDiff) > 0.01 && (
              <div className="mt-3 p-3 border rounded bg-amber-50 text-amber-900">
                Selisih Neraca: {formatCurrency(balanceDiff)} (Aktiva - (Kewajiban + Modal)).
              </div>
            )}
        </CardHeader>
        
        <CardContent>
            <ReportPrintHeader title="Laporan Neraca (Balance Sheet)" asOfDate={reportDate} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* LEFT SIDE: ASSETS (AKTIVA) */}
                <div className="space-y-4">
                    <h3 className="font-bold bg-blue-100 p-2 text-blue-800 uppercase border-l-4 border-blue-500">
                        AKTIVA (ASSETS)
                    </h3>
                    
                    {/* Group by Sub Category if needed, for now flat list */}
                    <Table>
                        <TableBody>
                            {reportData.assets.length === 0 ? (
                                <TableRow><TableCell className="italic text-gray-500">Tidak ada data</TableCell></TableRow>
                            ) : (
                                reportData.assets.map((item: any, idx: number) => (
                                    <TableRow key={idx} className={item.account_type === 'HEADER' ? 'bg-slate-50 font-semibold' : ''}>
                                        <TableCell>
                                            <div className="font-medium" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_name}
                                            </div>
                                            <div className="text-xs text-gray-500" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_code}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.account_type === 'HEADER' ? '' : formatCurrency(item.balance)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    <div className="flex justify-between items-center p-3 bg-slate-100 font-bold border-t-2 border-slate-300">
                        <span>TOTAL AKTIVA</span>
                        <span>{formatCurrency(totalAssets)}</span>
                    </div>
                </div>

                {/* RIGHT SIDE: LIABILITIES & EQUITY (PASSIVA) */}
                <div className="space-y-8">
                    {/* LIABILITIES */}
                    <div className="space-y-4">
                        <h3 className="font-bold bg-red-100 p-2 text-red-800 uppercase border-l-4 border-red-500">
                            KEWAJIBAN (LIABILITIES)
                        </h3>
                        <Table>
                            <TableBody>
                                {reportData.liabilities.length === 0 ? (
                                    <TableRow><TableCell className="italic text-gray-500">Tidak ada data</TableCell></TableRow>
                                ) : (
                                    reportData.liabilities.map((item: any, idx: number) => (
                                        <TableRow key={idx} className={item.account_type === 'HEADER' ? 'bg-slate-50 font-semibold' : ''}>
                                        <TableCell>
                                            <div className="font-medium" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_name}
                                            </div>
                                            <div className="text-xs text-gray-500" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_code}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.account_type === 'HEADER' ? '' : formatCurrency(item.balance)}
                                        </TableCell>
                                    </TableRow>
                                    ))
                                )}
                                <TableRow className="font-bold bg-slate-50">
                                    <TableCell>Total Kewajiban</TableCell>
                                    <TableCell className="text-right">{formatCurrency(totalLiabilities)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>

                    {/* EQUITY */}
                    <div className="space-y-4">
                        <h3 className="font-bold bg-green-100 p-2 text-green-800 uppercase border-l-4 border-green-500">
                            MODAL (EQUITY)
                        </h3>
                        <Table>
                            <TableBody>
                                {reportData.equity.map((item: any, idx: number) => (
                                    <TableRow key={idx} className={item.account_type === 'HEADER' ? 'bg-slate-50 font-semibold' : ''}>
                                        <TableCell>
                                            <div className="font-medium" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_name}
                                            </div>
                                            <div className="text-xs text-gray-500" style={{ paddingLeft: item.account_type === 'DETAIL' ? '1.5rem' : '0' }}>
                                                {item.account_code}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.account_type === 'HEADER' ? '' : formatCurrency(item.balance)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {/* Current Earnings */}
                                <TableRow>
                                    <TableCell className="font-medium text-blue-700">Laba Tahun Berjalan</TableCell>
                                    <TableCell className="text-right font-medium text-blue-700">{formatCurrency(reportData.currentEarnings)}</TableCell>
                                </TableRow>
                                <TableRow className="font-bold bg-slate-50">
                                    <TableCell>Total Modal</TableCell>
                                    <TableCell className="text-right">{formatCurrency(totalEquity)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>

                    {/* TOTAL PASSIVA */}
                    <div className="flex justify-between items-center p-3 bg-slate-100 font-bold border-t-2 border-slate-300 mt-4">
                        <span>TOTAL PASSIVA (KEWAJIBAN + MODAL)</span>
                        <span>{formatCurrency(totalLiabilities + totalEquity)}</span>
                    </div>
                </div>
            </div>

            {unbalancedJournals.length > 0 && (
              <div className="mt-8 print:hidden">
                <h3 className="font-bold bg-red-100 p-2 text-red-800 uppercase border-l-4 border-red-500">
                  Jurnal Tidak Seimbang (Top 50)
                </h3>
                <div className="rounded-md border mt-3">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Voucher</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead className="text-right">Selisih</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unbalancedJournals.map((j: any) => (
                        <TableRow key={j.journal_entry_id}>
                          <TableCell>{j.entry_date ? formatDate(j.entry_date) : '-'}</TableCell>
                          <TableCell className="font-mono">{j.voucher_no || '-'}</TableCell>
                          <TableCell className="max-w-[520px] truncate">{j.description || '-'}</TableCell>
                          <TableCell className="text-right font-bold text-red-700">{formatCurrency(Number(j.diff || 0))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
