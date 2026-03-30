import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Download, Printer, RefreshCw, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportPrintHeader from '@/components/reports/ReportPrintHeader';
import { Checkbox } from '@/components/ui/checkbox';

type StatusLabel =
  | 'BELUM_WO'
  | 'BELUM_PO_DAN_BELUM_KELUAR'
  | 'SUDAH_PO_BELUM_KELUAR'
  | 'KELUAR_SEBAGIAN'
  | 'SUDAH_KELUAR';

type Row = {
  entry_date: string;
  entry_number: string;
  wo_number: string;
  license_plate: string;
  vehicle_type: string;
  vehicle_group: string;
  item_name: string;
  qty: number;
  po_qty: number;
  issued_qty: number;
  remaining_qty: number;
  estimated_price: number;
  total_estimated: number;
  status: StatusLabel;
  po_numbers: string;
  po_status: string;
};

const normalizeText = (v: string) =>
  String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const isNameMatch = (estimatedName: string, goodsName: string) => {
  const a = normalizeText(estimatedName);
  const b = normalizeText(goodsName);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
};

const summarizePoStatus = (pos: any[]) => {
  const statuses = (pos || []).map((p) => String(p.status || ''));
  if (statuses.includes('RECEIVED_FULL')) return 'RECEIVED_FULL';
  if (statuses.includes('RECEIVED_PART')) return 'RECEIVED_PART';
  if (statuses.includes('ISSUED')) return 'ISSUED';
  if (statuses.includes('DRAFT')) return 'DRAFT';
  return '-';
};

