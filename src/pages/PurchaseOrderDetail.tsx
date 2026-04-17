import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Edit, Copy, X, ShoppingCart, Clock, CheckCircle2, AlertCircle, Package, Trash2, ChevronLeft, IndianRupee, Eye, EyeOff, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { EditableSection } from "@/components/EditableSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { fetchCompanySettings, fetchDocumentSettings } from "@/lib/settings-api";
import {
  fetchPurchaseOrder,
  cancelPurchaseOrder,
  duplicatePurchaseOrder,
  issuePurchaseOrder,
  softDeletePurchaseOrder,
  updatePOPayment,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  markRejectionNoted,
  type PurchaseOrder,
} from "@/lib/purchase-orders-api";
import { fetchGRNsForPO, createGrnFromPO } from "@/lib/grn-api";
import { formatCurrency, amountInWords } from "@/lib/gst-utils";
import { AuditTimeline } from "@/components/AuditTimeline";
import { logAudit } from "@/lib/audit-api";
import { DocumentHeader } from "@/components/DocumentHeader";
import { DocumentActions } from "@/components/DocumentActions";
import { DocumentSignature } from "@/components/DocumentSignature";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useAuth } from "@/hooks/useAuth";

const statusClass: Record<string, string> = {
  draft: "status-draft",
  approved: "bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  issued: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_received: "status-overdue",
  fully_received: "status-paid",
  cancelled: "status-cancelled",
  closed: "status-draft",
  pending_approval: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  rejected: "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", approved: "Approved", issued: "Issued", partially_received: "Partially Received",
  fully_received: "Fully Received", cancelled: "Cancelled", closed: "Closed",
  pending_approval: "Pending Approval", rejected: "Rejected",
};

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hideCosts } = useRoleAccess();
  const { role, profile } = useAuth();
  const isFinanceOrAdmin = role === 'admin' || role === 'finance';
  const isPurchaseTeam = role === 'purchase_team';
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteCustomReason, setDeleteCustomReason] = useState('');

  const DELETION_REASONS_PO = [
    { value: 'data_entry_error',        label: 'Data entry error' },
    { value: 'duplicate_entry',         label: 'Duplicate entry' },
    { value: 'wrong_vendor',            label: 'Wrong vendor / supplier selected' },
    { value: 'cancelled_by_management', label: 'Cancelled by management' },
    { value: 'other',                   label: 'Other (please specify)' },
  ];
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [printPreview, setPrintPreview] = useState(false);

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => fetchPurchaseOrder(id!),
    enabled: !!id,
  });

  const { data: grnHistory } = useQuery({
    queryKey: ["grns-for-po", id],
    queryFn: () => fetchGRNsForPO(id!),
    enabled: !!id,
  });

  const { data: company } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });

  const { data: poDocSettings } = useQuery({
    queryKey: ["document-settings", "purchase_order"],
    queryFn: () => fetchDocumentSettings("purchase_order"),
    staleTime: 5 * 60 * 1000,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await cancelPurchaseOrder(id!, cancelReason);
      await logAudit("purchase_order", id!, "cancelled", { reason: cancelReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      setCancelOpen(false);
      toast({ title: "PO Cancelled" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicatePurchaseOrder(id!),
    onSuccess: (newPO) => {
      toast({ title: "PO Duplicated", description: "A new draft PO has been created." });
      navigate(`/purchase-orders/${(newPO as any).id}/edit`);
    },
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      await issuePurchaseOrder(id!);
      await logAudit("purchase_order", id!, "issued");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      toast({ title: "PO Issued" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reason: string) => {
      await softDeletePurchaseOrder(id!, reason);
      await logAudit("purchase_order", id!, "deleted", { reason });
    },
    onSuccess: () => {
      toast({ title: "Purchase order deleted" });
      navigate("/purchase-orders");
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const getPOFinalReason = () =>
    deleteReason === 'other'
      ? deleteCustomReason.trim()
      : DELETION_REASONS_PO.find(r => r.value === deleteReason)?.label ?? deleteReason;

  const handleConfirmDeletePO = () => {
    if (!deleteReason) return;
    if (deleteReason === 'other' && !deleteCustomReason.trim()) return;
    deleteMutation.mutate(getPOFinalReason());
  };

  const createGrnMutation = useMutation({
    mutationFn: () => createGrnFromPO({ po_id: id!, date: new Date().toISOString().split("T")[0] }),
    onSuccess: (newGrn) => {
      navigate(`/grn/${(newGrn as any).id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error creating GRN", description: err.message, variant: "destructive" });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: () =>
      updatePOPayment(
        id!,
        {
          amount_paid: Number(paymentAmount),
          payment_date: paymentDate,
          payment_reference: paymentReference,
          payment_notes: paymentNotes,
        },
        po!.grand_total
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setPaymentOpen(false);
      toast({ title: "Payment recorded" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      const approvedBy = profile?.display_name || profile?.full_name || profile?.email || "Finance";
      return approvePurchaseOrder(id!, approvedBy);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-pending-approval-count"] });
      toast({ title: "PO Approved", description: "PO moved to Draft — it can now be issued." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectPurchaseOrder(id!, rejectReason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-pending-approval-count"] });
      queryClient.invalidateQueries({ queryKey: ["po-unread-rejection-count"] });
      setRejectOpen(false);
      setRejectReason("");
      toast({ title: "PO Rejected", description: "The purchase team will be notified." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const markNotedMutation = useMutation({
    mutationFn: () => markRejectionNoted(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-unread-rejection-count"] });
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!po) return <div className="p-6 text-muted-foreground">Purchase order not found.</div>;

  const items = po.line_items || [];
  const itemCount = items.length;
  const compactClass = itemCount > 12 ? ' ultra-compact' : itemCount > 8 ? ' compact' : '';
  const isSameState = po.vendor_state_code === "33";
  const charges = po.additional_charges || [];
  const canRecordReceipt = ["approved", "issued", "partially_received"].includes(po.status) && po.status !== "deleted";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto po-page-wrapper">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm 10mm; }

          /* Outer page wrapper — strip screen padding/max-width */
          .po-page-wrapper {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }

          /* Page wrapper — flex column so footer pins to bottom */
          .po-print-wrapper {
            display: flex !important;
            flex-direction: column !important;
            min-height: 277mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            gap: 4px !important;
          }

          /* Override Tailwind space-y-4 which adds 16px between every child */
          .po-print-wrapper > :not([hidden]) ~ :not([hidden]) { margin-top: 4px !important; }

          /* Section dividers */
          .po-section { page-break-inside: avoid; margin-bottom: 2px !important; }

          /* Footer pins to bottom */
          .po-footer { margin-top: auto !important; }

          /* Body base */
          body { font-size: 9.5pt !important; line-height: 1.35 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* Line items table — default */
          .po-line-items-table th { font-size: 9.5pt !important; padding: 4px 5px !important; }
          .po-line-items-table td { font-size: 9.5pt !important; padding: 4px 5px !important; line-height: 1.35 !important; white-space: nowrap !important; }
          .po-line-items-table td:nth-child(2) { white-space: normal !important; }
          .po-line-items-table tr { page-break-inside: avoid; }

          /* Compact — items > 8 */
          .po-print-wrapper.compact .po-line-items-table th { font-size: 7pt !important; padding: 1px 3px !important; }
          .po-print-wrapper.compact .po-line-items-table td { font-size: 7pt !important; padding: 1px 3px !important; line-height: 1.2 !important; }

          /* Ultra-compact — items > 12 */
          .po-print-wrapper.ultra-compact .po-line-items-table th { font-size: 6.5pt !important; padding: 1px 2px !important; }
          .po-print-wrapper.ultra-compact .po-line-items-table td { font-size: 6.5pt !important; padding: 1px 2px !important; line-height: 1.15 !important; }

          /* Navy/white alternating rows for print */
          .po-line-items-table thead tr th { background: #1E3A5F !important; color: #fff !important; border-color: #1E3A5F !important; }
          .po-line-items-table tbody tr:nth-child(odd) td { background: #fff !important; color: #000 !important; border-color: #e2e8f0 !important; }
          .po-line-items-table tbody tr:nth-child(even) td { background: #f8f8f8 !important; color: #000 !important; border-color: #e2e8f0 !important; }

          /* Totals block */
          .po-totals-block { font-size: 9pt !important; }
          .po-totals-block .po-totals-row { padding: 2px 4px !important; }
          .po-totals-block .po-amount-words { font-size: 8pt !important; }
        }
      `}</style>
      <button
        onClick={() => navigate("/purchase-orders")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3 print:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Purchase Orders
      </button>
      {/* Approval banner — finance/admin sees this when PO is pending_approval */}
      {isFinanceOrAdmin && po.status === "pending_approval" && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 print:hidden">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">Awaiting your approval</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Requested by <strong>{po.approval_requested_by || "purchase team"}</strong>
                {po.approval_requested_at && (
                  <> on {new Date(po.approval_requested_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate(`/purchase-orders/${id}/edit`)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-red-200 hover:border-red-300"
              onClick={() => { setRejectReason(""); setRejectOpen(true); }}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
            <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
          </div>
        </div>
      )}

      {/* Approved banner — purchase_team sees this when their PO has been approved and is ready to issue */}
      {isPurchaseTeam && (po.status === "approved" || (po.status === "draft" && po.approved_at)) && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4 print:hidden">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-900">Approved — ready to issue</p>
              <p className="text-sm text-green-700 mt-0.5">
                Approved by <strong>{po.approved_by || "Finance"}</strong>
                {po.approved_at && (
                  <> on {new Date(po.approved_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>
                )}. Issue this PO to the vendor when ready.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending} className="shrink-0 bg-green-700 hover:bg-green-800 text-white border-0">
            Issue PO →
          </Button>
        </div>
      )}

      {/* Rejection banner — purchase_team sees this when their PO was rejected */}
      {isPurchaseTeam && po.status === "rejected" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 print:hidden">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-900">This PO was rejected</p>
              {po.rejection_reason && (
                <p className="text-sm text-red-700 mt-0.5">Reason: <strong>{po.rejection_reason}</strong></p>
              )}
              <p className="text-sm text-red-600 mt-1">This request has been rejected. Please raise a new PO request if still required.</p>
            </div>
            {!po.rejection_noted && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-red-700 border-red-200"
                onClick={() => markNotedMutation.mutate()}
                disabled={markNotedMutation.isPending}
              >
                Mark as Noted
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-display font-bold font-mono text-foreground">{po.po_number}</h1>
          <span className={statusClass[po.status] || "status-draft"}>{statusLabels[po.status] || po.status}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPrintPreview((p) => !p)}>
            {printPreview ? <><EyeOff className="h-3.5 w-3.5 mr-1" /> Exit Preview</> : <><Eye className="h-3.5 w-3.5 mr-1" /> Preview Print</>}
          </Button>
          <DocumentActions documentNumber={po.po_number} documentType="Purchase Order" documentData={po as Record<string, unknown>} />
          {(po.status === "draft" || po.status === "approved") && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/purchase-orders/${id}/edit`)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              {/* Hide top-bar Issue button for purchase_team when the approved banner (with its own Issue button) is visible */}
              {!(isPurchaseTeam && (po.status === "approved" || po.approved_at)) && (
                <Button size="sm" onClick={() => issueMutation.mutate()}>Issue PO →</Button>
              )}
            </>
          )}

          {po.status === "issued" && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/purchase-orders/${id}/edit`)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {canRecordReceipt && (
            <Button size="sm" disabled={createGrnMutation.isPending} onClick={() => createGrnMutation.mutate()}>
              <Package className="h-3.5 w-3.5 mr-1" /> {createGrnMutation.isPending ? "Creating GRN…" : "Record Receipt"}
            </Button>
          )}
          {!["draft", "approved", "cancelled", "deleted"].includes(po.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const outstanding = po.grand_total - (po.amount_paid ?? 0);
                setPaymentAmount(outstanding > 0 ? String(outstanding) : "");
                setPaymentDate(new Date().toISOString().split("T")[0]);
                setPaymentReference("");
                setPaymentNotes("");
                setPaymentOpen(true);
              }}
            >
              <IndianRupee className="h-3.5 w-3.5 mr-1" /> Record Payment
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => duplicateMutation.mutate()}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
          </Button>
          {isFinanceOrAdmin && !["cancelled", "closed", "fully_received", "deleted"].includes(po.status) && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          )}
          {!["deleted"].includes(po.status) && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => { setDeleteReason(''); setDeleteCustomReason(''); setDeleteOpen(true); }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* Document Preview */}
      <div className={`paper-card space-y-4 po-print-wrapper${printPreview ? " print-preview-active" : ""}${compactClass}`}>

        {/* ── SCREEN: standard header ── */}
        <div className="print:hidden">
          <DocumentHeader />
          <div className="text-center border-b border-border pb-3">
            <h2 className="text-lg font-display font-bold text-primary uppercase tracking-wider">Purchase Order</h2>
          </div>
        </div>

        {/* ── PRINT: compact 2-col header ── */}
        <div className="hidden print:block po-section" style={{ borderBottom: '0.5pt solid #CBD5E1', paddingBottom: '3px' }}>
          {/* Centered PO title above the 2-col grid */}
          <div style={{ textAlign: 'center', marginBottom: '5px' }}>
            <div style={{ fontWeight: '700', fontSize: '14pt', color: '#1E3A5F', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Purchase Order</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '56fr 44fr', gap: '8px', alignItems: 'flex-start' }}>
            {/* Left: Company info */}
            <div>
              {company?.logo_url && (
                <img src={company.logo_url} alt="Logo" style={{ height: '36px', marginBottom: '2px', objectFit: 'contain' }} />
              )}
              <div style={{ fontWeight: '700', fontSize: '13pt', lineHeight: 1.2, color: '#CC0000' }}>{company?.company_name}</div>
              <div style={{ fontSize: '8.5pt', color: '#475569', lineHeight: 1.4 }}>
                {(() => {
                  const c = company as any;
                  const reg1 = c?.registered_address_line1 || company?.address_line1;
                  const reg2 = c?.registered_address_line2 || company?.address_line2;
                  const regCity = c?.registered_city || company?.city;
                  const regState = c?.registered_state || company?.state;
                  const regPin = c?.registered_pin_code || company?.pin_code;
                  return [reg1, reg2, [regCity, regState].filter(Boolean).join(', '), regPin ? regPin : ''].filter(Boolean).join(', ');
                })()}
              </div>
              {company?.gstin && <div style={{ fontSize: '8.5pt', fontFamily: 'monospace' }}>GSTIN: {company.gstin}</div>}
              {company?.phone && <div style={{ fontSize: '8.5pt', color: '#475569' }}>Ph: {company.phone}</div>}
              {company?.email && <div style={{ fontSize: '8.5pt', color: '#475569' }}>{company.email}</div>}
            </div>
            {/* Right: PO details */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '700', fontSize: '11pt' }}>PO No: {po.po_number.replace("/-", "-")}</div>
              <div style={{ fontSize: '9.5pt' }}>Date: {new Date(po.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
              {(po as any).vendor_reference && <div style={{ fontSize: '9pt' }}>Vendor Ref: {(po as any).vendor_reference}</div>}
              {po.reference_number && <div style={{ fontSize: '9pt' }}>Ref: {po.reference_number}</div>}
            </div>
          </div>
        </div>

        {/* ── SCREEN: Vendor & PO Details ── */}
        <div className="print:hidden">
          <EditableSection
            editable={po.status === "draft" || po.status === "approved" || po.status === "issued"}
            onEdit={() => navigate(`/purchase-orders/${id}/edit`)}
            label="Click to edit"
            className="p-4 -mx-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">To</p>
                <p className="font-medium text-foreground">{po.vendor_name}</p>
                {po.vendor_address && <p className="text-sm text-muted-foreground">{po.vendor_address}</p>}
                {po.vendor_gstin && <p className="text-sm font-mono">GSTIN: {po.vendor_gstin}</p>}
                {po.vendor_phone && <p className="text-sm text-muted-foreground">Ph: {po.vendor_phone}</p>}
                {(po as any).vendor_email && <p className="text-sm text-muted-foreground">{(po as any).vendor_email}</p>}
              </div>
              <div className="text-left md:text-right space-y-1">
                <div className="flex md:justify-end gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">PO No.</p>
                    <p className="font-mono font-medium">{po.po_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p>{new Date(po.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                  </div>
                </div>
                {(po as any).vendor_reference && (
                  <div className="md:text-right">
                    <p className="text-xs text-muted-foreground">Vendor Reference</p>
                    <p className="text-sm">{(po as any).vendor_reference}</p>
                  </div>
                )}
                {po.reference_number && (
                  <div className="md:text-right">
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <p className="text-sm">{po.reference_number}</p>
                  </div>
                )}
                {po.payment_terms && (
                  <div className="md:text-right">
                    <p className="text-xs text-muted-foreground">Payment Terms</p>
                    <p className="text-sm">{po.payment_terms}</p>
                  </div>
                )}
              </div>
            </div>
          </EditableSection>
          {po.delivery_address && (
            <div className="border-t border-border pt-3 mt-3">
              <p className="text-xs font-semibold text-slate-500 mb-1">Deliver To</p>
              <p className="text-sm whitespace-pre-line">{po.delivery_address}</p>
              {(po.delivery_contact_person || po.delivery_contact_phone) && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Contact:{" "}
                  {[po.delivery_contact_person, po.delivery_contact_phone].filter(Boolean).join(" — ")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── PRINT: Vendor + Delivery 2-col ── */}
        {(() => {
          // Deliver To: use po.delivery_address if specified; else company physical address; never registered address
          const co = company as any;
          const physAddr = [
            company?.address_line1,
            company?.address_line2,
            [company?.city, company?.state].filter(Boolean).join(', '),
            company?.pin_code ? company.pin_code : '',
          ].filter(Boolean).join(', ');
          const deliverAddr = po.delivery_address || physAddr || null;
          return (
            <div className="hidden print:block po-section" style={{ borderBottom: '0.5pt solid #E2E8F0', paddingBottom: '2px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: '1', borderRight: deliverAddr ? '0.5pt solid #E2E8F0' : undefined, paddingRight: deliverAddr ? '8px' : undefined }}>
                  <div style={{ fontSize: '8.5pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>Vendor / Bill To</div>
                  <div style={{ fontWeight: '700', fontSize: '9pt', lineHeight: 1.5 }}>{po.vendor_name}</div>
                  {po.vendor_address && <div style={{ fontSize: '9pt', color: '#475569', lineHeight: 1.5 }}>{po.vendor_address}</div>}
                  {po.vendor_gstin && <div style={{ fontSize: '8.5pt', fontFamily: 'monospace', lineHeight: 1.5 }}>GSTIN: {po.vendor_gstin}</div>}
                  {po.vendor_phone && <div style={{ fontSize: '9pt', color: '#475569', lineHeight: 1.5 }}>Ph: {po.vendor_phone}</div>}
                  {(po as any).vendor_email && <div style={{ fontSize: '9pt', color: '#475569', lineHeight: 1.5 }}>{(po as any).vendor_email}</div>}
                </div>
                {deliverAddr && (
                  <div style={{ flex: '1', paddingLeft: '8px' }}>
                    <div style={{ fontSize: '8.5pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>Deliver To</div>
                    <div style={{ fontSize: '9pt', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{deliverAddr}</div>
                    {(po.delivery_contact_person || po.delivery_contact_phone) && (
                      <div style={{ fontSize: '8.5pt', color: '#64748b', lineHeight: 1.5 }}>
                        Contact: {[po.delivery_contact_person, po.delivery_contact_phone].filter(Boolean).join(" — ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Line Items (shared screen + print) ── */}
        <div className="overflow-x-auto po-section">
          <table className="w-full border-collapse text-sm po-line-items-table">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '5%' }}>#</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '24%' }}>Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '8%' }}>HSN</th>
                {/* Drawing No: visible on screen, hidden in print (shown inline in description) */}
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left print:hidden" style={{ width: '12%' }}>Drawing No.</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right print:hidden" style={{ width: '7%' }}>Rcvd</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right print:hidden" style={{ width: '7%' }}>Pending</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: '8%' }}>Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '7%' }}>Unit</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center" style={{ width: '10%' }}>Delivery Date</th>
                {!hideCosts && <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: '17%' }}>Unit Price</th>}
                {!hideCosts && <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: '20%' }}>Amount</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => {
                const received = item.received_quantity || 0;
                const pending = (item.quantity || 0) - received;
                return (
                  <tr key={item.serial_number}>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-muted-foreground">{item.serial_number}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">
                      {item.description}
                      {/* Drawing No. shown inline below description only in print */}
                      {item.drawing_number && (
                        <div className="hidden print:block" style={{ fontSize: '7pt', color: '#64748b', marginTop: '1px' }}>
                          Dwg: {item.drawing_number}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{(item as any).hsn_sac_code || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono print:hidden">{item.drawing_number || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono print:hidden">
                      {received > 0 ? (
                        <span className="text-emerald-600">{received}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono print:hidden">
                      {pending > 0 ? (
                        <span className="text-amber-600 font-medium">{pending}</span>
                      ) : (
                        <span className="text-emerald-600">✓</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{item.quantity}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{item.unit}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center tabular-nums font-mono">{item.delivery_date ? new Date(item.delivery_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                    {!hideCosts && <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatCurrency(item.unit_price)}</td>}
                    {!hideCosts && <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatCurrency(item.line_total)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Flex spacer — print only — pushes totals+footer to page bottom */}
        <div className="hidden print:block" style={{ flexGrow: 1 }} />

        <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        {/* ── Totals (shared screen + print) ── */}
        {!hideCosts && <div className="flex justify-end po-section">
          <div className="w-full max-w-xs space-y-1.5 text-sm po-totals-block">
            <div className="flex justify-between po-totals-row">
              <span className="text-muted-foreground">Taxable Amount</span>
              <span className="font-mono tabular-nums">{formatCurrency(po.sub_total)}</span>
            </div>
            {charges.length > 0 && charges.map((c: any, i: number) => (
              <div key={i} className="flex justify-between po-totals-row">
                <span className="text-muted-foreground">{c.label || "Additional"}</span>
                <span className="font-mono tabular-nums">{formatCurrency(c.amount)}</span>
              </div>
            ))}
            {Math.abs((po.taxable_value || 0) - (po.sub_total || 0)) > 0.005 && (
              <div className="flex justify-between po-totals-row">
                <span className="text-muted-foreground">Taxable Value</span>
                <span className="font-mono tabular-nums">{formatCurrency(po.taxable_value)}</span>
              </div>
            )}
            <div className="border-t border-border my-1" />
            {isSameState ? (
              <>
                <div className="flex justify-between po-totals-row">
                  <span className="text-muted-foreground">CGST @ {(po.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(po.cgst_amount)}</span>
                </div>
                <div className="flex justify-between po-totals-row">
                  <span className="text-muted-foreground">SGST @ {(po.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(po.sgst_amount)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between po-totals-row">
                <span className="text-muted-foreground">IGST @ {po.gst_rate || 18}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(po.igst_amount)}</span>
              </div>
            )}
            <div className="border-t border-border my-1" />
            <div className="flex justify-between text-base font-bold po-totals-row">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums text-primary">{formatCurrency(po.grand_total)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground italic pt-1 po-amount-words">{amountInWords(po.grand_total)}</p>
          </div>
        </div>}

        {po.special_instructions && (
          <div className="po-section">
            <p className="text-xs font-semibold text-slate-500 mb-1">Special Instructions</p>
            <p className="text-sm">{po.special_instructions}</p>
          </div>
        )}

        {/* ── SCREEN: simple signature ── */}
        <div className="border-t border-border pt-4 print:hidden">
          <div className="flex justify-start">
            <DocumentSignature label="Authorised Signatory" showCompanyName />
          </div>
        </div>

        {/* ── PRINT: footer — [T&C | Bank Details] + Signatory ── */}
        <div className="hidden print:block po-footer" style={{ borderTop: '0.75pt solid #CBD5E1', paddingTop: '4px' }}>
          {/* Payment Terms — above T&C */}
          {po.payment_terms && (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '6px', paddingBottom: '5px', borderBottom: '0.5pt solid #E2E8F0' }}>
              <div>
                <span style={{ fontSize: '9.5pt', fontWeight: '700', color: '#1E3A5F' }}>Payment Terms: </span>
                <span style={{ fontSize: '9.5pt', fontWeight: '600', color: '#334155' }}>{po.payment_terms}</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            {/* Left 50%: T&C */}
            <div style={{ flex: '1 1 50%' }}>
              <div style={{ fontSize: '8.5pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '3px', letterSpacing: '0.04em' }}>Terms &amp; Conditions</div>
              {(poDocSettings?.terms_and_conditions || company?.default_terms_conditions) ? (
                <div style={{ fontSize: '8.5pt', color: '#475569', lineHeight: 1.4, maxHeight: '22mm', overflow: 'hidden', whiteSpace: 'pre-line' }}>
                  {poDocSettings?.terms_and_conditions || company?.default_terms_conditions}
                </div>
              ) : (
                <div style={{ fontSize: '8.5pt', color: '#475569', lineHeight: 1.4 }}>
                  1. Payment due as per agreed terms.<br />
                  2. Goods to be delivered as per PO specifications.<br />
                  3. Invoice must reference this PO number.
                </div>
              )}
            </div>
            {/* Divider */}
            <div style={{ width: '0.5pt', backgroundColor: '#E2E8F0', alignSelf: 'stretch' }} />
            {/* Right 50%: Bank Details + Signatory side by side */}
            <div style={{ flex: '1 1 50%', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              {/* Bank Details */}
              <div style={{ flex: '1' }}>
                <div style={{ fontSize: '8.5pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '3px', letterSpacing: '0.04em' }}>Bank Details</div>
                {company?.bank_name ? (
                  <div style={{ fontSize: '8.5pt', color: '#475569', lineHeight: 1.4 }}>
                    <div>{company.bank_name}</div>
                    {company.bank_account && <div>A/C: {company.bank_account}</div>}
                    {company.bank_ifsc && <div>IFSC: {company.bank_ifsc}</div>}
                    {company.bank_branch && <div>Branch: {company.bank_branch}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: '8.5pt', color: '#94a3b8' }}>—</div>
                )}
              </div>
              {/* Authorised Signatory */}
              <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                <div style={{ fontSize: '6.5pt', color: '#475569', whiteSpace: 'nowrap' }}>for {company?.company_name}</div>
                <div style={{ height: '40pt' }} />
                <div style={{ borderBottom: '0.5pt solid #94a3b8', marginBottom: '2mm', marginLeft: '4mm', marginRight: '4mm' }} />
                <div style={{ fontSize: '6.5pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>AUTHORISED SIGNATORY</div>
              </div>
            </div>
          </div>
        </div>
        </div>{/* end breakInside wrapper */}
      </div>

      {/* Audit Trail */}
      <div className="print:hidden">
        <AuditTimeline documentId={id!} />
      </div>

      {/* Receipt History */}
      <div className="paper-card print:hidden">
        <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
          <h3 className="text-xs font-semibold text-slate-500">Receipt History</h3>
          {canRecordReceipt && (
            <Button size="sm" variant="outline" disabled={createGrnMutation.isPending} onClick={() => createGrnMutation.mutate()}>
              <Package className="h-3.5 w-3.5 mr-1" /> {createGrnMutation.isPending ? "Creating GRN…" : "Record Receipt"}
            </Button>
          )}
        </div>
        {(grnHistory ?? []).length === 0 ? (
          <div className="text-center py-6">
            <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No receipts recorded yet</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">GRN #</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Accepted</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Rejected</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {(grnHistory ?? []).map((grn) => (
                <tr
                  key={grn.id}
                  className="hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/grn/${grn.id}`)}
                >
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium text-primary">{grn.grn_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground">
                    {new Date(grn.grn_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono text-emerald-600">{grn.total_accepted}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                    {grn.total_rejected > 0 ? (
                      <span className="text-destructive">{grn.total_rejected}</span>
                    ) : "0"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <span className={grn.status === "recorded" ? "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full" : "status-paid"}>
                      {grn.status === "recorded" ? "Recorded" : "Verified"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment Section */}
      {!hideCosts && <div className="paper-card print:hidden">
        <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
          <h3 className="text-xs font-semibold text-slate-500">Payment</h3>
          {(() => {
            const ps = po.payment_status;
            if (ps === "paid") return <span className="status-paid text-xs">Paid</span>;
            if (ps === "partial") return <span className="status-pending text-xs">Partial</span>;
            return <span className="status-draft text-xs">Unpaid</span>;
          })()}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Grand Total</p>
            <p className="font-mono font-medium">{formatCurrency(po.grand_total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Amount Paid</p>
            <p className="font-mono font-medium text-green-700">{formatCurrency(po.amount_paid ?? 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Outstanding</p>
            <p className={`font-mono font-medium ${(po.grand_total - (po.amount_paid ?? 0)) > 0 ? "text-amber-700" : "text-green-700"}`}>
              {formatCurrency(Math.max(0, po.grand_total - (po.amount_paid ?? 0)))}
            </p>
          </div>
          {po.payment_date && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Last Payment</p>
              <p>{new Date(po.payment_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            </div>
          )}
        </div>
        {po.payment_reference && (
          <p className="text-xs text-muted-foreground mt-2">Ref: {po.payment_reference}</p>
        )}
        {po.payment_notes && (
          <p className="text-xs text-muted-foreground mt-1 italic">{po.payment_notes}</p>
        )}
      </div>}

      {/* Record Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Outstanding: {formatCurrency(Math.max(0, po.grand_total - (po.amount_paid ?? 0)))}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Amount Paid (₹)</Label>
              <Input
                type="number"
                min={0}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="mt-1 font-mono"
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="text-sm">Payment Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Reference / UTR / Cheque No.</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                className="mt-1"
                placeholder="Optional"
              />
            </div>
            <div>
              <Label className="text-sm">Notes</Label>
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="mt-1"
                rows={2}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button
              onClick={() => paymentMutation.mutate()}
              disabled={paymentMutation.isPending || !paymentAmount || Number(paymentAmount) <= 0}
            >
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Reject Purchase Order</DialogTitle>
            <DialogDescription>Provide a reason so the purchase team can correct and resubmit.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Go Back</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? "Rejecting…" : "Reject PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Purchase Order</DialogTitle>
            <DialogDescription>This will cancel PO {po.po_number}. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Go Back</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              Cancel PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PO Deletion Dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open) setDeleteOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {isPurchaseTeam && po.status === "pending_approval" ? "Retract Approval Request" : "Delete Purchase Order"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isPurchaseTeam && po.status === "pending_approval"
                ? "This will retract your approval request and delete the PO. Are you sure?"
                : "Please provide a reason for deletion."}
            </p>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason for deletion <span className="text-destructive">*</span></label>
              <select
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a reason…</option>
                {DELETION_REASONS_PO.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {deleteReason === 'other' && (
              <Input
                placeholder="Please specify…"
                value={deleteCustomReason}
                onChange={e => setDeleteCustomReason(e.target.value)}
                className="h-9 text-sm"
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteMutation.isPending}>Go Back</Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeletePO}
              disabled={!deleteReason || (deleteReason === 'other' && !deleteCustomReason.trim()) || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm Deletion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
