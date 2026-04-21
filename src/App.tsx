import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { useRoleAccess } from "@/hooks/useRoleAccess";
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
import ReadyToMoveQueue from "@/pages/ReadyToMoveQueue";
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
import FollowUpTracker from "@/pages/FollowUpTracker";
import Consumables from "@/pages/Consumables";
import ConsumableIssueDetail from "@/pages/ConsumableIssueDetail";
import { ImportQueueProvider } from "@/lib/import-queue";

function PageGuard({ page, children }: { page: string; children: React.ReactNode; }) {
  const { canView } = useRoleAccess(page);
  if (!canView) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function DcGrnRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/grn/${id}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

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
              {/* ── Unguarded: accessible to all authenticated roles ── */}
              <Route path="/" element={<Dashboard />} />
              <Route path="/open-items" element={<PageGuard page="open-items"><OpenItems /></PageGuard>} />
              <Route path="/items" element={<Items />} />
              <Route path="/stock-register" element={<StockRegister />} />
              <Route path="/receipts" element={<PageGuard page="receipts"><PaymentReceipts /></PageGuard>} />
              <Route path="/assembly-orders" element={<AssemblyOrders />} />
              <Route path="/assembly-orders/:id" element={<AssemblyOrderDetail />} />
              <Route path="/warranty-tracker" element={<WarrantyTracker />} />
              <Route path="/sales-orders" element={<PageGuard page="sales-orders"><SalesOrders /></PageGuard>} />
              <Route path="/sales-orders/new" element={<PageGuard page="sales-orders"><SalesOrderForm /></PageGuard>} />
              <Route path="/sales-orders/:id" element={<PageGuard page="sales-orders"><SalesOrderDetail /></PageGuard>} />
              <Route path="/sales-orders/:id/edit" element={<PageGuard page="sales-orders"><SalesOrderForm /></PageGuard>} />
              <Route path="/dispatch-notes" element={<PageGuard page="dispatch-notes"><DispatchNotes /></PageGuard>} />
              <Route path="/dispatch-notes/new" element={<PageGuard page="dispatch-notes"><DispatchNoteForm /></PageGuard>} />
              <Route path="/dispatch-notes/:id" element={<PageGuard page="dispatch-notes"><DispatchNoteDetail /></PageGuard>} />
              <Route path="/dispatch-notes/:id/edit" element={<PageGuard page="dispatch-notes"><DispatchNoteForm /></PageGuard>} />
              <Route path="/reorder-rules" element={<PageGuard page="reorder-rules"><ReorderRules /></PageGuard>} />
              <Route path="/audit-log" element={<PageGuard page="audit-log"><AuditLog /></PageGuard>} />
              <Route path="/how-to-use" element={<HowToUse />} />
              <Route path="/settings/how-to-use" element={<HowToUse />} />
              <Route path="/stage-templates" element={<StageTemplates />} />
              <Route path="/component-journey" element={<ComponentJourney />} />
              <Route path="/assembly-work-orders/:id" element={<AssemblyWorkOrderDetail />} />
              <Route path="/grn-queue" element={<GrnQueue />} />
              <Route path="/qc-queue" element={<QcQueue />} />
              <Route path="/more" element={<MoreMenu />} />

              {/* ── Role-guarded routes ── */}
              <Route path="/parties" element={<PageGuard page="parties"><PartiesList /></PageGuard>} />
              <Route path="/parties/new" element={<PageGuard page="parties"><PartyForm /></PageGuard>} />
              <Route path="/parties/:id" element={<PageGuard page="parties"><PartyDetail /></PageGuard>} />
              <Route path="/parties/:id/edit" element={<PageGuard page="parties"><PartyForm /></PageGuard>} />

              <Route path="/invoices" element={<PageGuard page="invoices"><InvoiceRegister /></PageGuard>} />
              <Route path="/invoices/new" element={<PageGuard page="invoices"><InvoiceForm /></PageGuard>} />
              <Route path="/invoices/:id" element={<PageGuard page="invoices"><InvoiceDetail /></PageGuard>} />
              <Route path="/invoices/:id/edit" element={<PageGuard page="invoices"><InvoiceForm /></PageGuard>} />

              <Route path="/purchase-orders" element={<PageGuard page="purchase-orders"><PurchaseOrdersList /></PageGuard>} />
              <Route path="/purchase-orders/new" element={<PageGuard page="purchase-orders"><PurchaseOrderForm /></PageGuard>} />
              <Route path="/purchase-orders/:id" element={<PageGuard page="purchase-orders"><PurchaseOrderDetail /></PageGuard>} />
              <Route path="/purchase-orders/:id/edit" element={<PageGuard page="purchase-orders"><PurchaseOrderForm /></PageGuard>} />

              <Route path="/delivery-challans" element={<PageGuard page="delivery-challans"><DeliveryChallansRegister /></PageGuard>} />
              <Route path="/delivery-challans/new" element={<PageGuard page="delivery-challans"><DeliveryChallanForm /></PageGuard>} />
              <Route path="/delivery-challans/:id" element={<PageGuard page="delivery-challans"><DeliveryChallanDetail /></PageGuard>} />
              <Route path="/delivery-challans/:id/edit" element={<PageGuard page="delivery-challans"><DeliveryChallanForm /></PageGuard>} />
              <Route path="/delivery-challans/:id/record-return" element={<PageGuard page="delivery-challans"><DCRecordReturn /></PageGuard>} />

              <Route path="/grn" element={<PageGuard page="grn"><GRNRegister /></PageGuard>} />
              <Route path="/grn/new" element={<PageGuard page="grn"><GRNForm /></PageGuard>} />
              <Route path="/grn/:id" element={<PageGuard page="grn"><GRNDetail /></PageGuard>} />

              <Route path="/follow-up-tracker" element={<PageGuard page="follow-up-tracker"><FollowUpTracker /></PageGuard>} />

              <Route path="/dc-grn" element={<PageGuard page="dc-grn"><DcGrn /></PageGuard>} />
              <Route path="/dc-grn/new" element={<PageGuard page="dc-grn"><DcGrnForm /></PageGuard>} />
              <Route path="/dc-grn/:id" element={<PageGuard page="dc-grn"><DcGrnRedirect /></PageGuard>} />

              <Route path="/job-works" element={<PageGuard page="job-works"><JobWorks /></PageGuard>} />
              <Route path="/job-works/:id" element={<PageGuard page="job-works"><JobWorkDetail /></PageGuard>} />

              <Route path="/wip-register" element={<PageGuard page="wip-register"><WipRegister /></PageGuard>} />

              <Route path="/vendor-scorecards" element={<PageGuard page="vendor-scorecards"><VendorScorecards /></PageGuard>} />
              <Route path="/vendor-scorecards/:vendorId" element={<PageGuard page="vendor-scorecards"><VendorScorecardDetail /></PageGuard>} />

              <Route path="/gst-reports" element={<PageGuard page="gst-reports"><GstReports /></PageGuard>} />

              <Route path="/bill-of-materials" element={<PageGuard page="bill-of-materials"><BillOfMaterials /></PageGuard>} />

              <Route path="/stock-ledger" element={<PageGuard page="stock-ledger"><StockLedger /></PageGuard>} />

              <Route path="/serial-numbers" element={<PageGuard page="serial-numbers"><SerialNumbers /></PageGuard>} />

              <Route path="/fat-certificates" element={<PageGuard page="fat-certificates"><FatCertificates /></PageGuard>} />
              <Route path="/fat-certificates/:id" element={<PageGuard page="fat-certificates"><FatCertificateDetail /></PageGuard>} />

              <Route path="/reorder-intelligence" element={<PageGuard page="reorder-intelligence"><ReorderIntelligence /></PageGuard>} />

              <Route path="/scrap-register" element={<PageGuard page="scrap-register"><ScrapRegister /></PageGuard>} />

              <Route path="/jig-master" element={<PageGuard page="jig-master"><JigMaster /></PageGuard>} />

              <Route path="/sub-assembly-work-orders" element={<PageGuard page="sub-assembly-work-orders"><SubAssemblyWorkOrders /></PageGuard>} />
              <Route path="/finished-good-work-orders" element={<PageGuard page="finished-good-work-orders"><FinishedGoodWorkOrders /></PageGuard>} />

              <Route path="/storekeeper" element={<PageGuard page="storekeeper"><StorekeeperQueue /></PageGuard>} />
              <Route path="/storekeeper-queue" element={<PageGuard page="storekeeper-queue"><GrnStoreQueue /></PageGuard>} />
              <Route path="/ready-to-move" element={<PageGuard page="ready-to-move"><ReadyToMoveQueue /></PageGuard>} />

              <Route path="/dispatch-records" element={<PageGuard page="dispatch-records"><DispatchRecords /></PageGuard>} />
              <Route path="/dispatch-records/new" element={<PageGuard page="dispatch-records"><DispatchRecordForm /></PageGuard>} />
              <Route path="/dispatch-records/:id" element={<PageGuard page="dispatch-records"><DispatchRecordDetail /></PageGuard>} />
              <Route path="/dispatch-records/:id/edit" element={<PageGuard page="dispatch-records"><DispatchRecordForm /></PageGuard>} />

              <Route path="/ready-to-dispatch" element={<PageGuard page="ready-to-dispatch"><ReadyToDispatch /></PageGuard>} />

              <Route path="/assets-register" element={<PageGuard page="assets-register"><AssetsRegister /></PageGuard>} />

              <Route path="/opening-stock" element={<PageGuard page="opening-stock"><OpeningStock /></PageGuard>} />

              <Route path="/consumables" element={<PageGuard page="consumables"><Consumables /></PageGuard>} />
              <Route path="/consumables/:id" element={<PageGuard page="consumables"><ConsumableIssueDetail /></PageGuard>} />

              <Route path="/settings" element={<PageGuard page="settings"><SettingsPage /></PageGuard>} />
              <Route path="/settings/notifications" element={<PageGuard page="settings"><NotificationsSettings /></PageGuard>} />
              <Route path="/settings/documents" element={<PageGuard page="settings"><DocumentSettings /></PageGuard>} />
              <Route path="/settings/import" element={<PageGuard page="settings"><DataImport /></PageGuard>} />
              <Route path="/settings/users" element={<PageGuard page="settings"><UserManagement /></PageGuard>} />
              <Route path="/settings/company" element={<PageGuard page="settings"><CompanySettings /></PageGuard>} />
              <Route path="/settings/process-library" element={<PageGuard page="settings"><ProcessLibrary /></PageGuard>} />
              <Route path="/settings/jig-mould" element={<PageGuard page="settings"><JigMouldSettings /></PageGuard>} />
              <Route path="/settings/danger-zone" element={<PageGuard page="settings"><DangerZone /></PageGuard>} />
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
