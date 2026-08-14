import React from "react";
import { Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell.jsx";
import RequireAuth from "./hooks/RequireAuth.jsx";
import Dashboard from "./features/dashboard/DashboardPage.jsx";
import ProjectList from "./features/project/ProjectListPage.jsx";
import ProjectDetail from "./features/project/ProjectDetailPage.jsx";
import TicketList from "./features/ticket/TicketListPage.jsx";
import TicketDetail from "./features/ticket/TicketDetailPage.jsx";
import PMRequestList from "./features/pmrequest/PMRequestListPage.jsx";
import PMRequestDetail from "./features/pmrequest/PMRequestDetailPage.jsx";
import ContactList from "./features/contact/ContactListPage.jsx";
import CustomerDetailPage from "./features/contact/CustomerDetailPage.jsx";
import SiteDetailPage from "./features/contact/SiteDetailPage.jsx";
import StockSummary from "./features/stock/StockSummaryPage.jsx";
import StockTransferPage from "./features/stock/StockTransferPage.jsx";
import StockBorrowPage from "./features/stock/StockBorrowPage.jsx";
import StockRefundPage from "./features/stock/StockRefundPage.jsx";
import PurchaseRequestPage from "./features/stock/PurchaseRequestPage.jsx";
import SettingsPage from "./features/settings/SettingsPage.jsx";
import ChatPage from "./features/chat/ChatPage.jsx";
import Login from "./features/auth/LoginPage.jsx";
import Placeholder from "./components/ui/Placeholder.jsx";

// --- Sourcing module (TypeScript, English UI, Super Admin / Manager only) ---
import SourcingLayout from "./features/sourcing/SourcingLayout.jsx";
import { DashboardPage as SourcingDashboard } from "./features/sourcing/dashboard/DashboardPage";
import { FactoryPage } from "./features/sourcing/factories/FactoryPage";
import { ProductWorkspace } from "./features/sourcing/product/ProductWorkspace";
import { ComparePage as SourcingCompare } from "./features/sourcing/compare/ComparePage";
import { ReportsPage as SourcingReports } from "./features/sourcing/reports/ReportsPage";
import { SettingsPage as SourcingSettings } from "./features/sourcing/settings/SettingsPage";

// --- Accounting + Cash book (Admin / Manager / Super Admin) ---
import AccountingLayout from "./features/accounting/AccountingLayout.jsx";
import { DocumentListPage } from "./features/accounting/DocumentListPage";
import { DocumentEditorPage } from "./features/accounting/DocumentEditorPage";
import { CompanySettingsPage } from "./features/accounting/CompanySettingsPage";
import { VendorsPage } from "./features/accounting/VendorsPage";
import { ExportPage } from "./features/accounting/ExportPage";
import { CashBookPage } from "./features/cashbook/CashBookPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />

        <Route path="/project" element={<ProjectList />} />
        <Route path="/project/:code" element={<ProjectDetail />} />

        <Route path="/ticket" element={<TicketList />} />
        <Route path="/ticket/:code" element={<TicketDetail />} />

        <Route path="/pm-request" element={<PMRequestList />} />
        <Route path="/pm-request/:id" element={<PMRequestDetail />} />
        <Route path="/contact" element={<ContactList />} />
        <Route path="/contact/customer/:id" element={<CustomerDetailPage />} />
        <Route path="/contact/site/:id" element={<SiteDetailPage />} />

        <Route path="/stock" element={<StockSummary />} />
        <Route path="/stock/transfer" element={<StockTransferPage />} />
        <Route path="/stock/borrow" element={<StockBorrowPage />} />
        <Route path="/stock/refund" element={<StockRefundPage />} />
        <Route path="/stock/purchase-request" element={<PurchaseRequestPage />} />

        <Route path="/sourcing" element={<SourcingLayout />}>
          <Route index element={<SourcingDashboard />} />
          <Route path="factories" element={<FactoryPage />} />
          <Route path="products/:id" element={<ProductWorkspace />} />
          <Route path="compare" element={<SourcingCompare />} />
          <Route path="reports" element={<SourcingReports />} />
          <Route path="settings" element={<SourcingSettings />} />
        </Route>

        <Route element={<AccountingLayout />}>
          <Route path="/accounting" element={<CompanySettingsPage />} />
          <Route path="/accounting/settings" element={<CompanySettingsPage />} />
          <Route path="/accounting/vendors" element={<VendorsPage />} />
          <Route path="/accounting/export" element={<ExportPage />} />
          <Route path="/accounting/:docType" element={<DocumentListPage />} />
          <Route path="/accounting/:docType/new" element={<DocumentEditorPage />} />
          <Route path="/accounting/:docType/:id" element={<DocumentEditorPage />} />
          <Route path="/cashbook" element={<CashBookPage />} />
        </Route>

        <Route path="/report" element={<Placeholder title="Report" note="ต้องคุยว่ามีรายงานอะไรบ้าง, Export เป็น Excel/PDF ไหม — อยู่ใน Open Items ของ Spec" />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/chat" element={<ChatPage />} />

        <Route path="*" element={<Placeholder title="ไม่พบหน้านี้ (404)" />} />
      </Route>
    </Routes>
  );
}
