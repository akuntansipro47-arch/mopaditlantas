import { useEffect, useState } from 'react';
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
  Download,
  LogOut,
  CreditCard,
  Building2,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import LogoMark from '@/components/brand/LogoMark';
import { hasMenuAccess } from '@/lib/permissions';

type NavChild =
  | { type: 'group'; name: string }
  | { type?: 'link'; name: string; href: string; icon?: any; key: string };

type NavItem = {
  name: string;
  href?: string;
  icon: any;
  key: string;
  children?: NavChild[];
};

type SidebarProps = {
  className?: string;
  onNavigate?: () => void;
};

function DebugWrenchIcon({ active }: { active: boolean }) {
  return (
    <span className="relative mr-3 flex h-5 w-5 items-center justify-center">
      <Wrench
        className={cn(
          'absolute inset-0 h-5 w-5',
          active ? 'text-orange-200' : 'text-orange-300/60'
        )}
        style={{ clipPath: 'polygon(0 0, 42% 0, 24% 100%, 0 100%)' }}
      />
      <Wrench
        className={cn(
          'absolute inset-0 h-5 w-5',
          active ? 'text-lime-200' : 'text-lime-300/85'
        )}
        style={{ clipPath: 'polygon(18% 0, 72% 0, 54% 100%, 8% 100%)' }}
      />
      <Wrench
        className={cn(
          'absolute inset-0 h-5 w-5',
          active ? 'text-sky-100' : 'text-sky-300/85'
        )}
        style={{ clipPath: 'polygon(56% 0, 100% 0, 100% 100%, 44% 100%)' }}
      />
    </span>
  );
}

function getDefaultOpenMenus(pathname: string): string[] {
  if (pathname.startsWith('/master/')) return ['Master Data'];
  if (pathname.startsWith('/transactions/')) return ['Transaksi'];
  if (pathname.startsWith('/finance/')) return ['Keuangan'];
  if (pathname.startsWith('/hr/')) return ['Kepegawaian'];
  if (pathname.startsWith('/reports')) return ['Daftar Laporan'];
  return [];
}

