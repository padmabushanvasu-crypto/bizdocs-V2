import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Edit, Copy, X, ShoppingCart, Clock, CheckCircle2, AlertCircle, Package, Trash2, ChevronLeft } from "lucide-react";
import { EditableSection } from "@/components/EditableSection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  fetchPurchaseOrder,
  cancelPurchaseOrder,
  duplicatePurchaseOrder,
  issuePurchaseOrder,
  softDeletePurchaseOrder,
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
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
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
      <div className="paper-card space-y-6">
        <DocumentHeader />
        <div className="text-center border-b border-border pb-4">
          <h2 className="text-lg font-display font-bold text-primary uppercase tracking-wider">Purchase Order</h2>
        </div>

        {/* Vendor & PO Details */}
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

        {/* Line Items */}
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Description</th>
                <th>Drawing No.</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rcvd</th>
                <th className="text-right">Pending</th>
                <th>Unit</th>
                <th className="text-right">Unit Price</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => {
                const received = item.received_quantity || 0;
                const pending = (item.quantity || 0) - received;
                return (
                  <tr key={item.serial_number}>
                    <td className="font-mono text-muted-foreground">{item.serial_number}</td>
                    <td className="font-medium">{item.description}</td>
                    <td className="font-mono text-sm">{item.drawing_number || "—"}</td>
                    <td className="text-right font-mono tabular-nums">{item.quantity}</td>
                    <td className="text-right font-mono tabular-nums">
                      {received > 0 ? (
                        <span className="text-emerald-600">{received}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {pending > 0 ? (
                        <span className="text-amber-600 font-medium">{pending}</span>
                      ) : (
                        <span className="text-emerald-600">✓</span>
                      )}
                    </td>
                    <td>{item.unit}</td>
                    <td className="text-right font-mono tabular-nums">{formatCurrency(item.unit_price)}</td>
                    <td className="text-right font-mono tabular-nums">{formatCurrency(item.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxable Value</span>
              <span className="font-mono tabular-nums">{formatCurrency(po.taxable_value)}</span>
            </div>
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
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Special Instructions</p>
            <p className="text-sm">{po.special_instructions}</p>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <div className="flex justify-start">
            <DocumentSignature label="Authorised Signatory" showCompanyName />
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
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>GRN #</th>
                <th>Date</th>
                <th className="text-right">Accepted</th>
                <th className="text-right">Rejected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(grnHistory ?? []).map((grn) => (
                <tr
                  key={grn.id}
                  className="hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/grn/${grn.id}`)}
                >
                  <td className="font-mono text-sm font-medium text-primary">{grn.grn_number}</td>
                  <td className="text-muted-foreground">
                    {new Date(grn.grn_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="text-right font-mono tabular-nums text-emerald-600">{grn.total_accepted}</td>
                  <td className="text-right font-mono tabular-nums">
                    {grn.total_rejected > 0 ? (
                      <span className="text-destructive">{grn.total_rejected}</span>
                    ) : "0"}
                  </td>
                  <td>
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
