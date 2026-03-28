import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function DashboardLayout() {
  const { pathname } = useLocation();
  const isReports = pathname === '/reports' || pathname.startsWith('/reports/');
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans antialiased print:block print:h-auto print:overflow-visible">
      <div className="print:hidden h-full">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden relative print:overflow-visible print:h-auto print:block">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 bg-slate-50 [mask-image:linear-gradient(to_bottom,white,transparent)] z-[-1] print:hidden">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
        </div>
        <main
          className={`flex-1 overflow-y-auto scroll-smooth scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent print:overflow-visible print:h-auto print:p-0 ${isReports ? 'p-2 md:p-4' : 'p-4 md:p-8'}`}
        >
          <div
            className={`mx-auto animate-in fade-in duration-500 print:max-w-none ${isReports ? 'w-full max-w-none' : 'max-w-7xl'}`}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