const navigation: NavItem[] = [
  { 
    name: 'Master Data', 
    icon: Database,
    key: 'master',
    children: [
      { name: 'Kendaraan', href: '/master/vehicles', icon: Car, key: 'master_vehicles' },
      { name: 'Barang/Jasa', href: '/master/goods', icon: Package, key: 'master_goods' },
      { name: 'Pekerjaan', href: '/master/jobs', icon: Wrench, key: 'master_jobs' },
      { name: 'Supplier', href: '/master/suppliers', icon: Users, key: 'master_suppliers' },
      { name: 'Mekanik', href: '/master/mechanics', icon: UserCog, key: 'master_mechanics' },
      { name: 'Akun Perkiraan (COA)', href: '/master/coa', icon: Database, key: 'master_coa' },
      { name: 'Anggaran', href: '/master/budget', icon: Wallet, key: 'master_budget' },
    ]
  },
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, key: 'dashboard' },
  { 
    name: 'Transaksi', 
    icon: ClipboardList,
    key: 'transactions',
    children: [
      { name: 'Entry Estimasi Kendaraan', href: '/transactions/entry', icon: FileInput, key: 'trans_entry' },
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
    name: 'Daftar Laporan',
    icon: BarChart3,
    key: 'reports',
    children: [
      { type: 'group', name: 'Laporan Operasional' },
      { name: 'Rekap Barang Keluar', href: '/reports?tab=issue', icon: PackageMinus, key: 'report_issue' },
      { name: 'Laporan Detail Barang Keluar', href: '/reports?tab=issuedetail', icon: PackageMinus, key: 'report_issuedetail' },
      { name: 'Laporan Unit Masuk', href: '/reports?tab=vehicle_entry', icon: FileInput, key: 'report_vehicle_entry' },
      { name: 'Laporan Unit Keluar', href: '/reports?tab=vehicle_exit', icon: Car, key: 'report_vehicle_exit' },
      { name: 'Laporan Estimasi vs Realisasi', href: '/reports?tab=estimation', icon: BarChart3, key: 'report_estimation' },
      { name: 'Laporan Estimasi Part Belum PO', href: '/reports?tab=estimation_unpo', icon: ShoppingCart, key: 'report_unordered_parts' },
      { name: 'Detail WO', href: '/reports?tab=wodetail', icon: ClipboardCheck, key: 'report_wodetail' },
      { name: 'Detail WO Unit Masuk (Simpel)', href: '/reports?tab=wo_unit_masuk', icon: ClipboardCheck, key: 'report_wo_unit_masuk' },
      { type: 'group', name: 'Laporan Pembelian' },
      { name: 'Pembelian (PO)', href: '/reports?tab=po', icon: ShoppingCart, key: 'report_po' },
      { name: 'Barang Masuk', href: '/reports?tab=receipt', icon: PackageCheck, key: 'report_receipt' },
      { name: 'Rincian Pembelian', href: '/reports?tab=podetail', icon: ShoppingCart, key: 'report_podetail' },
      { name: 'Rincian Pembelian (Detail)', href: '/reports?tab=po_detail_new', icon: ShoppingCart, key: 'report_po_detail_new' },
      { name: 'Hutang Supplier', href: '/reports?tab=supplier_payable', icon: Wallet, key: 'report_supplier_payable' },
      { name: 'Riwayat Bayar Hutang', href: '/reports?tab=payment_history_ap', icon: Wallet, key: 'report_payment_history_ap' },
      { type: 'group', name: 'Laporan Persediaan' },
      { name: 'Stok Barang', href: '/reports?tab=stock', icon: Package, key: 'report_stock' },
      { name: 'Nilai Persediaan', href: '/reports?tab=inventory_value', icon: Package, key: 'report_inventory_value' },
      { name: 'History Barang', href: '/reports?tab=item_history', icon: Package, key: 'report_item_history' },
      { type: 'group', name: 'Laporan Keuangan' },
      { name: 'Neraca', href: '/reports?tab=balance_sheet', icon: Building2, key: 'report_balance_sheet' },
      { name: 'Laba Rugi', href: '/reports?tab=profit_loss', icon: BarChart3, key: 'report_profit_loss' },
      { name: 'Laba Kotor', href: '/reports?tab=profit', icon: BarChart3, key: 'report_profit' },
      { name: 'Arus Kas (Langsung)', href: '/reports?tab=cash_flow&method=direct', icon: Wallet, key: 'report_cash_flow' },
      { name: 'Arus Kas (Tidak Langsung)', href: '/reports?tab=cash_flow&method=indirect', icon: Wallet, key: 'report_cash_flow' },
      { name: 'Buku Bank/Kas', href: '/reports?tab=cash_bank_book', icon: Wallet, key: 'report_cash_bank_book' },
      { name: 'Monitoring Pagu', href: '/reports?tab=budget', icon: Wallet, key: 'report_budget' },
      { name: 'Forecasting Anggaran', href: '/reports?tab=forecast_budget', icon: Wallet, key: 'report_forecast_budget' },
      { name: 'Log Aktivitas', href: '/reports?tab=activity_log', icon: Activity, key: 'report_activity_log' },
    ]
  },
];

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [openMenus, setOpenMenus] = useState<string[]>(() => getDefaultOpenMenus(location.pathname));
  const [openReportGroups, setOpenReportGroups] = useState<string[]>([]);

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => 
      prev.includes(name) 
        ? prev.filter(item => item !== name)
        : [...prev, name]
    );
  };

  const toggleReportGroup = (name: string) => {
    setOpenReportGroups((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  };

  const hasAccess = (key: string) => hasMenuAccess(user, key);

  const currentPath = location.pathname + location.search;
  const appUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${currentPath}` : currentPath;

  useEffect(() => {
    const currentMenus = getDefaultOpenMenus(location.pathname);
    if (currentMenus.length === 0) return;
    setOpenMenus((prev) => {
      const next = new Set(prev);
      currentMenus.forEach((menu) => next.add(menu));
      return Array.from(next);
    });
  }, [location.pathname]);

  const handleNavigate = () => {
    onNavigate?.();
  };

  useEffect(() => {
    if (!openMenus.includes('Daftar Laporan')) return;
    const reportItem = navigation.find((x) => x.key === 'reports');
    const children = reportItem?.children || [];
    let activeGroup: string | null = null;
    let currentGroup: string | null = null;
    for (const child of children) {
      if (child.type === 'group') {
        currentGroup = child.name;
        continue;
      }
      if (!hasAccess(child.key)) continue;
      if (currentPath === child.href) {
        activeGroup = currentGroup;
        break;
      }
    }
    if (!activeGroup) return;
    setOpenReportGroups((prev) => (prev.includes(activeGroup) ? prev : [...prev, activeGroup]));
  }, [currentPath, openMenus, user]);

  return (
    <div className={cn("flex h-full w-72 max-w-full flex-col bg-[linear-gradient(180deg,#0b1630_0%,#102240_46%,#163052_100%)] text-slate-300 shadow-2xl transition-all duration-300 ease-in-out", className)}>
      {/* Header Logo */}
      <div className="flex min-h-20 items-center border-b border-sky-100/10 bg-[linear-gradient(90deg,rgba(56,189,248,0.08),rgba(132,204,22,0.05),rgba(251,191,36,0.025))] px-4 py-4">
        <a
          href={appUrl}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-3"
        >
          <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-200/15 bg-white/95 p-1 shadow-[0_10px_24px_rgba(8,15,40,0.28)] ring-1 ring-white/8">
             <LogoMark className="h-full w-full rounded-full object-cover" />
          </div>
          
          <div className="flex min-w-0 flex-col justify-center">
            <h1 className="text-xl font-semibold leading-none tracking-tight text-white sm:text-2xl">
              Oto<span className="bg-gradient-to-r from-sky-400 via-lime-400 to-amber-200 bg-clip-text text-transparent">Smart</span>
            </h1>
            <p className="mt-1 truncate text-[10px] font-medium tracking-[0.16em] text-slate-400 uppercase">Workshop Control System</p>
          </div>
        </a>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2 scrollbar-thin scrollbar-thumb-sky-950/70 scrollbar-track-transparent sm:px-4 sm:py-6">
        {navigation.map((item) => {
          const parentAccess =
            item.key === 'dashboard'
              ? hasAccess('dashboard') || hasAccess('dashboard_repeat_wo')
              : hasAccess(item.key);
          const children = item.children || [];
          const visibleChildren: NavChild[] = [];
          let currentGroup: { type: 'group'; name: string } | null = null;
          let groupAdded = false;
          for (const child of children) {
            if (child.type === 'group') {
              currentGroup = child;
              groupAdded = false;
              continue;
            }
            if (!hasAccess(child.key)) continue;
            if (currentGroup && !groupAdded) {
              visibleChildren.push(currentGroup);
              groupAdded = true;
            }
            visibleChildren.push(child);
          }
          
          if (!parentAccess && visibleChildren.length === 0) return null;

          return (
          <div key={item.name} className="group">
            {item.children ? (
              <div className="space-y-1">
                <button
                  onClick={() => toggleMenu(item.name)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    "hover:bg-sky-500/10 hover:text-white",
                    openMenus.includes(item.name) ? "text-white bg-gradient-to-r from-sky-500/14 via-emerald-400/8 to-transparent shadow-[inset_0_0_0_1px_rgba(125,211,252,0.08)]" : "text-slate-300/85"
                  )}
                >
                  <div className="flex items-center">
                    <item.icon className={cn(
                      "mr-3 h-5 w-5 transition-colors",
                      openMenus.includes(item.name) ? "text-sky-300" : "text-slate-400 group-hover:text-sky-200"
                    )} />
                    {item.name}
                  </div>
                  {openMenus.includes(item.name) ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  )}
                </button>
                
                {openMenus.includes(item.name) && (
                  <div className="ml-4 space-y-1 pl-2 border-l-2 border-sky-400/18 animate-in slide-in-from-left-2 duration-200">
                    {item.key === 'reports' ? (
                      (() => {
                        const groups: { name: string; links: Extract<NavChild, { href: string }>[] }[] = [];
                        let g: { name: string; links: Extract<NavChild, { href: string }>[] } | null = null;
                        for (const child of children) {
                          if (child.type === 'group') {
                            g = { name: child.name, links: [] };
                            groups.push(g);
                            continue;
                          }
                          if (!hasAccess(child.key)) continue;
                          if (!g) {
                            g = { name: 'Laporan', links: [] };
                            groups.push(g);
                          }
                          g.links.push(child as any);
                        }
                        const visibleGroups = groups.filter((x) => x.links.length > 0);
                        return (
                          <div className="space-y-1">
                            {visibleGroups.map((grp) => {
                              const isOpen = openReportGroups.includes(grp.name);
                              const groupHasActive = grp.links.some((l) => l.href === currentPath);
                              return (
                                <div key={`report-group-${grp.name}`} className="space-y-1">
                                  <button
                                    onClick={() => toggleReportGroup(grp.name)}
                                    className={cn(
                                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-all duration-200",
                                      "hover:bg-sky-500/8 hover:text-slate-100",
                                      isOpen || groupHasActive ? "text-slate-100 bg-sky-500/10" : "text-slate-400"
                                    )}
                                  >
                                    <span>{grp.name}</span>
                                    {isOpen ? (
                                      <ChevronDown className="h-4 w-4 text-slate-400" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-slate-500" />
                                    )}
                                  </button>

                                  {isOpen && (
                                    <div className="ml-3 space-y-1 pl-2 border-l border-sky-300/12">
                                      {grp.links.map((link) => {
                                        const active = currentPath === link.href;
                                        return (
                                          <NavLink
                                            key={`${link.key}-${link.href}`}
                                            to={link.href}
                                            onClick={handleNavigate}
                                            className={() =>
                                              cn(
                                                "flex items-center rounded-md px-3 py-2 text-sm transition-all duration-200",
                                                active
                                                  ? "bg-gradient-to-r from-sky-500/16 via-emerald-400/10 to-transparent text-sky-100 font-medium"
                                                  : "text-slate-400 hover:text-slate-100 hover:bg-sky-500/8"
                                              )
                                            }
                                          >
                                            <span
                                              className={cn(
                                                "mr-3 h-1.5 w-1.5 rounded-full transition-all",
                                                active ? "bg-lime-300 scale-125" : "bg-slate-500"
                                              )}
                                            />
                                            {link.name}
                                          </NavLink>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    ) : (
                      visibleChildren.map((child) => {
                        if (child.type === 'group') {
                          return (
                            <div
                              key={`group-${child.name}`}
                              className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400/80"
                            >
                              {child.name}
                            </div>
                          );
                        }

                        const active = currentPath === child.href;

                        return (
                          <NavLink
                            key={child.name}
                            to={child.href}
                            onClick={handleNavigate}
                            className={() =>
                              cn(
                                "flex items-center rounded-md px-3 py-2 text-sm transition-all duration-200",
                                active
                                  ? "bg-gradient-to-r from-sky-500/16 via-emerald-400/10 to-transparent text-sky-100 font-medium"
                                  : "text-slate-400 hover:text-slate-100 hover:bg-sky-500/8"
                              )
                            }
                          >
                            <span
                              className={cn(
                                "mr-3 h-1.5 w-1.5 rounded-full transition-all",
                                active ? "bg-lime-300 scale-125" : "bg-slate-500"
                              )}
                            />
                            {child.name}
                          </NavLink>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                to={item.href}
                onClick={handleNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-gradient-to-r from-sky-500/85 via-cyan-500/78 to-emerald-500/72 text-white shadow-lg shadow-sky-950/30" 
                      : "text-slate-300/85 hover:bg-sky-500/10 hover:text-white"
                  )
                }
              >
                <item.icon className={cn(
                  "mr-3 h-5 w-5 transition-colors",
                  location.pathname === item.href ? "text-white" : "text-slate-400 group-hover:text-sky-200"
                )} />
                {item.name}
              </NavLink>
            )}
          </div>
        )})}

        {/* User Management Menu for Super Admin & Admin */}
        {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
          <div className="pt-4 mt-4 border-t border-sky-300/10">
            <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400/80">Administrator</p>
            
            {user?.role === 'SUPER_ADMIN' && (
              <NavLink
                to="/admin/users"
                onClick={handleNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-gradient-to-r from-sky-500/85 via-cyan-500/78 to-emerald-500/72 text-white shadow-lg shadow-sky-950/30" 
                      : "text-slate-300/85 hover:bg-sky-500/10 hover:text-white"
                  )
                }
              >
                <Settings className="mr-3 h-5 w-5 text-slate-400 group-hover:text-sky-200" />
                Manajemen User
              </NavLink>
            )}

            {user?.role === 'SUPER_ADMIN' && (
              <NavLink
                to="/admin/agency"
                onClick={handleNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-gradient-to-r from-sky-500/85 via-cyan-500/78 to-emerald-500/72 text-white shadow-lg shadow-sky-950/30" 
                      : "text-slate-300/85 hover:bg-sky-500/10 hover:text-white"
                  )
                }
              >
                <Building2 className="mr-3 h-5 w-5 text-slate-400 group-hover:text-sky-200" />
                Profil Instansi
              </NavLink>
            )}

            {user?.role === 'SUPER_ADMIN' && (
              <NavLink
                to="/admin/backup"
                onClick={handleNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-sky-500/85 via-cyan-500/78 to-emerald-500/72 text-white shadow-lg shadow-sky-950/30"
                      : "text-slate-300/85 hover:bg-sky-500/10 hover:text-white"
                  )
                }
              >
                <Download className="mr-3 h-5 w-5 text-slate-400 group-hover:text-sky-200" />
                Backup & Export
              </NavLink>
            )}

            {user?.role === 'SUPER_ADMIN' && (
              <NavLink
                to="/debug-sync"
                onClick={handleNavigate}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-[linear-gradient(90deg,rgba(251,146,60,0.10),rgba(163,230,53,0.13),rgba(56,189,248,0.18))] text-white shadow-lg shadow-sky-950/20 ring-1 ring-sky-200/10"
                      : "text-slate-200/90 hover:bg-[linear-gradient(90deg,rgba(251,146,60,0.05),rgba(163,230,53,0.08),rgba(56,189,248,0.10))] hover:text-white"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <DebugWrenchIcon active={isActive} />
                    <span
                      className={cn(
                        'bg-gradient-to-r bg-clip-text text-transparent transition-all duration-200',
                        isActive
                          ? 'from-orange-100 via-lime-100 to-sky-100'
                          : 'from-orange-300 via-lime-300 to-sky-300 group-hover:from-orange-200 group-hover:via-lime-200 group-hover:to-sky-100'
                      )}
                    >
                      Debug & Fix Data
                    </span>
                  </>
                )}
              </NavLink>
            )}
          </div>
        )}
      </nav>
      
      {/* User Profile Footer */}
      <div className="border-t border-sky-300/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.12),rgba(56,189,248,0.04))] p-4">
        <div className="flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-sky-300/10 bg-gradient-to-tr from-sky-900 via-cyan-800 to-emerald-700 shadow-md">
                <span className="text-sm font-bold text-white">{user?.full_name?.charAt(0) || 'U'}</span>
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-900"></span>
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate max-w-[120px]">{user?.full_name || 'User'}</p>
              <div className="flex items-center gap-1 truncate text-xs text-slate-400">
                <span>{user?.role || 'Guest'}</span>
                <span className="text-[10px] bg-red-900 text-red-200 px-1 rounded">v3.0.6-DEBUG</span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => {
              logout();
              handleNavigate();
            }}
            className="rounded-md p-2 text-slate-400 transition-colors hover:bg-red-950/30 hover:text-red-400"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
