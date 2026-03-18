import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
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
  fetchJobCard,
  fetchJobCardSummary,
  updateJobCardStep,
  deleteJobCardStep,
  createJobCardStep,
  recordStepReturn,
  completeJobCard,
  updateJobCardStatus,
  fetchItemCurrentStock,
  type JobCardStep,
  type RecordReturnData,
} from "@/lib/job-cards-api";
import { AddStepDialog } from "@/components/AddStepDialog";
import { RecordReturnDialog } from "@/components/RecordReturnDialog";
import { AuditTimeline } from "@/components/AuditTimeline";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "₹") {
  if (n == null) return "—";
  return `${prefix}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function statusBadge(status: JobCardStep["status"]) {
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

function inspectionBadge(result: JobCardStep["inspection_result"]) {
  if (!result) return null;
  if (result === "accepted")
    return <Badge className="status-completed text-xs">Accepted</Badge>;
  if (result === "partially_accepted")
    return <Badge className="status-pending text-xs">Partial</Badge>;
  return <Badge className="status-overdue text-xs">Rejected</Badge>;
}

function stepCost(step: JobCardStep): number {
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
  step: JobCardStep;
  readOnly?: boolean;
  onEdit: (step: JobCardStep) => void;
  onDelete: (step: JobCardStep) => void;
  onRecordReturn: (step: JobCardStep) => void;
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
              {step.qty_sent != null && <span>Sent: {step.qty_sent} units</span>}
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
                  <span className="text-xs text-green-600">Accepted: {step.qty_accepted}</span>
                )}
                {(step.qty_rejected ?? 0) > 0 && (
                  <span className="text-xs text-red-600">Rejected: {step.qty_rejected}</span>
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

export default function JobCardDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addStepOpen, setAddStepOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<JobCardStep | null>(null);
  const [returnStep, setReturnStep] = useState<JobCardStep | null>(null);
  const [isStepSaving, setIsStepSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Completion dialog state
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completionOutcome, setCompletionOutcome] = useState<"stock" | "assembly" | "customer">("stock");
  const [completionNote, setCompletionNote] = useState("");

  const { data: jc, isLoading } = useQuery({
    queryKey: ["job-card", id],
    queryFn: () => fetchJobCard(id!),
    enabled: !!id,
  });

  const { data: summary } = useQuery({
    queryKey: ["job-card-summary", id],
    queryFn: () => fetchJobCardSummary(id!),
    enabled: !!id,
  });

  const { data: currentItemStock } = useQuery({
    queryKey: ["item-stock-for-completion", jc?.item_id],
    queryFn: () => fetchItemCurrentStock(jc!.item_id!),
    enabled: completeDialogOpen && !!jc?.item_id,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["job-card", id] });
    queryClient.invalidateQueries({ queryKey: ["job-card-summary", id] });
    queryClient.invalidateQueries({ queryKey: ["job-cards"] });
    queryClient.invalidateQueries({ queryKey: ["jc-stats"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (stepId: string) => deleteJobCardStep(stepId),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Step deleted" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: () => completeJobCard(id!, completionOutcome, completionNote || undefined),
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["stock-status"] });
      setCompleteDialogOpen(false);
      toast({ title: "Job Card completed" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const holdMutation = useMutation({
    mutationFn: (status: "in_progress" | "on_hold") => updateJobCardStatus(id!, status),
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
        {isLoading ? "Loading…" : "Job Card not found"}
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

  const handleSaveStep = async (data: Partial<JobCardStep>) => {
    setIsStepSaving(true);
    try {
      if (editingStep) {
        await updateJobCardStep(editingStep.id, data);
        toast({ title: "Step updated" });
      } else {
        await createJobCardStep({ ...data, job_card_id: id! });
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

  const handleEditStep = (step: JobCardStep) => {
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
        await createJobCardStep({
          job_card_id: id!,
          step_type: "external",
          name: `${returnStep.name} (Re-send)`,
          vendor_id: returnStep.vendor_id ?? undefined,
          vendor_name: returnStep.vendor_name ?? undefined,
          is_rework: false,
          status: "pending",
        } as any);
      } else if (autoNext === "rework_inhouse") {
        await createJobCardStep({
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

  const handleDeleteStep = (step: JobCardStep) => {
    if (confirm(`Delete step "${step.name}"?`)) {
      deleteMutation.mutate(step.id);
    }
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

      {/* back + header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          onClick={() => navigate("/job-cards")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
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
          {jc.item_description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {jc.item_code && <span className="font-mono mr-1">{jc.item_code}</span>}
              {jc.item_description}
            </p>
          )}
          {jc.batch_ref && (
            <p className="text-xs text-muted-foreground">
              {jc.tracking_mode === "batch" ? "Batch" : "Serial"}: {jc.batch_ref}
            </p>
          )}
          {/* Running total — prominent */}
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-2xl font-bold font-mono text-foreground">{fmt(totalCost)}</span>
            <span className="text-sm text-muted-foreground">total cost</span>
            {costPerUnit != null && (
              <span className="text-sm text-muted-foreground">· {fmt(costPerUnit)} / unit</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {!isCompleted && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                holdMutation.mutate(jc.status === "on_hold" ? "in_progress" : "on_hold")
              }
              disabled={holdMutation.isPending}
            >
              {jc.status === "on_hold" ? (
                <>
                  <Play className="h-4 w-4 mr-1" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-1" /> On Hold
                </>
              )}
            </Button>
          )}
          {!isCompleted && (
            <Button size="sm" onClick={handleOpenComplete}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Complete JC
            </Button>
          )}
        </div>
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
              <span className="font-mono">{jc.quantity_original}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accepted</span>
              <span className="font-mono text-green-600">{jc.quantity_accepted}</span>
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

      {/* Audit Trail */}
      <AuditTimeline documentId={id!} />

      {/* Add / Edit Step dialog */}
      <AddStepDialog
        open={addStepOpen}
        onOpenChange={handleStepDialogClose}
        editingStep={editingStep}
        onSave={handleSaveStep}
        isSaving={isStepSaving}
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

      {/* Completion dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Job Card</DialogTitle>
            <DialogDescription>
              Review the summary and choose what happens to the finished units.
            </DialogDescription>
          </DialogHeader>

          {/* Summary */}
          <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original Qty</span>
              <span className="font-mono">{jc.quantity_original}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accepted Qty</span>
              <span className="font-mono text-green-600 font-medium">{jc.quantity_accepted}</span>
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
              units
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
