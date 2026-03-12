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
import { Plus, Trash2, Save, Search, RefreshCw } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function ManualJournalEntry() {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  
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

  useEffect(() => {
    fetchAccounts();
    generateVoucherNo();
  }, []);

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
      newLines[index] = { ...newLines[index], [field]: value };
      
      // Auto-clear opposite field (Debit/Credit exclusive)
      if (field === 'debit' && value > 0) newLines[index].credit = 0;
      if (field === 'credit' && value > 0) newLines[index].debit = 0;
      
      setLines(newLines);
  };

  const openAccountSelector = (index: number) => {
      setActiveLineIndex(index);
      setAccountSearch('');
      setIsAccountSelectOpen(true);
  };

  const selectAccount = (account: any) => {
      if (activeLineIndex !== null) {
          updateLine(activeLineIndex, 'account_id', account.id);
          // Auto fill description if empty
          if (!lines[activeLineIndex].description) {
              updateLine(activeLineIndex, 'description', headerDesc);
          }
      }
      setIsAccountSelectOpen(false);
      setActiveLineIndex(null);
  };

  // Calculations
  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const balance = totalDebit - totalCredit;

  const handleSave = async () => {
      // Validations
      if (!voucherNo) return toast.error("Nomor Voucher harus diisi");
      if (!headerDesc) return toast.error("Keterangan harus diisi");
      if (Math.abs(balance) > 0.01) return toast.error(`Jurnal tidak seimbang! Selisih: ${formatCurrency(balance)}`);
      
      const validLines = lines.filter(l => l.account_id && (l.debit > 0 || l.credit > 0));
      if (validLines.length < 2) return toast.error("Minimal 2 akun yang valid (Debit & Kredit)");

      setLoading(true);
      try {
          // 1. Create Journal Entry Header
          const { data: entry, error: entryError } = await supabase
            .from('journal_entries')
            .insert([{
                entry_date: entryDate,
                voucher_no: voucherNo,
                description: headerDesc,
                entry_type: 'GENERAL', // General Journal
                total_amount: totalDebit,
                reference: null // Manual entry has no ref
            }])
            .select()
            .single();

          if (entryError) throw entryError;

          // 2. Create Journal Items
          const itemsToInsert = validLines.map(line => ({
              journal_entry_id: entry.id,
              account_id: line.account_id,
              debit: Number(line.debit) || 0,
              credit: Number(line.credit) || 0,
              description: line.description || headerDesc
          }));

          const { error: itemsError } = await supabase
            .from('journal_entry_items')
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;

          toast.success("Jurnal Umum berhasil disimpan");
          
          // Reset Form
          generateVoucherNo();
          setHeaderDesc('');
          setLines([
              { account_id: '', debit: 0, credit: 0, description: '' },
              { account_id: '', debit: 0, credit: 0, description: '' }
          ]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Jurnal Umum (General Journal)</h2>
        <Button variant="outline" onClick={generateVoucherNo}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reset Voucher No
        </Button>
      </div>

      <Card className="flex flex-col h-[calc(100vh-120px)]">
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
                                        inputMode="numeric"
                                        value={line.debit || ''} 
                                        onChange={e => {
                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                            updateLine(index, 'debit', val ? parseFloat(val) : 0);
                                        }}
                                        className="text-right"
                                        placeholder="0"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="text"
                                        inputMode="numeric"
                                        value={line.credit || ''} 
                                        onChange={e => {
                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                            updateLine(index, 'credit', val ? parseFloat(val) : 0);
                                        }}
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
