import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, X, Truck, CheckCircle2, RotateCcw, AlertTriangle, Printer } from "lucide-react";
import { EditableSection } from "@/components/EditableSection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  fetchDeliveryChallan,
  cancelDeliveryChallan,
  fetchDCReturns,
} from "@/lib/delivery-challans-api";
import { formatCurrency, formatNumber, amountInWords } from "@/lib/gst-utils";
import { DocumentHeader } from "@/components/DocumentHeader";
import { DocumentActions } from "@/components/DocumentActions";
import { AuditTimeline } from "@/components/AuditTimeline";
import { DocumentSignature } from "@/components/DocumentSignature";

const statusClass: Record<string, string> = {
  draft: "status-draft",
  issued: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_returned: "status-overdue",
  fully_returned: "status-paid",
  cancelled: "status-cancelled",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", issued: "Issued", partially_returned: "Partially Returned",
  fully_returned: "Fully Returned", cancelled: "Cancelled",
};
const typeLabels: Record<string, string> = {
  returnable: "RETURNABLE", non_returnable: "NON-RETURNABLE", job_work_143: "JOB WORK (SEC 143)",
  job_work_out: "JOB WORK OUT", job_work_return: "JOB WORK RETURN",
};

const JOB_WORK_TYPES = ["job_work_out", "job_work_return", "returnable", "job_work_143"];
const categoryLabels: Record<string, string> = {
  supply_on_approval: "Supply on Approval", job_work_return: "Job Work Return",
  sales_return: "Sales Return", others: "Others",
};

