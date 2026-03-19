import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import CompanySetup from "@/pages/CompanySetup";
import Dashboard from "@/pages/Dashboard";
import PartiesList from "@/pages/PartiesList";
import PartyForm from "@/pages/PartyForm";
import PartyDetail from "@/pages/PartyDetail";
import Items from "@/pages/Items";
import StockRegister from "@/pages/StockRegister";
import InvoiceRegister from "@/pages/InvoiceRegister";
import InvoiceForm from "@/pages/InvoiceForm";
import InvoiceDetail from "@/pages/InvoiceDetail";
import OpenItems from "@/pages/OpenItems";
import PurchaseOrdersList from "@/pages/PurchaseOrdersList";
import PurchaseOrderForm from "@/pages/PurchaseOrderForm";
import PurchaseOrderDetail from "@/pages/PurchaseOrderDetail";
import DeliveryChallansRegister from "@/pages/DeliveryChallansRegister";
import DeliveryChallanForm from "@/pages/DeliveryChallanForm";
import DeliveryChallanDetail from "@/pages/DeliveryChallanDetail";
import DCRecordReturn from "@/pages/DCRecordReturn";
import GRNRegister from "@/pages/GRNRegister";
import GRNForm from "@/pages/GRNForm";
import GRNDetail from "@/pages/GRNDetail";
import PaymentReceipts from "@/pages/PaymentReceipts";
import MoreMenu from "@/pages/MoreMenu";
import CompanySettings from "@/pages/CompanySettings";
import SettingsPage from "@/pages/SettingsPage";
import JobCards from "@/pages/JobCards";
import JobCardDetail from "@/pages/JobCardDetail";
import StageTemplates from "@/pages/StageTemplates";
import WipRegister from "@/pages/WipRegister";
import VendorScorecards from "@/pages/VendorScorecards";
import GstReports from "@/pages/GstReports";
import NotificationsSettings from "@/pages/NotificationsSettings";
import BillOfMaterials from "@/pages/BillOfMaterials";
import AssemblyOrders from "@/pages/AssemblyOrders";
import AssemblyOrderDetail from "@/pages/AssemblyOrderDetail";
import StockLedger from "@/pages/StockLedger";
import DataImport from "@/pages/DataImport";
import DocumentSettings from "@/pages/DocumentSettings";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/setup" element={<ProtectedRoute requireCompany={false}><CompanySetup /></ProtectedRoute>} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/open-items" element={<OpenItems />} />
              <Route path="/parties" element={<PartiesList />} />
              <Route path="/parties/new" element={<PartyForm />} />
              <Route path="/parties/:id" element={<PartyDetail />} />
              <Route path="/parties/:id/edit" element={<PartyForm />} />
              <Route path="/items" element={<Items />} />
              <Route path="/stock-register" element={<StockRegister />} />
              <Route path="/invoices" element={<InvoiceRegister />} />
              <Route path="/invoices/new" element={<InvoiceForm />} />
              <Route path="/invoices/:id" element={<InvoiceDetail />} />
              <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
              <Route path="/purchase-orders" element={<PurchaseOrdersList />} />
              <Route path="/purchase-orders/new" element={<PurchaseOrderForm />} />
              <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
              <Route path="/purchase-orders/:id/edit" element={<PurchaseOrderForm />} />
              <Route path="/delivery-challans" element={<DeliveryChallansRegister />} />
              <Route path="/delivery-challans/new" element={<DeliveryChallanForm />} />
              <Route path="/delivery-challans/:id" element={<DeliveryChallanDetail />} />
              <Route path="/delivery-challans/:id/edit" element={<DeliveryChallanForm />} />
              <Route path="/delivery-challans/:id/record-return" element={<DCRecordReturn />} />
              <Route path="/grn" element={<GRNRegister />} />
              <Route path="/grn/new" element={<GRNForm />} />
              <Route path="/grn/:id" element={<GRNDetail />} />
              <Route path="/receipts" element={<PaymentReceipts />} />
              <Route path="/job-cards" element={<JobCards />} />
              <Route path="/job-cards/:id" element={<JobCardDetail />} />
              <Route path="/wip-register" element={<WipRegister />} />
              <Route path="/vendor-scorecards" element={<VendorScorecards />} />
              <Route path="/gst-reports" element={<GstReports />} />
              <Route path="/settings/notifications" element={<NotificationsSettings />} />
              <Route path="/settings/documents" element={<DocumentSettings />} />
              <Route path="/settings/import" element={<DataImport />} />
              <Route path="/bill-of-materials" element={<BillOfMaterials />} />
              <Route path="/assembly-orders" element={<AssemblyOrders />} />
              <Route path="/assembly-orders/:id" element={<AssemblyOrderDetail />} />
              <Route path="/stock-ledger" element={<StockLedger />} />
              <Route path="/stage-templates" element={<StageTemplates />} />
              <Route path="/more" element={<MoreMenu />} />
              <Route path="/settings/company" element={<CompanySettings />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
