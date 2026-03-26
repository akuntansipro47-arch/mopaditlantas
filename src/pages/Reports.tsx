import { useState, useEffect } from 'react';
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
import ProfitLossReport from './reports/ProfitLossReport';
import BalanceSheetReport from './reports/BalanceSheetReport';
import SupplierPayableReport from './reports/SupplierPayableReport';
import VehicleEntryReport from './reports/VehicleEntryReport';
import EstimationVsRealizationReport from './reports/EstimationVsRealizationReport';
import BudgetMonitoringReport from './reports/BudgetMonitoringReport';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { BarChart3, PieChart, FileText, Activity } from 'lucide-react';

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
      if (canAccess('report_receipt')) return 'receipt';
      if (canAccess('report_stock')) return 'stock';
      if (canAccess('report_stock')) return 'inventory_value'; // Reuse stock permission
      if (canAccessIssueDetail()) return 'issuedetail';
      if (canAccess('report_issue')) return 'issue';
      if (canAccess('report_wo')) return 'wo';
      if (canAccess('report_vehicle_entry')) return 'vehicle_entry';
      if (canAccess('report_profit')) return 'profit';
      if (canAccess('report_profit_loss')) return 'profit_loss';
      if (canAccess('report_balance_sheet')) return 'balance_sheet';
      if (canAccess('report_supplier_payable')) return 'supplier_payable';
      if (canAccess('report_estimation')) return 'estimation';
      if (canAccess('report_budget')) return 'budget';
      return '';
  };

  const defaultTab = getDefaultTab();

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pusat Laporan</h1>
          <p className="text-slate-500 mt-1">Analisis dan ringkasan data operasional secara real-time.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          <Activity className="h-4 w-4" />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
      
      <Tabs defaultValue={defaultTab} className="w-full">
        <div className="space-y-5 mb-8">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operasional</div>
            <TabsList className="w-full h-auto flex flex-wrap gap-2 bg-transparent p-0 justify-start">
              {canAccess('report_vehicle_entry') && (
                <TabsTrigger value="vehicle_entry" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Unit Masuk
                </TabsTrigger>
              )}
              {canAccess('report_wo') && (
                <TabsTrigger value="wo" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Work Order
                </TabsTrigger>
              )}
              {canAccess('report_wo') && (
                <TabsTrigger value="wodetail" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Detail WO
                </TabsTrigger>
              )}
              {canAccess('report_po') && (
                <TabsTrigger value="po" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Pembelian (PO)
                </TabsTrigger>
              )}
              {canAccess('report_podetail') && (
                <TabsTrigger value="podetail" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Rincian Pembelian
                </TabsTrigger>
              )}
              {canAccess('report_receipt') && (
                <TabsTrigger value="receipt" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Barang Masuk
                </TabsTrigger>
              )}
              {canAccess('report_issue') && (
                <TabsTrigger value="issue" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Rekap Keluar
                </TabsTrigger>
              )}
              {canAccessIssueDetail() && (
                <TabsTrigger value="issuedetail" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Detail Barang Keluar
                </TabsTrigger>
              )}
              {canAccess('report_estimation') && (
                <TabsTrigger value="estimation" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-orange-300 font-medium">
                  Estimasi vs Realisasi
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Persediaan</div>
            <TabsList className="w-full h-auto flex flex-wrap gap-2 bg-transparent p-0 justify-start">
              {canAccess('report_stock') && (
                <TabsTrigger value="stock" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-emerald-300 font-medium">
                  Stok Barang
                </TabsTrigger>
              )}
              {canAccess('report_stock') && (
                <TabsTrigger value="inventory_value" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-emerald-300 font-medium">
                  Nilai Persediaan
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Keuangan</div>
            <TabsList className="w-full h-auto flex flex-wrap gap-2 bg-transparent p-0 justify-start">
              {canAccess('report_profit') && (
                <TabsTrigger value="profit" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Laba Kotor
                </TabsTrigger>
              )}
              {canAccess('report_profit_loss') && (
                <TabsTrigger value="profit_loss" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Laba Rugi
                </TabsTrigger>
              )}
              {canAccess('report_balance_sheet') && (
                <TabsTrigger value="balance_sheet" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Neraca
                </TabsTrigger>
              )}
              {canAccess('report_supplier_payable') && (
                <TabsTrigger value="supplier_payable" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-indigo-300">
                  Hutang Supplier
                </TabsTrigger>
              )}
              {canAccess('report_budget') && (
                <TabsTrigger value="budget" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 bg-white px-4 py-2.5 rounded-lg transition-all hover:border-cyan-300 font-medium">
                  Monitoring Pagu
                </TabsTrigger>
              )}
            </TabsList>
          </div>
        </div>
        
        <div className="mt-6 min-h-[500px]">
          {canAccess('report_po') && <TabsContent value="po"><PurchaseOrderReport /></TabsContent>}
          {canAccess('report_podetail') && <TabsContent value="podetail"><PurchaseDetailReport /></TabsContent>}
          {canAccess('report_receipt') && <TabsContent value="receipt"><GoodsReceiptReport /></TabsContent>}
          {canAccess('report_stock') && <TabsContent value="stock"><StockReport /></TabsContent>}
          {canAccess('report_stock') && <TabsContent value="inventory_value"><InventoryValueReport /></TabsContent>}
          {canAccess('report_issue') && <TabsContent value="issue"><GoodsIssueReport /></TabsContent>}
          {canAccessIssueDetail() && <TabsContent value="issuedetail"><GoodsIssueDetailReport /></TabsContent>}
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
