import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function DashboardLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  return (
    <div className="flex min-h-screen w-full bg-slate-50 xl:h-screen">
      <aside className="hidden border-r border-slate-200/80 xl:flex xl:shrink-0">
        <Sidebar className="h-screen border-r border-slate-200/80 shadow-none" />
      </aside>

      <div
        className={cn(
          'fixed inset-0 z-50 xl:hidden',
          mobileSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
      >
        <button
          type="button"
          aria-label="Tutup navigasi"
          onClick={() => setMobileSidebarOpen(false)}
          className={cn(
            'absolute inset-0 bg-slate-950/55 backdrop-blur-[1px] transition-opacity duration-300',
            mobileSidebarOpen ? 'opacity-100' : 'opacity-0'
          )}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 transition-transform duration-300 ease-out',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Sidebar
            className="h-full w-[min(88vw,20rem)] shadow-2xl"
            onNavigate={() => setMobileSidebarOpen(false)}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setMobileSidebarOpen((prev) => !prev)}
          sidebarOpen={mobileSidebarOpen}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6 xl:p-8">
          <div className="mx-auto w-full max-w-[1600px] min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
