import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function DebugSync() {
  const { user } = useAuth();
  const [wos, setWos] = useState<any[]>([]);
  const [unbalanced, setUnbalanced] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold tracking-tight">Debug & Fix Data</h2>
        <Card>
          <CardHeader>
            <CardTitle>Akses Ditolak</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Halaman ini hanya untuk Super Admin.
          </CardContent>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    fetchProblematicWOs();
    fetchUnbalancedWoJournals();
  }, []);

  const addLog = (msg: string) => setLogs(prev => [msg, ...prev]);

  const fetchProblematicWOs = async () => {
    setLoading(true);
    try {
      // 1. Get all CLOSED/COMPLETED WOs
      const { data: allWos } = await supabase
        .from('work_orders')
        .select('id, wo_number, work_date, status, grand_total')
        .in('status', ['CLOSED', 'COMPLETED'])
        .order('work_date', { ascending: false });

      if (!allWos) return;

      // 2. Get all Journal Entries related to WOs
      const { data: journals } = await supabase
        .from('journal_entries')
        .select('reference')
        .like('reference', 'WO-%');

      const journalRefs = new Set((journals || []).map((j: any) => String(j.reference || '')));

      // 3. Filter WOs that don't have a journal
      const missing = allWos.filter((wo: any) => !journalRefs.has(String(wo.wo_number || '')));
      
      setWos(missing);
      addLog(`Ditemukan ${missing.length} WO yang selesai tapi BELUM punya jurnal.`);

    } catch (error: any) {
      toast.error("Error fetching: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnbalancedWoJournals = async () => {
    try {
      const { data: entries, error: eErr } = await supabase
        .from('journal_entries')
        .select('id, entry_date, voucher_no, reference, description')
        .ilike('description', 'Jurnal Otomatis WO%')
        .order('entry_date', { ascending: false })
        .limit(300);
      if (eErr) throw eErr;

      const entryIds = (entries || []).map((e: any) => e.id).filter(Boolean);
      if (entryIds.length === 0) {
        setUnbalanced([]);
        return;
      }

      const { data: items, error: iErr } = await supabase
        .from('journal_entry_items')
        .select('journal_entry_id, debit, credit')
        .in('journal_entry_id', entryIds);
      if (iErr) throw iErr;

      const sums = new Map<string, { debit: number; credit: number }>();
      (items || []).forEach((it: any) => {
        const id = String(it.journal_entry_id || '');
        if (!id) return;
        const prev = sums.get(id) || { debit: 0, credit: 0 };
        prev.debit += Number(it.debit || 0);
        prev.credit += Number(it.credit || 0);
        sums.set(id, prev);
      });

      const parseWoNumber = (e: any) => {
        const ref = String(e.reference || '');
        if (ref.startsWith('WO-')) return ref;
        const desc = String(e.description || '');
        const m = desc.match(/WO-\d{8}-\d+/);
        return m ? m[0] : '';
      };

      const list = (entries || [])
        .map((e: any) => {
          const s = sums.get(String(e.id)) || { debit: 0, credit: 0 };
          const diff = Number(s.debit) - Number(s.credit);
          return {
            id: e.id,
            entry_date: e.entry_date,
            voucher_no: e.voucher_no,
            reference: e.reference,
            description: e.description,
            wo_number: parseWoNumber(e),
            debit: s.debit,
            credit: s.credit,
            diff,
          };
        })
        .filter((x: any) => Math.abs(Number(x.diff || 0)) > 0.01)
        .sort((a: any, b: any) => Math.abs(Number(b.diff || 0)) - Math.abs(Number(a.diff || 0)))
        .slice(0, 50);

      setUnbalanced(list);
      addLog(`Ditemukan ${list.length} jurnal WO yang TIDAK seimbang.`);
    } catch (e: any) {
      console.error('fetchUnbalancedWoJournals error', e);
      setUnbalanced([]);
    }
  };

  const getAccounts = async () => {
    const { data: accounts, error } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_code, account_type, category');
    if (error) throw error;
    const isDetail = (a: any) => String(a?.account_type || '').toUpperCase() === 'DETAIL';
    const findByCode = (code: string) => (accounts || []).find((a: any) => isDetail(a) && String(a?.account_code || '') === code);
    const findByName = (keyword: string) =>
      (accounts || []).find((a: any) => isDetail(a) && String(a?.account_name || '').toLowerCase().includes(keyword.toLowerCase()));
    const accReceivable =
      findByCode('1100201') || findByName('piutang usaha') || findByName('piutang') || findByName('receivable');
    const accServiceRev =
      findByCode('4100101') || findByName('pendapatan jasa') || findByName('jasa') || findByName('service');
    const accPartsRev =
      findByCode('4100102') || findByName('pendapatan sparepart') || findByName('sparepart') || accServiceRev;
    return { accReceivable, accServiceRev, accPartsRev };
  };

  const rebuildWoJournal = async (woNumber: string) => {
    setLoading(true);
    try {
      if (!woNumber) throw new Error('WO number kosong.');

      const { data: wo, error: woErr } = await supabase
        .from('work_orders')
        .select('id, wo_number, work_date, status')
        .eq('wo_number', woNumber)
        .maybeSingle();
      if (woErr) throw woErr;
      if (!wo) throw new Error(`WO ${woNumber} tidak ditemukan.`);

      const { data: billings, error: bErr } = await supabase
        .from('work_order_billings')
        .select('item_type, total_price')
        .eq('work_order_id', wo.id);
      if (bErr) throw bErr;

      let totalService = 0;
      let totalParts = 0;
      (billings || []).forEach((it: any) => {
        const amt = Number(it.total_price || 0);
        if (String(it.item_type || '').toUpperCase() === 'JOB') totalService += amt;
        else totalParts += amt;
      });
      const grandTotal = totalService + totalParts;
      if (grandTotal <= 0) throw new Error(`WO ${woNumber} total tagihan 0.`);

      const { accReceivable, accServiceRev, accPartsRev } = await getAccounts();
      if (!accReceivable || !accServiceRev) throw new Error('Akun Piutang/Pendapatan tidak ditemukan di COA.');

      const targetDesc = `Jurnal Otomatis WO ${woNumber}`;
      const { data: candidates, error: candErr } = await supabase
        .from('journal_entries')
        .select('id')
        .or(`reference.eq.${woNumber},description.eq.${targetDesc},voucher_no.ilike.%${woNumber}%`)
        .limit(50);
      if (candErr) throw candErr;

      const candidateIds = (candidates || []).map((x: any) => x.id).filter(Boolean);
      if (candidateIds.length > 0) {
        await supabase.from('journal_entry_items').delete().in('journal_entry_id', candidateIds);
        await supabase.from('journal_entries').delete().in('id', candidateIds);
      }

      const { data: created, error: cErr } = await supabase
        .from('journal_entries')
        .insert([{
          entry_date: wo.work_date,
          voucher_no: woNumber,
          reference: woNumber,
          description: targetDesc,
          entry_type: 'JOURNAL',
          total_amount: grandTotal,
        }])
        .select()
        .single();
      if (cErr) throw cErr;
      const journalId = created.id;

      const itemsPayload: any[] = [
        {
          journal_entry_id: journalId,
          account_id: accReceivable.id,
          debit: grandTotal,
          credit: 0,
          description: `Piutang WO ${woNumber}`,
        },
      ];
      if (totalService > 0) {
        itemsPayload.push({
          journal_entry_id: journalId,
          account_id: accServiceRev.id,
          debit: 0,
          credit: totalService,
          description: `Pendapatan Jasa WO ${woNumber}`,
        });
      }
      if (totalParts > 0) {
        itemsPayload.push({
          journal_entry_id: journalId,
          account_id: (accPartsRev?.id || accServiceRev.id),
          debit: 0,
          credit: totalParts,
          description: `Pendapatan Sparepart WO ${woNumber}`,
        });
      }

      const { error: insErr } = await supabase.from('journal_entry_items').insert(itemsPayload);
      if (insErr) throw insErr;

      addLog(`SUKSES: Rebuild jurnal WO ${woNumber}. Total: ${grandTotal}`);
      toast.success(`Rebuild jurnal WO ${woNumber} berhasil.`);
      fetchUnbalancedWoJournals();
    } catch (e: any) {
      addLog(`ERROR Rebuild ${woNumber}: ${e?.message || 'Unknown error'}`);
      toast.error(`Gagal rebuild jurnal ${woNumber}: ${e?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (wo: any) => {
    setLoading(true);
    try {
        addLog(`Memproses WO: ${wo.wo_number}...`);
        
        // 1. Fetch Billings
        const { data: billings } = await supabase
            .from('work_order_billings')
            .select('*')
            .eq('work_order_id', wo.id);
        
        if (!billings || billings.length === 0) {
            addLog(`SKIP: WO ${wo.wo_number} tidak punya tagihan.`);
            setLoading(false);
            return;
        }

        let totalService = 0;
        let totalParts = 0;
        
        billings.forEach(item => {
            if (item.item_type === 'JOB') {
                totalService += item.total_price || 0;
            } else {
                totalParts += item.total_price || 0;
            }
        });
        
        const grandTotal = totalService + totalParts;

        if (grandTotal <= 0) {
            addLog(`SKIP: WO ${wo.wo_number} total tagihan 0.`);
            setLoading(false);
            return;
        }

        // 2. Find Accounts
        const { data: accounts } = await supabase
            .from('chart_of_accounts')
            .select('id, account_name, account_code, account_type, category');
        
        const isDetail = (a: any) => (a?.account_type || '').toUpperCase() === 'DETAIL';
        const isRevenue = (a: any) => {
            const c = (a?.category || '').toUpperCase();
            return c === 'PENDAPATAN' || c === 'PENJUALAN';
        };
        const findByCode = (code: string) => accounts?.find(a => isDetail(a) && a?.account_code === code);
        const findByName = (keyword: string, revenueOnly = false) => accounts?.find(a => {
            if (!isDetail(a)) return false;
            if (revenueOnly && !isRevenue(a)) return false;
            return (a?.account_name || '').toLowerCase().includes(keyword.toLowerCase());
        });

        const accReceivable = findByName('Piutang Usaha') || findByName('Piutang') || findByName('Receivable');
        const accServiceRev = findByCode('4100101') || findByName('Pendapatan Jasa', true) || findByName('Jasa', true) || findByName('Service', true);
        const accPartsRev = findByCode('4100102') || findByName('Pendapatan Sparepart', true) || findByName('Sparepart', true) || accServiceRev;

        if (!accReceivable || !accServiceRev) {
            addLog(`ERROR: Akun COA tidak ditemukan untuk ${wo.wo_number}`);
            toast.error("Gagal: Akun Piutang/Pendapatan tidak ditemukan di COA.");
            setLoading(false);
            return;
        }

        // 3. Create Journal
        const { data: journal, error: jErr } = await supabase
            .from('journal_entries')
            .insert([{
                entry_date: wo.work_date, 
                voucher_no: wo.wo_number,
                reference: wo.wo_number,
                description: `Jurnal Otomatis WO ${wo.wo_number}`,
                total_amount: grandTotal,
                entry_type: 'JOURNAL'
            }])
            .select()
            .single();

        if (jErr) throw jErr;

        const journalItems = [];

        // DEBIT
        journalItems.push({
            journal_entry_id: journal.id,
            account_id: accReceivable.id,
            debit: grandTotal,
            credit: 0,
            description: `Piutang WO ${wo.wo_number}`
        });

        // CREDIT Service
        if (totalService > 0) {
            journalItems.push({
                journal_entry_id: journal.id,
                account_id: accServiceRev.id,
                debit: 0,
                credit: totalService,
                description: `Pendapatan Jasa WO ${wo.wo_number}`
            });
        }

        // CREDIT Parts
        if (totalParts > 0) {
                journalItems.push({
                journal_entry_id: journal.id,
                account_id: accPartsRev?.id || accServiceRev.id,
                debit: 0,
                credit: totalParts,
                description: `Pendapatan Sparepart WO ${wo.wo_number}`
            });
        }

        const { error: jiErr } = await supabase.from('journal_entry_items').insert(journalItems);
        if (jiErr) throw jiErr;
        
        addLog(`SUKSES: Jurnal dibuat untuk ${wo.wo_number}. Total: ${grandTotal}`);
        toast.success(`Jurnal WO ${wo.wo_number} berhasil dibuat!`);
        
        // Remove from list
        setWos(prev => prev.filter(w => w.id !== wo.id));
        fetchUnbalancedWoJournals();

    } catch (e: any) {
        addLog(`ERROR ${wo.wo_number}: ${e.message}`);
        toast.error("Gagal sync jurnal: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-red-600 flex items-center gap-2">
            <AlertTriangle /> Debug Sync Jurnal WO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex justify-between items-center">
            <p className="text-muted-foreground">
                Menampilkan WO yang statusnya CLOSED/COMPLETED tapi belum memiliki Jurnal Otomatis.
            </p>
            <Button onClick={fetchProblematicWOs} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Scan Ulang
            </Button>
          </div>

          <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>No. WO</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {wos.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center h-24 text-green-600 font-medium">
                                <CheckCircle className="inline mr-2" />
                                Semua WO aman! Tidak ada yang missing jurnal.
                            </TableCell>
                        </TableRow>
                    ) : (
                        wos.map(wo => (
                            <TableRow key={wo.id}>
                                <TableCell className="font-bold">{wo.wo_number}</TableCell>
                                <TableCell>{wo.work_date}</TableCell>
                                <TableCell><span className="px-2 py-1 bg-gray-100 rounded text-xs">{wo.status}</span></TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" onClick={() => handleSync(wo)} disabled={loading}>
                                        Sync Jurnal
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
          </div>

          {unbalanced.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-muted-foreground">
                  Jurnal Otomatis WO yang tidak seimbang (debit ≠ kredit).
                </p>
                <Button onClick={fetchUnbalancedWoJournals} disabled={loading} variant="outline">
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>No. WO</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unbalanced.map((j: any) => (
                      <TableRow key={j.id}>
                        <TableCell>{j.entry_date ? formatDate(j.entry_date) : '-'}</TableCell>
                        <TableCell className="font-mono">{j.wo_number || '-'}</TableCell>
                        <TableCell className="truncate max-w-[360px]">{j.description || '-'}</TableCell>
                        <TableCell className="text-right font-bold text-red-700">{formatCurrency(Number(j.diff || 0))}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => rebuildWoJournal(j.wo_number)} disabled={loading || !j.wo_number}>
                            Fix (Rebuild)
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="mt-6 bg-slate-900 text-green-400 p-4 rounded-md font-mono text-xs h-48 overflow-y-auto">
            {logs.map((log, i) => (
                <div key={i}>{log}</div>
            ))}
            {logs.length === 0 && <div className="text-gray-500">Ready to scan...</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
