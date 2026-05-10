import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Wrench, ShoppingCart, Car, Wallet, Tractor, Truck, ArchiveX, TrendingUp, CircleDollarSign, Landmark } from 'lucide-react';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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

const formatCurrencyPrecise = (value: number) => {
  const rounded = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const isInt = Number.isFinite(rounded) && Math.round(rounded) === rounded;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rounded);
};

// Komponen untuk satu kartu statistik
function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  className,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  loading: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
        ) : (
          typeof value === 'string' || typeof value === 'number' ? (
            <div className="text-2xl font-bold break-all">{value}</div>
          ) : (
            value
          )
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
  monthKey: string;
  monthLabel: string;
  totalIn: { r4: number; r2: number };
  totalWip: { r4: number; r2: number };
  totalCompleted: { r4: number; r2: number };
}

interface MonthlyPoData {
  monthKey: string;
  monthLabel: string;
  total: number;
}

interface CriticalStockItem {
  id: string;
  name: string;
  item_code: string | null;
  unit: string | null;
  current_stock: number | null;
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    woR4: 0,
    woR2: 0,
    poPendingCount: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    monthlyRevenue: 0,
    outstandingAR: 0,
    outstandingAP: 0,
  });
  const [fastMovingItems, setFastMovingItems] = useState<FastMovingItem[]>([]);
  const [leadTimeData, setLeadTimeData] = useState<LeadTimeData[]>([]);
  const [monthlyProgress, setMonthlyProgress] = useState<MonthlyProgressData[]>([]);
  const [monthlyPoData, setMonthlyPoData] = useState<MonthlyPoData[]>([]);
  const [criticalStockItems, setCriticalStockItems] = useState<CriticalStockItem[]>([]);
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

        // PO Total Value & Monthly Data
        const { data: poItems, error: poItemsError } = await supabase
          .from('purchase_order_items')
          .select('quantity, unit_price, created_at');

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthDate = startOfMonth.toISOString().split('T')[0];

        // Monthly Revenue
        const { data: revenueData, error: revenueError } = await supabase
          .from('sales_invoices')
          .select('total_amount, paid_amount, status')
          .gte('invoice_date', startOfMonthDate)
          .in('status', ['PAID', 'PARTIAL']);

        // Outstanding AR (Piutang)
        const { data: arData, error: arError } = await supabase
          .from('sales_invoices')
          .select('total_amount, paid_amount, status')
          .in('status', ['UNPAID', 'PARTIAL']);

        // Outstanding AP (Utang)
        const { data: apData, error: apError } = await supabase
          .from('purchase_invoices')
          .select('total_amount, paid_amount, status')
          .in('status', ['UNPAID', 'PARTIAL']);

        // Low Stock Items
        const { count: lowStockCount, error: lowStockError } = await supabase
          .from('goods')
          .select('*', { count: 'exact', head: true })
          .lt('current_stock', 3);

        // Out Of Stock Items
        const { count: outOfStockCount, error: outOfStockError } = await supabase
          .from('goods')
          .select('*', { count: 'exact', head: true })
          .lte('current_stock', 0);

        // Top Critical Stock Items (stok habis & menipis)
        const { data: criticalItems, error: criticalError } = await supabase
          .from('goods')
          .select('id, name, item_code, unit, current_stock')
          .lte('current_stock', 2)
          .order('current_stock', { ascending: true })
          .order('name', { ascending: true })
          .limit(10);

        // Fast Moving Items (periode berjalan: dari awal bulan ini s.d. sekarang)
        const startOfRunningPeriod = new Date();
        startOfRunningPeriod.setDate(1);
        startOfRunningPeriod.setHours(0, 0, 0, 0);
        
        const { data: issuedItems, error: issuedItemsError } = await supabase
          .from('goods_issue_items')
          .select(`
            quantity,
            goods ( name )
          `)
          .gte('created_at', startOfRunningPeriod.toISOString());

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


        // Monthly Progress Data (semua periode yang ada entry kendaraan)
        const monthlyWoData: any[] = [];
        const PAGE_SIZE = 1000;
        let pageFrom = 0;
        while (true) {
          const pageTo = pageFrom + PAGE_SIZE - 1;
          const { data: pageRows, error: monthlyWoError } = await supabase
            .from('work_orders')
            .select(`
              status,
              vehicle_entries!inner (
                entry_date,
                vehicles!inner ( vehicle_type )
              )
            `)
            .range(pageFrom, pageTo);

          if (monthlyWoError) throw monthlyWoError;
          if (!pageRows || pageRows.length === 0) break;

          monthlyWoData.push(...pageRows);
          if (pageRows.length < PAGE_SIZE) break;
          pageFrom += PAGE_SIZE;
        }


        if (woR4Error) throw woR4Error;
        if (woR2Error) throw woR2Error;
        if (poPendingError) throw poPendingError;
        if (poItemsError) throw poItemsError;
        if (lowStockError) throw lowStockError;
        if (outOfStockError) throw outOfStockError;
        if (criticalError) console.error('Error fetching critical stock items:', criticalError);
        if (revenueError) console.error('Error fetching monthly revenue:', revenueError);
        if (arError) console.error('Error fetching outstanding AR:', arError);
        if (apError) console.error('Error fetching outstanding AP:', apError);
        if (issuedItemsError) throw issuedItemsError;
        if (activeWoError) throw activeWoError;

        // Process PO Monthly Data
        const poByMonthKey: { [key: string]: number } = {};
        const monthShortFormatter = new Intl.DateTimeFormat('id-ID', { month: 'short' });
        
        poItems.forEach(item => {
          const itemDate = new Date(item.created_at);
          const total = item.quantity * item.unit_price;
          const monthKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`;
          poByMonthKey[monthKey] = (poByMonthKey[monthKey] || 0) + total;
        });

        const poBuckets = Array.from({ length: 6 }, (_, i) => {
          const d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() - 5 + i);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const monthLabel = `${monthShortFormatter.format(d)} ${String(d.getFullYear()).slice(2)}`;
          return { monthKey, monthLabel };
        });

        const sortedPoData = poBuckets.map(({ monthKey, monthLabel }) => ({
          monthKey,
          monthLabel,
          total: poByMonthKey[monthKey] || 0,
        }));

        setMonthlyPoData(sortedPoData);
        
        // Process Lead Time Data
        const formattedLeadTime = activeWoData.map(wo => ({
          license_plate: (wo.vehicle_entries as any)?.vehicles.license_plate || 'N/A',
          entry_date: (wo.vehicle_entries as any)?.entry_date,
          estimated_finish_date: (wo.vehicle_entries as any)?.estimated_finish_date,
        }));
        setLeadTimeData(formattedLeadTime);

        // Process Monthly Progress (hanya bulan yang ada datanya)
        const progress: { [key: string]: MonthlyProgressData } = {};
        const monthLongFormatter = new Intl.DateTimeFormat('id-ID', { month: 'long' });

        monthlyWoData.forEach((wo: any) => {
          const entry = wo.vehicle_entries as any;
          if (!entry || !entry.entry_date) return;

          const entryDate = new Date(entry.entry_date);
          const monthKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
          if (!progress[monthKey]) {
            progress[monthKey] = {
              monthKey,
              monthLabel: `${monthLongFormatter.format(entryDate)} ${entryDate.getFullYear()}`,
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

          if (wo.status === 'COMPLETED' || wo.status === 'CLOSED') {
            if (isR4) progress[monthKey].totalCompleted.r4++;
            if (isR2) progress[monthKey].totalCompleted.r2++;
          } else { // Consider everything else as WIP
            if (isR4) progress[monthKey].totalWip.r4++;
            if (isR2) progress[monthKey].totalWip.r2++;
          }
        });
        
        setMonthlyProgress(
          Object.values(progress).sort((a, b) => a.monthKey.localeCompare(b.monthKey))
        );
        
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
        setCriticalStockItems((criticalItems as any) || []);

        const totalRevenue = revenueData?.reduce((sum, inv: any) => {
          const totalAmount = Number(inv.total_amount || 0);
          const paidAmount = Number(inv.paid_amount || 0);
          const status = String(inv.status || '').toUpperCase();
          if (status === 'PAID') return sum + totalAmount;
          return sum + Math.min(paidAmount, totalAmount);
        }, 0) || 0;

        const totalAR = arData?.reduce((sum, inv: any) => {
          const totalAmount = Number(inv.total_amount || 0);
          const paidAmount = Number(inv.paid_amount || 0);
          const remaining = totalAmount - paidAmount;
          if (remaining <= 0) return sum;
          return sum + remaining;
        }, 0) || 0;
        const totalAP = apData?.reduce((sum, inv: any) => {
          const totalAmount = Number(inv.total_amount || 0);
          const paidAmount = Number(inv.paid_amount || 0);
          const remaining = totalAmount - paidAmount;
          if (remaining <= 0) return sum;
          return sum + remaining;
        }, 0) || 0;

        setStats({
          woR4: woR4Count || 0,
          woR2: woR2Count || 0,
          poPendingCount: poPendingCount || 0,
          lowStockItems: lowStockCount || 0,
          outOfStockItems: outOfStockCount || 0,
          monthlyRevenue: totalRevenue,
          outstandingAR: totalAR,
          outstandingAP: totalAP,
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
      
      {/* Stat Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard 
          title="Pendapatan Bulan Ini" 
          value={formatCurrency(stats.monthlyRevenue)} 
          icon={TrendingUp} 
          loading={loading}
          className="xl:col-span-2"
        />
        <StatCard 
          title="Piutang Belum Lunas" 
          value={formatCurrency(stats.outstandingAR)} 
          icon={CircleDollarSign} 
          loading={loading}
          className="xl:col-span-2"
        />
         <StatCard 
          title="Utang Belum Lunas" 
          value={
            <div className="text-2xl font-bold break-all">{formatCurrencyPrecise(stats.outstandingAP)}</div>
          }
          icon={Landmark} 
          loading={loading}
          className="xl:col-span-2"
        />
        <StatCard 
          title="PO Pending" 
          value={stats.poPendingCount} 
          icon={ShoppingCart} 
          loading={loading} 
        />
        <StatCard 
          title="Stok Menipis" 
          value={
            <div>
              <div className="text-2xl font-bold">{stats.lowStockItems}</div>
              <div className="text-xs text-slate-500 mt-1">
                Habis: {stats.outOfStockItems} • Menipis: {stats.lowStockItems} (stok &lt; 3)
              </div>
            </div>
          }
          icon={ArchiveX} 
          loading={loading} 
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          title="Stok Mau Habis (< 3)" 
          value={
            <div>
              <div className="text-2xl font-bold">{stats.lowStockItems}</div>
              <div className="text-xs text-slate-500 mt-1">
                Habis: {stats.outOfStockItems} • Menipis: {stats.lowStockItems}
              </div>
            </div>
          }
          icon={ArchiveX} 
          loading={loading} 
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Total Pembelanjaan (PO) per Bulan</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={monthlyPoData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${new Intl.NumberFormat('id-ID').format(value as number)}`}/>
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Lead Time Kendaraan (WIP)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Polisi</TableHead>
                  <TableHead>Tgl Masuk</TableHead>
                  <TableHead className="text-right">Durasi (Hari)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">Memuat data...</TableCell>
                  </TableRow>
                ) : leadTimeData.length > 0 ? (
                  leadTimeData.slice(0, 7).map((wo, index) => {
                    const entryDate = new Date(wo.entry_date);
                    const today = new Date();
                    const duration = Math.ceil((today.getTime() - entryDate.getTime()) / (1000 * 3600 * 24));
                    const isOverdue = duration > 3;

                    return (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{wo.license_plate}</TableCell>
                        <TableCell>{new Intl.DateTimeFormat('id-ID').format(entryDate)}</TableCell>
                        <TableCell className={`text-right font-bold ${isOverdue ? 'text-red-500' : ''}`}>{duration}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">Tidak ada kendaraan yang sedang dalam pengerjaan.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Tables Row */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-7">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top 10 Fast Moving Items (Periode Berjalan)</CardTitle>
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
              <p className="text-muted-foreground">Tidak ada data pemakaian barang pada periode berjalan.</p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Stok Kritis (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Memuat data...</p>
            ) : criticalStockItems.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barang</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criticalStockItems.map((it) => {
                    const stock = Number(it.current_stock || 0);
                    const isOut = stock <= 0;
                    const isLow = stock > 0 && stock <= 2;
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="text-xs">
                          <div className="font-medium truncate max-w-[260px]">{it.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {it.item_code ? it.item_code : '-'}
                            {it.unit ? ` • ${it.unit}` : ''}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right text-xs font-bold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : ''}`}>
                          {stock.toLocaleString('id-ID')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground">Tidak ada item stok kritis (≤ 2).</p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Laporan Progress Kendaraan Bulanan</CardTitle>
          </CardHeader>
          <CardContent>
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bulan</TableHead>
                  <TableHead>Masuk (R4/R2)</TableHead>
                  <TableHead>WIP (R4/R2)</TableHead>
                  <TableHead>Selesai (R4/R2)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">Memuat data...</TableCell>
                  </TableRow>
                ) : monthlyProgress.length > 0 ? (
                  monthlyProgress.map((data) => (
                    <TableRow key={data.monthKey}>
                      <TableCell className="font-medium">{data.monthLabel}</TableCell>
                      <TableCell>{data.totalIn.r4} / {data.totalIn.r2}</TableCell>
                      <TableCell>{data.totalWip.r4} / {data.totalWip.r2}</TableCell>
                      <TableCell>{data.totalCompleted.r4} / {data.totalCompleted.r2}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">Tidak ada data work order.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
