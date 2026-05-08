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
import CashFlowReport from './reports/CashFlowReport';
import VehicleEntryReport from './reports/VehicleEntryReport';
import VehicleExitReport from './reports/VehicleExitReport';
import EstimationVsRealizationReport from './reports/EstimationVsRealizationReport';
import UnorderedSparepartEstimationReport from './reports/UnorderedSparepartEstimationReport';
import BudgetMonitoringReport from './reports/BudgetMonitoringReport';
import ActivityLogReport from './reports/ActivityLogReport';
import { Card } from '@/components/ui/card';
import { Activity } from 'lucide-react';

type ReportKey =
  | 'vehicle_entry'
  | 'vehicle_exit'
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
  | 'cash_flow'
  | 'supplier_payable'
  | 'payment_history_ap'
  | 'cash_bank_book'
  | 'budget'
  | 'estimation'
  | 'estimation_unpo'
  | 'activity_log';

export default function Reports() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth(); // Get user
  const reportType = searchParams.get('type');
  const reportId = searchParams.get('id');

  // Helper to check permission
  const canAccess = (reportKey: string) => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    if (String(reportKey).trim().toLowerCase() === 'report_activity_log') return user.role === 'ADMIN';
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
      if (canAccess('report_vehicle_exit')) return 'vehicle_exit';
      if (canAccess('report_profit')) return 'profit';
      if (canAccess('report_profit_loss')) return 'profit_loss';
      if (canAccess('report_balance_sheet')) return 'balance_sheet';
      if (canAccess('report_cash_flow')) return 'cash_flow';
      if (canAccess('report_supplier_payable')) return 'supplier_payable';
      if (canAccess('report_payment_history_ap')) return 'payment_history_ap';
      if (canAccess('report_cash_bank_book')) return 'cash_bank_book';
      if (canAccess('report_estimation')) return 'estimation';
      if (canAccess('report_unordered_parts')) return 'estimation_unpo';
      if (canAccess('report_budget')) return 'budget';
      if (canAccess('report_activity_log')) return 'activity_log';
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
  const allowedTabs: ReportKey[] = [
    canAccess('report_vehicle_entry') ? 'vehicle_entry' : null,
    canAccess('report_vehicle_exit') ? 'vehicle_exit' : null,
    canAccess('report_wo') ? 'wo' : null,
    canAccess('report_wo') ? 'wodetail' : null,
    canAccess('report_po') ? 'po' : null,
    canAccess('report_podetail') ? 'podetail' : null,
    canAccess('report_po_detail_new') ? 'po_detail_new' : null,
    canAccess('report_receipt') ? 'receipt' : null,
    canAccess('report_issue') ? 'issue' : null,
    canAccessIssueDetail() ? 'issuedetail' : null,
    canAccess('report_stock') ? 'stock' : null,
    canAccess('report_stock') ? 'item_history' : null,
    canAccess('report_stock') ? 'inventory_value' : null,
    canAccess('report_profit') ? 'profit' : null,
    canAccess('report_profit_loss') ? 'profit_loss' : null,
    canAccess('report_balance_sheet') ? 'balance_sheet' : null,
    canAccess('report_cash_flow') ? 'cash_flow' : null,
    canAccess('report_supplier_payable') ? 'supplier_payable' : null,
    canAccess('report_payment_history_ap') ? 'payment_history_ap' : null,
    canAccess('report_cash_bank_book') ? 'cash_bank_book' : null,
    canAccess('report_estimation') ? 'estimation' : null,
    canAccess('report_unordered_parts') ? 'estimation_unpo' : null,
    canAccess('report_budget') ? 'budget' : null,
    canAccess('report_activity_log') ? 'activity_log' : null,
  ].filter(Boolean) as ReportKey[];

  const effectiveTab = allowedTabs.includes(activeTab) ? activeTab : defaultTab;

  const renderReport = (key: ReportKey) => {
    if (key === 'vehicle_entry') return <VehicleEntryReport />;
    if (key === 'vehicle_exit') return <VehicleExitReport />;
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
    if (key === 'cash_flow') return <CashFlowReport />;
    if (key === 'supplier_payable') return <SupplierPayableReport />;
    if (key === 'payment_history_ap') return <PurchasePaymentHistoryReport />;
    if (key === 'cash_bank_book') return <CashBankBookReport />;
    if (key === 'estimation') return <EstimationVsRealizationReport />;
    if (key === 'estimation_unpo') return <UnorderedSparepartEstimationReport />;
    if (key === 'budget') return <BudgetMonitoringReport />;
    if (key === 'activity_log') return <ActivityLogReport />;
    return null;
  };

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
      <Card className="min-h-[500px]">
        {renderReport(effectiveTab)}
      </Card>
    </div>
  );
}
