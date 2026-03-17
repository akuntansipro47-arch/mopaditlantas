import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Save } from 'lucide-react';

type AppUser = {
  id: string;
  username: string;
  full_name: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  allowed_menus: any;
  is_active: boolean;
  created_at: string;
};

const PERMISSION_GROUPS: Array<{ title: string; items: Array<{ key: string; label: string }> }> = [
  {
    title: 'Master Data',
    items: [
      { key: 'master_vehicles', label: 'Kendaraan' },
      { key: 'master_goods', label: 'Barang/Jasa' },
      { key: 'master_budget', label: 'Anggaran' },
      { key: 'master_jobs', label: 'Pekerjaan' },
      { key: 'master_suppliers', label: 'Supplier' },
      { key: 'master_mechanics', label: 'Mekanik' },
      { key: 'master_coa', label: 'Akun Perkiraan (COA)' },
    ],
  },
  {
    title: 'Transaksi',
    items: [
      { key: 'trans_entry', label: 'Entry Kendaraan' },
      { key: 'trans_wo', label: 'Work Order' },
      { key: 'trans_po', label: 'Purchase Order' },
      { key: 'trans_receive', label: 'Penerimaan Barang' },
      { key: 'trans_issue', label: 'Barang Keluar' },
      { key: 'trans_po_return', label: 'Retur Pembelian' },
      { key: 'trans_wo_reopen', label: 'Reopen WO (Admin)' },
    ],
  },
  {
    title: 'Keuangan',
    items: [
      { key: 'finance_payments', label: 'Pembayaran Hutang' },
      { key: 'finance_sales', label: 'Pembayaran Piutang' },
      { key: 'finance_cash', label: 'Kas & Bank' },
      { key: 'finance_journal', label: 'Jurnal Umum' },
      { key: 'finance_gl', label: 'Buku Besar' },
    ],
  },
  {
    title: 'Kepegawaian',
    items: [{ key: 'hr_employees', label: 'Data Karyawan' }],
  },
  {
    title: 'Laporan',
    items: [
      { key: 'reports', label: 'Menu Pusat Laporan' },
      { key: 'report_po', label: 'Laporan Pembelian (PO)' },
      { key: 'report_podetail', label: 'Laporan Rincian Pembelian' },
      { key: 'report_receipt', label: 'Laporan Barang Masuk' },
      { key: 'report_stock', label: 'Laporan Stok/Nilai/History' },
      { key: 'report_issue', label: 'Laporan Rekap Barang Keluar' },
      { key: 'report_issuedetail', label: 'Laporan Detail Barang Keluar' },
      { key: 'report_wo', label: 'Laporan Work Order' },
      { key: 'report_vehicle_entry', label: 'Laporan Unit Masuk' },
      { key: 'report_profit', label: 'Laporan Laba Kotor' },
      { key: 'report_profit_loss', label: 'Laporan Laba Rugi' },
      { key: 'report_balance_sheet', label: 'Laporan Neraca' },
      { key: 'report_supplier_payable', label: 'Laporan Hutang Supplier' },
      { key: 'report_estimation', label: 'Laporan Estimasi vs Realisasi' },
      { key: 'report_budget', label: 'Laporan Monitoring Pagu' },
    ],
  },
];

