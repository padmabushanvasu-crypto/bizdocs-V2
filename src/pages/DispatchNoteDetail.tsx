import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, X, Truck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { fetchDispatchNote, cancelDN } from "@/lib/sales-orders-api";
import { formatCurrency, amountInWords } from "@/lib/gst-utils";
import { DocumentHeader } from "@/components/DocumentHeader";
import { DocumentActions } from "@/components/DocumentActions";
import { AuditTimeline } from "@/components/AuditTimeline";
import { DocumentSignature } from "@/components/DocumentSignature";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  draft:     "status-draft",
  issued:    "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  cancelled: "status-cancelled",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", issued: "Issued", cancelled: "Cancelled",
};

export default function DispatchNoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isDuplicate, setIsDuplicate] = useState(false);

  const { data: dn, isLoading } = useQuery({
    queryKey: ["dispatch-note", id],
    queryFn: () => fetchDispatchNote(id!),
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelDN(id!, cancelReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dispatch-note", id] });
      setCancelOpen(false);
      toast({ title: "Dispatch Note Cancelled" });
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!dn) return <div className="p-6 text-muted-foreground">Dispatch note not found.</div>;

  const items = dn.line_items || [];
  const packing = dn.packing_list || [];
  const hasCgst = (dn.cgst_amount || 0) > 0;
  const grandTotal = dn.grand_total || dn.sub_total || 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-display font-bold font-mono text-foreground">{dn.dn_number}</h1>
          <span className={statusClass[dn.status] || "status-draft"}>{statusLabels[dn.status]}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsDuplicate(true);
              setTimeout(() => { window.print(); setIsDuplicate(false); }, 100);
            }}
          >
            <Printer className="h-3.5 w-3.5 mr-1" /> Print Duplicate
          </Button>
          <DocumentActions documentNumber={dn.dn_number} documentType="Dispatch Note" />
          {dn.status === "draft" && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/dispatch-notes/${id}/edit`)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {!["cancelled"].includes(dn.status) && (
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

      {/* Document */}
      <div className="paper-card space-y-6">
        <DocumentHeader />
        <div className="text-center border-b border-border pb-4 relative">
          <h2 className="text-lg font-display font-bold text-primary uppercase tracking-wider">Dispatch Note</h2>
          <span className="absolute top-0 right-0 text-xs font-bold border border-current px-2 py-0.5 rounded tracking-widest">
            {isDuplicate ? "DUPLICATE" : "ORIGINAL"}
          </span>
        </div>

        {/* DN Info Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-b border-border pb-4">
          <div>
            <p className="text-xs text-muted-foreground">DN Number</p>
            <p className="font-mono font-medium">{dn.dn_number}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p>{format(new Date(dn.dn_date), "dd MMM yyyy")}</p>
          </div>
          {dn.vehicle_number && (
            <div>
              <p className="text-xs text-muted-foreground">Vehicle No.</p>
              <p className="font-mono">{dn.vehicle_number}</p>
            </div>
          )}
          {dn.driver_name && (
            <div>
              <p className="text-xs text-muted-foreground">Driver</p>
              <p>{dn.driver_name}</p>
            </div>
          )}
        </div>

        {/* Customer & Reference */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-border rounded-lg p-4">
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Consignee (To)</p>
            <p className="font-medium text-foreground">{dn.customer_name}</p>
            {dn.shipping_address && <p className="text-sm text-muted-foreground whitespace-pre-line">{dn.shipping_address}</p>}
            {dn.customer_gstin && <p className="text-sm font-mono">GSTIN: {dn.customer_gstin}</p>}
          </div>
          <div className="border border-border rounded-lg p-4 space-y-2 text-sm">
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Reference Details</p>
            {dn.so_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">SO Reference</span>
                <span className="font-mono">{dn.so_number}</span>
              </div>
            )}
            {dn.reference_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer PO</span>
                <span className="font-mono">{dn.reference_number}</span>
              </div>
            )}
            {dn.transporter && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transporter</span>
                <span>{dn.transporter}</span>
              </div>
            )}
            {dn.lr_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">LR / Docket No.</span>
                <span className="font-mono">{dn.lr_number}</span>
              </div>
            )}
            {dn.lr_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">LR Date</span>
                <span>{format(new Date(dn.lr_date), "dd MMM yyyy")}</span>
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
                <th>Unit</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate (₹)</th>
                <th className="text-right">Amount (₹)</th>
                <th>Serial/Ref</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.serial_number}>
                  <td className="font-mono text-muted-foreground">{item.serial_number}</td>
                  <td className="font-mono text-sm">{item.item_code || "—"}</td>
                  <td className="font-medium">{item.description}</td>
                  <td className="text-muted-foreground">{item.unit || "NOS"}</td>
                  <td className="text-right font-mono tabular-nums">{item.quantity}</td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(item.rate || 0)}</td>
                  <td className="text-right font-mono tabular-nums font-medium">{formatCurrency(item.amount || 0)}</td>
                  <td className="text-muted-foreground text-sm font-mono">{item.serial_number_ref || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(dn.sub_total)}</span>
            </div>
            {hasCgst ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST @ {(dn.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(dn.cgst_amount || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST @ {(dn.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(dn.sgst_amount || 0)}</span>
                </div>
              </>
            ) : (dn.igst_amount || 0) > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST @ {dn.gst_rate || 18}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(dn.igst_amount || 0)}</span>
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

        {dn.special_instructions && (
          <div className="border-t border-border pt-4">
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-1">Special Instructions</p>
            <p className="text-sm">{dn.special_instructions}</p>
          </div>
        )}

        {/* Signature Block */}
        <div className="grid grid-cols-2 gap-6 border-t border-border pt-6 text-center text-sm">
          <div>
            <p className="text-muted-foreground mb-12"></p>
            <div className="border-t border-border pt-1">
              <p className="text-xs text-muted-foreground font-medium">Prepared By</p>
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
                <p className="text-xs text-muted-foreground">for {dn.customer_name}</p>
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

      {/* Packing List */}
      {packing.length > 0 && (
        <div className="paper-card print:block">
          <h3 className="text-xs uppercase text-muted-foreground font-bold tracking-wider border-b border-border pb-2 mb-4">
            Packing List
          </h3>
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th className="text-right">Qty</th>
                <th>Unit</th>
                <th className="text-right">Weight (kg)</th>
                <th>Dimensions</th>
                <th>Box No.</th>
              </tr>
            </thead>
            <tbody>
              {packing.map((item: any) => (
                <tr key={item.serial_number}>
                  <td className="font-mono text-muted-foreground">{item.serial_number}</td>
                  <td className="font-medium">{item.description}</td>
                  <td className="text-right font-mono tabular-nums">{item.quantity}</td>
                  <td>{item.unit}</td>
                  <td className="text-right font-mono tabular-nums">{item.weight_kg ?? "—"}</td>
                  <td className="text-sm">{item.dimensions || "—"}</td>
                  <td className="font-mono text-sm">{item.box_number || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <DialogTitle>Cancel Dispatch Note</DialogTitle>
            <DialogDescription>This will cancel DN {dn.dn_number}. This action cannot be undone.</DialogDescription>
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
              Cancel DN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
