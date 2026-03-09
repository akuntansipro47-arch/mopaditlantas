import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function DashboardLayout() {
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans antialiased">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 bg-slate-50 [mask-image:linear-gradient(to_bottom,white,transparent)] z-[-1]">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
        </div>
        
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          <div className="mx-auto max-w-7xl animate-in fade-in duration-500">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
