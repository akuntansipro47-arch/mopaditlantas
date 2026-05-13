import { Bell, Search, User } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export function Header() {
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
    <header className="flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6 shadow-sm sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {/* Mobile menu trigger could go here */}
        <h2 className="text-lg font-semibold text-slate-800 tracking-tight">{title}</h2>
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search resources..."
            className="h-9 w-64 rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all hover:bg-white"
          />
        </div>
        
        <button className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
        </button>
        
        <div className="h-6 w-px bg-slate-200" />
        
        <button className="flex items-center space-x-2 rounded-full p-1 hover:bg-slate-50 transition-colors">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 shadow-sm border border-indigo-200">
            <User className="h-4 w-4" />
          </div>
        </button>
      </div>
    </header>
  );
}
