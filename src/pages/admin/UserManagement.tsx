import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2, CheckSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

const MENU_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'master', label: 'Master Data (Parent)' },
  { id: 'master_vehicles', label: 'Master Kendaraan' },
  { id: 'master_goods', label: 'Master Barang' },
  { id: 'master_budget', label: 'Master Anggaran' },
  { id: 'master_jobs', label: 'Master Pekerjaan' },
  { id: 'master_suppliers', label: 'Master Supplier' },
  { id: 'master_mechanics', label: 'Master Mekanik' },
  { id: 'master_coa', label: 'Master Akun (COA)' },
  { id: 'transactions', label: 'Transaksi (Parent)' },
  { id: 'trans_entry', label: 'Entry Kendaraan' },
  { id: 'trans_po', label: 'Purchase Order' },
  { id: 'trans_po_return', label: 'Retur Pembelian' },
  { id: 'trans_receive', label: 'Penerimaan Barang' },
  { id: 'trans_wo', label: 'Work Order' },
  { id: 'trans_wo_reopen', label: 'WO Admin (Re-open/Hapus)' },
  { id: 'trans_issue', label: 'Barang Keluar' },
  { id: 'finance', label: 'Keuangan (Parent)' },
  { id: 'finance_payments', label: 'Pembayaran Hutang' },
  { id: 'finance_sales', label: 'Pembayaran Piutang' }, // New
  { id: 'finance_cash', label: 'Kas & Bank' },
  { id: 'finance_gl', label: 'Buku Besar' },
  { id: 'reports', label: 'Laporan' },
];

const REPORT_OPTIONS = [
  { id: 'report_po', label: 'Laporan Pembelian (PO)' },
  { id: 'report_podetail', label: 'Laporan Rincian Pembelian' },
  { id: 'report_receipt', label: 'Laporan Barang Masuk' },
  { id: 'report_stock', label: 'Laporan Stok Barang' },
  { id: 'report_issue', label: 'Laporan Rekap Keluar' },
  { id: 'report_issuedetail', label: 'Laporan Detail Barang Keluar' },
  { id: 'report_wo', label: 'Laporan Work Order' },
  { id: 'report_vehicle_entry', label: 'Laporan Unit Masuk' },
  { id: 'report_profit', label: 'Laporan Laba Kotor' },
  { id: 'report_estimation', label: 'Laporan Estimasi vs Realisasi' },
  { id: 'report_budget', label: 'Laporan Monitoring Pagu' },
  { id: 'inventory_value', label: 'Laporan Nilai Persediaan' },
];

export default function UserManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    password: '', // Only for creating/updating
    full_name: '',
    role: 'USER',
    allowed_menus: [] as string[],
  });

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      toast.error('Akses ditolak');
      navigate('/');
      return;
    }
    fetchUsers();
  }, [user]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, username, full_name, role, allowed_menus, is_active, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      toast.error('Gagal mengambil data user: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (value: string) => {
    setFormData(prev => ({ ...prev, role: value }));
  };

  const handleMenuToggle = (menuId: string) => {
    setFormData(prev => {
      const menus = prev.allowed_menus;
      if (menus.includes(menuId)) {
        return { ...prev, allowed_menus: menus.filter(m => m !== menuId) };
      } else {
        return { ...prev, allowed_menus: [...menus, menuId] };
      }
    });
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      full_name: '',
      role: 'USER',
      allowed_menus: [],
    });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleEdit = (user: any) => {
    setFormData({
      username: user.username,
      password: '', // Leave empty if not changing
      full_name: user.full_name,
      role: user.role,
      allowed_menus: user.allowed_menus || [],
    });
    setIsEditing(true);
    setCurrentId(user.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus user ini?')) return;
    try {
      const { error } = await supabase.from('app_users').delete().eq('id', id);
      if (error) throw error;
      toast.success('User dihapus');
      fetchUsers();
    } catch (error: any) {
      toast.error('Gagal menghapus: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Prepare payload
      const payload: any = {
        username: formData.username,
        full_name: formData.full_name,
        role: formData.role,
        allowed_menus: formData.allowed_menus,
      };

      // Handle Password hashing via SQL function/crypt if possible
      // Since client cannot run `crypt`, we should use an RPC call to create/update user securely
      // OR for now, we assume the user has set up the RPC I should create below.
      
      // Let's assume we use a simple RPC `upsert_user` for simplicity and security
      
      const { error } = await supabase.rpc('upsert_user', {
        p_id: isEditing ? currentId : null,
        p_username: formData.username,
        p_password: formData.password || null, // null means don't change if editing
        p_full_name: formData.full_name,
        p_role: formData.role,
        p_allowed_menus: formData.allowed_menus
      });

      if (error) throw error;

      toast.success(isEditing ? 'User diperbarui' : 'User dibuat');
      setIsDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      console.error(error);
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Manajemen User</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Tambah User</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit User' : 'Tambah User Baru'}</DialogTitle>
              <DialogDescription>Kelola akses dan data pengguna aplikasi.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input name="username" value={formData.username} onChange={handleInputChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Password {isEditing && '(Kosongkan jika tetap)'}</Label>
                    <Input name="password" type="password" value={formData.password} onChange={handleInputChange} required={!isEditing} />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nama Lengkap</Label>
                    <Input name="full_name" value={formData.full_name} onChange={handleInputChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={formData.role} onValueChange={handleRoleChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USER">User Biasa</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2 border rounded-md p-4 bg-slate-50">
                  <Label className="mb-2 block">Hak Akses Menu</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {MENU_OPTIONS.map(menu => (
                      <div key={menu.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`menu-${menu.id}`} 
                          checked={formData.allowed_menus.includes(menu.id) || formData.allowed_menus.includes('*')}
                          onCheckedChange={() => handleMenuToggle(menu.id)}
                          disabled={formData.role === 'SUPER_ADMIN'} // Super Admin has all access
                        />
                        <label 
                          htmlFor={`menu-${menu.id}`} 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {menu.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  {formData.role === 'SUPER_ADMIN' && (
                    <p className="text-xs text-blue-600 mt-2">* Super Admin memiliki akses penuh ke semua menu.</p>
                  )}
                </div>

                {/* Report Permissions Section */}
                {formData.role !== 'SUPER_ADMIN' && (
                  <div className="space-y-2 border rounded-md p-4 bg-orange-50 mt-4">
                    <Label className="mb-2 block text-orange-800">Hak Akses Laporan (Spesifik)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {REPORT_OPTIONS.map(report => (
                        <div key={report.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`rep-${report.id}`} 
                            checked={formData.allowed_menus.includes(report.id)}
                            onCheckedChange={() => handleMenuToggle(report.id)}
                          />
                          <label 
                            htmlFor={`rep-${report.id}`} 
                            className="text-sm font-medium leading-none text-orange-900"
                          >
                            {report.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-orange-600 mt-2">* User harus memiliki akses menu "Laporan" agar bisa membuka halaman laporan.</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between">
            <CardTitle>Daftar User</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Cari User..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Nama Lengkap</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Akses Menu</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24">Tidak ada data user.</TableCell></TableRow>
                ) : (
                  filteredUsers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.username}</TableCell>
                      <TableCell>{item.full_name}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          item.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800' :
                          item.role === 'ADMIN' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100'
                        }`}>
                          {item.role}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {item.role === 'SUPER_ADMIN' || (item.allowed_menus && item.allowed_menus.includes('*')) 
                          ? 'Full Access' 
                          : `${item.allowed_menus?.length || 0} Menu`}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                          {item.username !== 'admin26' && ( // Prevent deleting main admin
                             <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
