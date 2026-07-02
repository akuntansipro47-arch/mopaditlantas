import type { ReactNode } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Toaster } from "sonner";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import PermissionRoute from "@/components/layout/PermissionRoute";
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
import SalesInvoiceDisabled from "@/pages/finance/SalesInvoiceDisabled";
import CashBank from "@/pages/finance/CashBank";
import ManualJournalEntry from "@/pages/finance/ManualJournalEntry";
import GeneralLedger from "@/pages/finance/GeneralLedger";

// Kepegawaian
import EmployeeData from "@/pages/hr/EmployeeData";

// Admin
import UserManagement from "@/pages/admin/UserManagement";
import AgencyProfile from "@/pages/admin/AgencyProfile";
import AdminBackup from "@/pages/admin/AdminBackup";
import DebugSync from "@/pages/DebugSync";
import PrintSuratJalan from "@/pages/print/PrintSuratJalan";
import PrintSPK from "@/pages/print/PrintSPK";
import PrintVehicleEntry from "@/pages/print/PrintVehicleEntry";
import PrintGoodsIssue from "@/pages/print/PrintGoodsIssue";
import PrintGoodsReceipt from "@/pages/print/PrintGoodsReceipt";
import PrintPO from "@/pages/print/PrintPO";
import PrintPODotMatrix from "@/pages/print/PrintPODotMatrix";
import PrintSPKDotMatrix from "@/pages/print/PrintSPKDotMatrix";

export default function App() {
  const guardByPermission = (
    element: ReactNode,
    permissions: string[],
    description?: string,
  ) => (
    <PermissionRoute permissions={permissions} description={description}>
      {element}
    </PermissionRoute>
  );

  const guardSuperAdmin = (element: ReactNode, description?: string) => (
    <PermissionRoute requireSuperAdmin description={description}>
      {element}
    </PermissionRoute>
  );

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route
                path="/"
                element={guardByPermission(<Dashboard />, ['dashboard', 'dashboard_repeat_wo'], 'Anda tidak memiliki izin untuk membuka dashboard.')}
              />
              <Route
                path="/reports"
                element={
                  <PermissionRoute
                    requireReports
                    description="Anda tidak memiliki izin untuk membuka pusat laporan."
                  >
                    <Reports />
                  </PermissionRoute>
                }
              />

              {/* Master Data */}
              <Route path="/master/vehicles" element={guardByPermission(<Vehicles />, ['master_vehicles'])} />
              <Route path="/master/goods" element={guardByPermission(<Goods />, ['master_goods'])} />
              <Route path="/master/budget" element={guardByPermission(<Budget />, ['master_budget'])} />
              <Route path="/master/jobs" element={guardByPermission(<Jobs />, ['master_jobs'])} />
              <Route path="/master/suppliers" element={guardByPermission(<Suppliers />, ['master_suppliers'])} />
              <Route path="/master/mechanics" element={guardByPermission(<Mechanics />, ['master_mechanics'])} />
              <Route path="/master/coa" element={guardByPermission(<ChartOfAccounts />, ['master_coa'])} />

              {/* Transaksi */}
              <Route path="/transactions/entry" element={guardByPermission(<VehicleEntry />, ['trans_entry'])} />
              <Route path="/transactions/wo" element={guardByPermission(<WorkOrder />, ['trans_wo'])} />
              <Route path="/transactions/po" element={guardByPermission(<PurchaseOrderV2 />, ['trans_po'])} />
              <Route path="/transactions/receive" element={guardByPermission(<GoodsReceipt />, ['trans_receive'])} />
              <Route path="/transactions/issue" element={guardByPermission(<GoodsIssue />, ['trans_issue'])} />
              <Route path="/transactions/po-return" element={guardByPermission(<PurchaseOrderReturn />, ['trans_po_return'])} />

              {/* Keuangan */}
              <Route path="/finance/payments" element={guardByPermission(<PurchasePayment />, ['finance_payments'])} />
              <Route path="/finance/sales" element={guardByPermission(<SalesInvoiceDisabled />, ['finance_sales'])} />
              <Route path="/finance/cash-bank" element={guardByPermission(<CashBank />, ['finance_cash'])} />
              <Route path="/finance/journal-entry" element={guardByPermission(<ManualJournalEntry />, ['finance_journal'])} />
              <Route path="/finance/general-ledger" element={guardByPermission(<GeneralLedger />, ['finance_gl'])} />

              {/* Kepegawaian */}
              <Route path="/hr/employees" element={guardByPermission(<EmployeeData />, ['hr_employees'])} />

              {/* Admin */}
              <Route
                path="/admin/users"
                element={guardSuperAdmin(<UserManagement />, 'Halaman manajemen user hanya untuk Super Admin.')}
              />
              <Route
                path="/admin/agency"
                element={guardSuperAdmin(<AgencyProfile />, 'Halaman profil instansi hanya untuk Super Admin.')}
              />
              <Route
                path="/admin/backup"
                element={guardSuperAdmin(<AdminBackup />, 'Halaman backup hanya untuk Super Admin.')}
              />
              <Route
                path="/debug-sync"
                element={guardSuperAdmin(<DebugSync />, 'Halaman debug sinkronisasi hanya untuk Super Admin.')}
              />

            </Route>

            {/* Print Routes (Outside DashboardLayout for clean printing) */}
            <Route
              path="/print/surat-jalan/:id"
              element={guardByPermission(<PrintSuratJalan />, ['trans_wo', 'report_vehicle_exit'])}
            />
            <Route path="/print/spk/:id" element={guardByPermission(<PrintSPK />, ['trans_wo', 'trans_wo_reprint', 'report_wo'])} />
            <Route
              path="/print/spk-dot/:id"
              element={guardByPermission(<PrintSPKDotMatrix />, ['trans_wo', 'trans_wo_reprint', 'report_wo'])}
            />
            <Route
              path="/print/entry/:id"
              element={guardByPermission(<PrintVehicleEntry />, ['trans_entry', 'report_vehicle_entry'])}
            />
            <Route
              path="/print/issue/:id"
              element={guardByPermission(<PrintGoodsIssue />, ['trans_issue', 'report_issue', 'report_issuedetail'])}
            />
            <Route
              path="/print/receive/:id"
              element={guardByPermission(<PrintGoodsReceipt />, ['trans_receive', 'report_receipt'])}
            />
            <Route
              path="/print/po/:id"
              element={guardByPermission(<PrintPO />, ['trans_po', 'report_po', 'report_podetail', 'report_po_detail_new'])}
            />
            <Route
              path="/print/po-dot/:id"
              element={guardByPermission(<PrintPODotMatrix />, ['trans_po', 'report_po', 'report_podetail', 'report_po_detail_new'])}
            />
          </Route>
        </Routes>
      </Router>
      <Toaster />
    </AuthProvider>
  );
}
