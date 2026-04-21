import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

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