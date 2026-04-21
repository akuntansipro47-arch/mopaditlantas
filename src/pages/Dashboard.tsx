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
        // --- DIAGNOSTIC STEP 3: ISOLATED TEST ---
        // We are only running this single query to get clean results.
        const { data: rawWoData, error: rawWoError } = await supabase
          .from('work_orders')
          .select('id, wo_number, vehicle_entry_id, status, created_at')
          .limit(10);

        console.log('--- DIAGNOSTIC: RAW WORK ORDERS (ISOLATED) ---');
        console.log(rawWoData);
        console.log('--- ERROR ---', rawWoError);
        
        // All other queries are temporarily disabled.

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