export default function UnorderedSparepartEstimationReport() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [onlyPending, setOnlyPending] = useState(true);
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchData();
  }, [dateFilter.startDate, dateFilter.endDate]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: entries, error: entryErr } = await supabase
        .from('vehicle_entries')
        .select(
          `
          id,
          entry_number,
          entry_date,
          vehicles (license_plate, brand_type, vehicle_type),
          work_orders (
            id, 
            wo_number, 
            status
          ),
          vehicle_entry_spareparts (
            id,
            item_name,
            qty,
            estimated_price,
            job_types (job_name)
          )
        `
        )
        .gte('entry_date', dateFilter.startDate)
        .lte('entry_date', dateFilter.endDate)
        .order('entry_date', { ascending: false });

      if (entryErr) throw entryErr;

      const workOrderIds = Array.from(
        new Set(
          (entries || [])
            .map((e: any) => e.work_orders?.[0]?.id)
            .filter(Boolean)
            .map((id: any) => String(id))
        )
      );

      const woToPOs: Record<string, any[]> = {};

      if (workOrderIds.length > 0) {
        const { data: pos, error: poErr } = await supabase
          .from('purchase_orders')
          .select(
            `
            id,
            po_number,
            status,
            work_order_id,
            purchase_order_items (
              quantity,
              goods (name)
            )
          `
          )
          .in('work_order_id', workOrderIds)
          .order('created_at', { ascending: false });

        if (poErr) throw poErr;

        (pos || []).forEach((po: any) => {
          const woId = String(po.work_order_id || '');
          if (!woId) return;
          if (!woToPOs[woId]) woToPOs[woId] = [];
          woToPOs[woId].push(po);
        });
      }

      const woToGoodsIssues: Record<string, any[]> = {};
      if (workOrderIds.length > 0) {
        const { data: giData, error: giErr } = await supabase
          .from('goods_issues')
          .select(`
            work_order_id,
            goods_issue_items (
              quantity,
              goods (name)
            )
          `)
          .in('work_order_id', workOrderIds);

        if (giErr) throw giErr;

        (giData || []).forEach((gi: any) => {
          const wId = String(gi.work_order_id || '');
          if (!wId) return;
          if (!woToGoodsIssues[wId]) woToGoodsIssues[wId] = [];
          woToGoodsIssues[wId].push(gi);
        });
      }

      const flattened: Row[] = [];

      (entries || []).forEach((entry: any) => {
        const wo = entry.work_orders?.[0] || null;
        const woId = wo?.id ? String(wo.id) : '';
        const poList = woId ? woToPOs[woId] || [] : [];
        const poNumbers = (poList || []).map((p: any) => p.po_number).filter(Boolean).join(', ') || '-';
        const poStatus = poList.length > 0 ? summarizePoStatus(poList) : '-';
        const licensePlate = entry.vehicles?.license_plate || '-';
        const vehicleType = entry.vehicles?.brand_type || entry.vehicles?.vehicle_type || '-';
        const vehicleGroup = entry.vehicles?.vehicle_type || '-'; // Fallback to vehicle_type since vehicle_groups table doesn't exist

        const estItems = Array.isArray(entry.vehicle_entry_spareparts) ? entry.vehicle_entry_spareparts : [];
        estItems.forEach((sp: any) => {
          const estName = String(sp.item_name || '');
          const qty = Number(sp.qty || 0);
          const estPrice = Number(sp.estimated_price || 0);
          const total = qty * estPrice;

          const poQty = (poList || []).reduce((acc: number, po: any) => {
            const items = Array.isArray(po.purchase_order_items) ? po.purchase_order_items : [];
            const matchQty = items.reduce((sum: number, it: any) => {
              const ok = isNameMatch(estName, it.goods?.name || '');
              return sum + (ok ? Number(it.quantity || 0) : 0);
            }, 0);
            return acc + matchQty;
          }, 0);

          const giList = woId ? woToGoodsIssues[woId] || [] : [];
          const issuedQty = giList.reduce((acc: number, gi: any) => {
            const items = Array.isArray(gi.goods_issue_items) ? gi.goods_issue_items : [];
            const matchQty = items.reduce((sum: number, it: any) => {
              const ok = isNameMatch(estName, it.goods?.name || '');
              return sum + (ok ? Number(it.quantity || 0) : 0);
            }, 0);
            return acc + matchQty;
          }, 0);

          const remainingQty = Math.max(0, qty - issuedQty);

          let status: StatusLabel = 'BELUM_PO_DAN_BELUM_KELUAR';
          if (!wo) status = 'BELUM_WO';
          else if (issuedQty >= qty && qty > 0) status = 'SUDAH_KELUAR';
          else if (issuedQty > 0) status = 'KELUAR_SEBAGIAN';
          else if (poQty > 0) status = 'SUDAH_PO_BELUM_KELUAR';
          else status = 'BELUM_PO_DAN_BELUM_KELUAR';

          flattened.push({
            entry_date: entry.entry_date,
            entry_number: entry.entry_number,
            wo_number: wo?.wo_number || '-',
            license_plate: licensePlate,
            vehicle_type: vehicleType,
            vehicle_group: vehicleGroup,
            item_name: estName,
            qty,
            po_qty: poQty,
            issued_qty: issuedQty,
            remaining_qty: remainingQty,
            estimated_price: estPrice,
            total_estimated: total,
            status,
            po_numbers: poNumbers,
            po_status: poStatus,
          });
        });
      });

      setRows(flattened);
    } catch (e: any) {
      toast.error('Gagal memuat laporan: ' + (e?.message || 'Unknown error'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    const q = normalizeText(search);
    const base = onlyPending ? rows.filter((r) => r.remaining_qty > 0) : rows;
    if (!q) return base;
    return base.filter((r) => {
      const hay = normalizeText(
        [
          r.entry_number,
          r.wo_number,
          r.license_plate,
          r.vehicle_type,
          r.vehicle_group,
          r.item_name,
          r.po_numbers,
          r.po_status,
          r.status,
        ].join(' ')
      );
      return hay.includes(q);
    });
  }, [rows, search, onlyPending]);

  const totals = useMemo(() => {
    const totalEst = filteredRows.reduce((sum, r) => sum + (Number(r.total_estimated) || 0), 0);
    const count = filteredRows.length;
    return { totalEst, count };
  }, [filteredRows]);

  const exportToExcel = () => {
    const exportData = filteredRows.map((r, idx) => ({
      No: idx + 1,
      Tanggal: formatDate(r.entry_date),
      'No. Entry': r.entry_number,
      'No. WO': r.wo_number,
      Nopol: r.license_plate,
      Kendaraan: r.vehicle_type,
      Group: r.vehicle_group,
      'Item Estimasi': r.item_name,
      'Qty Est': r.qty,
      'Qty PO': r.po_qty,
      'Qty Keluar': r.issued_qty,
      'Sisa Keluar': r.remaining_qty,
      'Est Harga': r.estimated_price,
      'Total Est': r.total_estimated,
      Status: r.status,
      'No. PO': r.po_numbers,
      'Status PO': r.po_status,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monitoring Estimasi Part');
    XLSX.writeFile(wb, `Monitoring_Estimasi_Part_${dateFilter.startDate}_sd_${dateFilter.endDate}.xlsx`);
  };

  const statusBadge = (s: StatusLabel) => {
    if (s === 'BELUM_WO') return <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-800">Belum WO</span>;
    if (s === 'SUDAH_KELUAR') return <span className="text-xs font-semibold px-2 py-1 rounded bg-emerald-100 text-emerald-800">Sudah Keluar</span>;
    if (s === 'KELUAR_SEBAGIAN') return <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-100 text-amber-800">Keluar Sebagian</span>;
    if (s === 'SUDAH_PO_BELUM_KELUAR') return <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-800">Sudah PO, Belum Keluar</span>;
    return <span className="text-xs font-semibold px-2 py-1 rounded bg-red-100 text-red-800">Belum PO & Belum Keluar</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Monitoring Estimasi Part</h2>
          <p className="text-muted-foreground">Monitoring estimasi part: belum dibuat PO atau belum dicatat sebagai barang keluar.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} disabled={filteredRows.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Cetak
          </Button>
          <Button onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="pb-3 print:hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg">Filter</CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="w-auto bg-white"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                />
                <span className="text-sm text-slate-500">s/d</span>
                <Input
                  type="date"
                  className="w-auto bg-white"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Checkbox checked={onlyPending} onCheckedChange={(v) => setOnlyPending(Boolean(v))} />
                <span>Hanya yang belum keluar (masih ada sisa)</span>
              </div>
              <div className="relative w-72">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari entry / WO / nopol / item / PO..."
                  className="pl-8 bg-white"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6">
            <ReportPrintHeader title="Monitoring Estimasi Part" periodStart={dateFilter.startDate} periodEnd={dateFilter.endDate} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 print:hidden">
              <div className="p-3 rounded-md border bg-white">
                <div className="text-xs text-slate-500">Total Item</div>
                <div className="text-lg font-bold text-slate-900">{totals.count}</div>
              </div>
              <div className="p-3 rounded-md border bg-white">
                <div className="text-xs text-slate-500">Total Estimasi</div>
                <div className="text-lg font-bold text-slate-900">{formatCurrency(totals.totalEst)}</div>
              </div>
            </div>
          </div>

          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="w-[120px] font-semibold text-slate-700">Tanggal</TableHead>
                  <TableHead className="font-semibold text-slate-700">No. Entry</TableHead>
                  <TableHead className="font-semibold text-slate-700">No. WO</TableHead>
                  <TableHead className="font-semibold text-slate-700">Kendaraan & Group</TableHead>
                  <TableHead className="font-semibold text-slate-700">Estimasi Item</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Qty Est</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Qty PO</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Qty Keluar</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Sisa</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Est Harga</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Total Est</TableHead>
                  <TableHead className="font-semibold text-slate-700">Status</TableHead>
                  <TableHead className="font-semibold text-slate-700">PO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                      Tidak ada data ditemukan.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r, idx) => (
                    <TableRow key={`${r.entry_number}-${idx}`} className="hover:bg-slate-50/80">
                      <TableCell className="text-sm">{formatDate(r.entry_date)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.entry_number}</TableCell>
                      <TableCell className="font-mono text-xs">{r.wo_number}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="font-bold">{r.license_plate}</span>
                          <span className="text-xs text-muted-foreground">{r.vehicle_type}</span>
                          <span className="text-[10px] text-slate-500">Grp: {r.vehicle_group}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.item_name}</TableCell>
                      <TableCell className="text-right font-semibold">{r.qty}</TableCell>
                      <TableCell className="text-right font-semibold text-slate-700">{r.po_qty}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700">{r.issued_qty}</TableCell>
                      <TableCell className="text-right font-bold text-red-700">{r.remaining_qty}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.estimated_price)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(r.total_estimated)}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono">{r.po_numbers}</span>
                          <span className="text-[10px] text-slate-500">Status: {r.po_status}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
