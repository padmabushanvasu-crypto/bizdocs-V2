import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Edit, Copy, X, ShoppingCart, Clock, CheckCircle2, AlertCircle, Package, Trash2, ChevronLeft, IndianRupee, Eye, EyeOff } from "lucide-react";
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
  type PurchaseOrder,
} from "@/lib/purchase-orders-api";
import { fetchGRNsForPO } from "@/lib/grn-api";
import { formatCurrency, amountInWords } from "@/lib/gst-utils";
import { AuditTimeline } from "@/components/AuditTimeline";
import { logAudit } from "@/lib/audit-api";
import { DocumentHeader } from "@/components/DocumentHeader";
import { DocumentActions } from "@/components/DocumentActions";
import { DocumentSignature } from "@/components/DocumentSignature";

const statusClass: Record<string, string> = {
  draft: "status-draft",
  issued: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_received: "status-overdue",
  fully_received: "status-paid",
  cancelled: "status-cancelled",
  closed: "status-draft",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", issued: "Issued", partially_received: "Partially Received",
  fully_received: "Fully Received", cancelled: "Cancelled", closed: "Closed",
};

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
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
    mutationFn: async () => {
      await softDeletePurchaseOrder(id!);
      await logAudit("purchase_order", id!, "deleted");
    },
    onSuccess: () => {
      toast({ title: "PO Deleted" });
      navigate("/purchase-orders");
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

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!po) return <div className="p-6 text-muted-foreground">Purchase order not found.</div>;

  const items = po.line_items || [];
  const isSameState = po.vendor_state_code === "33";
  const charges = po.additional_charges || [];
  const canRecordReceipt = ["issued", "partially_received"].includes(po.status) && po.status !== "deleted";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/purchase-orders")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3 print:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Purchase Orders
      </button>
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-display font-bold font-mono text-foreground">{po.po_number}</h1>
          <span className={statusClass[po.status] || "status-draft"}>{statusLabels[po.status]}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPrintPreview((p) => !p)}>
            {printPreview ? <><EyeOff className="h-3.5 w-3.5 mr-1" /> Exit Preview</> : <><Eye className="h-3.5 w-3.5 mr-1" /> Preview Print</>}
          </Button>
          <DocumentActions documentNumber={po.po_number} documentType="Purchase Order" documentData={po as Record<string, unknown>} />
          {po.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/purchase-orders/${id}/edit`)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button size="sm" onClick={() => issueMutation.mutate()}>Issue PO →</Button>
            </>
          )}
          {po.status === "issued" && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/purchase-orders/${id}/edit`)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {canRecordReceipt && (
            <Button size="sm" onClick={() => navigate(`/grn/new?po=${id}`)}>
              <Package className="h-3.5 w-3.5 mr-1" /> Record Receipt
            </Button>
          )}
          {!["draft", "cancelled", "deleted"].includes(po.status) && (
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
          {!["cancelled", "closed", "fully_received", "deleted"].includes(po.status) && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          )}
          {!["deleted"].includes(po.status) && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => {
              if (confirm("Delete this PO?")) deleteMutation.mutate();
            }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* Document Preview */}
      <div className={`paper-card space-y-4 po-print-wrapper${printPreview ? " print-preview-active" : ""}`}>

        {/* ── SCREEN: standard header ── */}
        <div className="print:hidden">
          <DocumentHeader />
          <div className="text-center border-b border-border pb-3">
            <h2 className="text-lg font-display font-bold text-primary uppercase tracking-wider">Purchase Order</h2>
          </div>
        </div>

        {/* ── PRINT: compact 2-col header ── */}
        <div className="hidden print:block po-section" style={{ borderBottom: '0.5pt solid #CBD5E1', paddingBottom: '4mm' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            {/* Left: Company info */}
            <div style={{ flex: '0 0 58%' }}>
              {company?.logo_url && (
                <img src={company.logo_url} alt="Logo" style={{ height: '32px', marginBottom: '3px', objectFit: 'contain' }} />
              )}
              <div style={{ fontWeight: '700', fontSize: '11pt', lineHeight: 1.2 }}>{company?.company_name}</div>
              <div style={{ fontSize: '8pt', color: '#475569', lineHeight: 1.4 }}>
                {[company?.address_line1, company?.address_line2, [company?.city, company?.state].filter(Boolean).join(', '), company?.pin_code ? `PIN ${company.pin_code}` : ''].filter(Boolean).join(', ')}
              </div>
              {company?.gstin && <div style={{ fontSize: '8pt', fontFamily: 'monospace' }}>GSTIN: {company.gstin}</div>}
              {company?.phone && <div style={{ fontSize: '8pt', color: '#475569' }}>Ph: {company.phone}</div>}
              {company?.email && <div style={{ fontSize: '8pt', color: '#475569' }}>{company.email}</div>}
            </div>
            {/* Right: PO title + details */}
            <div style={{ flex: '0 0 42%', textAlign: 'right' }}>
              <div style={{ fontWeight: '700', fontSize: '13pt', color: '#1E3A5F', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Purchase Order</div>
              <div style={{ fontWeight: '700', fontSize: '9pt' }}>PO No: {po.po_number}</div>
              <div style={{ fontSize: '9pt' }}>Date: {new Date(po.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
              {po.payment_terms && <div style={{ fontSize: '9pt' }}>Terms: {po.payment_terms}</div>}
              {(po as any).vendor_reference && <div style={{ fontSize: '9pt' }}>Vendor Ref: {(po as any).vendor_reference}</div>}
              {po.reference_number && <div style={{ fontSize: '9pt' }}>Ref: {po.reference_number}</div>}
            </div>
          </div>
        </div>

        {/* ── SCREEN: Vendor & PO Details ── */}
        <div className="print:hidden">
          <EditableSection
            editable={po.status === "draft" || po.status === "issued"}
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
        <div className="hidden print:block po-section" style={{ borderBottom: '0.5pt solid #E2E8F0', paddingBottom: '3mm' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: '1', borderRight: po.delivery_address ? '0.5pt solid #E2E8F0' : undefined, paddingRight: po.delivery_address ? '8px' : undefined }}>
              <div style={{ fontSize: '7pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Vendor / Bill To</div>
              <div style={{ fontWeight: '600', fontSize: '9pt' }}>{po.vendor_name}</div>
              {po.vendor_address && <div style={{ fontSize: '8pt', color: '#475569' }}>{po.vendor_address}</div>}
              {po.vendor_gstin && <div style={{ fontSize: '8pt', fontFamily: 'monospace' }}>GSTIN: {po.vendor_gstin}</div>}
              {po.vendor_phone && <div style={{ fontSize: '8pt', color: '#475569' }}>Ph: {po.vendor_phone}</div>}
              {(po as any).vendor_email && <div style={{ fontSize: '8pt', color: '#475569' }}>{(po as any).vendor_email}</div>}
            </div>
            {po.delivery_address && (
              <div style={{ flex: '1', paddingLeft: '8px' }}>
                <div style={{ fontSize: '7pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Deliver To</div>
                <div style={{ fontSize: '8pt', whiteSpace: 'pre-line' }}>{po.delivery_address}</div>
                {(po.delivery_contact_person || po.delivery_contact_phone) && (
                  <div style={{ fontSize: '7pt', color: '#64748b' }}>
                    Contact: {[po.delivery_contact_person, po.delivery_contact_phone].filter(Boolean).join(" — ")}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Line Items (shared screen + print) ── */}
        <div className="overflow-x-auto po-section">
          <table className="w-full border-collapse text-sm po-line-items-table">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '5%' }}>#</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '36%' }}>Description</th>
                {/* Drawing No: visible on screen, hidden in print (shown inline in description) */}
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left print:hidden" style={{ width: '12%' }}>Drawing No.</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right print:hidden" style={{ width: '7%' }}>Rcvd</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right print:hidden" style={{ width: '7%' }}>Pending</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: '8%' }}>Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '7%' }}>Unit</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: '17%' }}>Unit Price</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: '20%' }}>Amount</th>
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
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatCurrency(item.unit_price)}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatCurrency(item.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Totals (shared screen + print) ── */}
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(po.sub_total)}</span>
            </div>
            {charges.length > 0 && charges.map((c: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">{c.label || "Additional"}</span>
                <span className="font-mono tabular-nums">{formatCurrency(c.amount)}</span>
              </div>
            ))}
            {/* Only show Taxable Value when it differs from Sub Total (i.e. there are charges or discounts) */}
            {Math.abs((po.taxable_value || 0) - (po.sub_total || 0)) > 0.005 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable Value</span>
                <span className="font-mono tabular-nums">{formatCurrency(po.taxable_value)}</span>
              </div>
            )}
            <div className="border-t border-border my-1" />
            {isSameState ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST @ {(po.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(po.cgst_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST @ {(po.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(po.sgst_amount)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST @ {po.gst_rate || 18}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(po.igst_amount)}</span>
              </div>
            )}
            <div className="border-t border-border my-1" />
            <div className="flex justify-between text-base font-bold">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums text-primary">{formatCurrency(po.grand_total)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground italic pt-1">{amountInWords(po.grand_total)}</p>
          </div>
        </div>

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

        {/* ── PRINT: 3-col footer (T&C | Bank | Signature) ── */}
        <div className="hidden print:block po-footer" style={{ borderTop: '0.5pt solid #CBD5E1', paddingTop: '4mm', marginTop: '4mm' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            {/* T&C */}
            <div style={{ flex: '1' }}>
              <div style={{ fontSize: '7pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Terms &amp; Conditions</div>
              {(poDocSettings?.terms_and_conditions || company?.default_terms_conditions) ? (
                <div style={{ fontSize: '7pt', color: '#475569', lineHeight: 1.4, maxHeight: '18mm', overflow: 'hidden' }}>
                  {poDocSettings?.terms_and_conditions || company?.default_terms_conditions}
                </div>
              ) : (
                <div style={{ fontSize: '7pt', color: '#94a3b8' }}>
                  1. Payment due as per agreed terms.<br />
                  2. Goods to be delivered as per PO specifications.<br />
                  3. Invoice must reference this PO number.
                </div>
              )}
            </div>
            {/* Bank Details */}
            <div style={{ flex: '1' }}>
              <div style={{ fontSize: '7pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Bank Details</div>
              {company?.bank_name ? (
                <>
                  <div style={{ fontSize: '7pt' }}>{company.bank_name}</div>
                  {company.bank_account && <div style={{ fontSize: '7pt' }}>A/C: {company.bank_account}</div>}
                  {company.bank_ifsc && <div style={{ fontSize: '7pt' }}>IFSC: {company.bank_ifsc}</div>}
                  {company.bank_branch && <div style={{ fontSize: '7pt' }}>Branch: {company.bank_branch}</div>}
                </>
              ) : (
                <div style={{ fontSize: '7pt', color: '#94a3b8' }}>—</div>
              )}
            </div>
            {/* Authorised Signatory */}
            <div style={{ flex: '1', textAlign: 'center' }}>
              <div style={{ fontSize: '7pt', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Authorised Signatory</div>
              <div style={{ fontSize: '8pt', color: '#475569' }}>for {company?.company_name}</div>
              <div style={{ borderBottom: '0.5pt solid #94a3b8', marginTop: '16mm', marginBottom: '2mm', marginLeft: '8mm', marginRight: '8mm' }} />
              <div style={{ fontSize: '7pt', color: '#64748b' }}>Signature</div>
            </div>
          </div>
        </div>
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
            <Button size="sm" variant="outline" onClick={() => navigate(`/grn/new?po=${id}`)}>
              <Package className="h-3.5 w-3.5 mr-1" /> Record Receipt
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
      <div className="paper-card print:hidden">
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
      </div>

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
    </div>
  );
}
