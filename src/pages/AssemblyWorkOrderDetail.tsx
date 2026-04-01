import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, Package, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAssemblyWorkOrder,
  fetchMaterialIssueRequests,
  createMaterialIssueRequest,
  completeAssemblyWorkOrder,
  cancelAssemblyWorkOrder,
  type AwoLineItem,
  type MaterialIssueRequest,
} from "@/lib/production-api";
import { format, differenceInDays, parseISO } from "date-fns";

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-slate-100 text-slate-700" },
    pending_materials: { label: "Pending Materials", className: "bg-amber-100 text-amber-800" },
    in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-800" },
    complete: { label: "Complete", className: "bg-green-100 text-green-800" },
    cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
  };
  const s = map[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
  return <Badge className={s.className}>{s.label}</Badge>;
}

function mirStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
    partially_issued: { label: "Partially Issued", className: "bg-blue-100 text-blue-800" },
    issued: { label: "Issued", className: "bg-green-100 text-green-800" },
    cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
  };
  const s = map[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
  return <Badge className={s.className}>{s.label}</Badge>;
}

function AvailabilityCell({ line }: { line: AwoLineItem }) {
  const stock = line.stock_free ?? 0;
  if (stock >= line.required_qty) {
    return <Badge className="bg-green-100 text-green-800">Ready</Badge>;
  } else if (stock > 0) {
    return <Badge className="bg-amber-100 text-amber-800">Partial</Badge>;
  } else {
    const need = line.required_qty - stock;
    return <span className="text-red-600 text-sm font-medium">Short — need {need} more</span>;
  }
}

