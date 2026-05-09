import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useRef } from 'react';
import { logActivity } from '@/lib/activityLog';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const lastPathRef = useRef<string>('');

  useEffect(() => {
    if (!user) return;
    const next = `${location.pathname}${location.search || ''}`.trim();
    if (!next) return;
    if (lastPathRef.current === next) return;
    lastPathRef.current = next;
    void logActivity({
      action: 'NAVIGATE',
      module: 'ROUTER',
      details: `Buka halaman ${next}`,
      meta: { pathname: location.pathname, search: location.search || '' },
    });
  }, [user, location.pathname, location.search]);

  if (loading) {
    // Menampilkan state loading sederhana selagi memeriksa status autentikasi
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-lg font-medium text-slate-600">Memuat data pengguna...</div>
      </div>
    );
  }

  if (!user) {
    // Jika tidak ada pengguna, alihkan ke halaman login
    return <Navigate to="/login" replace />;
  }

  // Jika pengguna ada, tampilkan konten yang diproteksi
  return <Outlet />;
}
