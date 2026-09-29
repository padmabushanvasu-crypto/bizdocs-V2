import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCanEdit } from "@/hooks/useCanEdit";
import { formatCurrency } from "@/lib/gst-utils";
import {
  fetchProcessorInvoices,
  fetchProcessorParties,
  cancelProcessorInvoice,
  type ProcessorInvoiceRow,
} from "@/lib/processor-invoices-api";

const TH = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200";
const TD = "px-3 py-2 text-sm text-slate-700 border-b border-slate-100";

export default function ProcessorInvoices() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = useCanEdit("processor-invoices");

  const [partyId, setPartyId] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "cancelled">("all");
  const [cancelTarget, setCancelTarget] = useState<ProcessorInvoiceRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: parties = [], error: partiesError } = useQuery({
    queryKey: ["processor-parties"],
    queryFn: fetchProcessorParties,
  });

  const { data: invoices = [], isLoading, error } = useQuery({
    queryKey: ["processor-invoices", partyId, status],
    queryFn: () =>
      fetchProcessorInvoices({
        partyId: partyId === "all" ? undefined : partyId,
        status: status === "all" ? undefined : status,
      }),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelProcessorInvoice(id, reason),
    onSuccess: () => {
      toast({ title: "Invoice cancelled" });
      setCancelTarget(null);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["processor-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["processor-invoice-lines"] });
      queryClient.invalidateQueries({ queryKey: ["dc-invoice-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["job-card-processing-cost"] });
    },
    // RPC check_violation messages are readable — show verbatim.
    onError: (e: Error) => toast({ title: "Could not cancel invoice", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Processor Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Invoices received from job-work processors, against DC lines</p>
        </div>
        {canEdit && (
          <Button onClick={() => navigate("/processor-invoices/new")}>
            <Plus className="h-4 w-4 mr-1" /> New Invoice
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={partyId} onValueChange={setPartyId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="All processors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All processors</SelectItem>
            {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {partiesError && <p className="text-xs text-red-600">Could not load processors: {(partiesError as Error).message}</p>}
      {error && <p className="text-sm text-red-600">Could not load invoices: {(error as Error).message}</p>}

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Invoice #</th>
                <th className={`${TH} text-left`}>Date</th>
                <th className={`${TH} text-left`}>Processor</th>
                <th className={`${TH} text-right`}>Lines</th>
                <th className={`${TH} text-right`}>Taxable</th>
                <th className={`${TH} text-right`}>GST</th>
                <th className={`${TH} text-right`}>Total</th>
                <th className={`${TH} text-center`}>Status</th>
                <th className={`${TH} text-center`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td></tr>
              ) : invoices.length === 0 && !error ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">No processor invoices found</td></tr>
              ) : (
                invoices.map((inv) => {
                  const cancelled = inv.status === "cancelled";
                  return (
                    <tr key={inv.id} className={cancelled ? "opacity-60 bg-slate-50" : ""}>
                      <td className={`${TD} font-mono font-medium ${cancelled ? "line-through" : ""}`}>{inv.invoice_number}</td>
                      <td className={TD}>{new Date(inv.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className={`${TD} font-medium`}>{inv.party_name ?? "—"}</td>
                      <td className={`${TD} text-right tabular-nums font-mono`}>{inv.line_count}</td>
                      <td className={`${TD} text-right tabular-nums font-mono`}>{formatCurrency(inv.taxable_total)}</td>
                      <td className={`${TD} text-right tabular-nums font-mono`}>{formatCurrency(inv.gst_total)}</td>
                      <td className={`${TD} text-right tabular-nums font-mono font-medium`}>{formatCurrency(inv.taxable_total + inv.gst_total)}</td>
                      <td className={`${TD} text-center`}>
                        {cancelled ? (
                          <div>
                            <span className="bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium px-2.5 py-0.5 rounded-full">Cancelled</span>
                            {inv.cancelled_reason && (
                              <p className="text-[11px] text-slate-500 mt-1 max-w-[220px] mx-auto">{inv.cancelled_reason}</p>
                            )}
                          </div>
                        ) : (
                          <span className="bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full">Active</span>
                        )}
                      </td>
                      <td className={`${TD} text-center`}>
                        {!cancelled && canEdit && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setCancelTarget(inv); setCancelReason(""); }}>
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open && !cancelMutation.isPending) setCancelTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Cancel invoice {cancelTarget?.invoice_number}</DialogTitle>
            <DialogDescription>
              Its lines go back to pending against their DCs. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation…"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" disabled={cancelMutation.isPending} onClick={() => setCancelTarget(null)}>Keep invoice</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              onClick={() => cancelTarget && cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason.trim() })}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
