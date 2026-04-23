import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { 
  LayoutDashboard, 
  Database, 
  ClipboardList, 
  BarChart3, 
  ChevronDown, 
  ChevronRight,
  Car,
  Package,
  Wallet,
  Wrench,
  Users,
  UserCog,
  FileInput,
  ShoppingCart,
  PackageCheck,
  ClipboardCheck,
  PackageMinus,
  Settings,
  LogOut,
  CreditCard,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import LogoMark from '@/components/brand/LogoMark';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, key: 'dashboard' },
  { 
    name: 'Master Data', 
    icon: Database,
    key: 'master',
    children: [
      { name: 'Kendaraan', href: '/master/vehicles', icon: Car, key: 'master_vehicles' },
      { name: 'Barang/Jasa', href: '/master/goods', icon: Package, key: 'master_goods' },
      { name: 'Anggaran', href: '/master/budget', icon: Wallet, key: 'master_budget' },
      { name: 'Pekerjaan', href: '/master/jobs', icon: Wrench, key: 'master_jobs' },
      { name: 'Supplier', href: '/master/suppliers', icon: Users, key: 'master_suppliers' },
      { name: 'Mekanik', href: '/master/mechanics', icon: UserCog, key: 'master_mechanics' },
      { name: 'Akun Perkiraan (COA)', href: '/master/coa', icon: Database, key: 'master_coa' },
    ]
  },
  { 
    name: 'Transaksi', 
    icon: ClipboardList,
    key: 'transactions',
    children: [
      { name: 'Entry Kendaraan', href: '/transactions/entry', icon: FileInput, key: 'trans_entry' },
      { name: 'Work Order', href: '/transactions/wo', icon: ClipboardCheck, key: 'trans_wo' },
      { name: 'Purchase Order', href: '/transactions/po', icon: ShoppingCart, key: 'trans_po' },
      { name: 'Penerimaan Barang', href: '/transactions/receive', icon: PackageCheck, key: 'trans_receive' },
      { name: 'Barang Keluar', href: '/transactions/issue', icon: PackageMinus, key: 'trans_issue' },
      { name: 'Retur Pembelian', href: '/transactions/po-return', icon: PackageMinus, key: 'trans_po_return' }, // New Return Menu
    ]
  },
  { 
    name: 'Keuangan', 
    icon: CreditCard,
    key: 'finance',
    children: [
      { name: 'Pembayaran Hutang', href: '/finance/payments', icon: Wallet, key: 'finance_payments' },
      { name: 'Pembayaran Piutang', href: '/finance/sales', icon: Wallet, key: 'finance_sales' }, // New Menu
      { name: 'Kas & Bank', href: '/finance/cash-bank', icon: Wallet, key: 'finance_cash' },
      { name: 'Jurnal Umum', href: '/finance/journal-entry', icon: ClipboardList, key: 'finance_journal' },
      { name: 'Buku Besar', href: '/finance/general-ledger', icon: Wallet, key: 'finance_gl' },
    ]
  },
  { 
    name: 'Kepegawaian', 
    icon: Users,
    key: 'hr',
    children: [
      { name: 'Data Karyawan', href: '/hr/employees', icon: Users, key: 'hr_employees' },
      // { name: 'Penggajian', href: '/hr/payroll', icon: Wallet, key: 'hr_payroll' }, // Future
    ]
  },
  {
    name: 'Laporan',
    icon: BarChart3,
    key: 'reports',
    children: [
      { name: 'Neraca', href: '/reports?tab=balance_sheet', icon: Building2, key: 'report_balance_sheet' },
      { name: 'Laba Rugi', href: '/reports?tab=profit_loss', icon: BarChart3, key: 'report_profit_loss' },
      { name: 'Laba Kotor', href: '/reports?tab=profit', icon: BarChart3, key: 'report_profit' },
      { name: 'Hutang Supplier', href: '/reports?tab=supplier_payable', icon: Wallet, key: 'report_supplier_payable' },
      { name: 'Riwayat Bayar Hutang', href: '/reports?tab=payment_history_ap', icon: Wallet, key: 'report_payment_history_ap' },
      { name: 'Buku Bank/Kas', href: '/reports?tab=cash_bank_book', icon: Wallet, key: 'report_cash_bank_book' },
      { name: 'Monitoring Pagu', href: '/reports?tab=budget', icon: Wallet, key: 'report_budget' },
      { name: 'Detail WO', href: '/reports?tab=wodetail', icon: ClipboardCheck, key: 'report_wo' },
      { name: 'Pembelian (PO)', href: '/reports?tab=po', icon: ShoppingCart, key: 'report_po' },
      { name: 'Barang Masuk', href: '/reports?tab=receipt', icon: PackageCheck, key: 'report_receipt' },
      { name: 'Stok Barang', href: '/reports?tab=stock', icon: Package, key: 'report_stock' },
    ]
  },
];

