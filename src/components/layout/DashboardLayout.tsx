import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function DashboardLayout() {
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
        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent print:overflow-visible print:h-auto print:p-0">
          <div className="mx-auto max-w-7xl animate-in fade-in duration-500 print:max-w-none">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
