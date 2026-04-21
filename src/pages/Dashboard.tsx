import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Wrench, ShoppingCart, Car, Wallet } from 'lucide-react';

// Fungsi untuk format mata uang
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

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
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
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
        // Secara paralel, jalankan semua query
        const [
          { count: woCount, error: woError },
          { count: poCount, error: poError },
          { count: vehiclesInServiceCount, error: vehiclesError },
          { data: cashBankAccounts, error: accError }
        ] = await Promise.all([
          supabase.from('work_orders').select('*', { count: 'exact', head: true }),
          supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).in('status', ['ISSUED', 'RECEIVED_PART']),
          supabase.from('work_orders').select('*', { count: 'exact', head: true }).in('status', ['OPEN', 'IN_PROGRESS']),
          supabase.from('chart_of_accounts').select('id, balance_type').in('account_category', ['KAS', 'BANK'])
        ]);

        if (woError) throw woError;
        if (poError) throw poError;
        if (vehiclesError) throw vehiclesError;
        if (accError) throw accError;

        // Hitung Saldo Kas & Bank
        let totalCashBalance = 0;
        if (cashBankAccounts) {
          const balancePromises = cashBankAccounts.map(async (account) => {
            const { data: items, error: itemsError } = await supabase
              .from('journal_entry_items')
              .select('debit, credit')
              .eq('account_id', account.id);
            
            if (itemsError) throw itemsError;

            let accountBalance = 0;
            items.forEach(item => {
              if (account.balance_type === 'DEBIT') {
                accountBalance += (item.debit || 0) - (item.credit || 0);
              } else {
                accountBalance += (item.credit || 0) - (item.debit || 0);
              }
            });
            return accountBalance;
          });
          
          const balances = await Promise.all(balancePromises);
          totalCashBalance = balances.reduce((sum, current) => sum + current, 0);
        }

        setStats({
          workOrders: woCount || 0,
          purchaseOrders: poCount || 0,
          vehiclesInService: vehiclesInServiceCount || 0,
          cashBalance: totalCashBalance,
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
          value={stats.purchaseOrders} 
          icon={ShoppingCart} 
          loading={loading} 
        />
        <StatCard 
          title="Kendaraan di Bengkel" 
          value={stats.vehiclesInService} 
          icon={Car} 
          loading={loading} 
        />
        <StatCard 
          title="Saldo Kas & Bank" 
          value={formatCurrency(stats.cashBalance)} 
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