export default function DeliveryChallanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isDuplicate, setIsDuplicate] = useState(false);

  const { data: dc, isLoading } = useQuery({
    queryKey: ["delivery-challan", id],
    queryFn: () => fetchDeliveryChallan(id!),
    enabled: !!id,
  });

  const { data: returns } = useQuery({
    queryKey: ["dc-returns", id],
    queryFn: () => fetchDCReturns(id!),
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelDeliveryChallan(id!, cancelReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-challan", id] });
      setCancelOpen(false);
      toast({ title: "DC Cancelled" });
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!dc) return <div className="p-6 text-muted-foreground">Delivery challan not found.</div>;

  const items = dc.line_items || [];
  const isReturnable = dc.dc_type === "returnable" || dc.dc_type === "job_work_143";
  const isJobWork = JOB_WORK_TYPES.includes(dc.dc_type);
  const hasNatureOfProcess = items.some((i) => i.nature_of_process);
  const hasQtyKgs = items.some((i) => (i as any).qty_kgs != null);
  const hasQtySft = items.some((i) => (i as any).qty_sft != null);
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = dc.return_due_date && dc.return_due_date < today && !["fully_returned", "cancelled"].includes(dc.status);

  const subTotal = dc.sub_total || items.reduce((s, i) => s + (i.amount || 0), 0);
  const grandTotal = dc.grand_total || subTotal;
  const isCgstSgst = (dc.cgst_amount || 0) > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-display font-bold font-mono text-foreground">{dc.dc_number}</h1>
          <span className={statusClass[dc.status] || "status-draft"}>{statusLabels[dc.status]}</span>
          {isOverdue && (
            <span className="bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium px-2.5 py-0.5 rounded-full">Overdue</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { setIsDuplicate(true); setTimeout(() => { window.print(); setIsDuplicate(false); }, 100); }}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print Duplicate
          </Button>
          <DocumentActions documentNumber={dc.dc_number} documentType="Delivery Challan" />
          {dc.status === "draft" && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/delivery-challans/${id}/edit`)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {isReturnable && ["issued", "partially_returned"].includes(dc.status) && (
            <Button size="sm" onClick={() => navigate(`/delivery-challans/${id}/record-return`)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Record Return
            </Button>
          )}
          {!["cancelled", "fully_returned"].includes(dc.status) && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Document Preview */}
      <div className="paper-card space-y-6">
        {/* Header */}
        <DocumentHeader />
        <div className="text-center border-b border-border pb-4 relative">
          <h2 className="text-lg font-display font-bold text-primary uppercase tracking-wider">
            Delivery Challan
          </h2>
          <p className="text-xs text-muted-foreground mt-1">[{typeLabels[dc.dc_type] || dc.dc_type}]</p>
          <span className="absolute top-0 right-0 text-xs font-bold border border-current px-2 py-0.5 rounded tracking-widest">
            {isDuplicate ? "DUPLICATE" : "ORIGINAL"}
          </span>
        </div>

        <EditableSection
          editable={dc.status === "draft"}
          onEdit={() => navigate(`/delivery-challans/${id}/edit`)}
          label="Click to edit"
          className="p-4 -mx-4"
        >
          {/* DC Info Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-b border-border pb-4">
            <div>
              <p className="text-xs text-muted-foreground">DC Number</p>
              <p className="font-mono font-medium">{dc.dc_number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p>{new Date(dc.dc_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            </div>
            {dc.vehicle_number && (
              <div>
                <p className="text-xs text-muted-foreground">Vehicle No.</p>
                <p className="font-mono">{dc.vehicle_number}</p>
              </div>
            )}
            {dc.driver_name && (
              <div>
                <p className="text-xs text-muted-foreground">Driver</p>
                <p>{dc.driver_name}</p>
              </div>
            )}
          </div>
        </EditableSection>

        {/* Consignee Block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-border rounded-lg p-4">
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Consignee (To)</p>
            <p className="font-medium text-foreground">{dc.party_name}</p>
            {dc.party_address && <p className="text-sm text-muted-foreground">{dc.party_address}</p>}
            {dc.party_gstin && <p className="text-sm font-mono">GSTIN: {dc.party_gstin}</p>}
            {dc.party_phone && <p className="text-sm text-muted-foreground">Ph: {dc.party_phone}</p>}
          </div>

          <div className="border border-border rounded-lg p-4 space-y-2 text-sm">
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Reference Details</p>
            {(dc as any).lo_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">L.O. No</span>
                <span className="font-mono">{(dc as any).lo_number}</span>
              </div>
            )}
            {dc.po_reference && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">PO Reference</span>
                <span className="font-mono">{dc.po_reference}</span>
              </div>
            )}
            {dc.po_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">PO Date</span>
                <span>{new Date(dc.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
            )}
            {dc.challan_category && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Challan Type</span>
                <span>{categoryLabels[dc.challan_category] || dc.challan_category}</span>
              </div>
            )}
            {(dc as any).approx_value != null && (dc as any).approx_value > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approx. Value</span>
                <span className="font-mono">{formatCurrency((dc as any).approx_value)}</span>
              </div>
            )}
            {dc.return_due_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Return Due</span>
                <span className={isOverdue ? "text-destructive font-medium" : ""}>
                  {new Date(dc.return_due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  {isOverdue && " ⚠ OVERDUE"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Item Code</th>
                <th>Description</th>
                {hasNatureOfProcess && <th>Nature of Process</th>}
                <th>Unit</th>
                <th className="text-right">Qty (NOS)</th>
                {hasQtyKgs && <th className="text-right">Qty (KGS)</th>}
                {hasQtySft && <th className="text-right">Qty (SFT)</th>}
                <th className="text-right">Rate (₹)</th>
                <th className="text-right">Amount (₹)</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.serial_number}>
                  <td className="font-mono text-muted-foreground">{item.serial_number}</td>
                  <td className="font-mono text-sm">{item.item_code || "—"}</td>
                  <td className="font-medium">{item.description}</td>
                  {hasNatureOfProcess && <td className="text-sm">{(item as any).nature_of_process || "—"}</td>}
                  <td className="text-muted-foreground">{item.unit || "NOS"}</td>
                  <td className="text-right font-mono tabular-nums">{formatNumber(item.quantity || item.qty_nos || 0)}</td>
                  {hasQtyKgs && <td className="text-right font-mono tabular-nums">{(item as any).qty_kgs != null ? formatNumber((item as any).qty_kgs) : "—"}</td>}
                  {hasQtySft && <td className="text-right font-mono tabular-nums">{(item as any).qty_sft != null ? formatNumber((item as any).qty_sft) : "—"}</td>}
                  <td className="text-right font-mono tabular-nums">{formatCurrency(item.rate || 0)}</td>
                  <td className="text-right font-mono tabular-nums font-medium">{formatCurrency(item.amount || 0)}</td>
                  <td className="text-muted-foreground text-sm">{item.remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Block */}
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(subTotal)}</span>
            </div>
            {isCgstSgst ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST @ {(dc.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(dc.cgst_amount || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST @ {(dc.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(dc.sgst_amount || 0)}</span>
                </div>
              </>
            ) : (dc.igst_amount || 0) > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST @ {dc.gst_rate || 18}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(dc.igst_amount || 0)}</span>
              </div>
            ) : null}
            <div className="border-t border-border pt-2">
              <div className="flex justify-between text-base font-bold">
                <span>Total Amount</span>
                <span className="font-mono tabular-nums text-primary">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
            <div className="bg-muted/50 rounded p-2 text-xs text-muted-foreground italic">
              {amountInWords(grandTotal)}
            </div>
          </div>
        </div>

        {/* Special Instructions */}
        {dc.special_instructions && (
          <div className="border-t border-border pt-4">
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-1">Special Instructions</p>
            <p className="text-sm">{dc.special_instructions}</p>
          </div>
        )}

        {/* Not for Sale Banner */}
        {isJobWork && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center text-sm font-bold text-primary uppercase tracking-wider">
            NOT FOR SALE — JOB WORK ONLY
          </div>
        )}

        {/* Signature Block */}
        <div className="grid grid-cols-3 gap-6 border-t border-border pt-6 text-center text-sm">
          <div>
            <p className="text-muted-foreground mb-12">{dc.prepared_by || ""}</p>
            <div className="border-t border-border pt-1">
              <p className="text-xs text-muted-foreground font-medium">Prepared By</p>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground mb-12">{dc.checked_by || ""}</p>
            <div className="border-t border-border pt-1">
              <p className="text-xs text-muted-foreground font-medium">Checked By</p>
            </div>
          </div>
          <DocumentSignature label="Authorised Signatory" />
        </div>

        {/* Receiver Box */}
        <div className="border-2 border-dashed border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground text-center mb-8">Received the above goods in good condition</p>
          <div className="flex justify-between items-end px-8">
            <div className="text-center">
              <div className="border-t border-border pt-1">
                <p className="text-xs text-muted-foreground px-6">Signature</p>
                <p className="text-xs text-muted-foreground">for {dc.party_name}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-border pt-1">
                <p className="text-xs text-muted-foreground px-6">Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Return History */}
      {isReturnable && (
        <div className="paper-card print:hidden">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
            <h3 className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Return History</h3>
            {["issued", "partially_returned"].includes(dc.status) && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/delivery-challans/${id}/record-return`)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Record Return
              </Button>
            )}
          </div>
          {(returns ?? []).length === 0 ? (
            <div className="text-center py-6">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No returns recorded yet</p>
            </div>
          ) : (
            <table className="w-full data-table">
              <thead>
                <tr><th>Date</th><th>Received By</th><th>Items Returned</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {(returns ?? []).map((ret) => (
                  <tr key={ret.id}>
                    <td>{new Date(ret.return_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td>{ret.received_by || "—"}</td>
                    <td className="font-mono text-sm">{ret.items?.length ?? 0} items</td>
                    <td className="text-muted-foreground">{ret.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Audit Trail */}
      <div className="print:hidden">
        <AuditTimeline documentId={id!} />
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Delivery Challan</DialogTitle>
            <DialogDescription>This will cancel DC {dc.dc_number}. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Go Back</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>Cancel DC</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
