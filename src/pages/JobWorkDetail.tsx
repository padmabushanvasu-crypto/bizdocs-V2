import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Factory,
  Truck,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  MapPin,
  RotateCcw,
  Pause,
  Play,
  PackageCheck,
  TrendingDown,
  TrendingUp,
  Package,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  fetchJobWork,
  fetchJobWorkSummary,
  updateJobWorkStep,
  deleteJobWorkStep,
  createJobWorkStep,
  recordStepReturn,
  completeJobWork,
  updateJobWorkStatus,
  fetchItemCurrentStock,
  fetchItemUnit,
  issueJobWorkMaterial,
  fetchJobWorkStockMovements,
  type JobWorkStep,
  type RecordReturnData,
  type StockMovement,
} from "@/lib/job-works-api";
import { fetchDCsForJobWork, fetchDCLineItemsForJobWork, type DeliveryChallan, type DCLineItemWithDC } from "@/lib/delivery-challans-api";
import { AddStepDialog } from "@/components/AddStepDialog";
import { RecordReturnDialog } from "@/components/RecordReturnDialog";
import { AuditTimeline } from "@/components/AuditTimeline";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "₹") {
  if (n == null) return "—";
  return `${prefix}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function statusBadge(status: JobWorkStep["status"]) {
  if (status === "done")
    return (
      <Badge className="status-completed text-xs">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Done
      </Badge>
    );
  if (status === "in_progress")
    return (
      <Badge className="status-pending text-xs">
        <Clock className="h-3 w-3 mr-1" /> In Progress
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      <Clock className="h-3 w-3 mr-1" /> Pending
    </Badge>
  );
}

function inspectionBadge(result: JobWorkStep["inspection_result"]) {
  if (!result) return null;
  if (result === "accepted")
    return <Badge className="status-completed text-xs">Accepted</Badge>;
  if (result === "partially_accepted")
    return <Badge className="status-pending text-xs">Partial</Badge>;
  return <Badge className="status-overdue text-xs">Rejected</Badge>;
}

function stepCost(step: JobWorkStep): number {
  if (step.step_type === "internal") {
    return (step.labour_cost ?? 0) + (step.material_cost ?? 0) + (step.additional_cost ?? 0);
  }
  return (
    (step.job_work_charges ?? 0) +
    (step.transport_cost_out ?? 0) +
    (step.transport_cost_in ?? 0) +
    (step.material_consumed ?? 0)
  );
}

// ─── Step card ──────────────────────────────────────────────────────────────

interface StepCardProps {
  step: JobWorkStep;
  readOnly?: boolean;
  onEdit: (step: JobWorkStep) => void;
  onDelete: (step: JobWorkStep) => void;
  onRecordReturn: (step: JobWorkStep) => void;
}

function StepCard({ step, readOnly, onEdit, onDelete, onRecordReturn }: StepCardProps) {
  const isExternal = step.step_type === "external";
  const canEdit = !readOnly && step.status !== "done";
  const canReturn =
    !readOnly &&
    isExternal &&
    step.status !== "done" &&
    (step.qty_returned == null || step.qty_returned === 0);

  return (
    <div className="relative pl-8">
      {/* timeline spine */}
      <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
      {/* timeline dot */}
      <div
        className={`absolute left-1.5 top-4 h-3 w-3 rounded-full border-2 ${
          step.status === "done"
            ? "bg-green-500 border-green-500"
            : step.status === "in_progress"
            ? "bg-amber-400 border-amber-400"
            : "bg-muted border-muted-foreground/30"
        }`}
      />

      <div className="paper-card mb-3 hover:shadow-md transition-shadow duration-200">
        {/* header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-bold text-muted-foreground">
              {step.step_number}
            </span>
            {isExternal ? (
              <Truck className="h-4 w-4 text-amber-600" />
            ) : (
              <Factory className="h-4 w-4 text-blue-600" />
            )}
            <span className="font-medium text-sm">{step.name}</span>
            {step.is_rework && (
              <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
                <RotateCcw className="h-3 w-3 mr-1" /> Rework
              </Badge>
            )}
            {statusBadge(step.status)}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canReturn && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => onRecordReturn(step)}
              >
                <PackageCheck className="h-3 w-3 mr-1" /> Record Return
              </Button>
            )}
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEdit(step)}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onDelete(step)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* body */}
        {step.step_type === "internal" ? (
          <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
            {(step.labour_cost ?? 0) > 0 && <span>Labour: {fmt(step.labour_cost)}</span>}
            {(step.material_cost ?? 0) > 0 && <span>Material: {fmt(step.material_cost)}</span>}
            {(step.additional_cost ?? 0) > 0 && <span>Additional: {fmt(step.additional_cost)}</span>}
            <span className="font-medium text-foreground">Total: {fmt(stepCost(step))}</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
              {step.vendor_name && (
                <span className="font-medium text-foreground">{step.vendor_name}</span>
              )}
              {step.qty_sent != null && <span>Sent: {step.qty_sent} {step.unit ?? "NOS"}</span>}
              {step.expected_return_date && (
                <span>
                  Expected: {new Date(step.expected_return_date).toLocaleDateString("en-IN")}
                </span>
              )}
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
              {(step.job_work_charges ?? 0) > 0 && (
                <span>Job Work: {fmt(step.job_work_charges)}</span>
              )}
              {(step.transport_cost_out ?? 0) > 0 && (
                <span>Transport Out: {fmt(step.transport_cost_out)}</span>
              )}
              {(step.transport_cost_in ?? 0) > 0 && (
                <span>Transport In: {fmt(step.transport_cost_in)}</span>
              )}
              {(step.material_consumed ?? 0) > 0 && (
                <span>Material: {fmt(step.material_consumed)}</span>
              )}
              <span className="font-medium text-foreground">Total: {fmt(stepCost(step))}</span>
            </div>
            {step.inspection_result && (
              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/50">
                {inspectionBadge(step.inspection_result)}
                {step.qty_accepted != null && (
                  <span className="text-xs text-green-600">Accepted: {step.qty_accepted} {step.unit ?? "NOS"}</span>
                )}
                {(step.qty_rejected ?? 0) > 0 && (
                  <span className="text-xs text-red-600">Rejected: {step.qty_rejected} {step.unit ?? "NOS"}</span>
                )}
                {step.inspected_by && (
                  <span className="text-xs text-muted-foreground">by {step.inspected_by}</span>
                )}
                {step.rejection_reason && (
                  <span className="text-xs text-muted-foreground italic">
                    "{step.rejection_reason}"
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {step.notes && (
          <p className="text-xs text-muted-foreground mt-1.5 italic">{step.notes}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function JobWorkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addStepOpen, setAddStepOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<JobWorkStep | null>(null);
  const [returnStep, setReturnStep] = useState<JobWorkStep | null>(null);
  const [isStepSaving, setIsStepSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Completion dialog state
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completionOutcome, setCompletionOutcome] = useState<"stock" | "assembly" | "customer">("stock");
  const [completionNote, setCompletionNote] = useState("");

  // Material issue dialog state
  const [materialIssueOpen, setMaterialIssueOpen] = useState(false);
  const [issuingMaterial, setIssuingMaterial] = useState(false);

  const { data: jc, isLoading } = useQuery({
    queryKey: ["job-work", id],
    queryFn: () => fetchJobWork(id!),
    enabled: !!id,
  });

  const { data: summary } = useQuery({
    queryKey: ["job-work-summary", id],
    queryFn: () => fetchJobWorkSummary(id!),
    enabled: !!id,
  });

  const { data: currentItemStock } = useQuery({
    queryKey: ["item-stock-for-completion", jc?.item_id],
    queryFn: () => fetchItemCurrentStock(jc!.item_id!),
    enabled: (completeDialogOpen || materialIssueOpen) && !!jc?.item_id,
  });

  const { data: itemUnit = "NOS" } = useQuery({
    queryKey: ["item-unit", jc?.item_id],
    queryFn: () => fetchItemUnit(jc!.item_id!),
    enabled: !!jc?.item_id,
  });

  const { data: stockMovements = [] } = useQuery<StockMovement[]>({
    queryKey: ["job-work-stock-movements", id],
    queryFn: () => fetchJobWorkStockMovements(id!),
    enabled: !!id,
  });

const { data: linkedDCs = [] } = useQuery<DeliveryChallan[]>({
    queryKey: ["job-work-dcs", id],
    queryFn: () => fetchDCsForJobWork(id!),
    enabled: !!id,
  });

  const { data: dcLineItems = [] } = useQuery<DCLineItemWithDC[]>({
    queryKey: ["job-work-dc-line-items", id],
    queryFn: () => fetchDCLineItemsForJobWork(id!),
    enabled: !!id,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["job-work", id] });
    queryClient.invalidateQueries({ queryKey: ["job-work-summary", id] });
    queryClient.invalidateQueries({ queryKey: ["job-works"] });
    queryClient.invalidateQueries({ queryKey: ["jw-stats"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (stepId: string) => deleteJobWorkStep(stepId),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Step deleted" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: () => completeJobWork(id!, completionOutcome, completionNote || undefined),
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["stock-status"] });
      setCompleteDialogOpen(false);
      toast({ title: "Job Work completed" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const holdMutation = useMutation({
    mutationFn: (status: "in_progress" | "on_hold") => updateJobWorkStatus(id!, status),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Status updated" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading || !jc) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {isLoading ? "Loading…" : "Job Work not found"}
      </div>
    );
  }

  const steps = jc.steps ?? [];
  const isCompleted = jc.status === "completed";
  const isReadOnly = isCompleted;

  const openExternalSteps = steps.filter(
    (s) => s.step_type === "external" && s.status !== "done"
  );

  const totalStepCost = steps.reduce((acc, s) => acc + stepCost(s), 0);
  const totalCost = (jc.initial_cost ?? 0) + totalStepCost;
  const costPerUnit =
    (jc.quantity_accepted ?? 0) > 0 ? totalCost / jc.quantity_accepted : null;
  const variance = summary
    ? summary.variance
    : (jc.standard_cost ?? 0) > 0
    ? totalCost - (jc.standard_cost ?? 0) * jc.quantity_original
    : null;

  const handleSaveStep = async (data: Partial<JobWorkStep>) => {
    setIsStepSaving(true);
    try {
      if (editingStep) {
        await updateJobWorkStep(editingStep.id, data);
        toast({ title: "Step updated" });
      } else {
        await createJobWorkStep({ ...data, job_card_id: id! });
        toast({ title: "Step added" });
      }
      invalidateAll();
      setAddStepOpen(false);
      setEditingStep(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsStepSaving(false);
    }
  };

  const handleEditStep = (step: JobWorkStep) => {
    setEditingStep(step);
    setAddStepOpen(true);
  };

  const handleAddStepOpen = () => {
    setEditingStep(null);
    setAddStepOpen(true);
  };

  const handleStepDialogClose = (open: boolean) => {
    setAddStepOpen(open);
    if (!open) setEditingStep(null);
  };

  const handleRecordReturn = async (
    data: RecordReturnData,
    autoNext?: "send_back" | "rework_inhouse"
  ) => {
    if (!returnStep) return;
    setIsRecording(true);
    try {
      await recordStepReturn(returnStep.id, data);
      if (autoNext === "send_back") {
        await createJobWorkStep({
          job_card_id: id!,
          step_type: "external",
          name: `${returnStep.name} (Re-send)`,
          vendor_id: returnStep.vendor_id ?? undefined,
          vendor_name: returnStep.vendor_name ?? undefined,
          is_rework: false,
          status: "pending",
        } as any);
      } else if (autoNext === "rework_inhouse") {
        await createJobWorkStep({
          job_card_id: id!,
          step_type: "internal",
          name: `${returnStep.name} (In-House Rework)`,
          is_rework: true,
          rework_reason: data.rejection_reason ?? "",
          status: "pending",
        } as any);
      }
      invalidateAll();
      setReturnStep(null);
      toast({ title: "Return recorded" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsRecording(false);
    }
  };

  const handleDeleteStep = (step: JobWorkStep) => {
    if (confirm(`Delete step "${step.name}"?`)) {
      deleteMutation.mutate(step.id);
    }
  };

  const handleRaiseDC = () => {
    const activeExternalStep = steps.find(
      (s) => s.step_type === "external" && s.status !== "done"
    );
    navigate("/delivery-challans/new", {
      state: {
        prefill: {
          job_work_id: id,
          job_work_number: jc.jc_number,
          party_id: activeExternalStep?.vendor_id ?? null,
          party_name: activeExternalStep?.vendor_name ?? null,
          dc_type: "returnable",
          return_before_date: activeExternalStep?.expected_return_date ?? null,
          line_items: steps
            .filter((s) => s.step_type === "external")
            .map((s) => ({
              item_id: jc.item_id,
              item_code: jc.item_code,
              description: jc.item_description,
              quantity: s.qty_sent ?? jc.quantity_original,
              unit: s.unit ?? jc.unit,
              nature_of_process: s.name,
              drawing_number: jc.drawing_revision || jc.drawing_number,
              rate: s.job_work_charges ?? 0,
              job_work_id: id,
              job_work_number: jc.jc_number,
              job_work_step_id: s.id,
            })),
        },
      },
    });
  };

  const handleOpenComplete = () => {
    if (openExternalSteps.length > 0) {
      const s = openExternalSteps[0];
      toast({
        title: "Cannot complete",
        description: `"${s.name}" is still at ${s.vendor_name ?? "vendor"}. Record the return first.`,
        variant: "destructive",
      });
      return;
    }
    setCompletionOutcome("stock");
    setCompletionNote("");
    setCompleteDialogOpen(true);
  };

  const completionOptions = [
    {
      value: "stock" as const,
      label: "Move to Stock",
      desc: "Increase item inventory by accepted quantity",
    },
    {
      value: "assembly" as const,
      label: "Consumed into Assembly",
      desc: "Added to a parent assembly — no stock change",
    },
    {
      value: "customer" as const,
      label: "Sent to Customer",
      desc: "Shipped directly — no stock change",
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      {/* Completed banner */}
      {isCompleted && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800 font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Completed
            {jc.completed_at &&
              ` on ${new Date(jc.completed_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}`}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="space-y-3">

        {/* Row 1 — Back link */}
        <button
          onClick={() => navigate("/job-works")}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Job Works
        </button>

        {/* Row 2 — JW number + action buttons */}
        <div className="flex items-start justify-between gap-4">

          {/* Left: JW identity */}
          <div className="flex-1 min-w-0">

            {/* JW number + status on same line */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 font-mono">{jc.jc_number}</h1>
              {jc.status === "completed" && (
                <Badge className="status-completed text-xs">Completed</Badge>
              )}
              {jc.status === "on_hold" && (
                <Badge className="status-pending text-xs">On Hold</Badge>
              )}
              {jc.status === "in_progress" && (
                <Badge variant="outline" className="text-xs">In Progress</Badge>
              )}
            </div>

            {/* Item name — full width, wraps naturally */}
            {jc.item_description && (
              <p className="text-base font-medium text-slate-800 break-words mt-1">
                {jc.item_code && (
                  <span className="font-mono text-slate-500 mr-1">{jc.item_code}</span>
                )}
                {jc.item_description}
              </p>
            )}

            {/* Drawing number */}
            {(jc.drawing_revision || jc.drawing_number) && (
              <p className="text-sm text-slate-500 mt-0.5">
                Drawing:{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {jc.drawing_revision ?? jc.drawing_number}
                </span>
                {jc.drawing_revision && jc.drawing_number && jc.drawing_number !== jc.drawing_revision && (
                  <span className="font-mono text-slate-400 ml-1">({jc.drawing_number})</span>
                )}
              </p>
            )}

            {(jc as any).item_type && (
              <p className="text-xs text-slate-400 mt-0.5">
                Type:{" "}
                <span className="capitalize">{String((jc as any).item_type).replace(/_/g, " ")}</span>
              </p>
            )}

            {jc.batch_ref && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {jc.tracking_mode === "batch" ? "Batch" : "Serial"}: {jc.batch_ref}
              </p>
            )}

            {/* Cost summary — single line */}
            <div className="flex items-center gap-3 text-sm text-slate-600 mt-1">
              <span className="font-bold font-mono text-slate-900 whitespace-nowrap">
                {fmt(totalCost)}
              </span>
              <span className="whitespace-nowrap">total cost</span>
              {costPerUnit != null && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="whitespace-nowrap">{fmt(costPerUnit)} / unit</span>
                </>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          {!isCompleted && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (jc.status === "on_hold") {
                    if (jc.item_id) {
                      setMaterialIssueOpen(true);
                    } else {
                      holdMutation.mutate("in_progress");
                    }
                  } else {
                    holdMutation.mutate("on_hold");
                  }
                }}
                disabled={holdMutation.isPending}
              >
                {jc.status === "on_hold" ? (
                  <><Play className="h-4 w-4 mr-1" /> Resume</>
                ) : (
                  <><Pause className="h-4 w-4 mr-1" /> On Hold</>
                )}
              </Button>
              <Button size="sm" onClick={handleOpenComplete}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Complete JC
              </Button>
            </div>
          )}
        </div>

        {/* Row 3 — Raise DC action bar */}
        {!isCompleted && (
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <Button
              size="sm"
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50 shrink-0"
              onClick={handleRaiseDC}
            >
              <Truck className="h-4 w-4 mr-1" /> Raise DC
            </Button>
            <span className="text-sm text-slate-500 italic">
              DC sends goods to vendor · Record return on the DC once received back
            </span>
          </div>
        )}

      </div>

      {/* location banner */}
      {jc.current_location === "at_vendor" ? (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2 text-sm">
          <Truck className="h-4 w-4 shrink-0" />
          <span>
            Currently at <strong>{jc.current_vendor_name}</strong>
            {jc.current_vendor_since && (
              <> since {new Date(jc.current_vendor_since).toLocaleDateString("en-IN")}</>
            )}
          </span>
        </div>
      ) : !isCompleted ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0" />
          <span>In House</span>
        </div>
      ) : null}

      <div className="grid md:grid-cols-3 gap-4">
        {/* timeline — left 2/3 */}
        <div className="md:col-span-2 space-y-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Journey Timeline
            </h2>
          </div>

          {steps.length === 0 ? (
            <div className="paper-card text-center py-10">
              <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-muted-foreground font-medium text-sm">No steps yet</p>
              <p className="text-xs text-muted-foreground">
                No steps yet. Click Add Step to start tracking this component's journey.
              </p>
            </div>
          ) : (
            <div className="relative">
              {steps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  readOnly={isReadOnly}
                  onEdit={handleEditStep}
                  onDelete={handleDeleteStep}
                  onRecordReturn={(s) => setReturnStep(s)}
                />
              ))}
              {/* end of timeline */}
              <div className="relative pl-8">
                <div className="absolute left-3 top-0 h-4 w-px bg-border" />
                <div className="absolute left-1.5 top-4 h-3 w-3 rounded-full border-2 border-dashed border-muted-foreground/30 bg-background" />
              </div>
            </div>
          )}

          {!isReadOnly && (
            <div className="mt-4">
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={handleAddStepOpen}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Step
              </Button>
            </div>
          )}
        </div>

        {/* cost summary — right 1/3 */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Quantities
          </h2>
          <div className="paper-card space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original</span>
              <span className="font-mono">{jc.quantity_original} {jc.unit ?? "NOS"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accepted</span>
              <span className="font-mono text-green-600">{jc.quantity_accepted} {jc.unit ?? "NOS"}</span>
            </div>
            {jc.quantity_rejected > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rejected</span>
                <span className="font-mono text-red-600">{jc.quantity_rejected}</span>
              </div>
            )}
          </div>

          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-1">
            Cost Summary
          </h2>
          <div className="bg-slate-900 text-white rounded-xl p-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Initial</span>
              <span className="font-mono">{fmt(jc.initial_cost)}</span>
            </div>

            {steps.map((step) => (
              <div key={step.id} className="flex justify-between text-xs">
                <span className="text-slate-400 truncate max-w-[120px]">
                  {step.step_number}. {step.name}
                </span>
                <span className="font-mono">{fmt(stepCost(step))}</span>
              </div>
            ))}

            <div className="border-t border-slate-700 pt-2 flex justify-between font-medium">
              <span className="text-white">Total Cost</span>
              <span className="font-mono text-white">{fmt(totalCost)}</span>
            </div>

            {costPerUnit != null && (
              <div className="flex justify-between text-xs text-slate-400">
                <span>Per Unit</span>
                <span className="font-mono">{fmt(costPerUnit)}</span>
              </div>
            )}

            {(jc.standard_cost ?? 0) > 0 && (
              <>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Standard</span>
                  <span className="font-mono">
                    {fmt((jc.standard_cost ?? 0) * jc.quantity_original)}
                  </span>
                </div>
                {variance != null && (
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-300">Variance</span>
                    <span
                      className={`font-mono ${
                        variance > 0 ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {variance > 0 ? "+" : ""}
                      {fmt(variance)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {jc.notes && (
            <>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-1">
                Notes
              </h2>
              <div className="paper-card text-sm text-muted-foreground italic">{jc.notes}</div>
            </>
          )}
        </div>
      </div>

      {/* Stock Movements */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Package className="h-4 w-4" /> Stock Movements
        </h2>
        {stockMovements.length === 0 ? (
          <div className="paper-card text-center py-6 text-sm text-muted-foreground">
            No stock movements recorded yet
          </div>
        ) : (
          <div className="paper-card !p-0 overflow-x-auto">
            <table className="w-full data-table text-sm">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Item</th>
                  <th className="text-right">Qty In</th>
                  <th className="text-right">Qty Out</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {stockMovements.map((mv) => (
                  <tr key={mv.id}>
                    <td>
                      {mv.transaction_type === "job_card_issue" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                          <TrendingDown className="h-3 w-3" /> Issued
                        </span>
                      ) : mv.transaction_type === "job_card_return" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                          <TrendingUp className="h-3 w-3" /> Returned
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground capitalize">
                          {mv.transaction_type.replace(/_/g, " ")}
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {new Date(mv.transaction_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="font-mono text-xs text-blue-600">{mv.item_code ?? "—"}</td>
                    <td className="text-right font-mono tabular-nums text-green-700">
                      {mv.qty_in > 0 ? `+${mv.qty_in}` : "—"}
                    </td>
                    <td className="text-right font-mono tabular-nums text-red-700">
                      {mv.qty_out > 0 ? `-${mv.qty_out}` : "—"}
                    </td>
                    <td className="text-right font-mono tabular-nums text-sm font-medium">
                      {mv.balance_qty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Linked Delivery Challans */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <FileText className="h-4 w-4" /> Delivery Challans
        </h2>
        {dcLineItems.length > 0 ? (
          <div className="paper-card !p-0 overflow-x-auto">
            <table className="w-full data-table text-sm">
              <thead>
                <tr>
                  <th>DC Number</th>
                  <th>Date</th>
                  <th>Drawing No.</th>
                  <th>Nature of Process</th>
                  <th className="text-right">Qty Sent</th>
                  <th className="text-right">Accepted</th>
                  <th className="text-right">Rejected</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dcLineItems.map((li) => (
                  <tr
                    key={li.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate(`/delivery-challans/${li.dc_id}`)}
                  >
                    <td className="font-mono text-primary hover:underline">{li.dc_number}</td>
                    <td className="text-xs text-muted-foreground">
                      {li.dc_date ? new Date(li.dc_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="font-mono text-blue-600 text-xs">{li.drawing_number || li.item_code || "—"}</td>
                    <td className="text-muted-foreground text-xs">{li.nature_of_process || "—"}</td>
                    <td className="text-right font-mono tabular-nums">{li.quantity}</td>
                    <td className="text-right font-mono tabular-nums text-green-700">{li.qty_accepted != null ? li.qty_accepted : "—"}</td>
                    <td className="text-right font-mono tabular-nums text-red-700">{li.qty_rejected != null && li.qty_rejected > 0 ? li.qty_rejected : "—"}</td>
                    <td>
                      {li.return_status === "returned" ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">Returned</span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : linkedDCs.length === 0 ? (
          <div className="paper-card text-center py-6 text-sm text-muted-foreground">
            No delivery challans linked to this work order yet
          </div>
        ) : (
          <div className="paper-card !p-0 overflow-x-auto">
            <table className="w-full data-table text-sm">
              <thead>
                <tr>
                  <th>DC Number</th>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th className="text-right">Qty Sent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {linkedDCs.map((dc) => {
                  const today = new Date().toISOString().split("T")[0];
                  const isOverdue = dc.return_due_date && dc.return_due_date < today && !["fully_returned", "cancelled"].includes(dc.status);
                  const totalQtySent = (dc.line_items ?? []).reduce((s, li) => s + (li.quantity || 0), 0);
                  return (
                    <tr key={dc.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/delivery-challans/${dc.id}`)}>
                      <td className="font-mono text-primary hover:underline">{dc.dc_number}</td>
                      <td className="text-xs text-muted-foreground">
                        {new Date(dc.dc_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td>{dc.party_name ?? "—"}</td>
                      <td className="text-right font-mono tabular-nums">{totalQtySent || dc.total_qty}</td>
                      <td>
                        {isOverdue ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">Overdue</span>
                        ) : dc.status === "fully_returned" ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">Returned</span>
                        ) : (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">Pending Return</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Trail */}
      <AuditTimeline documentId={id!} />

      {/* Add / Edit Step dialog */}
      <AddStepDialog
        open={addStepOpen}
        onOpenChange={handleStepDialogClose}
        editingStep={editingStep}
        onSave={handleSaveStep}
        isSaving={isStepSaving}
        itemUnit={itemUnit}
      />

      {/* Record Return dialog */}
      {returnStep && (
        <RecordReturnDialog
          open={!!returnStep}
          onOpenChange={(o) => {
            if (!o) setReturnStep(null);
          }}
          step={returnStep}
          onSave={handleRecordReturn}
          isSaving={isRecording}
        />
      )}

      {/* Material Issue Dialog */}
      <Dialog open={materialIssueOpen} onOpenChange={setMaterialIssueOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Issue Material from Stock?</DialogTitle>
            <DialogDescription>
              This work order consumes stock. Do you want to deduct the quantity now?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Item</span>
              <span className="font-mono font-medium text-blue-700">{jc.item_code ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity to deduct</span>
              <span className="font-mono font-medium">{jc.quantity_original}</span>
            </div>
            {currentItemStock != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stock after issue</span>
                <span className={`font-mono font-medium ${Math.max(0, currentItemStock - jc.quantity_original) === 0 ? "text-red-600" : "text-slate-700"}`}>
                  {currentItemStock} → {Math.max(0, currentItemStock - jc.quantity_original)}
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              className="flex-1"
              disabled={issuingMaterial}
              onClick={async () => {
                setMaterialIssueOpen(false);
                holdMutation.mutate("in_progress");
              }}
            >
              Skip for Now
            </Button>
            <Button
              className="flex-1"
              disabled={issuingMaterial}
              onClick={async () => {
                setIssuingMaterial(true);
                try {
                  await issueJobWorkMaterial(id!);
                  queryClient.invalidateQueries({ queryKey: ["job-work-stock-movements", id] });
                  queryClient.invalidateQueries({ queryKey: ["item-stock-for-completion", jc.item_id] });
                  setMaterialIssueOpen(false);
                  holdMutation.mutate("in_progress");
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setIssuingMaterial(false);
                }
              }}
            >
              {issuingMaterial ? "Issuing…" : "Yes, Issue Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completion dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Job Work</DialogTitle>
            <DialogDescription>
              Review the summary and choose what happens to the finished units.
            </DialogDescription>
          </DialogHeader>

          {/* Summary */}
          <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original Qty</span>
              <span className="font-mono">{jc.quantity_original} {jc.unit ?? "NOS"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accepted Qty</span>
              <span className="font-mono text-green-600 font-medium">{jc.quantity_accepted} {jc.unit ?? "NOS"}</span>
            </div>
            {jc.quantity_rejected > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rejected Qty</span>
                <span className="font-mono text-red-600">{jc.quantity_rejected}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1.5 font-medium">
              <span>Total Cost</span>
              <span className="font-mono">{fmt(totalCost)}</span>
            </div>
            {costPerUnit != null && (
              <div className="flex justify-between text-muted-foreground">
                <span>Cost per Unit</span>
                <span className="font-mono">{fmt(costPerUnit)}</span>
              </div>
            )}
            {variance != null && (jc.standard_cost ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Variance</span>
                <span
                  className={cn(
                    "font-mono font-medium",
                    variance > 0 ? "text-red-600" : "text-green-600"
                  )}
                >
                  {variance > 0 ? "+" : ""}
                  {fmt(variance)}
                </span>
              </div>
            )}
          </div>

          {/* Outcome */}
          <div className="space-y-2">
            <Label>Completion Outcome *</Label>
            <div className="space-y-2">
              {completionOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCompletionOutcome(opt.value)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg border-2 transition-colors",
                    completionOutcome === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Stock info */}
          {completionOutcome === "stock" && jc.item_id && currentItemStock != null && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              Stock will increase: {currentItemStock} → {currentItemStock + jc.quantity_accepted}{" "}
              {jc.unit ?? "NOS"}
            </p>
          )}

          {/* Note field for non-stock outcomes */}
          {(completionOutcome === "assembly" || completionOutcome === "customer") && (
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea
                rows={2}
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder={
                  completionOutcome === "assembly"
                    ? "Which assembly / order..."
                    : "Customer / shipment details..."
                }
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              Confirm Completion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
