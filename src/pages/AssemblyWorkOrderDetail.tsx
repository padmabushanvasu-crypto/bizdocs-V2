import { useState } from "react";
import { printWithLightMode } from "@/lib/print-utils";
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

type StockAction = 'none' | 'return_all' | 'partial' | 'scrap_all';

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
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelOption, setCancelOption] = useState<StockAction>('none');
  const [partialLines, setPartialLines] = useState<Record<string, { return_qty: number; scrap_qty: number }>>({});

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
    mutationFn: async () => {
      const pLines =
        cancelOption === 'partial'
          ? Object.entries(partialLines).map(([item_id, vals]) => ({
              item_id,
              return_qty: vals.return_qty,
              scrap_qty: vals.scrap_qty,
            }))
          : undefined;
      return cancelAssemblyWorkOrder(id!, cancelOption, pLines);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["awo-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["sa-work-orders-wip"] });
      queryClient.invalidateQueries({ queryKey: ["fg-work-orders-wip"] });
      queryClient.invalidateQueries({ queryKey: ["awo-stats-dashboard"] });
      setCancelDialogOpen(false);
      toast({ title: "Work order cancelled" });
      if (awo?.awo_type === 'sub_assembly') {
        navigate('/sub-assembly-work-orders');
      } else {
        navigate('/finished-good-work-orders');
      }
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

  const handlePrint = () => printWithLightMode();

  const issuedLines = (awo.line_items ?? []).filter(
    (li) => li.item_id && li.issued_qty > 0
  );

  // Validation for partial option
  const hasValidationErrors =
    cancelOption === 'partial' &&
    Object.entries(partialLines).some(([item_id, vals]) => {
      const issued = issuedLines.find((li) => li.item_id === item_id)?.issued_qty ?? 0;
      return vals.return_qty + vals.scrap_qty > issued;
    });

  const openCancelDialog = () => {
    const defaultOption: StockAction =
      awo.status === 'in_progress' ? 'return_all' : 'none';
    setCancelOption(defaultOption);
    // Initialize partial lines from issued items
    const lines: Record<string, { return_qty: number; scrap_qty: number }> = {};
    issuedLines.forEach((li) => {
      lines[li.item_id!] = { return_qty: li.issued_qty, scrap_qty: 0 };
    });
    setPartialLines(lines);
    setCancelDialogOpen(true);
  };

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
            {(awo.status === 'draft' || awo.status === 'pending_materials' || awo.status === 'in_progress') && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={openCancelDialog}
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
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item Code</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Type</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Required Qty</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Issued Qty</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Available</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {(awo.line_items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">No data found</td>
                  </tr>
                ) : (
                  (awo.line_items ?? []).map((li) => (
                    <tr key={li.id}>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-blue-700">{li.drawing_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        <p className="text-sm font-medium">{li.item_description}</p>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        {li.is_critical ? (
                          <span className="text-red-600 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Critical
                          </span>
                        ) : "Standard"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{li.required_qty}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{li.issued_qty}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{li.stock_free ?? 0}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center"><AvailabilityCell line={li} /></td>
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
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Required Qty</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Issued Qty</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {(latestMir.line_items ?? []).map((li) => (
                    <tr key={li.id}>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-blue-700">{li.drawing_number ?? "—"}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{li.item_description ?? "—"}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{li.requested_qty}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{li.issued_qty}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono text-red-600">
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

      {/* Cancel work order dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cancel Work Order</DialogTitle>
            <DialogDescription>
              How should we handle the materials for this order?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* draft / pending_materials: only Option A */}
            {(awo.status === 'draft' || awo.status === 'pending_materials') && (
              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="cancelOption"
                  value="none"
                  checked={cancelOption === 'none'}
                  onChange={() => setCancelOption('none')}
                  className="mt-0.5 accent-slate-700"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">No materials issued yet — cancel only</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No stock changes will be made.</p>
                </div>
              </label>
            )}

            {/* in_progress: three options */}
            {awo.status === 'in_progress' && (
              <>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="cancelOption"
                    value="return_all"
                    checked={cancelOption === 'return_all'}
                    onChange={() => setCancelOption('return_all')}
                    className="mt-0.5 accent-slate-700"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Materials issued but work not started</p>
                    <p className="text-xs text-muted-foreground mt-0.5">All issued materials will be returned to store.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="cancelOption"
                    value="partial"
                    checked={cancelOption === 'partial'}
                    onChange={() => setCancelOption('partial')}
                    className="mt-0.5 accent-slate-700"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">Work partially done — some materials scrapped</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Specify how much to return to store and how much to write off.</p>
                  </div>
                </label>

                {/* Partial lines table */}
                {cancelOption === 'partial' && issuedLines.length > 0 && (
                  <div className="ml-6 overflow-x-auto rounded-lg border border-slate-200">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                          <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.05em" }}>Item Code</th>
                          <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.05em" }}>Description</th>
                          <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.05em" }}>Issued</th>
                          <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.05em" }}>Return to Store</th>
                          <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.05em" }}>Scrap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {issuedLines.map((li) => {
                          const pl = partialLines[li.item_id!] ?? { return_qty: li.issued_qty, scrap_qty: 0 };
                          const exceeded = pl.return_qty + pl.scrap_qty > li.issued_qty;
                          return (
                            <tr key={li.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#3b82f6" }}>{li.drawing_number ?? li.item_code ?? "—"}</td>
                              <td style={{ padding: "6px 10px", color: "#334155", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{li.item_description ?? "—"}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace", color: "#475569" }}>{li.issued_qty}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right" }}>
                                <input
                                  type="number"
                                  min={0}
                                  max={li.issued_qty}
                                  step={1}
                                  value={pl.return_qty}
                                  onChange={(e) => {
                                    const v = Math.max(0, Number(e.target.value));
                                    setPartialLines((prev) => ({
                                      ...prev,
                                      [li.item_id!]: { ...pl, return_qty: v },
                                    }));
                                  }}
                                  style={{ width: "64px", textAlign: "right", border: exceeded ? "1px solid #ef4444" : "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 6px", fontSize: "13px" }}
                                />
                              </td>
                              <td style={{ padding: "6px 10px", textAlign: "right" }}>
                                <input
                                  type="number"
                                  min={0}
                                  max={li.issued_qty}
                                  step={1}
                                  value={pl.scrap_qty}
                                  onChange={(e) => {
                                    const v = Math.max(0, Number(e.target.value));
                                    setPartialLines((prev) => ({
                                      ...prev,
                                      [li.item_id!]: { ...pl, scrap_qty: v },
                                    }));
                                  }}
                                  style={{ width: "64px", textAlign: "right", border: exceeded ? "1px solid #ef4444" : "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 6px", fontSize: "13px" }}
                                />
                                {exceeded && (
                                  <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "2px" }}>Exceeds issued</p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="cancelOption"
                    value="scrap_all"
                    checked={cancelOption === 'scrap_all'}
                    onChange={() => setCancelOption('scrap_all')}
                    className="mt-0.5 accent-slate-700"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Entire batch scrapped</p>
                    <p className="text-xs text-muted-foreground mt-0.5">All issued materials will be written off as scrap.</p>
                  </div>
                </label>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelMutation.isPending}
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || hasValidationErrors}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
