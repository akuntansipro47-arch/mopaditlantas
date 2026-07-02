import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasMenuAccess } from '@/lib/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ShoppingCart, ArchiveX, TrendingUp, CircleDollarSign, Landmark, Percent, Timer, Users, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';

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

type TopCustomer = { name: string; total: number };

type RepeatWoVehicle = {
  license_plate: string;
  vehicle_name: string;
  group: string;
  wo_count: number;
  wo_numbers: string[];
  latest_entry_date: string | null;
  latest_entry_number: string | null;
  total_estimation: number;
};

const getJobEstimationFromRow = (row: any) => {
  const epRaw = (row as any)?.estimated_price;
  const ep = Number(epRaw);
  const sp = Number((row as any)?.job_types?.selling_price || 0);
  if (Number.isFinite(ep) && ep > 0) return ep;
  if ((!Number.isFinite(ep) || epRaw === null || epRaw === undefined) && sp > 0) return sp;
  if (Number.isFinite(ep) && ep === 0 && sp > 0) return sp;
  return Number.isFinite(ep) ? ep : 0;
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canViewRepeatWo = hasMenuAccess(user, 'dashboard_repeat_wo');

  useEffect(() => {
    if (user && !hasMenuAccess(user, 'dashboard')) {
      navigate('/reports');
    }
  }, [user, navigate]);

  const [stats, setStats] = useState({
    monthlyRevenue: 0,
    outstandingAR: 0,
    outstandingAP: 0,
    poPendingCount: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
  });
  const [profitability, setProfitability] = useState({
    revenue30: 0,
    hpp30: 0,
    grossProfit30: 0,
    avgMarginPct: 0,
    avgProfitPerWo: 0,
    avgCycleTimeDays: 0,
    estimateConversionPct: 0,
    newCustomers: 0,
    returningCustomers: 0,
  });
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [fastMovingItems, setFastMovingItems] = useState<FastMovingItem[]>([]);
  const [leadTimeData, setLeadTimeData] = useState<LeadTimeData[]>([]);
  const [monthlyProgress, setMonthlyProgress] = useState<MonthlyProgressData[]>([]);
  const [monthlyPoData, setMonthlyPoData] = useState<MonthlyPoData[]>([]);
  const [criticalStockItems, setCriticalStockItems] = useState<CriticalStockItem[]>([]);
  const [repeatWoVehicles, setRepeatWoVehicles] = useState<RepeatWoVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);

  const exportRepeatWoToExcel = () => {
    try {
      const rows = (repeatWoVehicles || []).map((r) => ({
        'No. Polisi': r.license_plate,
        Group: r.group,
        Kendaraan: r.vehicle_name,
        'Jumlah WO': r.wo_count,
        'No. WO': r.wo_numbers.join(', '),
        'Estimasi Total': Number(r.total_estimation || 0),
        'Entry Terakhir': r.latest_entry_number || '',
        'Tgl Entry Terakhir': r.latest_entry_date || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'WO Berulang');
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Dashboard_WO_Berulang_${today}.xlsx`);
    } catch (e) {
      console.error('Export repeat WO failed', e);
    }
  };

  const normalizeVehicleGroup = (vehicleType?: string | null) => {
    const vt = String(vehicleType || '').toUpperCase();
    if (vt.includes('R2_KECIL') || vt.includes('R2 KECIL') || vt.includes('KECIL')) return 'R2 Kecil';
    if (vt === 'R4' || vt.includes('R4') || vt.includes('MOBIL')) return 'R4';
    if (vt === 'R2' || vt.includes('R2') || vt.includes('MOTOR')) return 'R2';
    return '-';
  };

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      const nextWarnings: string[] = [];
      const warn = (label: string, err: any) => {
        console.error(label, err);
        nextWarnings.push(label);
      };
      try {
        // PO Pending Count
        const { count: poPendingCount, error: poPendingError } = await supabase
          .from('purchase_orders')
          .select('*', { count: 'exact', head: true })
          .in('status', ['ISSUED', 'RECEIVED_PART']);
        if (poPendingError) warn('Gagal ambil PO Pending', poPendingError);

        // PO Total Value & Monthly Data
        const { data: poItems, error: poItemsError } = await supabase
          .from('purchase_order_items')
          .select('quantity, unit_price, created_at');
        if (poItemsError) warn('Gagal ambil data PO per bulan', poItemsError);
        const poItemsRows = Array.isArray(poItems) ? poItems : [];

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthDate = startOfMonth.toISOString().split('T')[0];
        const startOfLast30Days = new Date();
        startOfLast30Days.setDate(startOfLast30Days.getDate() - 30);
        startOfLast30Days.setHours(0, 0, 0, 0);
        const start30Date = startOfLast30Days.toISOString().split('T')[0];

        // Monthly Revenue
        const { data: revenueData, error: revenueError } = await supabase
          .from('sales_invoices')
          .select('total_amount, paid_amount, status')
          .gte('invoice_date', startOfMonthDate)
          .in('status', ['PAID', 'PARTIAL']);
        if (revenueError) warn('Gagal ambil pendapatan bulan ini', revenueError);

        // Outstanding AR (Piutang)
        const { data: arData, error: arError } = await supabase
          .from('sales_invoices')
          .select('total_amount, paid_amount, status')
          .in('status', ['UNPAID', 'PARTIAL']);
        if (arError) warn('Gagal ambil piutang', arError);

        // Outstanding AP (Utang)
        const { data: apData, error: apError } = await supabase
          .from('purchase_invoices')
          .select('total_amount, paid_amount, status')
          .in('status', ['UNPAID', 'PARTIAL']);
        if (apError) warn('Gagal ambil utang', apError);

        // Low Stock Items
        const { count: lowStockCount, error: lowStockError } = await supabase
          .from('goods')
          .select('*', { count: 'exact', head: true })
          .lt('current_stock', 3)
          .gt('current_stock', 0);
        if (lowStockError) warn('Gagal ambil stok menipis', lowStockError);

        // Out Of Stock Items
        const { count: outOfStockCount, error: outOfStockError } = await supabase
          .from('goods')
          .select('*', { count: 'exact', head: true })
          .lte('current_stock', 0);
        if (outOfStockError) warn('Gagal ambil stok habis', outOfStockError);

        // Top Critical Stock Items (stok habis & menipis)
        const { data: criticalItems, error: criticalError } = await supabase
          .from('goods')
          .select('id, name, item_code, unit, current_stock')
          .lte('current_stock', 2)
          .order('current_stock', { ascending: true })
          .order('name', { ascending: true })
          .limit(10);
        if (criticalError) warn('Gagal ambil stok kritis', criticalError);

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
        if (issuedItemsError) warn('Gagal ambil fast moving items', issuedItemsError);

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
        if (activeWoError) warn('Gagal ambil lead time WIP', activeWoError);

        const { data: completedWos, error: completedWoErr } = await supabase
          .from('work_orders')
          .select(`
            id,
            wo_number,
            status,
            work_date,
            vehicle_entry_id,
            vehicle_entries (
              entry_date
            ),
            work_order_billings (
              item_type,
              qty,
              goods_id,
              job_type_id,
              unit_price,
              total_price
            )
          `)
          .gte('work_date', start30Date)
          .in('status', ['CLOSED', 'COMPLETED']);
        if (completedWoErr) warn('Gagal ambil WO selesai (30 hari)', completedWoErr);

        const { data: last30Invoices, error: invoices30Err } = await supabase
          .from('sales_invoices')
          .select('id, invoice_date, customer_name, total_amount')
          .gte('invoice_date', start30Date);
        if (invoices30Err) warn('Gagal ambil invoice (30 hari)', invoices30Err);

        const { data: last30Entries, error: entries30Err } = await supabase
          .from('vehicle_entries')
          .select('id')
          .gte('entry_date', start30Date)
          .limit(5000);
        if (entries30Err) warn('Gagal ambil estimasi/entry (30 hari)', entries30Err);

        const entryIds30 = (last30Entries || []).map((e: any) => e.id).filter(Boolean);
        const { count: woFromEntriesCount, error: woFromEntriesErr } = entryIds30.length
          ? await supabase
              .from('work_orders')
              .select('id', { count: 'exact', head: true })
              .in('vehicle_entry_id', entryIds30)
          : { count: 0, error: null };
        if (woFromEntriesErr) warn('Gagal hitung konversi estimasi → WO', woFromEntriesErr);


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

          if (monthlyWoError) {
            warn('Gagal ambil progress bulanan', monthlyWoError);
            break;
          }
          if (!pageRows || pageRows.length === 0) break;

          monthlyWoData.push(...pageRows);
          if (pageRows.length < PAGE_SIZE) break;
          pageFrom += PAGE_SIZE;
        }

        // Process PO Monthly Data
        const poByMonthKey: { [key: string]: number } = {};
        const monthShortFormatter = new Intl.DateTimeFormat('id-ID', { month: 'short' });
        
        poItemsRows.forEach((item: any) => {
          const itemDate = new Date(item.created_at);
          const total = Number(item.quantity || 0) * Number(item.unit_price || 0);
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
        const formattedLeadTime = (Array.isArray(activeWoData) ? activeWoData : []).map((wo: any) => ({
          license_plate: (wo.vehicle_entries as any)?.vehicles.license_plate || 'N/A',
          entry_date: (wo.vehicle_entries as any)?.entry_date,
          estimated_finish_date: (wo.vehicle_entries as any)?.estimated_finish_date,
        }));
        setLeadTimeData(formattedLeadTime);

        // Kendaraan yang punya WO lebih dari 1 kali (nopol sama)
        try {
          if (!canViewRepeatWo) {
            setRepeatWoVehicles([]);
            throw new Error('skip'); // skip heavy query bila tidak ada izin
          }

          const woRows: any[] = [];
          const PAGE_SIZE_WO = 1000;
          const MAX_PAGES_WO = 400; // safety cap (400k rows max)
          let pageFrom = 0;
          let pages = 0;
          while (true) {
            const pageTo = pageFrom + PAGE_SIZE_WO - 1;
            const { data: pageRows, error: woErr } = await supabase
              .from('work_orders')
              .select(
                `
                id,
                wo_number,
                work_date,
                vehicle_entry_id,
                vehicle_entries!inner(
                  id,
                  entry_date,
                  entry_number,
                  vehicles(id, license_plate, brand_type, vehicle_type)
                )
              `
              )
              .range(pageFrom, pageTo);

            if (woErr) {
              warn('Gagal ambil histori WO per kendaraan', woErr);
              break;
            }
            if (!pageRows || pageRows.length === 0) break;

            woRows.push(...pageRows);
            if (pageRows.length < PAGE_SIZE_WO) break;
            pageFrom += PAGE_SIZE_WO;
            pages += 1;
            if (pages >= MAX_PAGES_WO) break;
          }

          const byPlate = new Map<
            string,
            {
              license_plate: string;
              vehicle_name: string;
              woIds: Set<string>;
              woNumbers: Map<string, string>; // wo_number -> work_date
              entryWoCounts: Map<string, number>; // vehicle_entry_id -> jumlah WO
              latestEntryId: string | null;
              latestEntryDate: string | null;
              latestEntryNumber: string | null;
              group: string;
            }
          >();

          woRows.forEach((wo: any) => {
            const entry = (wo as any)?.vehicle_entries as any;
            const v = entry?.vehicles as any;
            const plate = String(v?.license_plate || '').trim();
            if (!plate) return;
            const vehicleName = String(v?.brand_type || '-').trim() || '-';
            const group = normalizeVehicleGroup(v?.vehicle_type);
            const woId = String(wo?.id || '').trim();
            const woNumber = String(wo?.wo_number || '').trim();
            const workDate = String(wo?.work_date || entry?.entry_date || '').trim();
            const entryId = String(entry?.id || wo?.vehicle_entry_id || '').trim();
            const entryDate = String(entry?.entry_date || '').trim() || null;
            const entryNumber = String(entry?.entry_number || '').trim() || null;

            if (!byPlate.has(plate)) {
              byPlate.set(plate, {
                license_plate: plate,
                vehicle_name: vehicleName,
                group,
                woIds: new Set<string>(),
                woNumbers: new Map<string, string>(),
                entryWoCounts: new Map<string, number>(),
                latestEntryId: entryId || null,
                latestEntryDate: entryDate,
                latestEntryNumber: entryNumber,
              });
            }

            const agg = byPlate.get(plate)!;
            if (woId) agg.woIds.add(woId);
            if (woNumber) agg.woNumbers.set(woNumber, workDate || '');
            if (entryId) agg.entryWoCounts.set(entryId, (agg.entryWoCounts.get(entryId) || 0) + 1);

            // Update entry terbaru (pakai entry_date; fallback work_date)
            const curTs = agg.latestEntryDate ? Date.parse(agg.latestEntryDate) : Number.NaN;
            const nextTs = entryDate ? Date.parse(entryDate) : Number.NaN;
            const curWorkTs = curTs;
            const nextWorkTs = workDate ? Date.parse(workDate) : Number.NaN;
            const shouldUpdate =
              (Number.isFinite(nextTs) && (!Number.isFinite(curTs) || nextTs > curTs)) ||
              (!Number.isFinite(nextTs) && Number.isFinite(nextWorkTs) && (!Number.isFinite(curWorkTs) || nextWorkTs > curWorkTs));

            if (shouldUpdate) {
              agg.latestEntryId = entryId || agg.latestEntryId;
              agg.latestEntryDate = entryDate || agg.latestEntryDate;
              agg.latestEntryNumber = entryNumber || agg.latestEntryNumber;
              agg.vehicle_name = vehicleName || agg.vehicle_name;
              agg.group = group || agg.group;
            }
          });

          const candidates = Array.from(byPlate.values())
            .map((x) => ({
              license_plate: x.license_plate,
              vehicle_name: x.vehicle_name,
              group: x.group,
              wo_count: x.woIds.size,
              wo_numbers: Array.from(x.woNumbers.entries())
                .sort((a, b) => String(b[1] || '').localeCompare(String(a[1] || '')))
                .map(([woNumber]) => woNumber),
              entry_ids: Array.from(x.entryWoCounts.entries()).map(([id, count]) => ({ id, count })),
              latest_entry_id: x.latestEntryId,
              latest_entry_date: x.latestEntryDate,
              latest_entry_number: x.latestEntryNumber,
            }))
            .filter((x) => x.wo_count > 1);

          const entryIdsForEstimation = Array.from(
            new Set(
              candidates
                .flatMap((x) => (Array.isArray(x.entry_ids) ? x.entry_ids : []))
                .map((v: any) => String(v?.id || '').trim())
                .filter(Boolean)
            )
          ) as string[];
          const estByEntryId = new Map<string, number>();

          if (entryIdsForEstimation.length > 0) {
            const chunk = <T,>(arr: T[], size: number) => {
              const out: T[][] = [];
              for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
              return out;
            };

            // Query bertahap supaya aman dari limit IN dan limit row.
            for (const ids of chunk(entryIdsForEstimation, 300)) {
              const { data: jobRows, error: jobErr } = await supabase
                .from('vehicle_entry_jobs')
                .select('vehicle_entry_id, estimated_price, value_only, job_types ( selling_price )')
                .in('vehicle_entry_id', ids)
                .limit(50000);
              if (jobErr) warn('Gagal hitung estimasi pekerjaan (dashboard)', jobErr);

              (jobRows || []).forEach((r: any) => {
                const entryId = String(r?.vehicle_entry_id || '').trim();
                if (!entryId) return;
                const amt = getJobEstimationFromRow(r);
                estByEntryId.set(entryId, (estByEntryId.get(entryId) || 0) + amt);
              });

              const { data: partRows, error: partErr } = await supabase
                .from('vehicle_entry_spareparts')
                .select('vehicle_entry_id, qty, estimated_price, total_price, value_only')
                .in('vehicle_entry_id', ids)
                .limit(50000);
              if (partErr) warn('Gagal hitung estimasi part (dashboard)', partErr);

              (partRows || []).forEach((r: any) => {
                const entryId = String(r?.vehicle_entry_id || '').trim();
                if (!entryId) return;
                const total =
                  r?.total_price !== null && r?.total_price !== undefined
                    ? Number(r.total_price || 0)
                    : Number(r?.qty || 0) * Number(r?.estimated_price || 0);
                estByEntryId.set(entryId, (estByEntryId.get(entryId) || 0) + total);
              });
            }
          }

          const repeatRows: RepeatWoVehicle[] = candidates
            .map((x) => ({
              license_plate: x.license_plate,
              vehicle_name: x.vehicle_name,
              group: x.group,
              wo_count: x.wo_count,
              wo_numbers: x.wo_numbers,
              latest_entry_date: x.latest_entry_date,
              latest_entry_number: x.latest_entry_number,
              // Samakan dengan laporan Estimasi vs Realisasi: jika 1 entry menghasilkan beberapa WO,
              // estimasi entry tsb dihitung per WO (dikalikan jumlah WO pada entry tsb).
              total_estimation: (Array.isArray(x.entry_ids) ? x.entry_ids : []).reduce((sum: number, it: any) => {
                const id = String(it?.id || '').trim();
                const cnt = Number(it?.count || 0);
                if (!id || !Number.isFinite(cnt) || cnt <= 0) return sum;
                return sum + Number(estByEntryId.get(id) || 0) * cnt;
              }, 0),
            }))
            .sort((a, b) => {
              if (b.wo_count !== a.wo_count) return b.wo_count - a.wo_count;
              const bt = b.latest_entry_date ? Date.parse(b.latest_entry_date) : 0;
              const at = a.latest_entry_date ? Date.parse(a.latest_entry_date) : 0;
              return bt - at;
            });

          setRepeatWoVehicles(repeatRows);
        } catch (e: any) {
          const msg = String(e?.message || '');
          if (msg !== 'skip') warn('Gagal proses kendaraan WO berulang', e);
        }

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
          .slice(0, 15);
        
        setFastMovingItems(sortedItems);
        setCriticalStockItems((criticalItems as any) || []);

        const completedRows = Array.isArray(completedWos) ? completedWos : [];
        const woIds = new Set<string>();
        const goodsIds = new Set<string>();
        const jobTypeIds = new Set<string>();

        completedRows.forEach((wo: any) => {
          if (wo?.id) woIds.add(String(wo.id));
          const bills = Array.isArray(wo?.work_order_billings) ? wo.work_order_billings : [];
          bills.forEach((b: any) => {
            const type = String(b?.item_type || '').toUpperCase();
            if (type === 'PART' && b?.goods_id) goodsIds.add(String(b.goods_id));
            if (type === 'JOB' && b?.job_type_id) jobTypeIds.add(String(b.job_type_id));
          });
        });

        const partHppByWoGoods: Record<string, number> = {};
        const partHppAvgStockMap: Record<string, number> = {};
        if (goodsIds.size > 0) {
          const { data: poCostItems, error: poCostErr } = await supabase
            .from('purchase_order_items')
            .select('goods_id, quantity, unit_price, purchase_orders!inner(work_order_id, status)')
            .in('purchase_orders.status', ['RECEIVED_PART', 'RECEIVED_FULL'])
            .in('goods_id', Array.from(goodsIds))
            .not('unit_price', 'is', null)
            .limit(50000);
          if (poCostErr) throw poCostErr;

          const woAgg = new Map<string, { sumQty: number; sumValue: number }>();
          const stockAgg = new Map<string, { sumQty: number; sumValue: number }>();
          (poCostItems || []).forEach((it: any) => {
            const gid = String(it?.goods_id || '').trim();
            const qty = Number(it?.quantity || 0);
            const price = Number(it?.unit_price || 0);
            if (!gid || qty <= 0 || price <= 0) return;

            const woId = String(it?.purchase_orders?.work_order_id || '').trim();
            if (woId && woIds.has(woId)) {
              const key = `${woId}:${gid}`;
              const cur = woAgg.get(key) || { sumQty: 0, sumValue: 0 };
              cur.sumQty += qty;
              cur.sumValue += qty * price;
              woAgg.set(key, cur);
              return;
            }

            if (!woId) {
              const cur = stockAgg.get(gid) || { sumQty: 0, sumValue: 0 };
              cur.sumQty += qty;
              cur.sumValue += qty * price;
              stockAgg.set(gid, cur);
            }
          });

          woAgg.forEach((v, k) => {
            if (v.sumQty > 0) partHppByWoGoods[k] = v.sumValue / v.sumQty;
          });
          stockAgg.forEach((v, gid) => {
            if (v.sumQty > 0) partHppAvgStockMap[gid] = v.sumValue / v.sumQty;
          });
        }

        const jobCostMap: Record<string, number> = {};
        if (jobTypeIds.size > 0) {
          const { data: jobs, error: jobErr } = await supabase
            .from('job_types')
            .select('id, hpp')
            .in('id', Array.from(jobTypeIds));
          if (jobErr) throw jobErr;
          (jobs || []).forEach((j: any) => {
            jobCostMap[String(j.id)] = Number((j as any)?.hpp || 0);
          });
        }

        const woMetrics = completedRows
          .map((wo: any) => {
            const bills = Array.isArray(wo?.work_order_billings) ? wo.work_order_billings : [];
            let rev = 0;
            let hpp = 0;
            bills.forEach((b: any) => {
              const qty = Number(b?.qty || 0);
              if (qty <= 0) return;
              const type = String(b?.item_type || '').toUpperCase();
              const totalPrice = Number(b?.total_price || 0) || Number(b?.unit_price || 0) * qty;
              rev += totalPrice;
              if (type === 'PART' && b?.goods_id) {
                const woKey = `${String(wo.id)}:${String(b.goods_id)}`;
                const unitHpp =
                  partHppByWoGoods[woKey] !== undefined
                    ? partHppByWoGoods[woKey] || 0
                    : partHppAvgStockMap[String(b.goods_id)] !== undefined
                      ? partHppAvgStockMap[String(b.goods_id)] || 0
                      : 0;
                hpp += unitHpp * qty;
              } else if (type === 'JOB' && b?.job_type_id) {
                const unitHpp = jobCostMap[String(b.job_type_id)] || 0;
                hpp += unitHpp * qty;
              }
            });

            const entryDateRaw = (wo?.vehicle_entries as any)?.entry_date;
            const endRaw = wo?.completed_at || wo?.work_date;
            const entryDate = entryDateRaw ? new Date(entryDateRaw) : null;
            const endDate = endRaw ? new Date(endRaw) : null;
            const cycleDays =
              entryDate && endDate && Number.isFinite(entryDate.getTime()) && Number.isFinite(endDate.getTime())
                ? Math.max(0, (endDate.getTime() - entryDate.getTime()) / (1000 * 3600 * 24))
                : null;

            const profit = rev - hpp;
            const margin = rev > 0 ? profit / rev : 0;
            return { rev, hpp, profit, margin, cycleDays };
          })
          .filter((m) => Number.isFinite(m.rev) && Number.isFinite(m.hpp));

        const revenue30 = woMetrics.reduce((s, m) => s + (m.rev || 0), 0);
        const hpp30 = woMetrics.reduce((s, m) => s + (m.hpp || 0), 0);
        const grossProfit30 = revenue30 - hpp30;
        const avgProfitPerWo = woMetrics.length > 0 ? woMetrics.reduce((s, m) => s + (m.profit || 0), 0) / woMetrics.length : 0;

        const marginRows = woMetrics.filter((m) => m.rev > 0);
        const avgMarginPct = marginRows.length > 0 ? (marginRows.reduce((s, m) => s + (m.margin || 0), 0) / marginRows.length) * 100 : 0;

        const cycleRows = woMetrics.filter((m) => typeof m.cycleDays === 'number');
        const avgCycleTimeDays = cycleRows.length > 0 ? cycleRows.reduce((s, m) => s + (m.cycleDays as number), 0) / cycleRows.length : 0;

        const entryCount = entryIds30.length;
        const woCount = Number(woFromEntriesCount || 0);
        const estimateConversionPct = entryCount > 0 ? (woCount / entryCount) * 100 : 0;

        const invoiceRows30 = Array.isArray(last30Invoices) ? last30Invoices : [];
        const customerNames = Array.from(
          new Set(
            invoiceRows30
              .map((r: any) => String(r?.customer_name || '').trim())
              .filter((x) => x.length > 0)
          )
        );

        const { data: prevInvoicesByCustomer, error: prevInvErr } = customerNames.length
          ? await supabase
              .from('sales_invoices')
              .select('customer_name')
              .lt('invoice_date', start30Date)
              .in('customer_name', customerNames)
              .limit(50000)
          : { data: [], error: null };
        if (prevInvErr) warn('Gagal ambil histori pelanggan (untuk segmentasi baru/berulang)', prevInvErr);

        const returningSet = new Set<string>(
          (prevInvoicesByCustomer || [])
            .map((r: any) => String(r?.customer_name || '').trim())
            .filter((x: string) => x.length > 0)
        );
        const returningCustomers = returningSet.size;
        const newCustomers = Math.max(0, customerNames.length - returningCustomers);

        const revenueByCustomer = new Map<string, number>();
        invoiceRows30.forEach((r: any) => {
          const name = String(r?.customer_name || '').trim();
          if (!name) return;
          const amt = Number(r?.total_amount || 0);
          revenueByCustomer.set(name, (revenueByCustomer.get(name) || 0) + amt);
        });
        const top5 = Array.from(revenueByCustomer.entries())
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);

        setProfitability({
          revenue30,
          hpp30,
          grossProfit30,
          avgMarginPct,
          avgProfitPerWo,
          avgCycleTimeDays,
          estimateConversionPct,
          newCustomers,
          returningCustomers,
        });
        setTopCustomers(top5);

        const totalRevenue = (Array.isArray(revenueData) ? revenueData : [])?.reduce((sum, inv: any) => {
          const totalAmount = Number(inv.total_amount || 0);
          const paidAmount = Number(inv.paid_amount || 0);
          const status = String(inv.status || '').toUpperCase();
          if (status === 'PAID') return sum + totalAmount;
          return sum + Math.min(paidAmount, totalAmount);
        }, 0) || 0;

        const totalAR = (Array.isArray(arData) ? arData : [])?.reduce((sum, inv: any) => {
          const totalAmount = Number(inv.total_amount || 0);
          const paidAmount = Number(inv.paid_amount || 0);
          const remaining = totalAmount - paidAmount;
          if (remaining <= 0) return sum;
          return sum + remaining;
        }, 0) || 0;
        const totalAP = (Array.isArray(apData) ? apData : [])?.reduce((sum, inv: any) => {
          const totalAmount = Number(inv.total_amount || 0);
          const paidAmount = Number(inv.paid_amount || 0);
          const remaining = totalAmount - paidAmount;
          if (remaining <= 0) return sum;
          return sum + remaining;
        }, 0) || 0;

        setStats({
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
        setWarnings(nextWarnings);
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>

      {warnings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sebagian data Dashboard tidak bisa dimuat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-slate-600">
              {warnings.map((w, i) => (
                <div key={`${w}-${i}`}>- {w}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      
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
                Habis: {stats.outOfStockItems} • Menipis: {stats.lowStockItems} (stok 1–2)
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Laba Kotor (30 Hari)"
          value={formatCurrencyPrecise(profitability.grossProfit30)}
          icon={TrendingUp}
          loading={loading}
        />
        <StatCard
          title="Margin Rata-rata/WO"
          value={`${profitability.avgMarginPct.toFixed(1)}%`}
          icon={Percent}
          loading={loading}
        />
        <StatCard
          title="Rata-rata Cycle Time WO"
          value={`${profitability.avgCycleTimeDays.toFixed(1)} hari`}
          icon={Timer}
          loading={loading}
        />
        <StatCard
          title="Konversi Estimasi → WO"
          value={`${profitability.estimateConversionPct.toFixed(1)}%`}
          icon={Users}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Pendapatan vs HPP (30 Hari)</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={[
                  { label: 'Pendapatan', total: profitability.revenue30 },
                  { label: 'HPP', total: profitability.hpp30 },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${new Intl.NumberFormat('id-ID').format(value as number)}`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value || 0))} />
                <Bar dataKey="total" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Pelanggan (30 Hari)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Memuat data...</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border p-3">
                    <div className="text-xs text-slate-500">Pelanggan Baru</div>
                    <div className="text-2xl font-bold">{profitability.newCustomers}</div>
                  </div>
                  <div className="rounded border p-3">
                    <div className="text-xs text-slate-500">Pelanggan Berulang</div>
                    <div className="text-2xl font-bold">{profitability.returningCustomers}</div>
                  </div>
                </div>
                {topCustomers.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Top 5 Pelanggan</TableHead>
                        <TableHead className="text-right">Pendapatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topCustomers.map((c) => (
                        <TableRow key={c.name}>
                          <TableCell className="text-xs">
                            <div className="font-medium truncate max-w-[220px]">{c.name}</div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-bold">{formatCurrencyPrecise(c.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground">Belum ada data invoice dalam 30 hari terakhir.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-7">
        {canViewRepeatWo && (
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Unit dengan WO Berulang (Nopol Sama)</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={exportRepeatWoToExcel}
                disabled={repeatWoVehicles.length === 0}
                className="print:hidden"
              >
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Memuat data...</p>
            ) : repeatWoVehicles.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Polisi</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Kendaraan</TableHead>
                    <TableHead>No. WO</TableHead>
                    <TableHead className="text-right">Estimasi Total</TableHead>
                    <TableHead className="text-right">Jumlah WO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repeatWoVehicles.map((row) => {
                    const woLabel = row.wo_numbers.join(', ');
                    return (
                      <TableRow key={row.license_plate}>
                        <TableCell className="font-medium">{row.license_plate}</TableCell>
                        <TableCell className="text-xs font-medium">{row.group}</TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium truncate max-w-[260px]">{row.vehicle_name}</div>
                          <div className="text-[10px] text-slate-400">
                            {row.latest_entry_number ? `Entry: ${row.latest_entry_number}` : '-'}
                            {row.latest_entry_date ? ` • ${formatDate(row.latest_entry_date)}` : ''}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="max-w-[360px] whitespace-normal break-words leading-snug">{woLabel || '-'}</div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold">{formatCurrencyPrecise(row.total_estimation)}</TableCell>
                        <TableCell className="text-right font-bold">{row.wo_count}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground">Belum ada unit dengan WO lebih dari 1 kali.</p>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {/* Bottom Tables Row */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-7">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top 15 Fast Moving Items (Periode Berjalan)</CardTitle>
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
