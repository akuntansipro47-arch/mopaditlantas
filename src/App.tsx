import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AuthProvider } from "@/context/AuthContext";
// import { DemoProvider } from "@/context/DemoDataContext"; // Import DemoProvider (DISABLED)
import { Toaster } from "sonner";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import Login from "@/pages/auth/Login";
import Dashboard from "@/pages/Dashboard";
import Vehicles from "@/pages/master/Vehicles";
import Goods from "@/pages/master/Goods";
import Budget from "@/pages/master/Budget";
import Jobs from "@/pages/master/Jobs";
import Suppliers from "@/pages/master/Suppliers";
import Mechanics from "@/pages/master/Mechanics";
import ChartOfAccounts from "@/pages/master/ChartOfAccounts";
import VehicleEntry from "@/pages/transactions/VehicleEntry";
import PurchaseOrder from "@/pages/transactions/PurchaseOrderV2";
import PurchaseOrderReturn from "@/pages/transactions/PurchaseOrderReturn"; // New Import
import GoodsReceipt from "@/pages/transactions/GoodsReceipt";
import WorkOrder from "@/pages/transactions/WorkOrderV2";
import GoodsIssue from "@/pages/transactions/GoodsIssue";
import Reports from "@/pages/Reports";
import ItemHistoryReport from "@/pages/reports/ItemHistoryReport"; // New Import
import ProfitLossReport from "@/pages/reports/ProfitLossReport"; // Import P&L Report
import PrintPO from "@/pages/print/PrintPO";
import PrintSuratJalan from "@/pages/print/PrintSuratJalan";
import PrintVehicleEntry from "@/pages/print/PrintVehicleEntry";
import PrintGoodsIssue from "@/pages/print/PrintGoodsIssue";
import PrintInvoice from "@/pages/print/PrintInvoice";
import UserManagement from "@/pages/admin/UserManagement";
import DemoGenerator from "@/pages/admin/DemoGenerator"; // Import Demo
import AgencyProfile from "@/pages/admin/AgencyProfile";
import PurchasePayment from "@/pages/finance/PurchasePayment";
import SalesInvoice from "@/pages/finance/SalesInvoice"; // Import Sales Invoice
import CashBank from "@/pages/finance/CashBankV2";
import GeneralLedger from "@/pages/finance/GeneralLedger"; // Import GL
import ManualJournalEntry from "@/pages/finance/ManualJournalEntry"; // Import Manual Journal
import EmployeeData from "@/pages/hr/EmployeeData"; // Import HR


// ReportsUpdated to V2
// import ReloadPrompt from "@/components/ReloadPrompt";
import DebugDashboard from "@/pages/DebugDashboard";
import DebugSync from "@/pages/DebugSync"; // EMERGENCY DEBUG SYNC

export default function App() {
  console.log("App.tsx Loaded - Version DEBUG SYNC ADDED");
  return (
    <AuthProvider>
      {/* <DemoProvider> */}
        <Router>
        {/* <ReloadPrompt /> */}
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            {/* EMERGENCY DEBUG SYNC ROUTE */}
            <Route path="/debug-sync" element={<DebugSync />} />
            
            {/* Dedicated Print Routes (No Layout) */}
            <Route path="/print/po/:id" element={<PrintPO />} />
            <Route path="/print/surat-jalan/:id" element={<PrintSuratJalan />} />
            <Route path="/print/entry/:id" element={<PrintVehicleEntry />} />
            <Route path="/print/issue/:id" element={<PrintGoodsIssue />} />
            <Route path="/print/invoice/:id" element={<PrintInvoice />} />

            <Route element={<DashboardLayout />}>
              <Route path="/" element={<Dashboard />} />
              
              {/* Master Data */}
              <Route path="/master/vehicles" element={<Vehicles />} />
              <Route path="/master/goods" element={<Goods />} />
              <Route path="/master/budget" element={<Budget />} />
              <Route path="/master/jobs" element={<Jobs />} />
              <Route path="/master/suppliers" element={<Suppliers />} />
              <Route path="/master/mechanics" element={<Mechanics />} />
              <Route path="/master/coa" element={<ChartOfAccounts />} />
              
              {/* Transactions */}
              <Route path="/transactions/entry" element={<VehicleEntry />} />
              <Route path="/transactions/po" element={<PurchaseOrder />} />
              <Route path="/transactions/po-return" element={<PurchaseOrderReturn />} /> {/* New Route */}
              <Route path="/transactions/receive" element={<GoodsReceipt />} />
              <Route path="/transactions/wo" element={<WorkOrder />} />
              <Route path="/transactions/issue" element={<GoodsIssue />} />
              
              {/* Finance */}
              <Route path="/finance/payments" element={<PurchasePayment />} />
              <Route path="/finance/sales" element={<SalesInvoice />} /> {/* Sales Route */}
              <Route path="/finance/cash-bank" element={<CashBank />} />
              <Route path="/finance/journal-entry" element={<ManualJournalEntry />} /> {/* Manual Journal Route */}
              <Route path="/finance/general-ledger" element={<GeneralLedger />} />
              
              {/* HR */}
              <Route path="/hr/employees" element={<EmployeeData />} />

          {/* Report Routes */}
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/item-history" element={<ItemHistoryReport />} />
              <Route path="/reports/profit-loss" element={<ProfitLossReport />} />
              
              {/* Admin */}
              <Route path="/admin/users" element={<UserManagement />} />
              <Route path="/admin/agency" element={<AgencyProfile />} />
              <Route path="/admin/demo" element={<DemoGenerator />} /> {/* Demo Route */}
              <Route path="/debug" element={<DebugDashboard />} />
            </Route>
          </Route>
        </Routes>
      </Router>
      <Toaster />
      {/* </DemoProvider> */}
    </AuthProvider>
  );
}