function normalizeAllowedMenus(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function UserManagement() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    role: 'USER' as AppUser['role'],
    password: '',
    allowAll: false,
    allowedSet: new Set<string>(),
  });

  const allPermissionKeys = useMemo(() => {
    const keys = new Set<string>();
    PERMISSION_GROUPS.forEach(g => g.items.forEach(i => keys.add(i.key)));
    return Array.from(keys);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, username, full_name, role, allowed_menus, is_active, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers((data as any) || []);
    } catch (e: any) {
      toast.error('Gagal memuat user: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({
      username: '',
      full_name: '',
      role: 'USER',
      password: '',
      allowAll: false,
      allowedSet: new Set<string>(['dashboard']),
    });
    setDialogOpen(true);
  }

  function openEdit(u: AppUser) {
    const allowed = normalizeAllowedMenus(u.allowed_menus);
    const allowAll = allowed.includes('*');
    setEditing(u);
    setForm({
      username: u.username || '',
      full_name: u.full_name || '',
      role: u.role || 'USER',
      password: '',
      allowAll,
      allowedSet: new Set<string>(allowAll ? [] : allowed),
    });
    setDialogOpen(true);
  }

  async function handleToggleActive(u: AppUser) {
    try {
      const { error } = await supabase.from('app_users').update({ is_active: !u.is_active }).eq('id', u.id);
      if (error) throw error;
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, is_active: !u.is_active } : x)));
      toast.success('Status user diperbarui.');
    } catch (e: any) {
      toast.error('Gagal ubah status: ' + e.message);
    }
  }

  async function handleSave() {
    if (!form.username.trim()) {
      toast.error('Username wajib diisi.');
      return;
    }

    if (!editing && !form.password.trim()) {
      toast.error('Password wajib diisi untuk user baru.');
      return;
    }

    const allowed = form.allowAll ? ['*'] : Array.from(form.allowedSet);
    const cleanedAllowed = allowed
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s === '*' || allPermissionKeys.includes(s) || s === 'dashboard');

    setSaving(true);
    try {
      const { error } = await supabase.rpc('upsert_user', {
        p_id: editing?.id || null,
        p_username: form.username.trim(),
        p_password: form.password.trim(),
        p_full_name: form.full_name.trim() || null,
        p_role: form.role,
        p_allowed_menus: cleanedAllowed,
      });
      if (error) throw error;
      toast.success('User tersimpan.');
      setDialogOpen(false);
      await fetchUsers();
    } catch (e: any) {
      toast.error('Gagal simpan user: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = users.filter(u => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username?.toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
  });

  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold tracking-tight">Manajemen User</h2>
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

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Manajemen User</h2>
      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Pengaturan User</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              Kelola username, role, akses menu, dan reset password.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Input
                placeholder="Cari user..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
            </div>
            <Button variant="outline" onClick={fetchUsers} disabled={loading || saving}>
              Muat Ulang
            </Button>
            <Button onClick={openCreate} disabled={loading || saving} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Tambah User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat user...
            </div>
          ) : (
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Username</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        Tidak ada user.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-semibold">{u.username}</TableCell>
                        <TableCell>{u.full_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{u.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            className={`text-xs font-semibold px-2 py-1 rounded ${
                              u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {u.is_active ? 'AKTIF' : 'NONAKTIF'}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit User' : 'Tambah User'}</DialogTitle>
            <DialogDescription>
              Atur role dan akses menu. Untuk reset password, isi field password.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="contoh: admin01"
                />
              </div>
              <div className="space-y-2">
                <Label>Nama Lengkap</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Nama user"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v: any) => setForm(prev => ({ ...prev, role: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">USER</SelectItem>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                    <SelectItem value="SUPER_ADMIN">SUPER_ADMIN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Password {editing ? '(opsional untuk reset)' : ''}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={editing ? 'Kosongkan jika tidak diubah' : 'Password awal'}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.allowAll}
                  onCheckedChange={(checked) =>
                    setForm(prev => ({ ...prev, allowAll: Boolean(checked), allowedSet: new Set(prev.allowedSet) }))
                  }
                />
                <div className="text-sm font-medium text-slate-800">Akses semua menu ( * )</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-900">Akses Menu</div>
              <div className={`rounded-lg border border-slate-200 p-3 max-h-[360px] overflow-auto ${form.allowAll ? 'opacity-40 pointer-events-none' : ''}`}>
                <div className="space-y-4">
                  {PERMISSION_GROUPS.map(group => (
                    <div key={group.title} className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {group.title}
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {group.items.map(item => {
                          const checked = form.allowedSet.has(item.key);
                          return (
                            <label key={item.key} className="flex items-center gap-2 text-sm text-slate-700">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setForm(prev => {
                                    const next = new Set(prev.allowedSet);
                                    if (v) next.add(item.key);
                                    else next.delete(item.key);
                                    return { ...prev, allowedSet: next };
                                  });
                                }}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-xs text-slate-500">
                Catatan: user dengan role SUPER_ADMIN sebaiknya pakai akses semua menu.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
