import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Toaster } from "sonner";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import Login from "@/pages/auth/Login";
import Dashboard from "@/pages/Dashboard";
import Reports from "@/pages/Reports";

// Master Data
import Vehicles from "@/pages/master/Vehicles";
import Goods from "@/pages/master/Goods";
import Budget from "@/pages/master/Budget";
import Jobs from "@/pages/master/Jobs";
import Suppliers from "@/pages/master/Suppliers";
import Mechanics from "@/pages/master/Mechanics";
import ChartOfAccounts from "@/pages/master/ChartOfAccounts";

// Transaksi
import VehicleEntry from "@/pages/transactions/VehicleEntry";
import WorkOrder from "@/pages/transactions/WorkOrder";
import PurchaseOrderV2 from "@/pages/transactions/PurchaseOrderV2";
import GoodsReceipt from "@/pages/transactions/GoodsReceipt";
import GoodsIssue from "@/pages/transactions/GoodsIssue";
import PurchaseOrderReturn from "@/pages/transactions/PurchaseOrderReturn";

// Keuangan
import PurchasePayment from "@/pages/finance/PurchasePayment";
import SalesInvoice from "@/pages/finance/SalesInvoice";
import CashBank from "@/pages/finance/CashBank";
import ManualJournalEntry from "@/pages/finance/ManualJournalEntry";
import GeneralLedger from "@/pages/finance/GeneralLedger";

// Kepegawaian
import EmployeeData from "@/pages/hr/EmployeeData";

// Admin
import UserManagement from "@/pages/admin/UserManagement";
import AgencyProfile from "@/pages/admin/AgencyProfile";
import DebugSync from "@/pages/DebugSync";
import PrintSuratJalan from "@/pages/print/PrintSuratJalan";
import PrintSPK from "@/pages/print/PrintSPK";
import PrintVehicleEntry from "@/pages/print/PrintVehicleEntry";
import PrintGoodsIssue from "@/pages/print/PrintGoodsIssue";
import PrintPO from "@/pages/print/PrintPO";
import PrintPODotMatrix from "@/pages/print/PrintPODotMatrix";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/reports" element={<Reports />} />

              {/* Master Data */}
              <Route path="/master/vehicles" element={<Vehicles />} />
              <Route path="/master/goods" element={<Goods />} />
              <Route path="/master/budget" element={<Budget />} />
              <Route path="/master/jobs" element={<Jobs />} />
              <Route path="/master/suppliers" element={<Suppliers />} />
              <Route path="/master/mechanics" element={<Mechanics />} />
              <Route path="/master/coa" element={<ChartOfAccounts />} />

              {/* Transaksi */}
              <Route path="/transactions/entry" element={<VehicleEntry />} />
              <Route path="/transactions/wo" element={<WorkOrder />} />
              <Route path="/transactions/po" element={<PurchaseOrderV2 />} />
              <Route path="/transactions/receive" element={<GoodsReceipt />} />
              <Route path="/transactions/issue" element={<GoodsIssue />} />
              <Route path="/transactions/po-return" element={<PurchaseOrderReturn />} />

              {/* Keuangan */}
              <Route path="/finance/payments" element={<PurchasePayment />} />
              <Route path="/finance/sales" element={<SalesInvoice />} />
              <Route path="/finance/cash-bank" element={<CashBank />} />
              <Route path="/finance/journal-entry" element={<ManualJournalEntry />} />
              <Route path="/finance/general-ledger" element={<GeneralLedger />} />

              {/* Kepegawaian */}
              <Route path="/hr/employees" element={<EmployeeData />} />

              {/* Admin */}
              <Route path="/admin/users" element={<UserManagement />} />
              <Route path="/admin/agency" element={<AgencyProfile />} />
              <Route path="/debug-sync" element={<DebugSync />} />

            </Route>

            {/* Print Routes (Outside DashboardLayout for clean printing) */}
            <Route path="/print/surat-jalan/:id" element={<PrintSuratJalan />} />
            <Route path="/print/spk/:id" element={<PrintSPK />} />
            <Route path="/print/entry/:id" element={<PrintVehicleEntry />} />
            <Route path="/print/issue/:id" element={<PrintGoodsIssue />} />
            <Route path="/print/po/:id" element={<PrintPO />} />
            <Route path="/print/po-dot/:id" element={<PrintPODotMatrix />} />
          </Route>
        </Routes>
      </Router>
      <Toaster />
    </AuthProvider>
  );
}
