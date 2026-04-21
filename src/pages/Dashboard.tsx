import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Wrench, ShoppingCart, Car, Wallet } from 'lucide-react';

// Komponen untuk satu kartu statistik
function StatCard({ title, value, icon: Icon, loading }: { title: string, value: string | number, icon: React.ElementType, loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    workOrders: 0,
    purchaseOrders: 0,
    vehiclesInService: 0,
    cashBalance: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        // 1. Ambil jumlah total Work Order
        const { count: woCount, error: woError } = await supabase
          .from('work_orders')
          .select('*', { count: 'exact', head: true });

        if (woError) throw woError;

        // Untuk saat ini, kita hanya implementasikan satu statistik dulu
        // Statistik lain akan kita tambahkan nanti
        setStats({
          workOrders: woCount || 0,
          purchaseOrders: 0, // Placeholder
          vehiclesInService: 0, // Placeholder
          cashBalance: 0, // Placeholder
        });

      } catch (error: any) {
        console.error("Error fetching dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Work Orders" 
          value={stats.workOrders} 
          icon={Wrench} 
          loading={loading} 
        />
        <StatCard 
          title="Purchase Orders (Pending)" 
          value="N/A" 
          icon={ShoppingCart} 
          loading={loading} 
        />
        <StatCard 
          title="Kendaraan di Bengkel" 
          value="N/A" 
          icon={Car} 
          loading={loading} 
        />
        <StatCard 
          title="Saldo Kas & Bank" 
          value="N/A" 
          icon={Wallet} 
          loading={loading} 
        />
      </div>

      {/* Di sini kita bisa menambahkan komponen lain seperti grafik atau tabel ringkasan nanti */}
      <div className="grid grid-cols-1 gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Aktivitas Terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Komponen aktivitas terbaru akan ditambahkan di sini.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}