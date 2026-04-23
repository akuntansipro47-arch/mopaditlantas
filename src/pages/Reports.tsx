import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext'; // Import Auth Context
import PurchaseOrderPrint from '@/components/print/PurchaseOrderPrint';
import PurchaseOrderReport from './reports/PurchaseOrderReport';
import PurchaseDetailReport from './reports/PurchaseDetailReport';
import GoodsReceiptReport from './reports/GoodsReceiptReport';
import WorkOrderReport from './reports/WorkOrderReport';
import WorkOrderDetailReport from './reports/WorkOrderDetailReport';
import PurchaseOrderDetailReport from './reports/PurchaseOrderDetailReport';
import GoodsIssueReport from './reports/GoodsIssueReport';
import GoodsIssueDetailReport from './reports/GoodsIssueDetailReport';
import StockReport from './reports/StockReport';
import ItemHistoryReport from './reports/ItemHistoryReport';
import InventoryValueReport from './reports/InventoryValueReport';
import GrossProfitReport from './reports/GrossProfitReport';
import ProfitLossReport from './reports/ProfitLossReport';
import BalanceSheetReport from './reports/BalanceSheetReport';
import SupplierPayableReport from './reports/SupplierPayableReport';
import PurchasePaymentHistoryReport from './reports/PurchasePaymentHistoryReport';
import CashBankBookReport from './reports/CashBankBookReport';
import VehicleEntryReport from './reports/VehicleEntryReport';
import EstimationVsRealizationReport from './reports/EstimationVsRealizationReport';
import UnorderedSparepartEstimationReport from './reports/UnorderedSparepartEstimationReport';
import BudgetMonitoringReport from './reports/BudgetMonitoringReport';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BarChart3, Activity, Package, Wrench, Wallet, ChevronRight } from 'lucide-react';

