import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext'; // Import Auth Context
import PurchaseOrderPrint from '@/components/print/PurchaseOrderPrint';
import PurchaseOrderReport from './reports/PurchaseOrderReport';
import PurchaseDetailReport from './reports/PurchaseDetailReport';
import GoodsReceiptReport from './reports/GoodsReceiptReport';
import WorkOrderReport from './reports/WorkOrderReport';
import WorkOrderDetailReport from './reports/WorkOrderDetailReport';
import GoodsIssueReport from './reports/GoodsIssueReport';
import GoodsIssueDetailReport from './reports/GoodsIssueDetailReport';
import StockReport from './reports/StockReport';
import InventoryValueReport from './reports/InventoryValueReport';
import GrossProfitReport from './reports/GrossProfitReport';
import ProfitLossReport from './reports/ProfitLossReport'; // Import P&L
import BalanceSheetReport from './reports/BalanceSheetReport'; // Import Balance Sheet
import SupplierPayableReport from './reports/SupplierPayableReport'; // Import Supplier Payable
import VehicleEntryReport from './reports/VehicleEntryReport';
import EstimationVsRealizationReport from './reports/EstimationVsRealizationReport';
import BudgetMonitoringReport from './reports/BudgetMonitoringReport';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';

import ItemHistoryReport from './reports/ItemHistoryReport';

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth(); // Get user
  const reportType = searchParams.get('type');
  const reportId = searchParams.get('id');

  // Helper to check permission
  const canAccess = (reportKey: string) => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    return user.allowed_menus?.includes(reportKey) || false;
  };

  // Get the first allowed tab to set as default
  const getDefaultTab = () => {
      if (canAccess('report_po')) return 'po';
      if (canAccess('report_podetail')) return 'podetail';
      if (canAccess('report_receipt')) return 'receipt';
      if (canAccess('report_stock')) return 'stock';
      if (canAccess('report_stock')) return 'inventory_value'; // Reuse stock permission
      if (canAccess('report_issue')) return 'issue';
      if (canAccess('report_issuedetail')) return 'issuedetail';
      if (canAccess('report_wo')) return 'wo';
      if (canAccess('report_vehicle_entry')) return 'vehicle_entry';
      if (canAccess('report_profit')) return 'profit';
      if (canAccess('report_estimation')) return 'estimation';
      if (canAccess('report_budget')) return 'budget';
      return '';
  };

  const defaultTab = getDefaultTab();
  const reportCards = useMemo(() => ([
    { category: 'Keuangan', value: 'profit_loss', label: 'Laba Rugi', description: 'Ringkasan laba rugi per periode.', permission: 'report_profit_loss' },
    { category: 'Keuangan', value: 'balance_sheet', label: 'Neraca', description: 'Posisi aktiva, kewajiban, dan ekuitas.', permission: 'report_balance_sheet' },
    { category: 'Keuangan', value: 'profit', label: 'Laba Kotor', description: 'Analisis laba kotor dari transaksi.', permission: 'report_profit' },
    { category: 'Keuangan', value: 'supplier_payable', label: 'Hutang Supplier', description: 'Sisa hutang per supplier.', permission: 'report_supplier_payable' },

    { category: 'Persediaan', value: 'stock', label: 'Stok Barang', description: 'Stok terkini dan pergerakan.', permission: 'report_stock' },
    { category: 'Persediaan', value: 'inventory_value', label: 'Nilai Persediaan', description: 'Nilai persediaan berdasarkan cost.', permission: 'report_stock' },
    { category: 'Persediaan', value: 'item_history', label: 'History Barang', description: 'Riwayat masuk/keluar per item.', permission: 'report_stock' },

    { category: 'Pembelian', value: 'po', label: 'Pembelian (PO)', description: 'Rekap purchase order.', permission: 'report_po' },
    { category: 'Pembelian', value: 'podetail', label: 'Rincian Pembelian', description: 'Detail item pembelian.', permission: 'report_podetail' },
    { category: 'Pembelian', value: 'receipt', label: 'Barang Masuk', description: 'Rekap penerimaan barang.', permission: 'report_receipt' },

    { category: 'Operasional', value: 'wo', label: 'Work Order', description: 'Rekap pekerjaan dan status.', permission: 'report_wo' },
    { category: 'Operasional', value: 'wodetail', label: 'Detail WO', description: 'Rincian item dan biaya WO.', permission: 'report_wo' },
    { category: 'Operasional', value: 'vehicle_entry', label: 'Unit Masuk', description: 'Rekap kendaraan masuk.', permission: 'report_vehicle_entry' },
    { category: 'Operasional', value: 'issue', label: 'Rekap Keluar', description: 'Rekap barang keluar.', permission: 'report_issue' },
    { category: 'Operasional', value: 'issuedetail', label: 'Detail Barang Keluar', description: 'Rincian item barang keluar.', permission: 'report_issuedetail' },

    { category: 'Anggaran', value: 'budget', label: 'Monitoring Pagu', description: 'Monitoring anggaran/pagu.', permission: 'report_budget' },
    { category: 'Anggaran', value: 'estimation', label: 'Estimasi vs Realisasi', description: 'Perbandingan estimasi dan realisasi.', permission: 'report_estimation' },
  ]), []);

  const allowedCards = useMemo(() => reportCards.filter(r => canAccess(r.permission)), [reportCards, user]);
  const categories = useMemo(() => {
    const order = ['Keuangan', 'Persediaan', 'Pembelian', 'Operasional', 'Anggaran'];
    const available = new Set(allowedCards.map(r => r.category));
    return order.filter(c => available.has(c));
  }, [allowedCards]);

  const initialCategory = useMemo(() => {
    const byTab = allowedCards.find(r => r.value === defaultTab)?.category;
    return byTab || categories[0] || 'Keuangan';
  }, [allowedCards, defaultTab, categories]);

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [cardQuery, setCardQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      if (typeof window === 'undefined') return true;
      return localStorage.getItem('reports_panel_open') !== '0';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    const byTab = allowedCards.find(r => r.value === activeTab)?.category;
    if (!byTab) return;
    setActiveCategory((prev) => (prev === byTab ? prev : byTab));
  }, [activeTab, allowedCards]);

  useEffect(() => {
    try {
      localStorage.setItem('reports_panel_open', panelOpen ? '1' : '0');
    } catch {}
  }, [panelOpen]);

  const visibleCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    return allowedCards
      .filter(r => r.category === activeCategory)
      .filter(r => !q || r.label.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [allowedCards, activeCategory, cardQuery]);

  const activeMeta = useMemo(() => {
    return allowedCards.find(r => r.value === activeTab) || null;
  }, [allowedCards, activeTab]);

  // If specific report type is requested (e.g. print view), render that instead
  if (reportType === 'po' && reportId) {
    return <PurchaseOrderPrint id={reportId} />;
  }

  if (!defaultTab) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <Activity className="h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900">Akses Terbatas</h3>
          <p className="text-slate-500 mt-2">Anda tidak memiliki akses ke laporan apapun. Hubungi Super Admin.</p>
        </div>
      );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pusat Laporan</h1>
          <p className="text-slate-500 mt-1">Analisis dan ringkasan data operasional secara real-time.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          <Activity className="h-4 w-4" />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="print:hidden rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {activeMeta ? activeMeta.label : 'Pusat Laporan'}
              </div>
              {activeMeta && (
                <div className="text-xs text-slate-500 truncate">
                  {activeMeta.category}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(v => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-indigo-200 hover:shadow-sm transition-all whitespace-nowrap"
            >
              {panelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {panelOpen ? 'Sembunyikan Panel' : 'Pilih Laporan'}
            </button>
          </div>

          {panelOpen && (
            <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
              <div className="border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-2 py-2">
                  Kategori
                </div>
                <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible px-1 pb-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveCategory(c)}
                      className={`whitespace-nowrap md:whitespace-normal rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                        activeCategory === c
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="text-sm font-semibold text-slate-900">{activeCategory}</div>
                  <Input
                    value={cardQuery}
                    onChange={(e) => setCardQuery(e.target.value)}
                    placeholder="Cari laporan..."
                    className="h-9 sm:w-72"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visibleCards.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => { setActiveTab(r.value); setPanelOpen(false); }}
                      className={`text-left rounded-xl border p-4 transition-all ${
                        activeTab === r.value
                          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm'
                      }`}
                    >
                      <div className="font-semibold text-slate-900">{r.label}</div>
                      <div className="text-xs text-slate-500 mt-1 overflow-hidden text-ellipsis">{r.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6 min-h-[500px]">
          {canAccess('report_po') && <TabsContent value="po"><PurchaseOrderReport /></TabsContent>}
          {canAccess('report_podetail') && <TabsContent value="podetail"><PurchaseDetailReport /></TabsContent>}
          {canAccess('report_receipt') && <TabsContent value="receipt"><GoodsReceiptReport /></TabsContent>}
          {canAccess('report_stock') && <TabsContent value="stock"><StockReport /></TabsContent>}
          {canAccess('report_stock') && <TabsContent value="inventory_value"><InventoryValueReport /></TabsContent>}
          {canAccess('report_stock') && <TabsContent value="item_history"><ItemHistoryReport /></TabsContent>}
          {canAccess('report_issue') && <TabsContent value="issue"><GoodsIssueReport /></TabsContent>}
          {canAccess('report_issuedetail') && <TabsContent value="issuedetail"><GoodsIssueDetailReport /></TabsContent>}
          {canAccess('report_wo') && <TabsContent value="wo"><WorkOrderReport /></TabsContent>}
          {canAccess('report_wo') && <TabsContent value="wodetail"><WorkOrderDetailReport /></TabsContent>}
          {canAccess('report_vehicle_entry') && <TabsContent value="vehicle_entry"><VehicleEntryReport /></TabsContent>}
          {canAccess('report_profit') && <TabsContent value="profit"><GrossProfitReport /></TabsContent>}
          {canAccess('report_profit_loss') && <TabsContent value="profit_loss"><ProfitLossReport /></TabsContent>}
          {canAccess('report_balance_sheet') && <TabsContent value="balance_sheet"><BalanceSheetReport /></TabsContent>}
          {canAccess('report_supplier_payable') && <TabsContent value="supplier_payable"><SupplierPayableReport /></TabsContent>}
          {canAccess('report_estimation') && <TabsContent value="estimation"><EstimationVsRealizationReport /></TabsContent>}
          {canAccess('report_budget') && <TabsContent value="budget"><BudgetMonitoringReport /></TabsContent>}
        </div>
      </Tabs>
    </div>
  );
}
