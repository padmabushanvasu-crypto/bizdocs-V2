import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, AlertTriangle, CheckCircle2, Clock, ExternalLink, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchGRN } from "@/lib/grn-api";
import { DocumentHeader } from "@/components/DocumentHeader";
import { DocumentActions } from "@/components/DocumentActions";
import { AuditTimeline } from "@/components/AuditTimeline";

const statusClass: Record<string, string> = {
  draft: "status-draft",
  recorded: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  verified: "status-paid",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", recorded: "Recorded", verified: "Verified",
};

export default function GRNDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: grn, isLoading } = useQuery({
    queryKey: ["grn", id],
    queryFn: () => fetchGRN(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!grn) return <div className="p-6 text-muted-foreground">GRN not found.</div>;

  const items = grn.line_items || [];
  const rejectedItems = items.filter((i) => i.rejected_quantity > 0);

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
          <h1 className="text-xl font-display font-bold font-mono text-foreground">{grn.grn_number}</h1>
          <span className={statusClass[grn.status] || "status-draft"}>{statusLabels[grn.status] || grn.status}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <DocumentActions documentNumber={grn.grn_number} documentType="Goods Receipt Note" />
          {grn.po_id && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/purchase-orders/${grn.po_id}`)}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> View PO {grn.po_number}
            </Button>
          )}
        </div>
      </div>

      {/* Rejection Summary */}
      {rejectedItems.length > 0 && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-bold text-destructive">
              {grn.total_rejected} item{grn.total_rejected > 1 ? "s" : ""} rejected
            </h3>
          </div>
          {rejectedItems.map((item) => (
            <p key={item.serial_number} className="text-sm text-muted-foreground">
              {item.description}: <span className="text-destructive font-medium">{item.rejected_quantity} rejected</span>
              {item.rejection_reason && <span> — {item.rejection_reason}</span>}
            </p>
          ))}
        </div>
      )}

      {/* Document Preview */}
      <div className="paper-card space-y-6">
        <DocumentHeader />
        <div className="text-center border-b border-border pb-4">
          <h2 className="text-lg font-display font-bold text-primary uppercase tracking-wider">Goods Receipt Note</h2>
        </div>

        {/* Header Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-1">Vendor</p>
              <p className="font-medium text-foreground">{grn.vendor_name || "—"}</p>
            </div>
            {grn.vendor_invoice_number && (
              <div>
                <p className="text-xs text-muted-foreground">Vendor Invoice</p>
                <p className="font-mono">{grn.vendor_invoice_number}</p>
              </div>
            )}
            {grn.vendor_invoice_date && (
              <div>
                <p className="text-xs text-muted-foreground">Invoice Date</p>
                <p>{new Date(grn.vendor_invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
              </div>
            )}
          </div>
          <div className="text-left md:text-right space-y-2 text-sm">
            <div className="flex md:justify-end gap-4">
              <div>
                <p className="text-xs text-muted-foreground">GRN No.</p>
                <p className="font-mono font-medium">{grn.grn_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p>{new Date(grn.grn_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
              </div>
            </div>
            {grn.po_number && (
              <div className="md:text-right">
                <p className="text-xs text-muted-foreground">Against PO</p>
                <button
                  className="font-mono text-sm text-primary hover:underline"
                  onClick={() => navigate(`/purchase-orders/${grn.po_id}`)}
                >
                  {grn.po_number}
                </button>
              </div>
            )}
            {grn.vehicle_number && (
              <div className="md:text-right">
                <p className="text-xs text-muted-foreground">Vehicle</p>
                <p>{grn.vehicle_number}</p>
              </div>
            )}
            {grn.received_by && (
              <div className="md:text-right">
                <p className="text-xs text-muted-foreground">Received By</p>
                <p>{grn.received_by}</p>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Description</th>
                <th>Drawing</th>
                <th className="text-right">PO Qty</th>
                <th className="text-right">Received</th>
                <th className="text-right">Accepted</th>
                <th className="text-right">Rejected</th>
                <th>Reason</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.serial_number} className={item.rejected_quantity > 0 ? "bg-destructive/5" : ""}>
                  <td className="font-mono text-muted-foreground">{item.serial_number}</td>
                  <td className="font-medium">{item.description}</td>
                  <td className="font-mono text-sm text-muted-foreground">{item.drawing_number || "—"}</td>
                  <td className="text-right font-mono tabular-nums text-muted-foreground">{item.po_quantity}</td>
                  <td className="text-right font-mono tabular-nums">{item.receiving_now}</td>
                  <td className="text-right font-mono tabular-nums text-emerald-600 font-medium">{item.accepted_quantity}</td>
                  <td className="text-right font-mono tabular-nums">
                    {item.rejected_quantity > 0 ? (
                      <span className="text-destructive font-medium">{item.rejected_quantity}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="text-muted-foreground">{item.rejection_reason || "—"}</td>
                  <td className="text-muted-foreground">{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Received</span>
              <span className="font-mono tabular-nums font-medium">{grn.total_received}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accepted</span>
              <span className="font-mono tabular-nums text-emerald-600 font-medium">{grn.total_accepted}</span>
            </div>
            {grn.total_rejected > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rejected</span>
                <span className="font-mono tabular-nums text-destructive font-medium">{grn.total_rejected}</span>
              </div>
            )}
          </div>
        </div>

        {grn.notes && (
          <div>
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-1">Notes</p>
            <p className="text-sm">{grn.notes}</p>
          </div>
        )}
      </div>

      {/* Audit Trail */}
      <div className="print:hidden">
        <AuditTimeline documentId={id!} />
      </div>
    </div>
  );
}
