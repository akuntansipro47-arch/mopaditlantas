import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { Plus, Trash2, Save, Search, RefreshCw, Pencil } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtimeRefetch } from '@/hooks/useRealtimeRefetch';
import { logActivity } from '@/lib/activityLog';

export default function ManualJournalEntry() {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [voucherNo, setVoucherNo] = useState('');
  const [headerDesc, setHeaderDesc] = useState('');
  
  const [lines, setLines] = useState<any[]>([
      { account_id: '', debit: 0, credit: 0, description: '' },
      { account_id: '', debit: 0, credit: 0, description: '' }
  ]);

  // Account Selector
  const [isAccountSelectOpen, setIsAccountSelectOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [accountSearch, setAccountSearch] = useState('');

  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchAccounts();
    generateVoucherNo();
  }, []);

  useEffect(() => {
    const onFocus = () => fetchAccounts();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useRealtimeRefetch({
    tables: ['chart_of_accounts'],
    onRefetch: fetchAccounts,
  });

  useEffect(() => {
    fetchHistory();
  }, [historyFilter.startDate, historyFilter.endDate]);

  async function fetchAccounts() {
    try {
        const { data } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code, account_name, category, sub_category')
            .eq('account_type', 'DETAIL')
            .order('account_code');
        setAccounts(data || []);
    } catch (e) {
        console.error(e);
    }
  }

  function generateVoucherNo() {
      const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      setVoucherNo(`JV-${dateStr}-${random}`);
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select(`
          *,
          items:journal_entry_items (
            id,
            debit,
            credit,
            account_id,
            description,
            account:chart_of_accounts (id, account_name, account_code)
          )
        `)
        .eq('entry_type', 'GENERAL')
        .gte('entry_date', historyFilter.startDate)
        .lte('entry_date', historyFilter.endDate)
        .order('entry_date', { ascending: false })
        .order('voucher_no', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error: any) {
      toast.error('Gagal memuat riwayat jurnal umum: ' + error.message);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Line Operations
  const addLine = () => {
      setLines([...lines, { account_id: '', debit: 0, credit: 0, description: '' }]);
  };

  const removeLine = (index: number) => {
      if (lines.length <= 2) {
          toast.error("Minimal 2 baris jurnal");
          return;
      }
      const newLines = [...lines];
      newLines.splice(index, 1);
      setLines(newLines);
  };

  const updateLine = (index: number, field: string, value: any) => {
      const newLines = [...lines];
      
      if (field === 'debit' || field === 'credit') {
          // Handle string input for decimal/separator support
          if (typeof value === 'string') {
              // Replace comma with dot for internal calculation
              const normalizedValue = value.replace(/,/g, '.');
              // Allow only numbers and one dot
              if (/^[0-9]*\.?[0-9]*$/.test(normalizedValue)) {
                  newLines[index] = { ...newLines[index], [field]: normalizedValue };
              } else if (value === '') {
                  newLines[index] = { ...newLines[index], [field]: 0 };
              }
          } else {
              newLines[index] = { ...newLines[index], [field]: value };
          }
      } else {
          newLines[index] = { ...newLines[index], [field]: value };
      }
      
      // Auto-clear opposite field (Debit/Credit exclusive)
      const currentDebit = Number(newLines[index].debit) || 0;
      const currentCredit = Number(newLines[index].credit) || 0;
      
      if (field === 'debit' && currentDebit > 0) newLines[index].credit = 0;
      if (field === 'credit' && currentCredit > 0) newLines[index].debit = 0;
      
      setLines(newLines);
  };

  const openAccountSelector = (index: number) => {
      setActiveLineIndex(index);
      setAccountSearch('');
      setIsAccountSelectOpen(true);
  };

  const selectAccount = (account: any) => {
      if (String(account?.account_name || '').toLowerCase().includes('piutang usaha')) {
          toast.error('Transaksi yang mencatat Piutang Usaha dinonaktifkan.');
          return;
      }
      if (activeLineIndex !== null) {
          setLines((prev) => {
              const next = [...prev];
              const current = next[activeLineIndex] || { account_id: '', debit: 0, credit: 0, description: '' };
              next[activeLineIndex] = {
                  ...current,
                  account_id: account.id,
                  description: current.description || headerDesc
              };
              return next;
          });
      }
      setIsAccountSelectOpen(false);
      setActiveLineIndex(null);
  };

  // Calculations
  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const balance = totalDebit - totalCredit;

  const resetForm = () => {
    setEntryDate(new Date().toISOString().split('T')[0]);
    generateVoucherNo();
    setHeaderDesc('');
    setLines([
      { account_id: '', debit: 0, credit: 0, description: '' },
      { account_id: '', debit: 0, credit: 0, description: '' }
    ]);
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    resetForm();
    setActiveTab('history');
  };

  const handleEditEntry = (entry: any) => {
    setEditingId(entry.id);
    setEntryDate(entry.entry_date);
    setVoucherNo(entry.voucher_no);
    setHeaderDesc(entry.description || '');
    const mapped = (entry.items || []).map((it: any) => ({
      account_id: it.account_id,
      debit: it.debit || 0,
      credit: it.credit || 0,
      description: it.description || ''
    }));
    const normalizedLines = mapped.length >= 2 ? mapped : [...mapped, ...Array.from({ length: 2 - mapped.length }).map(() => ({ account_id: '', debit: 0, credit: 0, description: '' }))];
    setLines(normalizedLines);
    setActiveTab('entry');
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Hapus jurnal umum ini?')) return;
    setHistoryLoading(true);
    try {
      const { error: delItemsErr } = await supabase
        .from('journal_entry_items')
        .delete()
        .eq('journal_entry_id', id);
      if (delItemsErr) throw delItemsErr;

      const { error: delEntryErr } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', id);
      if (delEntryErr) throw delEntryErr;

      toast.success('Jurnal umum berhasil dihapus');
      {
        const row = history.find((x: any) => String(x.id) === String(id)) as any;
        const vNo = String(row?.voucher_no || '').trim() || null;
        void logActivity({
          action: 'GJ_DELETE',
          module: 'GENERAL_JOURNAL',
          entity_type: 'journal_entries',
          entity_id: String(id),
          details: `Hapus jurnal ${vNo || id}`,
          meta: { journal_entry_id: id, voucher_no: vNo, entry_date: row?.entry_date || null },
        });
      }
      if (editingId === id) handleCancelEdit();
      fetchHistory();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSave = async () => {
      // Validations
      if (!voucherNo) return toast.error("Nomor Voucher harus diisi");
      if (!headerDesc) return toast.error("Keterangan harus diisi");
      if (Math.abs(balance) > 0.01) return toast.error(`Jurnal tidak seimbang! Selisih: ${formatCurrency(balance)}`);
      
      const validLines = lines.filter(l => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0));
      if (validLines.length < 2) return toast.error("Minimal 2 akun yang valid (Debit & Kredit)");
      const hasPiutangUsaha = validLines.some((l) => {
          const acc = accounts.find((a) => a.id === l.account_id);
          return String(acc?.account_name || '').toLowerCase().includes('piutang usaha');
      });
      if (hasPiutangUsaha) return toast.error('Transaksi yang mencatat Piutang Usaha dinonaktifkan.');

      setLoading(true);
      try {
          let entryId = editingId;

          if (editingId) {
            const { error: entryError } = await supabase
              .from('journal_entries')
              .update({
                entry_date: entryDate,
                voucher_no: voucherNo,
                description: headerDesc,
                entry_type: 'GENERAL',
                total_amount: totalDebit,
                updated_at: new Date().toISOString()
              })
              .eq('id', editingId);
            if (entryError) throw entryError;

            const { error: deleteError } = await supabase
              .from('journal_entry_items')
              .delete()
              .eq('journal_entry_id', editingId);
            if (deleteError) throw deleteError;
          } else {
            const { data: entry, error: entryError } = await supabase
              .from('journal_entries')
              .insert([{
                  entry_date: entryDate,
                  voucher_no: voucherNo,
                  description: headerDesc,
                  entry_type: 'GENERAL',
                  total_amount: totalDebit,
                  reference: null
              }])
              .select()
              .single();
            if (entryError) throw entryError;
            entryId = entry.id;
          }

          // 2. Create Journal Items
          const itemsToInsert = validLines.map(line => ({
              journal_entry_id: entryId,
              account_id: line.account_id,
              debit: Number(line.debit) || 0,
              credit: Number(line.credit) || 0,
              description: line.description || headerDesc
          }));

          const { error: itemsError } = await supabase
            .from('journal_entry_items')
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;

          toast.success(editingId ? 'Jurnal Umum berhasil diperbarui' : 'Jurnal Umum berhasil disimpan');
          void logActivity({
            action: editingId ? 'GJ_UPDATE' : 'GJ_CREATE',
            module: 'GENERAL_JOURNAL',
            entity_type: 'journal_entries',
            entity_id: String(entryId || ''),
            details: `${editingId ? 'Update' : 'Create'} jurnal ${voucherNo}`.trim(),
            meta: {
              journal_entry_id: entryId,
              voucher_no: voucherNo,
              entry_date: entryDate,
              total_amount: totalDebit,
              line_count: validLines.length,
            },
          });
          resetForm();
          fetchHistory();
          setActiveTab('history');

      } catch (error: any) {
          toast.error("Gagal menyimpan: " + error.message);
      } finally {
          setLoading(false);
      }
  };

  const filteredAccounts = accounts.filter(acc => 
      (acc.account_code || '').toLowerCase().includes(accountSearch.toLowerCase()) ||
      (acc.account_name || '').toLowerCase().includes(accountSearch.toLowerCase())
  );

  const filteredHistory = history.filter(t => {
    const q = historySearch.toLowerCase();
    return (
      (t.voucher_no?.toLowerCase() || '').includes(q) ||
      (t.description?.toLowerCase() || '').includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Jurnal Umum (General Journal)</h2>
        <div className="flex gap-2">
          {editingId && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-2 rounded flex items-center gap-3">
              <span>Sedang mengedit jurnal...</span>
              <Button size="sm" variant="destructive" onClick={handleCancelEdit}>Batal Edit</Button>
            </div>
          )}
          <Button variant="outline" onClick={generateVoucherNo} disabled={activeTab !== 'entry' || !!editingId}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reset Voucher No
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="entry">Entri Jurnal</TabsTrigger>
          <TabsTrigger value="history">Riwayat Jurnal Umum</TabsTrigger>
        </TabsList>

        <TabsContent value="entry" className="mt-4">
          <Card className="flex flex-col h-[calc(100vh-180px)]">
            <CardHeader className="flex-none">
                <CardTitle>Entri Jurnal Manual</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 gap-4 overflow-hidden">
            {/* Header Inputs - Fixed */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-none">
                <div className="space-y-2">
                    <Label>Tanggal</Label>
                    <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label>No. Voucher</Label>
                    <Input value={voucherNo} onChange={e => setVoucherNo(e.target.value)} placeholder="Auto Generated" />
                </div>
                <div className="space-y-2">
                    <Label>Keterangan Utama</Label>
                    <Input value={headerDesc} onChange={e => setHeaderDesc(e.target.value)} placeholder="Contoh: Penyesuaian Stok..." />
                </div>
            </div>

            {/* Lines Table - Flexible & Scrollable */}
            <div className="flex-1 border rounded-md overflow-auto relative">
                <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <TableRow>
                            <TableHead className="w-[300px]">Akun Perkiraan</TableHead>
                            <TableHead>Keterangan Baris</TableHead>
                            <TableHead className="w-[180px] text-right">Debit</TableHead>
                            <TableHead className="w-[180px] text-right">Kredit</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {lines.map((line, index) => (
                            <TableRow key={index}>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Input 
                                            readOnly 
                                            value={accounts.find(a => a.id === line.account_id)?.account_name || ''} 
                                            placeholder="Pilih Akun..."
                                            className="cursor-pointer bg-slate-50"
                                            onClick={() => openAccountSelector(index)}
                                        />
                                        <Button size="icon" variant="ghost" onClick={() => openAccountSelector(index)}>
                                            <Search className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 pl-1">
                                        {accounts.find(a => a.id === line.account_id)?.account_code}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        value={line.description} 
                                        onChange={e => updateLine(index, 'description', e.target.value)}
                                        placeholder="Opsional (Ikut Header)"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="text"
                                        value={line.debit || ''} 
                                        onChange={e => updateLine(index, 'debit', e.target.value)}
                                        className="text-right"
                                        placeholder="0"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="text"
                                        value={line.credit || ''} 
                                        onChange={e => updateLine(index, 'credit', e.target.value)}
                                        className="text-right"
                                        placeholder="0"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => removeLine(index)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            
            {/* Footer Actions - Fixed */}
            <div className="flex-none flex flex-col gap-4 mt-auto pt-4 border-t bg-white">
                <div className="flex justify-between items-center">
                    <Button variant="outline" onClick={addLine}>
                        <Plus className="mr-2 h-4 w-4" /> Tambah Baris
                    </Button>
                    
                    <div className="flex gap-8 items-center bg-slate-100 p-4 rounded-lg">
                        <div className="text-right">
                            <p className="text-xs text-gray-500">Total Debit</p>
                            <p className="font-bold text-lg">{formatCurrency(totalDebit)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500">Total Kredit</p>
                            <p className="font-bold text-lg">{formatCurrency(totalCredit)}</p>
                        </div>
                        <div className="text-right border-l pl-8 border-gray-300">
                            <p className="text-xs text-gray-500">Balance (Selisih)</p>
                            <p className={`font-bold text-lg ${balance === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(balance)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button size="lg" onClick={handleSave} disabled={loading || balance !== 0} className="w-full md:w-auto">
                        <Save className="mr-2 h-4 w-4" /> Simpan Jurnal
                    </Button>
                </div>
            </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <CardTitle>Riwayat Jurnal Umum</CardTitle>
                  <Button variant="outline" size="sm" onClick={fetchHistory} disabled={historyLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${historyLoading ? 'animate-spin' : ''}`} /> Refresh
                  </Button>
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border flex-1">
                    <Input
                      type="date"
                      className="w-auto h-8 bg-white"
                      value={historyFilter.startDate}
                      onChange={(e) => setHistoryFilter({ ...historyFilter, startDate: e.target.value })}
                    />
                    <span className="text-gray-400">-</span>
                    <Input
                      type="date"
                      className="w-auto h-8 bg-white"
                      value={historyFilter.endDate}
                      onChange={(e) => setHistoryFilter({ ...historyFilter, endDate: e.target.value })}
                    />
                  </div>
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Cari No. Voucher atau Keterangan..."
                      className="pl-8 h-12 bg-white"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader className="bg-slate-100 sticky top-0 z-10">
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>No. Voucher</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead className="text-right">Total Debit</TableHead>
                        <TableHead>Detail Akun</TableHead>
                        <TableHead className="w-[120px] text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                      ) : filteredHistory.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Tidak ada data.</TableCell></TableRow>
                      ) : (
                        filteredHistory.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>{t.entry_date}</TableCell>
                            <TableCell className="font-mono text-xs">{t.voucher_no}</TableCell>
                            <TableCell className="max-w-[420px]">
                              <div className="whitespace-pre-wrap text-sm">{t.description}</div>
                            </TableCell>
                            <TableCell className="text-right font-bold">{formatCurrency(t.total_amount || 0)}</TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {t.items?.slice(0, 2).map((i: any, idx: number) => (
                                <div key={idx}>
                                  {i.account?.account_code} - {i.account?.account_name} ({formatCurrency(i.debit || i.credit)})
                                </div>
                              ))}
                              {t.items?.length > 2 && <div>...</div>}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleEditEntry(t)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteEntry(t.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Account Selector Dialog */}
      <Dialog open={isAccountSelectOpen} onOpenChange={setIsAccountSelectOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
              <DialogHeader>
                  <DialogTitle>Pilih Akun Perkiraan</DialogTitle>
              </DialogHeader>
              <div className="relative mb-2">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                      placeholder="Cari Kode atau Nama Akun..." 
                      className="pl-8" 
                      value={accountSearch}
                      onChange={e => setAccountSearch(e.target.value)}
                      autoFocus
                  />
              </div>
              <div className="flex-1 overflow-auto border rounded-md">
                <Table>
                    <TableHeader className="bg-slate-100 sticky top-0">
                        <TableRow>
                            <TableHead className="w-[120px]">Kode</TableHead>
                            <TableHead>Nama Akun</TableHead>
                            <TableHead>Kategori</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAccounts.map(acc => (
                            <TableRow key={acc.id} className="cursor-pointer hover:bg-blue-50" onClick={() => selectAccount(acc)}>
                                <TableCell className="font-mono font-bold text-blue-700">{acc.account_code}</TableCell>
                                <TableCell>{acc.account_name}</TableCell>
                                <TableCell className="text-xs text-gray-500">
                                    {acc.category} - {acc.sub_category?.replace('_', ' ')}
                                </TableCell>
                                <TableCell>
                                    <Button size="sm" variant="ghost">Pilih</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              </div>
          </DialogContent>
      </Dialog>
    </div>
  );
}
