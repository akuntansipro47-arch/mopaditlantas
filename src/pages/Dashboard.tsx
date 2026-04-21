import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Wrench, ShoppingCart, Car, Wallet, Tractor, Truck, ArchiveX } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

interface FastMovingItem {
  name: string;
  count: number;
}

interface LeadTimeData {
  license_plate: string;
  entry_date: string;
  estimated_finish_date: string | null;
}

interface MonthlyProgressData {
  month: string;
  totalIn: { r4: number; r2: number };
  totalWip: { r4: number; r2: number };
  totalCompleted: { r4: number; r2: number };
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    woR4: 0,
    woR2: 0,
    poPendingCount: 0,
    poTotalValue: 0,
    lowStockItems: 0,
  });
  const [fastMovingItems, setFastMovingItems] = useState<FastMovingItem[]>([]);
  const [leadTimeData, setLeadTimeData] = useState<LeadTimeData[]>([]);
  const [monthlyProgress, setMonthlyProgress] = useState<MonthlyProgressData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        // Work Orders R4
        const { count: woR4Count, error: woR4Error } = await supabase
          .from('work_orders')
          .select(`
            id,
            vehicle_entries!inner(
              vehicles!inner(vehicle_type)
            )
          `, { count: 'exact', head: true })
          .eq('vehicle_entries.vehicles.vehicle_type', 'R4');

        // Work Orders R2
        const { count: woR2Count, error: woR2Error } = await supabase
          .from('work_orders')
          .select(`
            id,
            vehicle_entries!inner(
              vehicles!inner(vehicle_type)
            )
          `, { count: 'exact', head: true })
          .in('vehicle_entries.vehicles.vehicle_type', ['R2', 'R2_KECIL']);

        // PO Pending Count
        const { count: poPendingCount, error: poPendingError } = await supabase
          .from('purchase_orders')
          .select('*', { count: 'exact', head: true })
          .in('status', ['ISSUED', 'RECEIVED_PART']);

        // PO Total Value
        const { data: poItems, error: poItemsError } = await supabase
          .from('purchase_order_items')
          .select('quantity, price');

        // Low Stock Items
        const { count: lowStockCount, error: lowStockError } = await supabase
          .from('goods')
          .select('*', { count: 'exact', head: true })
          .lt('current_stock', 3);

        // Fast Moving Items (last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const { data: issuedItems, error: issuedItemsError } = await supabase
          .from('goods_issue_items')
          .select(`
            quantity,
            goods ( name )
          `)
          .gte('created_at', ninetyDaysAgo.toISOString());

        // Lead Time Data for Active WO
        const { data: activeWoData, error: activeWoError } = await supabase
          .from('work_orders')
          .select(`
            vehicle_entries (
              entry_date,
              estimated_finish_date,
              vehicles ( license_plate )
            )
          `)
          .not('status', 'in', '("COMPLETED", "CLOSED")');

        // Monthly Progress Data (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        sixMonthsAgo.setDate(1); // Start from the beginning of the month

        const { data: monthlyWoData, error: monthlyWoError } = await supabase
          .from('work_orders')
          .select(`
            status,
            vehicle_entries!inner (
              entry_date,
              vehicles!inner ( vehicle_type )
            )
          `)
          .gte('vehicle_entries.entry_date', sixMonthsAgo.toISOString().split('T')[0]);


        if (woR4Error) throw woR4Error;
        if (woR2Error) throw woR2Error;
        if (poPendingError) throw poPendingError;
        if (poItemsError) throw poItemsError;
        if (lowStockError) throw lowStockError;
        if (issuedItemsError) throw issuedItemsError;
        if (activeWoError) throw activeWoError;
        if (monthlyWoError) throw monthlyWoError;

        const totalValue = poItems.reduce((sum, item) => {
          return sum + (item.quantity * item.price);
        }, 0);
        
        // Process Lead Time Data
        const formattedLeadTime = activeWoData.map(wo => ({
          license_plate: (wo.vehicle_entries as any)?.vehicles.license_plate || 'N/A',
          entry_date: (wo.vehicle_entries as any)?.entry_date,
          estimated_finish_date: (wo.vehicle_entries as any)?.estimated_finish_date,
        }));
        setLeadTimeData(formattedLeadTime);

        // Process Monthly Progress
        const progress: { [key: string]: MonthlyProgressData } = {};
        const monthFormatter = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

        monthlyWoData.forEach(wo => {
          const entry = wo.vehicle_entries as any;
          if (!entry || !entry.entry_date) return;

          const entryDate = new Date(entry.entry_date);
          const monthKey = monthFormatter.format(entryDate);
          
          if (!progress[monthKey]) {
            progress[monthKey] = {
              month: monthKey,
              totalIn: { r4: 0, r2: 0 },
              totalWip: { r4: 0, r2: 0 },
              totalCompleted: { r4: 0, r2: 0 },
            };
          }

          const vehicleType = entry.vehicles.vehicle_type;
          const isR4 = vehicleType === 'R4';
          const isR2 = vehicleType === 'R2' || vehicleType === 'R2_KECIL';

          if (isR4) progress[monthKey].totalIn.r4++;
          if (isR2) progress[monthKey].totalIn.r2++;

          if (wo.status === 'COMPLETED') {
            if (isR4) progress[monthKey].totalCompleted.r4++;
            if (isR2) progress[monthKey].totalCompleted.r2++;
          } else if (wo.status !== 'CLOSED') { // Consider everything else as WIP
            if (isR4) progress[monthKey].totalWip.r4++;
            if (isR2) progress[monthKey].totalWip.r2++;
          }
        });
        
        const sortedProgress = Object.values(progress).sort((a, b) => {
            const dateA = new Date(a.month.split(' ')[1], new Date(Date.parse(a.month.split(' ')[0] +" 1, 2012")).getMonth());
            const dateB = new Date(b.month.split(' ')[1], new Date(Date.parse(b.month.split(' ')[0] +" 1, 2012")).getMonth());
            return dateB.getTime() - dateA.getTime();
        });

        setMonthlyProgress(sortedProgress);
        
        // Process Fast Moving Items
        const itemCounts: { [key: string]: number } = {};
        issuedItems.forEach(item => {
          const itemName = (item.goods as any)?.name;
          if (itemName) {
            itemCounts[itemName] = (itemCounts[itemName] || 0) + item.quantity;
          }
        });

        const sortedItems = Object.entries(itemCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        setFastMovingItems(sortedItems);

        setStats({
          woR4: woR4Count || 0,
          woR2: woR2Count || 0,
          poPendingCount: poPendingCount || 0,
          poTotalValue: totalValue,
          lowStockItems: lowStockCount || 0,
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
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard 
          title="Total WO Roda 4" 
          value={stats.woR4} 
          icon={Truck} 
          loading={loading} 
        />
        <StatCard 
          title="Total WO Roda 2" 
          value={stats.woR2} 
          icon={Tractor} 
          loading={loading} 
        />
        <StatCard 
          title="PO Pending (Jumlah)" 
          value={stats.poPendingCount} 
          icon={ShoppingCart} 
          loading={loading} 
        />
        <StatCard 
          title="Total Pembelanjaan (PO)" 
          value={formatCurrency(stats.poTotalValue)} 
          icon={Wallet} 
          loading={loading} 
        />
        <StatCard 
          title="Stok Mau Habis (< 3)" 
          value={stats.lowStockItems} 
          icon={ArchiveX} 
          loading={loading} 
        />
      </div>

      <div className="grid grid-cols-1 gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Lead Time Kendaraan (WIP)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Polisi</TableHead>
                  <TableHead>Tgl Masuk</TableHead>
                  <TableHead>Estimasi Selesai</TableHead>
                  <TableHead className="text-right">Durasi (Hari)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">Memuat data...</TableCell>
                  </TableRow>
                ) : leadTimeData.length > 0 ? (
                  leadTimeData.map((wo, index) => {
                    const entryDate = new Date(wo.entry_date);
                    const today = new Date();
                    const duration = Math.ceil((today.getTime() - entryDate.getTime()) / (1000 * 3600 * 24));
                    const isOverdue = duration > 3;

                    return (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{wo.license_plate}</TableCell>
                        <TableCell>{new Intl.DateTimeFormat('id-ID').format(entryDate)}</TableCell>
                        <TableCell>{wo.estimated_finish_date ? new Intl.DateTimeFormat('id-ID').format(new Date(wo.estimated_finish_date)) : 'N/A'}</TableCell>
                        <TableCell className={`text-right font-bold ${isOverdue ? 'text-red-500' : ''}`}>{duration}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">Tidak ada kendaraan yang sedang dalam pengerjaan.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Laporan Progress Kendaraan Bulanan</CardTitle>
          </CardHeader>
          <CardContent>
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bulan</TableHead>
                  <TableHead>Total Masuk (R4/R2)</TableHead>
                  <TableHead>Total WIP (R4/R2)</TableHead>
                  <TableHead>Total Selesai (R4/R2)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">Memuat data...</TableCell>
                  </TableRow>
                ) : monthlyProgress.length > 0 ? (
                  monthlyProgress.map((data) => (
                    <TableRow key={data.month}>
                      <TableCell className="font-medium">{data.month}</TableCell>
                      <TableCell>{data.totalIn.r4} / {data.totalIn.r2}</TableCell>
                      <TableCell>{data.totalWip.r4} / {data.totalWip.r2}</TableCell>
                      <TableCell>{data.totalCompleted.r4} / {data.totalCompleted.r2}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">Tidak ada data work order dalam 6 bulan terakhir.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Fast Moving Items (90 Hari Terakhir)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Memuat data...</p>
            ) : fastMovingItems.length > 0 ? (
              <ol className="space-y-2">
                {fastMovingItems.map((item, index) => (
                  <li key={index} className="flex justify-between">
                    <span>{index + 1}. {item.name}</span>
                    <span className="font-bold">{item.count} unit</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground">Tidak ada data pemakaian barang dalam 90 hari terakhir.</p>
            )}
          </CardContent>
        </Card>
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