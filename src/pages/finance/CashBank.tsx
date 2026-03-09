import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Search, PlusCircle, ArrowUpCircle, ArrowDownCircle, Wallet } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function CashBank() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'IN' | 'OUT'>('IN');
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    category: '',
    description: ''
  });

  const categories = {
    'IN': ['PENJUALAN', 'MODAL_SETOR', 'PENDAPATAN_LAIN'],
    'OUT': ['BIAYA_OPERASIONAL', 'GAJI_PEGAWAI', 'BELANJA_ASET', 'BIAYA_LAIN', 'PEMBAYARAN_HUTANG']
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  async function fetchTransactions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cash_bank_transactions')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data kas: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenDialog = (type: 'IN' | 'OUT') => {
    setTransactionType(type);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      category: type === 'IN' ? 'PENDAPATAN_LAIN' : 'BIAYA_OPERASIONAL',
      description: ''
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('cash_bank_transactions')
        .insert([{
          transaction_date: formData.date,
          type: transactionType,
          category: formData.category,
          amount: Number(formData.amount),
          description: formData.description
        }]);
      
      if (error) throw error;

      toast.success('Transaksi berhasil disimpan');
      setIsDialogOpen(false);
      fetchTransactions();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateBalance = () => {
    const income = transactions.filter(t => t.type === 'IN').reduce((acc, curr) => acc + curr.amount, 0);
    const expense = transactions.filter(t => t.type === 'OUT').reduce((acc, curr) => acc + curr.amount, 0);
    return income - expense;
  };

  const filteredTransactions = transactions.filter(t => 
    t.description?.toLowerCase().includes(search.toLowerCase()) ||
    t.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Kas & Bank</h2>
        <div className="flex gap-2">
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleOpenDialog('IN')}>
                <ArrowDownCircle className="mr-2 h-4 w-4" /> Terima Kas (Masuk)
            </Button>
            <Button variant="destructive" onClick={() => handleOpenDialog('OUT')}>
                <ArrowUpCircle className="mr-2 h-4 w-4" /> Keluar Kas (Biaya/Beban)
            </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Saldo Kas Saat Ini</CardTitle></CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${calculateBalance() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(calculateBalance())}
                </div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Pemasukan (Bulan Ini)</CardTitle></CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(transactions
                        .filter(t => t.type === 'IN' && new Date(t.transaction_date).getMonth() === new Date().getMonth())
                        .reduce((acc, curr) => acc + curr.amount, 0)
                    )}
                </div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Pengeluaran (Bulan Ini)</CardTitle></CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(transactions
                        .filter(t => t.type === 'OUT' && new Date(t.transaction_date).getMonth() === new Date().getMonth())
                        .reduce((acc, curr) => acc + curr.amount, 0)
                    )}
                </div>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
            <div className="flex justify-between">
                <CardTitle>Riwayat Transaksi</CardTitle>
                <div className="relative w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Cari Transaksi..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead className="text-right">Nominal</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredTransactions.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8">Tidak ada transaksi.</TableCell></TableRow>
                    ) : (
                        filteredTransactions.map(t => (
                            <TableRow key={t.id}>
                                <TableCell>{formatDate(t.transaction_date)}</TableCell>
                                <TableCell>
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${t.type === 'IN' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {t.type === 'IN' ? 'MASUK' : 'KELUAR'}
                                    </span>
                                </TableCell>
                                <TableCell>{t.category.replace('_', ' ')}</TableCell>
                                <TableCell>{t.description}</TableCell>
                                <TableCell className={`text-right font-bold ${t.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                                    {t.type === 'IN' ? '+' : '-'} {formatCurrency(t.amount)}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{transactionType === 'IN' ? 'Catat Pemasukan Kas' : 'Catat Pengeluaran (Biaya/Beban)'}</DialogTitle>
                <DialogDescription>
                    {transactionType === 'IN' ? 'Catat penerimaan uang tunai atau bank.' : 'Catat biaya operasional atau pengeluaran lain (Bukan Pembayaran Hutang).'}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label>Tanggal</Label>
                    <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label>Kategori</Label>
                    <Select value={formData.category} onValueChange={v => setFormData({...formData, category: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {categories[transactionType].map(c => (
                                <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Jumlah (Rp)</Label>
                    <Input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} />
                </div>
                <div className="space-y-2">
                    <Label>Keterangan</Label>
                    <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Contoh: Biaya Listrik, Setoran Modal..." />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                <Button onClick={handleSubmit} disabled={loading} className={transactionType === 'IN' ? 'bg-green-600' : 'bg-red-600'}>
                    Simpan
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
