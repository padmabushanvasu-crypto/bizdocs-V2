import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
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
import DcGrn from "@/pages/DcGrn";
import DcGrnForm from "@/pages/DcGrnForm";
import PaymentReceipts from "@/pages/PaymentReceipts";
import MoreMenu from "@/pages/MoreMenu";
import CompanySettings from "@/pages/CompanySettings";
import SettingsPage from "@/pages/SettingsPage";
import JobWorks from "@/pages/JobWorks";
import JobWorkDetail from "@/pages/JobWorkDetail";
import StageTemplates from "@/pages/StageTemplates";
import WipRegister from "@/pages/WipRegister";
import VendorScorecards from "@/pages/VendorScorecards";
import VendorScorecardDetail from "@/pages/VendorScorecardDetail";
import GstReports from "@/pages/GstReports";
import NotificationsSettings from "@/pages/NotificationsSettings";
import BillOfMaterials from "@/pages/BillOfMaterials";
import AssemblyOrders from "@/pages/AssemblyOrders";
import AssemblyOrderDetail from "@/pages/AssemblyOrderDetail";
import StockLedger from "@/pages/StockLedger";
import DataImport from "@/pages/DataImport";
import DocumentSettings from "@/pages/DocumentSettings";
import SerialNumbers from "@/pages/SerialNumbers";
import FatCertificates from "@/pages/FatCertificates";
import FatCertificateDetail from "@/pages/FatCertificateDetail";
import WarrantyTracker from "@/pages/WarrantyTracker";
import SalesOrders from "@/pages/SalesOrders";
import SalesOrderForm from "@/pages/SalesOrderForm";
import SalesOrderDetail from "@/pages/SalesOrderDetail";
import DispatchNotes from "@/pages/DispatchNotes";
import DispatchNoteForm from "@/pages/DispatchNoteForm";
import DispatchNoteDetail from "@/pages/DispatchNoteDetail";
import ReorderIntelligence from "@/pages/ReorderIntelligence";
import ReorderRules from "@/pages/ReorderRules";
import ScrapRegister from "@/pages/ScrapRegister";
import AuditLog from "@/pages/AuditLog";
import HowToUse from "@/pages/HowToUse";
import NotFound from "@/pages/NotFound";
import ComponentJourney from "@/pages/ComponentJourney";
import JigMaster from "@/pages/JigMaster";
import SubAssemblyWorkOrders from "@/pages/SubAssemblyWorkOrders";
import FinishedGoodWorkOrders from "@/pages/FinishedGoodWorkOrders";
import AssemblyWorkOrderDetail from "@/pages/AssemblyWorkOrderDetail";
import StorekeeperQueue from "@/pages/StorekeeperQueue";
import GrnStoreQueue from "@/pages/GrnStoreQueue";
import GrnQueue from "@/pages/GrnQueue";
import QcQueue from "@/pages/QcQueue";
import UserManagement from "@/pages/UserManagement";
import DispatchRecords from "@/pages/DispatchRecords";
import DispatchRecordForm from "@/pages/DispatchRecordForm";
import DispatchRecordDetail from "@/pages/DispatchRecordDetail";
import ReadyToDispatch from "@/pages/ReadyToDispatch";
import ProcessLibrary from "@/pages/ProcessLibrary";
import JigMouldSettings from "@/pages/JigMouldSettings";
import AssetsRegister from "@/pages/AssetsRegister";
import OpeningStock from "@/pages/OpeningStock";
import DangerZone from "@/pages/DangerZone";
import { ImportQueueProvider } from "@/lib/import-queue";

function DcGrnRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/grn/${id}`} replace />;
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ImportQueueProvider>
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
              <Route path="/grn/new" element={<Navigate to="/grn" replace />} />
              <Route path="/grn/:id" element={<GRNDetail />} />
              <Route path="/dc-grn" element={<DcGrn />} />
              <Route path="/dc-grn/new" element={<Navigate to="/grn" replace />} />
              <Route path="/dc-grn/:id" element={<DcGrnRedirect />} />
              <Route path="/receipts" element={<PaymentReceipts />} />
              <Route path="/job-works" element={<JobWorks />} />
              <Route path="/job-works/:id" element={<JobWorkDetail />} />
              <Route path="/wip-register" element={<WipRegister />} />
              <Route path="/vendor-scorecards" element={<VendorScorecards />} />
              <Route path="/vendor-scorecards/:vendorId" element={<VendorScorecardDetail />} />
              <Route path="/gst-reports" element={<GstReports />} />
              <Route path="/settings/notifications" element={<NotificationsSettings />} />
              <Route path="/settings/documents" element={<DocumentSettings />} />
              <Route path="/settings/import" element={<DataImport />} />
              <Route path="/bill-of-materials" element={<BillOfMaterials />} />
              <Route path="/assembly-orders" element={<AssemblyOrders />} />
              <Route path="/assembly-orders/:id" element={<AssemblyOrderDetail />} />
              <Route path="/stock-ledger" element={<StockLedger />} />
              <Route path="/serial-numbers" element={<SerialNumbers />} />
              <Route path="/fat-certificates" element={<FatCertificates />} />
              <Route path="/fat-certificates/:id" element={<FatCertificateDetail />} />
              <Route path="/warranty-tracker" element={<WarrantyTracker />} />
              <Route path="/sales-orders" element={<SalesOrders />} />
              <Route path="/sales-orders/new" element={<SalesOrderForm />} />
              <Route path="/sales-orders/:id" element={<SalesOrderDetail />} />
              <Route path="/sales-orders/:id/edit" element={<SalesOrderForm />} />
              <Route path="/dispatch-notes" element={<DispatchNotes />} />
              <Route path="/dispatch-notes/new" element={<DispatchNoteForm />} />
              <Route path="/dispatch-notes/:id" element={<DispatchNoteDetail />} />
              <Route path="/dispatch-notes/:id/edit" element={<DispatchNoteForm />} />
              <Route path="/reorder-intelligence" element={<ReorderIntelligence />} />
              <Route path="/reorder-rules" element={<ReorderRules />} />
              <Route path="/scrap-register" element={<ScrapRegister />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/how-to-use" element={<HowToUse />} />
              <Route path="/settings/how-to-use" element={<HowToUse />} />
              <Route path="/stage-templates" element={<StageTemplates />} />
              <Route path="/component-journey" element={<ComponentJourney />} />
              <Route path="/jig-master" element={<JigMaster />} />
              <Route path="/sub-assembly-work-orders" element={<SubAssemblyWorkOrders />} />
              <Route path="/finished-good-work-orders" element={<FinishedGoodWorkOrders />} />
              <Route path="/assembly-work-orders/:id" element={<AssemblyWorkOrderDetail />} />
              <Route path="/storekeeper" element={<StorekeeperQueue />} />
              <Route path="/storekeeper-queue" element={<GrnStoreQueue />} />
              <Route path="/grn-queue" element={<GrnQueue />} />
              <Route path="/qc-queue" element={<QcQueue />} />
              <Route path="/settings/users" element={<UserManagement />} />
              <Route path="/dispatch-records" element={<DispatchRecords />} />
              <Route path="/dispatch-records/new" element={<DispatchRecordForm />} />
              <Route path="/dispatch-records/:id" element={<DispatchRecordDetail />} />
              <Route path="/dispatch-records/:id/edit" element={<DispatchRecordForm />} />
              <Route path="/ready-to-dispatch" element={<ReadyToDispatch />} />
              <Route path="/more" element={<MoreMenu />} />
              <Route path="/settings/company" element={<CompanySettings />} />
              <Route path="/settings/process-library" element={<ProcessLibrary />} />
              <Route path="/settings/jig-mould" element={<JigMouldSettings />} />
              <Route path="/settings/danger-zone" element={<DangerZone />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/assets-register" element={<AssetsRegister />} />
              <Route path="/opening-stock" element={<OpeningStock />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ImportQueueProvider>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
