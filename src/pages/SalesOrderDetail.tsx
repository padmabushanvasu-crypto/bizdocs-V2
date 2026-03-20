import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, X, ShoppingBag, Truck, CheckCircle2, AlertCircle, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  fetchSalesOrder,
  confirmSalesOrder,
  cancelSalesOrder,
  fetchDispatchNotesForSO,
} from "@/lib/sales-orders-api";
import { formatCurrency, amountInWords } from "@/lib/gst-utils";
import { DocumentHeader } from "@/components/DocumentHeader";
import { DocumentActions } from "@/components/DocumentActions";
import { AuditTimeline } from "@/components/AuditTimeline";
import { DocumentSignature } from "@/components/DocumentSignature";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  draft:         "status-draft",
  confirmed:     "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  in_production: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  dispatched:    "bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  invoiced:      "status-paid",
  cancelled:     "status-cancelled",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", confirmed: "Confirmed", in_production: "In Production",
  dispatched: "Dispatched", invoiced: "Invoiced", cancelled: "Cancelled",
};

export default function SalesOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const { data: so, isLoading } = useQuery({
    queryKey: ["sales-order", id],
    queryFn: () => fetchSalesOrder(id!),
    enabled: !!id,
  });

  const { data: linkedDNs } = useQuery({
    queryKey: ["dispatch-notes-for-so", id],
    queryFn: () => fetchDispatchNotesForSO(id!),
    enabled: !!id,
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmSalesOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-order", id] });
      toast({ title: "Sales Order Confirmed" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSalesOrder(id!, cancelReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-order", id] });
      setCancelOpen(false);
      toast({ title: "Sales Order Cancelled" });
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!so) return <div className="p-6 text-muted-foreground">Sales order not found.</div>;

  const items = so.line_items || [];
  const isSameState = so.customer_state_code === (so as any).company_state_code;
  const hasCgst = (so.cgst_amount || 0) > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-display font-bold font-mono text-foreground">{so.so_number}</h1>
          <span className={statusClass[so.status] || "status-draft"}>{statusLabels[so.status]}</span>
          {so.priority && so.priority !== "normal" && (
            <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full border ${
              so.priority === "urgent" ? "bg-red-50 text-red-700 border-red-200" :
              so.priority === "high"   ? "bg-amber-50 text-amber-700 border-amber-200" :
              "bg-slate-50 text-slate-600 border-slate-200"
            }`}>
              {so.priority}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <DocumentActions
            documentNumber={so.so_number}
            documentType="Sales Order"
            partyName={so.customer_name}
            date={so.so_date}
            amount={so.grand_total}
          />
          {so.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/sales-orders/${id}/edit`)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button size="sm" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
                Confirm SO →
              </Button>
            </>
          )}
          {so.status === "confirmed" && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/sales-orders/${id}/edit`)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button size="sm" onClick={() => navigate(`/dispatch-notes/new?so=${id}`)}>
                <Truck className="h-3.5 w-3.5 mr-1" /> Create Dispatch Note
              </Button>
            </>
          )}
          {so.status === "in_production" && (
            <Button size="sm" onClick={() => navigate(`/dispatch-notes/new?so=${id}`)}>
              <Truck className="h-3.5 w-3.5 mr-1" /> Create Dispatch Note
            </Button>
          )}
          {!["cancelled", "invoiced", "dispatched"].includes(so.status) && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Document Preview */}
      <div className="paper-card space-y-6">
        <DocumentHeader />
        <div className="text-center border-b border-border pb-4">
          <h2 className="text-lg font-display font-bold text-primary uppercase tracking-wider">Sales Order</h2>
        </div>

        {/* Customer & SO Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-1">To</p>
            <p className="font-medium text-foreground">{so.customer_name}</p>
            {so.billing_address && <p className="text-sm text-muted-foreground whitespace-pre-line">{so.billing_address}</p>}
            {so.customer_gstin && <p className="text-sm font-mono">GSTIN: {so.customer_gstin}</p>}
            {so.customer_phone && <p className="text-sm text-muted-foreground">Ph: {so.customer_phone}</p>}
          </div>
          <div className="text-left md:text-right space-y-1">
            <div className="flex md:justify-end gap-4">
              <div>
                <p className="text-xs text-muted-foreground">SO No.</p>
                <p className="font-mono font-medium">{so.so_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p>{format(new Date(so.so_date), "dd MMM yyyy")}</p>
              </div>
            </div>
            {so.reference_number && (
              <div className="md:text-right">
                <p className="text-xs text-muted-foreground">Customer PO Ref.</p>
                <p className="text-sm">{so.reference_number}</p>
              </div>
            )}
            {so.delivery_date && (
              <div className="md:text-right">
                <p className="text-xs text-muted-foreground">Expected Delivery</p>
                <p className="text-sm">{format(new Date(so.delivery_date), "dd MMM yyyy")}</p>
              </div>
            )}
            {so.payment_terms && (
              <div className="md:text-right">
                <p className="text-xs text-muted-foreground">Payment Terms</p>
                <p className="text-sm">{so.payment_terms}</p>
              </div>
            )}
          </div>
        </div>

        {/* Shipping Address */}
        {so.shipping_address && so.shipping_address !== so.billing_address && (
          <div>
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-1">Ship To</p>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{so.shipping_address}</p>
          </div>
        )}

        {/* Line Items */}
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Description</th>
                <th>HSN/SAC</th>
                <th className="text-right">Qty</th>
                <th>Unit</th>
                <th className="text-right">Unit Price</th>
                <th className="text-right">GST %</th>
                <th className="text-right">Amount</th>
                <th>Delivery Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.serial_number}>
                  <td className="font-mono text-muted-foreground">{item.serial_number}</td>
                  <td className="font-medium">
                    {item.description}
                    {item.item_code && <p className="text-xs text-muted-foreground font-mono">{item.item_code}</p>}
                  </td>
                  <td className="font-mono text-sm">{item.hsn_sac_code || "—"}</td>
                  <td className="text-right font-mono tabular-nums">{item.quantity}</td>
                  <td>{item.unit}</td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(item.unit_price)}</td>
                  <td className="text-right font-mono tabular-nums">{item.gst_rate}%</td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(item.line_total)}</td>
                  <td className="text-sm">
                    {item.delivery_date ? format(new Date(item.delivery_date), "dd MMM yyyy") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(so.sub_total)}</span>
            </div>
            <div className="border-t border-border my-1" />
            {hasCgst ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST @ {(so.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(so.cgst_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST @ {(so.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(so.sgst_amount)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST @ {so.gst_rate || 18}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(so.igst_amount)}</span>
              </div>
            )}
            <div className="border-t border-border my-1" />
            <div className="flex justify-between text-base font-bold">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums text-primary">{formatCurrency(so.grand_total)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground italic pt-1">{amountInWords(so.grand_total)}</p>
          </div>
        </div>

        {so.special_instructions && (
          <div>
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-1">Special Instructions</p>
            <p className="text-sm">{so.special_instructions}</p>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <div className="flex justify-end">
            <DocumentSignature label="Authorised Signatory" />
          </div>
        </div>
      </div>

      {/* Linked Dispatch Notes */}
      <div className="paper-card print:hidden">
        <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
          <h3 className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Dispatch Notes</h3>
          {["confirmed", "in_production"].includes(so.status) && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/dispatch-notes/new?so=${id}`)}>
              <Truck className="h-3.5 w-3.5 mr-1" /> Create DN
            </Button>
          )}
        </div>
        {(linkedDNs ?? []).length === 0 ? (
          <div className="text-center py-6">
            <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No dispatch notes yet</p>
          </div>
        ) : (
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>DN Number</th>
                <th>Date</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(linkedDNs ?? []).map((dn: any) => (
                <tr
                  key={dn.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/dispatch-notes/${dn.id}`)}
                >
                  <td className="font-mono text-sm font-medium text-primary">{dn.dn_number}</td>
                  <td className="text-sm">
                    {dn.dn_date ? format(new Date(dn.dn_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="text-right font-mono text-sm tabular-nums">
                    {formatCurrency(dn.grand_total ?? 0)}
                  </td>
                  <td>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                      dn.status === "issued"    ? "bg-blue-50 text-blue-700 border-blue-200" :
                      dn.status === "cancelled" ? "bg-red-50 text-red-700 border-red-200" :
                      "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      {dn.status === "issued" ? "Issued" : dn.status === "cancelled" ? "Cancelled" : "Draft"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Audit Trail */}
      <div className="print:hidden">
        <AuditTimeline documentId={id!} />
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Sales Order</DialogTitle>
            <DialogDescription>This will cancel SO {so.so_number}. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Go Back</Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              Cancel SO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
