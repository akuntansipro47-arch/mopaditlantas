import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { logActivity } from '@/lib/activityLog';

type COA = Database['public']['Tables']['chart_of_accounts']['Row'];

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<COA[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    account_code: '',
    account_name: '',
    account_type: 'DETAIL' as 'HEADER' | 'DETAIL',
    parent_id: 'NONE',
    category: 'AKTIVA' as 'AKTIVA' | 'PASSIVA' | 'MODAL' | 'HPP' | 'BEBAN' | 'PENDAPATAN' | 'PENJUALAN',
    sub_category: 'NONE' as string,
    balance_type: 'DEBIT' as 'DEBIT' | 'CREDIT'
  });

  // Auto-generate account code and set category based on parent
  const handleParentChange = (parentId: string) => {
    if (parentId === 'NONE') {
        setFormData(prev => ({
            ...prev,
            parent_id: 'NONE',
            account_code: '', // Reset code if no parent
            category: 'AKTIVA', // Default
            sub_category: 'NONE'
        }));
        return;
    }

    const parent = accounts.find(a => a.id === parentId);
    if (parent) {
        // Find children count to generate next code
        const children = accounts.filter(a => a.parent_id === parentId);
        let nextCode = parent.account_code + '.' + (children.length + 1).toString().padStart(2, '0');
        
        // If parent code is short (like 1, 2), maybe just append (11, 12). 
        // But requested format implies hierarchy. Let's use simple logic:
        // If parent is 1 (Aktiva), child is 11 (Aktiva Lancar).
        // If parent is 11, child is 1101 (Kas).
        
        // Simple logic:
        // Level 1 (Root): 1 digit (1, 2)
        // Level 2: 2 digits (11, 12)
        // Level 3: 4 digits (1101, 1102)
        // Level 4: 6 digits or more
        
        const parentCode = parent.account_code;
        const childCount = children.length + 1;
        
        if (parentCode.length === 1) {
            nextCode = parentCode + childCount.toString();
        } else if (parentCode.length === 2) {
            nextCode = parentCode + childCount.toString().padStart(2, '0');
        } else {
            nextCode = parentCode + childCount.toString().padStart(2, '0'); // Just append 01, 02...
        }

        setFormData(prev => ({
            ...prev,
            parent_id: parentId,
            account_code: nextCode,
            category: parent.category,
            sub_category: parent.sub_category || 'NONE',
            balance_type: parent.balance_type
        }));
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const createRootPersediaan = async () => {
    try {
      const exists = accounts.some(
        (a) => a.parent_id === null && String(a.account_name || '').toUpperCase().includes('PERSEDIAAN')
      );
      if (exists) {
        toast.info('Root PERSEDIAAN sudah ada.');
        return;
      }

      const used = new Set(accounts.map((a) => String(a.account_code || '').trim()));
      let codeNum = 1300;
      while (used.has(String(codeNum))) codeNum += 1;

      const { error } = await supabase.from('chart_of_accounts').insert([{
        account_code: String(codeNum),
        account_name: 'PERSEDIAAN',
        account_type: 'HEADER',
        parent_id: null,
        category: 'AKTIVA',
        sub_category: 'AKTIVA_LANCAR',
        balance_type: 'DEBIT',
      }]);
      if (error) throw error;

      toast.success('Root PERSEDIAAN berhasil dibuat.');
      void logActivity({
        action: 'MASTER_COA_CREATE_ROOT',
        module: 'MASTER_COA',
        entity_type: 'chart_of_accounts',
        entity_id: '',
        details: 'Create root PERSEDIAAN',
        meta: { account_code: String(codeNum), account_name: 'PERSEDIAAN' },
      });
      fetchAccounts();
    } catch (e: any) {
      toast.error('Gagal membuat root PERSEDIAAN: ' + (e?.message || 'Unknown error'));
    }
  };

  async function fetchAccounts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .order('account_code', { ascending: true });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data akun: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      account_code: '',
      account_name: '',
      account_type: 'DETAIL',
      parent_id: 'NONE',
      category: 'AKTIVA',
      sub_category: 'NONE',
      balance_type: 'DEBIT'
    });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (acc: COA) => {
    setFormData({
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      parent_id: acc.parent_id || 'NONE',
      category: acc.category,
      sub_category: acc.sub_category || 'NONE',
      balance_type: acc.balance_type
    });
    setIsEditing(true);
    setCurrentId(acc.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    // Check if has children
    const hasChildren = accounts.some(a => a.parent_id === id);
    if (hasChildren) {
      toast.error('Akun Header tidak bisa dihapus jika masih memiliki sub-akun.');
      return;
    }

    if (!confirm('Hapus akun ini?')) return;
    try {
      const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id);
      if (error) throw error;
      toast.success('Akun dihapus');
      {
        const acc = accounts.find((x) => String(x.id) === String(id)) as any;
        const code = String(acc?.account_code || '').trim() || null;
        const name = String(acc?.account_name || '').trim() || null;
        void logActivity({
          action: 'MASTER_COA_DELETE',
          module: 'MASTER_COA',
          entity_type: 'chart_of_accounts',
          entity_id: String(id),
          details: `Hapus akun${code ? ` ${code}` : ''}${name ? ` - ${name}` : ''}`.trim(),
          meta: { coa_id: id, account_code: code, account_name: name },
        });
      }
      fetchAccounts();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload: any = {
        account_code: formData.account_code,
        account_name: formData.account_name,
        account_type: formData.account_type,
        parent_id: formData.parent_id === 'NONE' ? null : formData.parent_id,
        category: formData.category,
        sub_category: formData.sub_category === 'NONE' ? null : formData.sub_category,
        balance_type: formData.balance_type
      };

      if (isEditing && currentId) {
        const { error } = await supabase
          .from('chart_of_accounts')
          .update(payload)
          .eq('id', currentId);
        if (error) throw error;
        toast.success('Akun diperbarui');
        void logActivity({
          action: 'MASTER_COA_UPDATE',
          module: 'MASTER_COA',
          entity_type: 'chart_of_accounts',
          entity_id: String(currentId),
          details: `Update akun ${String(formData.account_code || '').trim()} - ${String(formData.account_name || '').trim()}`.trim(),
          meta: { coa_id: currentId, account_code: formData.account_code, account_name: formData.account_name, account_type: formData.account_type },
        });
      } else {
        const { error } = await supabase
          .from('chart_of_accounts')
          .insert([payload]);
        if (error) throw error;
        toast.success('Akun dibuat');
        void logActivity({
          action: 'MASTER_COA_CREATE',
          module: 'MASTER_COA',
          entity_type: 'chart_of_accounts',
          entity_id: '',
          details: `Create akun ${String(formData.account_code || '').trim()} - ${String(formData.account_name || '').trim()}`.trim(),
          meta: { account_code: formData.account_code, account_name: formData.account_name, account_type: formData.account_type },
        });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Build Tree Structure
  const buildTree = (parentId: string | null = null, level = 0): JSX.Element[] => {
    return accounts
      .filter(a => a.parent_id === parentId)
      .map(node => (
        <>
          <TableRow key={node.id} className={cn(node.account_type === 'HEADER' ? "bg-slate-50 font-semibold" : "")}>
            <TableCell>
              <div style={{ paddingLeft: `${level * 20}px` }} className="flex items-center">
                {node.account_type === 'HEADER' && <ChevronDown className="h-4 w-4 mr-1 text-slate-400" />}
                {node.account_code}
              </div>
            </TableCell>
            <TableCell>{node.account_name}</TableCell>
            <TableCell>{node.account_type}</TableCell>
            <TableCell>{node.category}</TableCell>
            <TableCell>{node.balance_type}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(node)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(node.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </TableCell>
          </TableRow>
          {buildTree(node.id, level + 1)}
        </>
      ));
  };

  const filteredAccounts = accounts.filter(a => 
    a.account_code.toLowerCase().includes(search.toLowerCase()) ||
    a.account_name.toLowerCase().includes(search.toLowerCase())
  );

  // If searching, show flat list instead of tree
  const displayRows = search ? filteredAccounts.map(node => (
    <TableRow key={node.id} className={cn(node.account_type === 'HEADER' ? "bg-slate-50 font-semibold" : "")}>
      <TableCell>{node.account_code}</TableCell>
      <TableCell>{node.account_name}</TableCell>
      <TableCell>{node.account_type}</TableCell>
      <TableCell>{node.category}</TableCell>
      <TableCell>{node.balance_type}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="icon" onClick={() => handleEdit(node)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(node.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </TableCell>
    </TableRow>
  )) : buildTree(null);

  const headerAccounts = accounts.filter(a => a.account_type === 'HEADER');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Akun Perkiraan (COA)</h2>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={createRootPersediaan}>
            Buat Root Persediaan
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Tambah Akun</Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Akun' : 'Tambah Akun Baru'}</DialogTitle>
              <DialogDescription>Kelola Chart of Accounts.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Kode Akun</Label>
                    <Input name="account_code" value={formData.account_code} onChange={handleInputChange} required placeholder="Contoh: 1101" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nama Akun</Label>
                    <Input name="account_name" value={formData.account_name} onChange={handleInputChange} required placeholder="Contoh: Kas Besar" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipe Akun</Label>
                    <Select value={formData.account_type} onValueChange={(v) => handleSelectChange('account_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HEADER">Header (Group)</SelectItem>
                        <SelectItem value="DETAIL">Detail (Transaksi)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Induk Akun (Parent)</Label>
                    <Select value={formData.parent_id} onValueChange={(v) => handleParentChange(v)}>
                      <SelectTrigger><SelectValue placeholder="Pilih Parent (Opsional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">-- Tidak Ada (Root) --</SelectItem>
                        {headerAccounts.map(h => (
                          <SelectItem key={h.id} value={h.id}>{h.account_code} - {h.account_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Kategori Utama</Label>
                    <Select value={formData.category} onValueChange={(v) => handleSelectChange('category', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AKTIVA">AKTIVA</SelectItem>
                        <SelectItem value="PASSIVA">PASSIVA (KEWAJIBAN)</SelectItem>
                        <SelectItem value="MODAL">MODAL (EKUITAS)</SelectItem>
                        <SelectItem value="HPP">HPP (HARGA POKOK)</SelectItem>
                        <SelectItem value="BEBAN">BEBAN</SelectItem>
                        <SelectItem value="PENDAPATAN">PENDAPATAN</SelectItem>
                        <SelectItem value="PENJUALAN">PENJUALAN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sub Kategori</Label>
                    <Select value={formData.sub_category} onValueChange={(v) => handleSelectChange('sub_category', v)}>
                      <SelectTrigger><SelectValue placeholder="Pilih Sub Kategori" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">-- Tidak Ada --</SelectItem>
                        <SelectItem value="AKTIVA_LANCAR">AKTIVA LANCAR</SelectItem>
                        <SelectItem value="AKTIVA_TETAP">AKTIVA TETAP</SelectItem>
                        <SelectItem value="HUTANG">HUTANG</SelectItem>
                        <SelectItem value="MODAL">MODAL</SelectItem>
                        <SelectItem value="PENJUALAN">PENJUALAN</SelectItem>
                        <SelectItem value="HPP">HPP</SelectItem>
                        <SelectItem value="BEBAN_ADMIN_UMUM">BEBAN ADMIN & UMUM</SelectItem>
                        <SelectItem value="PENDAPATAN_LAINNYA">PENDAPATAN LAINNYA</SelectItem>
                        <SelectItem value="BEBAN_LAINNYA">BEBAN LAINNYA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                   <Label>Saldo Normal</Label>
                   <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="debit" name="balance_type" checked={formData.balance_type === 'DEBIT'} onChange={() => handleSelectChange('balance_type', 'DEBIT')} className="h-4 w-4" />
                        <label htmlFor="debit">Debit (Bertambah di Debit)</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="credit" name="balance_type" checked={formData.balance_type === 'CREDIT'} onChange={() => handleSelectChange('balance_type', 'CREDIT')} className="h-4 w-4" />
                        <label htmlFor="credit">Kredit (Bertambah di Kredit)</label>
                      </div>
                   </div>
                </div>

              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between">
            <CardTitle>Daftar Akun</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari Kode / Nama Akun..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Kode Akun</TableHead>
                  <TableHead>Nama Akun</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Saldo Normal</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24">Belum ada data akun.</TableCell></TableRow>
                ) : (
                  displayRows
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
