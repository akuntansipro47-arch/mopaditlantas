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
import { Eye, EyeOff, Loader2, Plus, Save } from 'lucide-react';

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
      { key: 'trans_purchase_request', label: 'Purchase Request / Request Item' },
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
      { key: 'report_po_detail_new', label: 'Laporan Rincian Pembelian (Detail)' },
      { key: 'report_receipt', label: 'Laporan Barang Masuk' },
      { key: 'report_stock', label: 'Laporan Stok/Nilai/History' },
      { key: 'report_issue', label: 'Laporan Rekap Barang Keluar' },
      { key: 'report_issuedetail', label: 'Laporan Detail Barang Keluar' },
      { key: 'report_wo', label: 'Laporan Work Order' },
      { key: 'report_wodetail', label: 'Laporan Detail Work Order' },
      { key: 'report_vehicle_entry', label: 'Laporan Unit Masuk' },
      { key: 'report_profit', label: 'Laporan Laba Kotor' },
      { key: 'report_profit_loss', label: 'Laporan Laba Rugi' },
      { key: 'report_balance_sheet', label: 'Laporan Neraca' },
      { key: 'report_supplier_payable', label: 'Laporan Hutang Supplier' },
      { key: 'report_payment_history_ap', label: 'Laporan Riwayat Pembayaran Hutang' },
      { key: 'report_cash_bank_book', label: 'Laporan Buku Bank/Kas' },
      { key: 'report_estimation', label: 'Laporan Estimasi vs Realisasi' },
      { key: 'report_budget', label: 'Laporan Monitoring Pagu' },
      { key: 'report_forecast_budget', label: 'Laporan Forecasting Anggaran' },
      { key: 'report_unordered_parts', label: 'Laporan Estimasi Part Belum PO' },
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
  const [showPassword, setShowPassword] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
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

  const generatePassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  };

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
    setShowPassword(false);
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
    setShowPassword(false);
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

  function openReset(u: AppUser) {
    setResetTarget(u);
    setResetPassword(generatePassword());
    setShowResetPassword(true);
    setResetOpen(true);
  }

  async function handleResetPassword() {
    if (!resetTarget?.id) return;
    if (!resetPassword.trim()) {
      toast.error('Password baru wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const allowed = normalizeAllowedMenus(resetTarget.allowed_menus);
      const { error } = await supabase.rpc('upsert_user', {
        p_id: resetTarget.id,
        p_username: resetTarget.username,
        p_password: resetPassword.trim(),
        p_full_name: resetTarget.full_name,
        p_role: resetTarget.role,
        p_allowed_menus: allowed,
      });
      if (error) throw error;
      toast.success('Password berhasil direset.');
      setResetOpen(false);
      await fetchUsers();
    } catch (e: any) {
      toast.error('Gagal reset password: ' + e.message);
    } finally {
      setSaving(false);
    }
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

    const normalizedUsername = form.username.trim().toLowerCase();

    if (!editing && !form.password.trim()) {
      toast.error('Password wajib diisi untuk user baru.');
      return;
    }

    const rawAllowed = form.allowAll ? ['*'] : Array.from(form.allowedSet);
    const nextAllowedSet = new Set(rawAllowed);
    const hasAnyReport = Array.from(nextAllowedSet).some(k => k.startsWith('report_'));
    if (hasAnyReport) nextAllowedSet.add('reports');
    if (!hasAnyReport) nextAllowedSet.delete('reports');
    const allowed = Array.from(nextAllowedSet);
    const cleanedAllowed = allowed
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s === '*' || allPermissionKeys.includes(s) || s === 'dashboard');

    setSaving(true);
    try {
      const { data: existing, error: existErr } = await supabase
        .from('app_users')
        .select('id, username')
        .ilike('username', normalizedUsername)
        .limit(1)
        .maybeSingle();
      if (existErr) throw existErr;
      if (existing && String(existing.id) !== String(editing?.id || '')) {
        toast.error(`Username "${normalizedUsername}" sudah digunakan. Gunakan username lain.`);
        return;
      }

      const { error } = await supabase.rpc('upsert_user', {
        p_id: editing?.id || null,
        p_username: normalizedUsername,
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
      const msg = String(e?.message || e || '');
      const code = String(e?.code || '');
      if (code === '23505' || msg.toLowerCase().includes('duplicate key value') || msg.includes('app_users_username_key')) {
        toast.error(`Gagal simpan user: username "${normalizedUsername}" sudah digunakan.`);
      } else {
        toast.error('Gagal simpan user: ' + msg);
      }
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
                    <TableHead>Password</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
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
                          <Button variant="outline" size="sm" onClick={() => openReset(u)} disabled={saving}>
                            Reset
                          </Button>
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
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={editing ? 'Kosongkan jika tidak diubah' : 'Password awal'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {editing && (
                  <p className="text-xs text-muted-foreground pt-1">
                    Password lama tidak ditampilkan demi keamanan. Biarkan kosong jika tidak ingin mengubah.
                  </p>
                )}
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

                                    if (item.key === 'reports' && !v) {
                                      Array.from(next).forEach(k => {
                                        if (k.startsWith('report_')) next.delete(k);
                                      });
                                    }

                                    if (item.key.startsWith('report_') && v) next.add('reports');

                                    const anyReport = Array.from(next).some(k => k.startsWith('report_'));
                                    if (anyReport) next.add('reports');
                                    if (!anyReport) next.delete('reports');
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

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Password lama tidak bisa ditampilkan. Set password baru untuk user {resetTarget?.username || '-'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Password Baru</Label>
            <div className="relative">
              <Input
                type={showResetPassword ? 'text' : 'password'}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowResetPassword(!showResetPassword)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
              >
                {showResetPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setResetPassword(generatePassword())} disabled={saving}>
                Generate
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleResetPassword} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Simpan Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
