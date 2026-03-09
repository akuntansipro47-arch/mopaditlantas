import { Bell, Search, User, Menu } from 'lucide-react';

export function Header() {
  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6 shadow-sm sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {/* Mobile menu trigger could go here */}
        <h2 className="text-lg font-semibold text-slate-800 tracking-tight">Dashboard Overview</h2>
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
