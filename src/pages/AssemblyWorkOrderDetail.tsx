import { useState } from "react";
import { printWithLightMode } from "@/lib/print-utils";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, Package, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchAssemblyWorkOrder,
  fetchMaterialIssueRequests,
  createMaterialIssueRequest,
  completeAssemblyWorkOrder,
  cancelAssemblyWorkOrder,
  reportComponentIssue,
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
  const { user } = useAuth();

  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelOption, setCancelOption] = useState<StockAction>('none');
  const [partialLines, setPartialLines] = useState<Record<string, { return_qty: number; scrap_qty: number }>>({});

  // FIX 5B: Report Issue dialog state
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [reportIssueLine, setReportIssueLine] = useState<AwoLineItem | null>(null);
  const [reportIssueForm, setReportIssueForm] = useState<{
    damage_qty: number;
    disposition: 'scrap' | 'use_as_is' | 'return_to_vendor';
    reason: string;
  }>({ damage_qty: 0, disposition: 'scrap', reason: '' });

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

  // FIX 5C: Report Issue mutation
  const reportIssueMutation = useMutation({
    mutationFn: async () => {
      if (!reportIssueLine) throw new Error("No line selected");
      // concession_by is a uuid FK to auth.users(id) — must pass a UUID,
      // not a display name. Bail before the API call if no UUID is available
      // so we surface a clean toast rather than a Postgres FK error.
      if (!user?.id) throw new Error("Not authenticated");
      return reportComponentIssue(
        reportIssueLine.id,
        reportIssueForm.damage_qty,
        reportIssueForm.disposition,
        reportIssueForm.reason,
        user.id,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["awo-detail", id] });
      setReportIssueOpen(false);
      toast({ title: "Issue recorded successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const latestMir: MaterialIssueRequest | undefined = mirs[0];

  // FIX 5D: Derived unfulfilled lines for warning banner + button guard.
  // damage_qty only counts toward fulfilment when the disposition is
  // use_as_is — i.e. the team accepts the gap and proceeds with short qty.
  // For scrap or return_to_vendor the line is genuinely short by damage_qty
  // and needs replacement before the WO can complete.
  const effectivelyIssued = (li: AwoLineItem): number => {
    const issued = li.issued_qty ?? 0;
    const damage = li.damage_qty ?? 0;
    const useAsIs = li.disposition === 'use_as_is';
    return issued + (useAsIs ? damage : 0);
  };
  const unfulfilledLines = (awo?.line_items ?? []).filter(
    (li) => effectivelyIssued(li) < li.required_qty,
  );
  const hasUnfulfilled = unfulfilledLines.length > 0;

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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                        onClick={() => setConfirmCompleteOpen(true)}
                        disabled={hasUnfulfilled}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Complete Work Order
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {hasUnfulfilled && (
                    <TooltipContent>
                      <p>{unfulfilledLines.length} component(s) still short — resolve before completing</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
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

      {/* FIX 5D: Warning banner — shown when in_progress with unfulfilled lines */}
      {awo.status === 'in_progress' && hasUnfulfilled && (
        <div className="no-print flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <b>{unfulfilledLines.length} component{unfulfilledLines.length !== 1 ? 's' : ''}</b> still short.
            Issue remaining stock or record a disposition for each short item before completing the work order.
          </p>
        </div>
      )}

      {/* BOM Checklist */}
      <div className="no-print space-y-3">
        <h2 className="text-lg font-semibold">BOM Checklist</h2>
        <div className="paper-card !p-0">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-left">Item Code</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-left">Description</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-left">Type</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-right">Required Qty</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-right">Issued Qty</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-right">Available</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-center">Status</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-center">Action</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-center">Damage</th>
                </tr>
              </thead>
              <tbody>
                {(awo.line_items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">No data found</td>
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
                      <td className="px-3 py-2 border-b border-slate-100 text-center">
                        {li.disposition === 'use_as_is' ? (
                          <Badge className="bg-amber-100 text-amber-800">Accepted as-is</Badge>
                        ) : (li.issued_qty ?? 0) >= li.required_qty ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-red-600 text-xs font-medium">
                              Short — {li.required_qty - (li.issued_qty ?? 0)} pending
                            </span>
                            {awo.status === 'in_progress' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-6 px-2 text-amber-700 border-amber-300 hover:bg-amber-50"
                                onClick={() => {
                                  setReportIssueLine(li);
                                  setReportIssueForm({
                                    damage_qty: li.required_qty - (li.issued_qty ?? 0),
                                    disposition: 'scrap',
                                    reason: '',
                                  });
                                  setReportIssueOpen(true);
                                }}
                              >
                                Report Issue
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-center">
                        {(li.issued_qty ?? 0) >= li.required_qty && awo.status === 'in_progress' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-6 px-2 text-orange-700 border-orange-300 hover:bg-orange-50"
                            onClick={() => {
                              setReportIssueLine(li);
                              setReportIssueForm({
                                damage_qty: 1,
                                disposition: 'scrap',
                                reason: '',
                              });
                              setReportIssueOpen(true);
                            }}
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Report Damage
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
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
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-left">Drawing No</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-left">Description</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-right">Required Qty</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-right">Issued Qty</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-right">Shortage</th>
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

      {/* FIX 5B: Report Issue / Damage dialog — adapts to two scenarios:
          (1) Short line — assembler explains why MIR fell short
          (2) Fully issued line — assembler reports a unit damaged during build */}
      <Dialog open={reportIssueOpen} onOpenChange={setReportIssueOpen}>
        <DialogContent>
          {(() => {
            const issued = reportIssueLine?.issued_qty ?? 0;
            const required = reportIssueLine?.required_qty ?? 0;
            const isFullyIssued = issued >= required;
            const gap = Math.max(0, required - issued);
            // Cap the qty input: for fully-issued lines, can't damage more
            // than what was actually issued; for short lines, can't claim
            // more units damaged than the open gap. Math.max with 1 keeps
            // the boundary edge cases from disabling the form entirely.
            const maxAllowed = Math.max(issued, isFullyIssued ? 1 : gap);
            const qtyValid =
              reportIssueForm.damage_qty > 0 &&
              reportIssueForm.damage_qty <= maxAllowed;
            const reasonValid = reportIssueForm.reason.trim().length > 0;
            const isValid = qtyValid && reasonValid;
            const unit = reportIssueLine?.unit ?? '';
            const consequence =
              reportIssueForm.disposition === 'scrap'
                ? ' and write a scrap_write_off ledger entry'
                : reportIssueForm.disposition === 'return_to_vendor'
                ? ', return them to free stock, and write an assembly_return ledger entry'
                : ' (use-as-is — no stock movement, just records concession)';
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {isFullyIssued ? 'Report Component Damage' : 'Report Component Issue'}
                  </DialogTitle>
                  <DialogDescription>
                    {reportIssueLine?.item_description ?? reportIssueLine?.item_code ?? 'Component'}
                    {' — '}
                    {isFullyIssued
                      ? 'report units damaged during assembly'
                      : `short by ${gap} ${unit}`}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label>Disposition</Label>
                    <Select
                      value={reportIssueForm.disposition}
                      onValueChange={(v) =>
                        setReportIssueForm((f) => ({ ...f, disposition: v as typeof f.disposition }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scrap">Scrap — write off damaged stock</SelectItem>
                        <SelectItem value="use_as_is">Accept as-is — proceed with short qty</SelectItem>
                        <SelectItem value="return_to_vendor">Return to vendor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Quantity affected</Label>
                    <Input
                      type="number"
                      min={0}
                      max={maxAllowed}
                      value={reportIssueForm.damage_qty}
                      onChange={(e) =>
                        setReportIssueForm((f) => ({ ...f, damage_qty: Number(e.target.value) }))
                      }
                    />
                    {!qtyValid && (
                      <p className="text-xs text-red-600">
                        {reportIssueForm.damage_qty <= 0
                          ? 'Quantity must be greater than 0.'
                          : `Quantity must be between 1 and ${maxAllowed} ${unit}.`}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reason / notes</Label>
                    <Input
                      value={reportIssueForm.reason}
                      onChange={(e) => setReportIssueForm((f) => ({ ...f, reason: e.target.value }))}
                      placeholder="Describe the issue…"
                    />
                    {!reasonValid && (
                      <p className="text-xs text-red-600">Reason is required.</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This will deduct {reportIssueForm.damage_qty || 0} {unit} from WIP{consequence}, then notify the storekeeper.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setReportIssueOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => reportIssueMutation.mutate()}
                    disabled={reportIssueMutation.isPending || !isValid}
                  >
                    {reportIssueMutation.isPending ? "Saving…" : "Record Issue"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