export function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [openMenus, setOpenMenus] = useState<string[]>(['Data Base', 'Transaksi', 'Keuangan', 'Kepegawaian', 'Laporan']);

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => 
      prev.includes(name) 
        ? prev.filter(item => item !== name)
        : [...prev, name]
    );
  };

  // Helper to check access
  const hasAccess = (key: string) => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    const allowed = Array.isArray(user.allowed_menus) ? user.allowed_menus : [];
    if (allowed.includes('*')) return true;
    if (key === 'reports') return allowed.includes('reports') || allowed.some((k: string) => String(k).startsWith('report_'));
    return allowed.includes(key);
  };

  return (
    <div className="flex h-full w-72 flex-col bg-[#0f172a] text-slate-300 shadow-2xl transition-all duration-300 ease-in-out">
      {/* Header Logo */}
      <div className="flex h-24 items-center px-4 border-b border-slate-800/60 bg-slate-950/30">
        <div className="flex items-center gap-1.5 w-full">
          <div className="relative h-12 w-12 flex-shrink-0 flex items-center justify-center">
             <LogoMark className="h-12 w-12 text-white" />
          </div>
          
          <div className="flex flex-col justify-center -mt-1">
            <h1 className="text-3xl font-black tracking-tighter leading-none flex items-baseline">
              <span className="text-white italic">Oto</span>
              <span className="text-lime-500 italic">Smart</span>
            </h1>
            <p className="text-[9px] text-slate-400 font-medium tracking-widest uppercase mt-0.5 ml-0.5">Complete Control Smart System</p>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {navigation.map((item) => {
          const parentAccess = hasAccess(item.key);
          const visibleChildren = item.children?.filter(child => hasAccess(child.key)) || [];
          
          if (!parentAccess && visibleChildren.length === 0) return null;

          return (
          <div key={item.name} className="group">
            {item.children ? (
              <div className="space-y-1">
                <button
                  onClick={() => toggleMenu(item.name)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    "hover:bg-slate-800/50 hover:text-white",
                    openMenus.includes(item.name) ? "text-white bg-slate-800/30" : "text-slate-400"
                  )}
                >
                  <div className="flex items-center">
                    <item.icon className={cn(
                      "mr-3 h-5 w-5 transition-colors",
                      openMenus.includes(item.name) ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
                    )} />
                    {item.name}
                  </div>
                  {openMenus.includes(item.name) ? (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                  )}
                </button>
                
                {openMenus.includes(item.name) && (
                  <div className="ml-4 space-y-1 pl-2 border-l-2 border-slate-800 animate-in slide-in-from-left-2 duration-200">
                    {visibleChildren.map((child) => (
                      <NavLink
                        key={child.name}
                        to={child.href}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center rounded-md px-3 py-2 text-sm transition-all duration-200",
                            isActive 
                              ? "bg-indigo-600/10 text-indigo-300 font-medium" 
                              : "text-slate-500 hover:text-slate-200 hover:bg-slate-800/30"
                          )
                        }
                      >
                        <span className={cn(
                          "mr-3 h-1.5 w-1.5 rounded-full transition-all",
                          location.pathname === child.href ? "bg-indigo-400 scale-125" : "bg-slate-600"
                        )} />
                        {child.name}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20" 
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                  )
                }
              >
                <item.icon className={cn(
                  "mr-3 h-5 w-5 transition-colors",
                  location.pathname === item.href ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                )} />
                {item.name}
              </NavLink>
            )}
          </div>
        )})}

        {/* User Management Menu for Super Admin & Admin */}
        {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
          <div className="pt-4 mt-4 border-t border-slate-800/50">
            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Administrator</p>
            
            {user?.role === 'SUPER_ADMIN' && (
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20" 
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                  )
                }
              >
                <Settings className="mr-3 h-5 w-5 text-slate-500 group-hover:text-slate-300" />
                Manajemen User
              </NavLink>
            )}

            {user?.role === 'SUPER_ADMIN' && (
              <NavLink
                to="/admin/agency"
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20" 
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                  )
                }
              >
                <Building2 className="mr-3 h-5 w-5 text-slate-500 group-hover:text-slate-300" />
                Profil Instansi
              </NavLink>
            )}

            {user?.role === 'SUPER_ADMIN' && (
              <NavLink
                to="/debug-sync"
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 text-red-400 hover:bg-red-900/20",
                    isActive 
                      ? "bg-red-900/30 text-red-300" 
                      : ""
                  )
                }
              >
                <Wrench className="mr-3 h-5 w-5 text-red-500" />
                Debug & Fix Data
              </NavLink>
            )}
          </div>
        )}
      </nav>
      
      {/* User Profile Footer */}
      <div className="p-4 bg-slate-950/30 border-t border-slate-800/60">
        <div className="flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center border-2 border-slate-800 shadow-md">
                <span className="text-sm font-bold text-white">{user?.full_name?.charAt(0) || 'U'}</span>
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-900"></span>
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate max-w-[120px]">{user?.full_name || 'User'}</p>
              <div className="flex items-center gap-1 text-xs text-slate-500 truncate">
                <span>{user?.role || 'Guest'}</span>
                <span className="text-[10px] bg-red-900 text-red-200 px-1 rounded">v3.0.6-DEBUG</span>
              </div>
            </div>
          </div>
          <button 
            onClick={logout} 
            className="p-2 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
