import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Activity, 
  CreditCard, 
  DollarSign, 
  Users, 
  ShoppingCart, 
  Wrench, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Car,
  CheckCircle
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    monthlyPOSpending: 0,
    activeWOCount: 0,
    pendingPOCount: 0,
    vehicleEntryCount: 0,
    lowStockCount: 0,
    // Breakdown values
    inventoryPersediaan: 0,
    inventoryPeralatan: 0,
    inventoryInventaris: 0
  });
  
  const [woStatusData, setWoStatusData] = useState<any[]>([]);
  const [monthlySpendingData, setMonthlySpendingData] = useState<any[]>([]);
  const [recentVehicles, setRecentVehicles] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const classifyVehicleType = (vehicleType: string) => {
    const vt = String(vehicleType || '').toUpperCase();
    if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
    if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
    if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
    return 'Lainnya';
  };

  async function fetchDashboardData() {
    setLoading(true);
    
    // Initialize defaults to avoid "missing info" if some queries fail
    let statsData = {
        monthlyPOSpending: 0,
        activeWOCount: 0,
        pendingPOCount: 0,
        vehicleEntryCount: 0,
        lowStockCount: 0,
        inventoryPersediaan: 0,
        inventoryPeralatan: 0,
        inventoryInventaris: 0
    };

    try {
      const today = new Date();
      const currentYear = today.getFullYear();
      const firstDayOfMonth = new Date(currentYear, today.getMonth(), 1).toISOString().split('T')[0];
      
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);

      // --- 0. NEW MONTHLY STATS TABLE DATA ---
      const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      
      // Initialize array for all months
      const monthlyData = months.map(m => ({
          name: m,
          unitMasuk: { total: 0, r4: 0, r2: 0, r2kecil: 0 },
          unitBelumWO: { total: 0, r4: 0, r2: 0, r2kecil: 0 },
          unitWoProses: { total: 0, r4: 0, r2: 0, r2kecil: 0 },
          unitWoClose: { total: 0, r4: 0, r2: 0, r2kecil: 0 },
      }));

      // --- 1. KPI COUNTS & Monthly Stats (Parallel) ---
      // We'll run lighter queries in parallel first
      const startOfYear = `${currentYear}-01-01`;
      const endOfYear = `${currentYear}-12-31`;

      const [woCountRes, poCountRes, entryCountRes, entriesRes] = await Promise.all([
          supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('status', 'IN_PROGRESS'),
          supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).in('status', ['ISSUED', 'RECEIVED_PART']),
          supabase.from('vehicle_entries').select('*', { count: 'exact', head: true }).gte('entry_date', firstDayOfMonth),
          supabase.from('vehicle_entries')
            .select(`
                entry_date, 
                status,
                vehicles (vehicle_type),
                work_orders (
                    id,
                    status
                )
            `)
            .gte('entry_date', startOfYear)
            .lte('entry_date', endOfYear)
      ]);

      statsData.activeWOCount = woCountRes.count || 0;
      statsData.pendingPOCount = poCountRes.count || 0;
      statsData.vehicleEntryCount = entryCountRes.count || 0;

      // Process Monthly Stats from Parallel Result
      if (entriesRes.data) {
          entriesRes.data.forEach((e: any) => {
              const date = new Date(e.entry_date);
              const monthIdx = date.getMonth(); // 0-11
              
              if (monthIdx >= 0 && monthIdx < 12) {
                  const typeKey = classifyVehicleType(e.vehicles?.vehicle_type);
                  const slot =
                    typeKey === 'R4' ? 'r4' :
                    typeKey === 'R2' ? 'r2' :
                    typeKey === 'R2 Kecil' ? 'r2kecil' :
                    null;

                  monthlyData[monthIdx].unitMasuk.total++;
                  if (slot) monthlyData[monthIdx].unitMasuk[slot]++;
                  
                  const wo = (e.work_orders as any) && (e.work_orders as any).length > 0 ? (e.work_orders as any)[0] : null;

                  if (!wo) {
                      // No WO linked yet
                      if (e.status === 'OPEN') {
                          monthlyData[monthIdx].unitBelumWO.total++;
                          if (slot) monthlyData[monthIdx].unitBelumWO[slot]++;
                      } else {
                          // Status is PROCESSED/CLOSED but no WO found? 
                          // Treat as Process to balance the math, or maybe it's a ghost entry.
                          // Let's assume it's in process if it's not OPEN.
                          monthlyData[monthIdx].unitWoProses.total++;
                          if (slot) monthlyData[monthIdx].unitWoProses[slot]++;
                      }
                  } else {
                      // WO Exists
                      if (wo.status === 'COMPLETED' || wo.status === 'CLOSED') {
                          monthlyData[monthIdx].unitWoClose.total++;
                          if (slot) monthlyData[monthIdx].unitWoClose[slot]++;
                      } else {
                          // WO is OPEN or IN_PROGRESS
                          monthlyData[monthIdx].unitWoProses.total++;
                          if (slot) monthlyData[monthIdx].unitWoProses[slot]++;
                      }
                  }
              }
          });
      }
      setMonthlyStats(monthlyData);

      // --- 2. HEAVY CALCULATIONS (Inventory, Spending, Charts) ---
      // Run these in a second batch or independently to not block the initial render if we were using streaming, 
      // but here we just parallelize them to speed up total time.
      
      const [goodsRes, poItemsRes, posRes, wosRes, lowStockRes, simpleEntriesRes] = await Promise.all([
          supabase.from('goods').select('id, current_stock, item_type').gt('current_stock', 0),
          supabase.from('purchase_order_items').select('goods_id, unit_price').order('created_at', { ascending: false }).limit(2000),
          supabase.from('purchase_orders').select('total_amount, po_date, created_at').gte('created_at', sixMonthsAgo.toISOString()).neq('status', 'DRAFT'),
          supabase.from('work_orders').select('status'),
          supabase.from('goods').select('id, name, item_code, current_stock, unit').lt('current_stock', 10).gt('current_stock', 0).order('current_stock', { ascending: true }).limit(5),
          supabase.from('vehicle_entries')
            .select('id, entry_date, entry_number, license_plate, status, vehicles (brand_type, vehicle_type)')
            .eq('status', 'OPEN')
            .order('entry_date', { ascending: false })
            .limit(20)
      ]);

      // 2a. Inventory Value Calc
      try {
          const goods = goodsRes.data;
          const poItems = poItemsRes.data;
          
          const priceMap = new Map();
          if (poItems) {
            for (const item of poItems) {
               if (!priceMap.has(item.goods_id) && item.unit_price) {
                 priceMap.set(item.goods_id, item.unit_price);
               }
            }
          }

          let valPersediaan = 0;
          let valPeralatan = 0;
          let valInventaris = 0;

          if (goods) {
            for (const g of goods) {
                const price = priceMap.get(g.id) || 0;
                const val = (g.current_stock || 0) * price;
                
                // Exclude NON_PERSEDIAAN from breakdown as requested
                if (g.item_type === 'PERSEDIAAN') {
                    valPersediaan += val;
                } else if (g.item_type === 'PERALATAN_WORKSHOP') {
                    valPeralatan += val;
                } else if (g.item_type === 'INVENTARIS_KANTOR' || g.item_type === 'FURNITURE') {
                    valInventaris += val;
                }
            }
          }
          statsData.inventoryPersediaan = valPersediaan;
          statsData.inventoryPeralatan = valPeralatan;
          statsData.inventoryInventaris = valInventaris;
      } catch (e) { console.error("Inventory Value Calc Error:", e); }

      // 2b. Monthly Spending
      try {
          const pos = posRes.data;
          const spendingMap: Record<string, number> = {};
          for (let i = 0; i < 6; i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = d.toLocaleString('id-ID', { month: 'short' });
            spendingMap[key] = 0;
          }

          if (pos) {
            for (const p of pos) {
                const date = new Date(p.po_date || p.created_at);
                const key = date.toLocaleString('id-ID', { month: 'short' });
                if (spendingMap[key] !== undefined) {
                  spendingMap[key] += p.total_amount || 0;
                }
            }
          }
          
          const currentMonthKey = today.toLocaleString('id-ID', { month: 'short' });
          statsData.monthlyPOSpending = spendingMap[currentMonthKey] || 0;
          setMonthlySpendingData(Object.entries(spendingMap).map(([name, value]) => ({ name, value })).reverse());
      } catch (e) { console.error("Spending Data Error:", e); }

      // 2c. WO Status & Low Stock & Recent Vehicles
      try {
          const wos = wosRes.data;
          const woStatusCounts = { OPEN: 0, IN_PROGRESS: 0, COMPLETED: 0, CLOSED: 0 };
          let totalWos = 0;
          
          if (wos) {
            for (const w of wos) {
                const status = w.status as keyof typeof woStatusCounts;
                if (woStatusCounts[status] !== undefined) {
                    woStatusCounts[status]++;
                    totalWos++;
                }
            }
          }
          
          setWoStatusData([
            { name: 'Open', value: woStatusCounts.OPEN, color: '#94a3b8', percentage: totalWos > 0 ? (woStatusCounts.OPEN / totalWos * 100).toFixed(1) : 0 },
            { name: 'In Progress', value: woStatusCounts.IN_PROGRESS, color: '#3b82f6', percentage: totalWos > 0 ? (woStatusCounts.IN_PROGRESS / totalWos * 100).toFixed(1) : 0 },
            { name: 'Completed', value: woStatusCounts.COMPLETED, color: '#22c55e', percentage: totalWos > 0 ? (woStatusCounts.COMPLETED / totalWos * 100).toFixed(1) : 0 },
            { name: 'Closed', value: woStatusCounts.CLOSED, color: '#64748b', percentage: totalWos > 0 ? (woStatusCounts.CLOSED / totalWos * 100).toFixed(1) : 0 },
          ].filter(d => d.value > 0));

          setLowStockItems(lowStockRes.data || []);
          statsData.lowStockCount = lowStockRes.data?.length || 0;
          setRecentVehicles(simpleEntriesRes.data || []);

      } catch (e) { console.error("WO/Stock/Recent Error:", e); }

      // Finally set stats
      setStats(statsData);

    } catch (error) {
      console.error("Fatal Dashboard Error:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  const openEntryByType = recentVehicles.reduce(
    (acc: any, e: any) => {
      const vt = String(e.vehicles?.vehicle_type || '').toUpperCase();
      if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) acc.r2kecil++;
      else if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) acc.r4++;
      else if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) acc.r2++;
      else acc.other++;
      return acc;
    },
    { r4: 0, r2: 0, r2kecil: 0, other: 0 }
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard v2.2</h2>
          <p className="text-slate-500 mt-1">Ringkasan aktivitas operasional dan performa bengkel.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1 bg-white text-slate-600 border-slate-200 shadow-sm">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Badge>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard 
          title="Nilai Stok Persediaan" 
          value={formatCurrency(stats.inventoryPersediaan)} 
          icon={Package}
          trend="Barang Persediaan"
          trendColor="text-slate-500"
          iconColor="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <KpiCard 
          title="Nilai Aset Peralatan" 
          value={formatCurrency(stats.inventoryPeralatan)} 
          icon={Wrench}
          trend="Peralatan Workshop"
          trendColor="text-slate-500"
          iconColor="text-blue-600"
          bgColor="bg-blue-50"
        />
        <KpiCard 
          title="Nilai Inventaris Kantor" 
          value={formatCurrency(stats.inventoryInventaris)} 
          icon={ShoppingCart}
          trend="Inventaris & Furniture"
          trendColor="text-slate-500"
          iconColor="text-orange-600"
          bgColor="bg-orange-50"
        />
        <KpiCard 
          title="Belanja Bulan Ini" 
          value={formatCurrency(stats.monthlyPOSpending)} 
          icon={CreditCard}
          trend="Total PO diterbitkan bulan ini"
          trendColor="text-slate-500"
          iconColor="text-indigo-600"
          bgColor="bg-indigo-50"
        />
      </div>

      <Card className="shadow-md border-slate-200">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle>Unit Masuk (Status OPEN)</CardTitle>
            <CardDescription>Ringkasan unit yang belum diproses WO</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">R4: {openEntryByType.r4}</div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">R2: {openEntryByType.r2}</div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">R2 Kecil: {openEntryByType.r2kecil}</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No. Entry</TableHead>
                  <TableHead>No. Polisi</TableHead>
                  <TableHead>Merk/Tipe</TableHead>
                  <TableHead className="w-[120px]">Jenis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentVehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                      Tidak ada unit OPEN.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentVehicles.slice(0, 10).map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{formatDate(e.entry_date)}</TableCell>
                      <TableCell className="font-medium">{e.entry_number}</TableCell>
                      <TableCell className="font-semibold">{e.license_plate || e.vehicles?.license_plate || '-'}</TableCell>
                      <TableCell className="text-slate-600">{e.vehicles?.brand_type || '-'}</TableCell>
                      <TableCell className="font-semibold">{e.vehicles?.vehicle_type || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-7">
        {/* Charts Section */}
        <Card className="col-span-4 shadow-md border-slate-200">
          <CardHeader>
            <CardTitle>Tren Belanja (6 Bulan Terakhir)</CardTitle>
            <CardDescription>Total nominal Purchase Order per bulan</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySpendingData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#64748b', fontSize: 12}} 
                    tickFormatter={(value) => `Rp${(value/1000000).toFixed(0)}jt`}
                  />
                  <Tooltip 
                    cursor={{fill: '#f1f5f9'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    formatter={(value: number) => [formatCurrency(value), 'Total Belanja']}
                  />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        {/* WO Status Chart */}
        <Card className="col-span-3 shadow-md border-slate-200">
          <CardHeader>
            <CardTitle>Status Work Order</CardTitle>
            <CardDescription>Distribusi status pekerjaan saat ini</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex flex-col items-center justify-center">
              {woStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={woStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {woStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                        formatter={(value: number, name: string, props: any) => [
                            `${value} Unit (${props.payload.percentage}%)`, 
                            name
                        ]}
                    />
                    <Legend 
                        verticalAlign="bottom" 
                        height={36}
                        formatter={(value, entry: any) => {
                            const { payload } = entry;
                            return `${value}: ${payload.value} (${payload.percentage}%)`;
                        }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground">Belum ada data WO</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Stats Table */}
      <Card className="shadow-md border-slate-200">
        <CardHeader>
          <CardTitle>Rekapitulasi Bulanan ({new Date().getFullYear()})</CardTitle>
          <CardDescription>Data statistik unit masuk dan pengerjaan per bulan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-[200px]">Periode</TableHead>
                  <TableHead className="text-center">Unit Masuk</TableHead>
                  <TableHead className="text-center text-orange-600">Unit Belum WO</TableHead>
                  <TableHead className="text-center text-blue-600">Unit WO Proses</TableHead>
                  <TableHead className="text-center text-green-600">Unit WO Close</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyStats.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-center">
                      <MonthlyTypeBreakdown value={row.unitMasuk} />
                    </TableCell>
                    <TableCell className="text-center font-semibold text-orange-600 bg-orange-50/50">
                      <MonthlyTypeBreakdown value={row.unitBelumWO} />
                    </TableCell>
                    <TableCell className="text-center font-semibold text-blue-600 bg-blue-50/50">
                      <MonthlyTypeBreakdown value={row.unitWoProses} />
                    </TableCell>
                    <TableCell className="text-center font-semibold text-green-600 bg-green-50/50">
                      <MonthlyTypeBreakdown value={row.unitWoClose} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Lists Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-md border-slate-200 col-span-2 md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Peringatan Stok Menipis
              </CardTitle>
              <CardDescription>Barang dengan stok kurang dari 10 unit</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <a href="/master/goods">Kelola Stok</a>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lowStockItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-emerald-600">
                  <Package className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm font-medium">Stok aman! Tidak ada peringatan.</p>
                </div>
              ) : (
                lowStockItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.item_code}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-amber-600">{item.current_stock}</span>
                      <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, trend, trendColor, iconColor, bgColor }: any) {
  return (
    <Card className="shadow-sm border-slate-200 hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
        <div className={`p-2 rounded-full ${bgColor}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <p className={`text-xs mt-1 ${trendColor}`}>{trend}</p>
      </CardContent>
    </Card>
  );
}

function MonthlyTypeBreakdown({ value }: { value: { total: number; r4: number; r2: number; r2kecil: number } }) {
  if (!value || value.total <= 0) return <span className="text-slate-400 font-medium">-</span>;
  return (
    <div className="flex flex-col items-center leading-tight">
      <div className="text-sm font-bold text-slate-900">{value.total}</div>
      <div className="mt-1 flex flex-wrap justify-center gap-1 text-[10px] font-medium text-slate-600">
        <span className="rounded bg-white/60 px-1.5 py-0.5 border border-slate-200">R4 {value.r4}</span>
        <span className="rounded bg-white/60 px-1.5 py-0.5 border border-slate-200">R2 {value.r2}</span>
        <span className="rounded bg-white/60 px-1.5 py-0.5 border border-slate-200">R2K {value.r2kecil}</span>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-7">
        <Skeleton className="col-span-4 h-[350px] rounded-xl" />
        <Skeleton className="col-span-3 h-[350px] rounded-xl" />
      </div>
    </div>
  );
}
