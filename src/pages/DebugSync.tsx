import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function DebugSync() {
  const [wos, setWos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    fetchProblematicWOs();
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
        .select('reference_number')
        .like('reference_number', 'WO-%'); // Assuming WO numbers start with WO-

      const journalRefs = new Set(journals?.map(j => j.reference_number));

      // 3. Filter WOs that don't have a journal
      const missing = allWos.filter(wo => !journalRefs.has(wo.wo_number));
      
      setWos(missing);
      addLog(`Ditemukan ${missing.length} WO yang selesai tapi BELUM punya jurnal.`);

    } catch (error: any) {
      toast.error("Error fetching: " + error.message);
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
            if (item.is_info_only) return;
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
            .select('id, account_name');
        
        const findAccount = (keyword: string) => accounts?.find(a => a.account_name.toLowerCase().includes(keyword.toLowerCase()));

        const accReceivable = findAccount('Piutang Usaha') || findAccount('Piutang') || findAccount('Receivable');
        const accServiceRev = findAccount('Pendapatan Jasa') || findAccount('Jasa') || findAccount('Service');
        const accPartsRev = findAccount('Pendapatan Sparepart') || findAccount('Sparepart') || accServiceRev;

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
                description: `Jurnal Otomatis WO ${wo.wo_number}`,
                reference_number: wo.wo_number,
                total_amount: grandTotal,
                status: 'POSTED'
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

        await supabase.from('journal_entry_items').insert(journalItems);
        
        addLog(`SUKSES: Jurnal dibuat untuk ${wo.wo_number}. Total: ${grandTotal}`);
        toast.success(`Jurnal WO ${wo.wo_number} berhasil dibuat!`);
        
        // Remove from list
        setWos(prev => prev.filter(w => w.id !== wo.id));

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