export default function AssemblyWorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);

  const { data: awo, isLoading } = useQuery({
    queryKey: ["awo-detail", id],
    queryFn: () => fetchAssemblyWorkOrder(id!),
    enabled: !!id,
  });

  const { data: mirs = [] } = useQuery({
    queryKey: ["mirs", id],
    queryFn: () => fetchMaterialIssueRequests({ awo_id: id }),
    enabled: !!id,
  });

  const requestMaterialsMutation = useMutation({
    mutationFn: () => createMaterialIssueRequest(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["awo-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["mirs", id] });
      toast({
        title: "Material Issue Request created",
        description: "Storekeeper notified.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => completeAssemblyWorkOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["awo-detail", id] });
      setConfirmCompleteOpen(false);
      toast({ title: "Work Order complete", description: "Stock updated." });
      navigate(-1);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelAssemblyWorkOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["awo-detail", id] });
      toast({ title: "Work order cancelled" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const latestMir: MaterialIssueRequest | undefined = mirs[0];

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground">Loading work order…</div>
    );
  }

  if (!awo) {
    return (
      <div className="p-6 text-center text-muted-foreground">Work order not found.</div>
    );
  }

  const handlePrint = () => window.print();

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Print styles */}
      <style>{`@media print { .no-print { display: none !important; } .print-only { display: block !important; } }`}</style>

      {/* Printable section */}
      <div className="print-only hidden">
        <h2 className="text-xl font-bold">Work Order: {awo.awo_number}</h2>
        {awo.awo_type === 'finished_good' && awo.serial_number && (
          <p>Serial Number: {awo.serial_number}</p>
        )}
        <p>Build: {awo.item_description} ({awo.item_code})</p>
        <p>Quantity: {awo.quantity_to_build}</p>
        <p>Raised By: {awo.raised_by}</p>
        <p>Date: {awo.awo_date}</p>
        <br />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: "6px" }}>S.No</th>
              <th style={{ border: "1px solid #ccc", padding: "6px" }}>Drawing No</th>
              <th style={{ border: "1px solid #ccc", padding: "6px" }}>Description</th>
              <th style={{ border: "1px solid #ccc", padding: "6px" }}>Qty Required</th>
              <th style={{ border: "1px solid #ccc", padding: "6px" }}>Unit</th>
              <th style={{ border: "1px solid #ccc", padding: "6px" }}>✓</th>
            </tr>
          </thead>
          <tbody>
            {(awo.line_items ?? []).map((li, idx) => (
              <tr key={li.id}>
                <td style={{ border: "1px solid #ccc", padding: "6px" }}>{idx + 1}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px" }}>{li.drawing_number ?? "—"}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px" }}>{li.item_description ?? "—"}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px" }}>{li.required_qty}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px" }}>{li.unit}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px" }}></td>
              </tr>
            ))}
          </tbody>
        </table>
        <br />
        <p>Issued By: _____________ &nbsp;&nbsp;&nbsp; Date: _____________</p>
      </div>

      {/* Header */}
      <div className="no-print flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{awo.awo_number}</h1>
              {statusBadge(awo.status)}
            </div>
            <p className="text-muted-foreground mt-1">
              {awo.item_description} <span className="text-sm font-mono">({awo.item_code})</span>
            </p>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              <span>Qty: <b className="text-foreground">{awo.quantity_to_build}</b></span>
              <span>Raised by: <b className="text-foreground">{awo.raised_by ?? "—"}</b></span>
              {awo.planned_date && (
                <span>Planned: <b className="text-foreground">{format(parseISO(awo.planned_date), "dd MMM yyyy")}</b></span>
              )}
              {awo.serial_number && (
                <span>Serial: <b className="text-foreground font-mono">{awo.serial_number}</b></span>
              )}
              <span className="text-slate-400">
                {differenceInDays(new Date(), parseISO(awo.created_at))}d open
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print Checklist
            </Button>
            {awo.status === 'draft' && (
              <Button
                size="sm"
                onClick={() => requestMaterialsMutation.mutate()}
                disabled={requestMaterialsMutation.isPending}
              >
                <Package className="w-4 h-4 mr-2" />
                {requestMaterialsMutation.isPending ? "Requesting…" : "Request Materials"}
              </Button>
            )}
            {awo.status === 'in_progress' && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setConfirmCompleteOpen(true)}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete Work Order
              </Button>
            )}
            {(awo.status === 'draft' || awo.status === 'pending_materials') && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* BOM Checklist */}
      <div className="no-print space-y-3">
        <h2 className="text-lg font-semibold">BOM Checklist</h2>
        <div className="paper-card !p-0">
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Drawing No</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th className="text-right">Required Qty</th>
                  <th className="text-right">Issued Qty</th>
                  <th className="text-right">Available</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(awo.line_items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No BOM lines for this work order.
                    </td>
                  </tr>
                ) : (
                  (awo.line_items ?? []).map((li) => (
                    <tr key={li.id}>
                      <td className="font-mono text-xs text-blue-700">{li.drawing_number ?? "—"}</td>
                      <td>
                        <p className="text-sm font-medium">{li.item_code ?? "—"}</p>
                        {li.item_description && (
                          <p className="text-xs text-muted-foreground">{li.item_description}</p>
                        )}
                      </td>
                      <td className="text-sm text-muted-foreground">
                        {li.is_critical ? (
                          <span className="text-red-600 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Critical
                          </span>
                        ) : "Standard"}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm">{li.required_qty}</td>
                      <td className="text-right font-mono tabular-nums text-sm">{li.issued_qty}</td>
                      <td className="text-right font-mono tabular-nums text-sm">{li.stock_free ?? 0}</td>
                      <td><AvailabilityCell line={li} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Material Issue section */}
      {latestMir && (
        <div className="no-print space-y-3">
          <h2 className="text-lg font-semibold">Material Issue Request</h2>
          <div className="paper-card space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono font-medium text-sm">{latestMir.mir_number}</span>
              {mirStatusBadge(latestMir.status)}
              {latestMir.requested_by && (
                <span className="text-sm text-muted-foreground">Requested by: {latestMir.requested_by}</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>Drawing No</th>
                    <th>Description</th>
                    <th className="text-right">Required Qty</th>
                    <th className="text-right">Issued Qty</th>
                    <th className="text-right">Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {(latestMir.line_items ?? []).map((li) => (
                    <tr key={li.id}>
                      <td className="font-mono text-xs text-blue-700">{li.drawing_number ?? "—"}</td>
                      <td className="text-sm">{li.item_description ?? "—"}</td>
                      <td className="text-right font-mono tabular-nums text-sm">{li.requested_qty}</td>
                      <td className="text-right font-mono tabular-nums text-sm">{li.issued_qty}</td>
                      <td className="text-right font-mono tabular-nums text-sm text-red-600">
                        {li.shortage_qty > 0 ? li.shortage_qty : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {latestMir.issued_by && (
              <p className="text-sm text-muted-foreground">Issued by: <b>{latestMir.issued_by}</b></p>
            )}
          </div>
        </div>
      )}

      {/* Complete confirmation dialog */}
      <Dialog open={confirmCompleteOpen} onOpenChange={setConfirmCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Work Order?</DialogTitle>
            <DialogDescription>
              This will backflush all issued components and update stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            <p className="text-muted-foreground">
              Components consumed: <b>{(awo.line_items ?? []).filter((li) => li.issued_qty > 0).length} items</b>
            </p>
            <p className="text-muted-foreground">
              <b>{awo.item_description}</b> stock will increase by <b>{awo.quantity_to_build}</b>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCompleteOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? "Completing…" : "Confirm Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