type ReportKey =
  | 'vehicle_entry'
  | 'wo'
  | 'wodetail'
  | 'po'
  | 'podetail'
  | 'po_detail_new'
  | 'receipt'
  | 'issue'
  | 'issuedetail'
  | 'stock'
  | 'item_history'
  | 'inventory_value'
  | 'profit'
  | 'profit_loss'
  | 'balance_sheet'
  | 'supplier_payable'
  | 'payment_history_ap'
  | 'cash_bank_book'
  | 'budget'
  | 'estimation'
  | 'estimation_unpo';

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth(); // Get user
  const reportType = searchParams.get('type');
  const reportId = searchParams.get('id');

  // Helper to check permission
  const canAccess = (reportKey: string) => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    const allowed = Array.isArray(user.allowed_menus) ? user.allowed_menus : [];
    const allowedLower = allowed.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
    if (allowedLower.includes('*')) return true;
    return allowedLower.includes(String(reportKey).trim().toLowerCase());
  };

  const canAccessIssueDetail = () =>
    canAccess('report_issuedetail') ||
    canAccess('report_issue_detail') ||
    canAccess('report_goods_issue_detail') ||
    canAccess('report_issue');

  // Get the first allowed tab to set as default
  const getDefaultTab = () => {
      if (canAccess('report_po')) return 'po';
      if (canAccess('report_podetail')) return 'podetail';
      if (canAccess('report_po_detail_new')) return 'po_detail_new'; // Tambahkan key untuk laporan baru
      if (canAccess('report_receipt')) return 'receipt';
      if (canAccess('report_stock')) return 'stock';
      if (canAccess('report_stock')) return 'item_history'; // Reuse stock permission
      if (canAccess('report_stock')) return 'inventory_value'; // Reuse stock permission
      if (canAccessIssueDetail()) return 'issuedetail';
      if (canAccess('report_issue')) return 'issue';
      if (canAccess('report_wo')) return 'wo';
      if (canAccess('report_vehicle_entry')) return 'vehicle_entry';
      if (canAccess('report_profit')) return 'profit';
      if (canAccess('report_profit_loss')) return 'profit_loss';
      if (canAccess('report_balance_sheet')) return 'balance_sheet';
      if (canAccess('report_supplier_payable')) return 'supplier_payable';
      if (canAccess('report_payment_history_ap')) return 'payment_history_ap';
      if (canAccess('report_cash_bank_book')) return 'cash_bank_book';
      if (canAccess('report_estimation')) return 'estimation';
      if (canAccess('report_unordered_parts')) return 'estimation_unpo';
      if (canAccess('report_budget')) return 'budget';
      return '';
  };

  const defaultTab = getDefaultTab() as ReportKey | '';

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

  const activeTab = (searchParams.get('tab') as ReportKey | null) || defaultTab;

  const reportGroups: Array<{
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    items: Array<{ key: ReportKey; label: string; visible: boolean }>;
  }> = [
    {
      title: 'Operasional',
      icon: Wrench,
      items: [
        { key: 'vehicle_entry', label: 'Unit Masuk', visible: canAccess('report_vehicle_entry') },
        { key: 'wo', label: 'Work Order', visible: canAccess('report_wo') },
        { key: 'wodetail', label: 'Detail WO', visible: canAccess('report_wo') },
        { key: 'po', label: 'Pembelian (PO)', visible: canAccess('report_po') },
        { key: 'podetail', label: 'Rincian Pembelian', visible: canAccess('report_podetail') },
        { key: 'po_detail_new', label: 'Rincian Pembelian (Detail)', visible: canAccess('report_po_detail_new') },
        { key: 'receipt', label: 'Barang Masuk', visible: canAccess('report_receipt') },
        { key: 'issue', label: 'Rekap Keluar', visible: canAccess('report_issue') },
        { key: 'issuedetail', label: 'Detail Barang Keluar', visible: canAccessIssueDetail() },
        { key: 'estimation', label: 'Estimasi vs Realisasi', visible: canAccess('report_estimation') },
        { key: 'estimation_unpo', label: 'Estimasi Part Belum PO', visible: canAccess('report_unordered_parts') },
      ],
    },
    {
      title: 'Persediaan',
      icon: Package,
      items: [
        { key: 'stock', label: 'Stok Barang', visible: canAccess('report_stock') },
        { key: 'item_history', label: 'History Item / Kartu Stok', visible: canAccess('report_stock') },
        { key: 'inventory_value', label: 'Nilai Persediaan', visible: canAccess('report_stock') },
      ],
    },
    {
      title: 'Keuangan',
      icon: Wallet,
      items: [
        { key: 'profit', label: 'Laba Kotor', visible: canAccess('report_profit') },
        { key: 'profit_loss', label: 'Laba Rugi', visible: canAccess('report_profit_loss') },
        { key: 'balance_sheet', label: 'Neraca', visible: canAccess('report_balance_sheet') },
        { key: 'supplier_payable', label: 'Hutang Supplier', visible: canAccess('report_supplier_payable') },
        { key: 'payment_history_ap', label: 'Riwayat Bayar Hutang', visible: canAccess('report_payment_history_ap') },
        { key: 'cash_bank_book', label: 'Buku Bank/Kas', visible: canAccess('report_cash_bank_book') },
        { key: 'budget', label: 'Monitoring Pagu', visible: canAccess('report_budget') },
      ],
    },
  ];

  const visibleReportKeys = reportGroups
    .flatMap((g) => g.items)
    .filter((x) => x.visible)
    .map((x) => x.key);

  const effectiveTab = visibleReportKeys.includes(activeTab) ? activeTab : defaultTab;

  const setTab = (key: ReportKey) => {
    const next = new URLSearchParams(searchParams);
    next.delete('type');
    next.delete('id');
    next.set('tab', key);
    setSearchParams(next);
  };

  const renderReport = (key: ReportKey) => {
    if (key === 'vehicle_entry') return <VehicleEntryReport />;
    if (key === 'wo') return <WorkOrderReport />;
    if (key === 'wodetail') return <WorkOrderDetailReport />;
    if (key === 'po') return <PurchaseOrderReport />;
    if (key === 'podetail') return <PurchaseDetailReport />;
    if (key === 'po_detail_new') return <PurchaseOrderDetailReport />;
    if (key === 'receipt') return <GoodsReceiptReport />;
    if (key === 'issue') return <GoodsIssueReport />;
    if (key === 'issuedetail') return <GoodsIssueDetailReport />;
    if (key === 'stock') return <StockReport />;
    if (key === 'item_history') return <ItemHistoryReport />;
    if (key === 'inventory_value') return <InventoryValueReport />;
    if (key === 'profit') return <GrossProfitReport />;
    if (key === 'profit_loss') return <ProfitLossReport />;
    if (key === 'balance_sheet') return <BalanceSheetReport />;
    if (key === 'supplier_payable') return <SupplierPayableReport />;
    if (key === 'payment_history_ap') return <PurchasePaymentHistoryReport />;
    if (key === 'cash_bank_book') return <CashBankBookReport />;
    if (key === 'estimation') return <EstimationVsRealizationReport />;
    if (key === 'estimation_unpo') return <UnorderedSparepartEstimationReport />;
    if (key === 'budget') return <BudgetMonitoringReport />;
    return null;
  };

  const activeLabel =
    reportGroups
      .flatMap((g) => g.items)
      .find((x) => x.key === effectiveTab)?.label || 'Laporan';

  return (
    <div className="report-print-scope space-y-8 animate-in fade-in duration-500 pb-10">
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

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        <Card className="print:hidden">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
              <span>Pilih Laporan</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{activeLabel}</div>
          </div>
          <div className="p-2 space-y-2">
            {reportGroups.map((group) => {
              const visible = group.items.filter((x) => x.visible);
              if (visible.length === 0) return null;
              const GroupIcon = group.icon;
              return (
                <div key={group.title} className="px-2 py-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-2">
                    <GroupIcon className="h-3.5 w-3.5" />
                    <span>{group.title}</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {visible.map((item) => {
                      const active = item.key === effectiveTab;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setTab(item.key)}
                          className={cn(
                            'w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                            active
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-700 hover:bg-slate-100'
                          )}
                        >
                          <span className="truncate">{item.label}</span>
                          <ChevronRight className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-slate-400')} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="min-h-[500px]">
          {renderReport(effectiveTab)}
        </div>
      </div>
    </div>
  );
}
