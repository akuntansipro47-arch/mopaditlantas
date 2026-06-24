import { Bell, Menu, PanelLeftClose, Search, User } from 'lucide-react';
import { useLocation } from 'react-router-dom';

type HeaderProps = {
  onMenuClick?: () => void;
  sidebarOpen?: boolean;
};

export function Header({ onMenuClick, sidebarOpen = false }: HeaderProps) {
  const { pathname } = useLocation();

  const title =
    pathname === '/' ? 'Dashboard' :
    pathname.startsWith('/master/vehicles') ? 'Master Data • Kendaraan' :
    pathname.startsWith('/master/goods') ? 'Master Data • Barang/Jasa' :
    pathname.startsWith('/master/budget') ? 'Master Data • Anggaran' :
    pathname.startsWith('/master/jobs') ? 'Master Data • Pekerjaan' :
    pathname.startsWith('/master/suppliers') ? 'Master Data • Supplier' :
    pathname.startsWith('/master/mechanics') ? 'Master Data • Mekanik' :
    pathname.startsWith('/master/coa') ? 'Master Data • Chart of Accounts' :
    pathname.startsWith('/transactions/entry') ? 'Transaksi • Entry Estimasi Kendaraan' :
    pathname.startsWith('/transactions/po-return') ? 'Transaksi • Retur Pembelian' :
    pathname.startsWith('/transactions/purchase-request') ? 'Transaksi • Purchase Request' :
    pathname.startsWith('/transactions/po') ? 'Transaksi • Purchase Order' :
    pathname.startsWith('/transactions/receive') ? 'Transaksi • Penerimaan Barang' :
    pathname.startsWith('/transactions/issue') ? 'Transaksi • Barang Keluar' :
    pathname.startsWith('/transactions/wo') ? 'Transaksi • Work Order' :
    pathname.startsWith('/finance/payments') ? 'Keuangan • Pembayaran Hutang' :
    pathname.startsWith('/finance/sales') ? 'Keuangan • Pembayaran Piutang' :
    pathname.startsWith('/finance/cash-bank') ? 'Keuangan • Kas & Bank' :
    pathname.startsWith('/finance/journal-entry') ? 'Keuangan • Jurnal Umum' :
    pathname.startsWith('/finance/general-ledger') ? 'Keuangan • Buku Besar' :
    pathname.startsWith('/hr/employees') ? 'Kepegawaian • Data Karyawan' :
    pathname.startsWith('/reports') ? 'Laporan • Pusat Laporan' :
    pathname.startsWith('/debug') ? 'Debug' :
    'OtoSmart';

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/90 px-3 shadow-sm backdrop-blur-sm sm:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onMenuClick ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 xl:hidden"
            aria-label={sidebarOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
          >
            {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        ) : null}

        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight text-slate-800 sm:text-base lg:text-lg">{title}</h2>
          <p className="hidden text-xs text-slate-500 sm:block">Navigasi aplikasi OtoSmart</p>
        </div>
      </div>
      
      <div className="flex items-center gap-1 sm:gap-3">
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Cari menu atau data..."
            className="h-10 w-48 rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none transition-all hover:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 xl:w-64"
          />
        </div>
        
        <button className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
        </button>
        
        <div className="hidden h-6 w-px bg-slate-200 sm:block" />
        
        <button className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-slate-50">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 shadow-sm border border-indigo-200">
            <User className="h-4 w-4" />
          </div>
          <span className="hidden text-sm font-medium text-slate-600 md:inline">Akun</span>
        </button>
      </div>
    </header>
  );
}
