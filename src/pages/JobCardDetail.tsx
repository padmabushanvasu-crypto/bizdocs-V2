import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, AlertTriangle, TrendingUp, CheckCircle2, Clock, Circle, Wrench, ExternalLink } from "lucide-react";
import { fetchJobWork, type JobWork, type JobWorkStep } from "@/lib/job-works-api";
import { fetchProcessingRouteAll, type ProcessingRoute } from "@/lib/dc-intelligence-api";
import { format } from "date-fns";

// ── Vertical timeline step ────────────────────────────────────────────────────

function TimelineStep({
  step,
  isLast,
}: {
  step: JobWorkStep;
  isLast: boolean;
}) {
  const done = step.status === "done";
  const matReturned = step.status === "material_returned";
  const active = step.status === "in_progress";
  const preBizdocs = step.status === "pre_bizdocs";

  let icon: React.ReactNode;
  let iconBg: string;
  let lineColor: string;
  let lineDash: boolean;

  if (done) {
    icon = <CheckCircle2 className="h-5 w-5 text-white" />;
    iconBg = "bg-emerald-600";
    lineColor = "bg-emerald-300";
    lineDash = false;
  } else if (matReturned) {
    icon = <Clock className="h-4 w-4 text-white" />;
    iconBg = "bg-blue-500";
    lineColor = "bg-blue-200";
    lineDash = true;
  } else if (active) {
    icon = <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse block" />;
    iconBg = "bg-amber-500";
    lineColor = "bg-amber-200";
    lineDash = true;
  } else if (preBizdocs) {
    icon = <CheckCircle2 className="h-5 w-5 text-slate-400" />;
    iconBg = "bg-slate-200";
    lineColor = "bg-slate-200";
    lineDash = false;
  } else {
    icon = <Circle className="h-4 w-4 text-slate-400" />;
    iconBg = "bg-white border-2 border-slate-300";
    lineColor = "bg-slate-200";
    lineDash = true;
  }

  let statusLabel: string;
  let statusColor: string;
  let sublabel: string | null = null;

  if (done) {
    statusLabel = "Completed";
    statusColor = "text-emerald-700";
    sublabel = step.completed_at
      ? format(new Date(step.completed_at), "dd MMM yyyy")
      : null;
  } else if (matReturned) {
    statusLabel = "Material Returned — Awaiting QC";
    statusColor = "text-blue-700";
  } else if (active) {
    if (step.step_type === "external") {
      statusLabel = step.vendor_name ? `At Vendor — ${step.vendor_name}` : "At Vendor";
      statusColor = "text-amber-700";
      sublabel = step.dc_number ? `DC: ${step.dc_number}` : null;
    } else {
      statusLabel = "In Progress";
      statusColor = "text-amber-700";
    }
  } else if (preBizdocs) {
    statusLabel = "Pre-system (completed)";
    statusColor = "text-slate-400";
  } else {
    statusLabel = "Pending";
    statusColor = "text-slate-400";
  }

  return (
    <div className="flex gap-3">
      {/* Icon + connector */}
      <div className="flex flex-col items-center">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}
        >
          {icon}
        </div>
        {!isLast && (
          <div
            className={`flex-1 w-0.5 my-1 min-h-[28px] ${lineColor} ${
              lineDash ? "opacity-60" : ""
            }`}
            style={lineDash ? { backgroundImage: "repeating-linear-gradient(to bottom, currentColor 0, currentColor 4px, transparent 4px, transparent 8px)" } : {}}
          />
        )}
      </div>

      {/* Content */}
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-900">
                {step.step_number}. {step.name}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium uppercase tracking-wide">
                {step.step_type === "external" ? "External" : "Internal"}
              </span>
            </div>
            <p className={`text-xs mt-0.5 font-medium ${statusColor}`}>
              {statusLabel}
              {sublabel && (
                <span className="text-slate-400 font-normal ml-1.5">· {sublabel}</span>
              )}
            </p>
            {done && step.actual_qty != null && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                Confirmed qty: {step.actual_qty} {step.unit ?? ""}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Production Route row ──────────────────────────────────────────────────────

function RouteRow({
  route,
  step,
  isLast,
}: {
  route: ProcessingRoute;
  step: JobWorkStep | undefined;
  isLast: boolean;
}) {
  const isExternal = route.stage_type === "external";

  // Determine visual state from the linked job_card_step (external only)
  const done      = step?.status === "done";
  const matRet    = step?.status === "material_returned";
  const active    = step?.status === "in_progress";
  const preBiz    = step?.status === "pre_bizdocs";
  const pending   = step?.status === "pending";
  const tracked   = !!step;

  let iconBg: string;
  let icon: React.ReactNode;
  let lineColor: string;

  if (!isExternal) {
    // Internal — always grey
    iconBg = "bg-slate-100 border border-slate-200";
    icon = <Wrench className="h-3.5 w-3.5 text-slate-400" />;
    lineColor = "bg-slate-100";
  } else if (done) {
    iconBg = "bg-emerald-600";
    icon = <CheckCircle2 className="h-4 w-4 text-white" />;
    lineColor = "bg-emerald-300";
  } else if (matRet) {
    iconBg = "bg-blue-500";
    icon = <Clock className="h-3.5 w-3.5 text-white" />;
    lineColor = "bg-blue-200";
  } else if (active) {
    iconBg = "bg-amber-500";
    icon = <span className="w-2 h-2 rounded-full bg-white animate-pulse block" />;
    lineColor = "bg-amber-200";
  } else if (preBiz) {
    iconBg = "bg-slate-200";
    icon = <CheckCircle2 className="h-4 w-4 text-slate-400" />;
    lineColor = "bg-slate-200";
  } else {
    // pending or untracked external
    iconBg = "bg-white border-2 border-slate-300";
    icon = <ExternalLink className="h-3 w-3 text-slate-400" />;
    lineColor = "bg-slate-100";
  }

  let statusText: string | null = null;
  let statusColor = "text-slate-400";

  if (!isExternal) {
    statusText = "Internal — in-house";
    statusColor = "text-slate-400";
  } else if (!tracked) {
    statusText = "Not yet started";
    statusColor = "text-slate-400";
  } else if (done) {
    statusText = step?.completed_at
      ? `Completed · ${format(new Date(step.completed_at), "dd MMM yyyy")}`
      : "Completed";
    statusColor = "text-emerald-700";
  } else if (matRet) {
    statusText = "Material returned — awaiting QC";
    statusColor = "text-blue-700";
  } else if (active) {
    statusText = step?.vendor_name ? `At Vendor — ${step.vendor_name}` : "At Vendor";
    statusColor = "text-amber-700";
  } else if (preBiz) {
    statusText = "Pre-system (completed)";
    statusColor = "text-slate-400";
  } else if (pending) {
    statusText = "Pending";
    statusColor = "text-slate-400";
  }

  return (
    <div className="flex gap-3">
      {/* Icon + connector line */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        {!isLast && (
          <div className={`flex-1 w-0.5 my-1 min-h-[24px] ${lineColor}`} />
        )}
      </div>

      {/* Row content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800">
            {route.stage_number}. {route.process_name}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide shrink-0 ${
              isExternal
                ? "bg-blue-50 text-blue-600 border border-blue-100"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {isExternal ? "External" : "Internal"}
          </span>
          {active && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
              Active
            </span>
          )}
        </div>
        {statusText && (
          <p className={`text-xs mt-0.5 ${statusColor}`}>{statusText}</p>
        )}
        {active && step?.dc_number && (
          <p className="text-[11px] text-slate-400 mt-0.5">DC: {step.dc_number}</p>
        )}
        {route.notes && (
          <p className="text-[11px] text-slate-400 mt-0.5 italic">{route.notes}</p>
        )}
      </div>
    </div>
  );
}

// ── Cost Summary Panel ────────────────────────────────────────────────────────

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CostSummaryPanel({ jc, steps }: { jc: JobWork; steps: JobWorkStep[] }) {
  const rawMaterialCost = jc.initial_cost ?? 0;

  const processingRows = steps.map((step) => {
    if (step.step_type === "internal") {
      const total = (step.labour_cost ?? 0) + (step.material_cost ?? 0) + (step.additional_cost ?? 0);
      return { step, total };
    } else {
      const total = (step.job_work_charges ?? 0) + (step.transport_cost_out ?? 0) + (step.transport_cost_in ?? 0);
      return { step, total };
    }
  });

  const totalProcessingCost = processingRows.reduce((s, r) => s + r.total, 0);
  const totalCost = rawMaterialCost + totalProcessingCost;

  const acceptedQty = jc.quantity_accepted ?? jc.quantity_original ?? 0;
  const rejectedQty = jc.quantity_rejected ?? 0;
  const originalQty = jc.quantity_original ?? 0;
  const costPerUnit = acceptedQty > 0 ? totalCost / acceptedQty : 0;
  const standardCost = jc.standard_cost ?? 0;
  const variance = costPerUnit - standardCost;
  const variancePct = standardCost > 0 ? (variance / standardCost) * 100 : null;

  const rejectionCost = originalQty > 0 && rejectedQty > 0
    ? (totalCost / originalQty) * rejectedQty
    : 0;

  return (
    <div className="paper-card space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">Cost Accumulation</h2>
        {jc.batch_ref && (
          <span className="text-xs text-muted-foreground">— Batch {jc.batch_ref}</span>
        )}
      </div>

      <div className="font-mono text-xs space-y-1 text-slate-700">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-2">Raw Material Cost</div>
        {rawMaterialCost > 0 ? (
          <div className="flex justify-between">
            <span className="text-slate-600">{jc.item_code ?? jc.item_description ?? "Item"} × {originalQty} {jc.unit ?? ""}</span>
            <span className="font-medium">{fmt(rawMaterialCost)}</span>
          </div>
        ) : (
          <div className="text-slate-400 italic">No raw material cost recorded</div>
        )}

        {processingRows.length > 0 && (
          <>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-3">Processing Costs</div>
            {processingRows.map(({ step, total }) => (
              <div key={step.id} className="flex justify-between">
                <span className="text-slate-600 flex-1 min-w-0 pr-2 truncate">
                  {step.step_number}. {step.name}
                  {step.step_type === "internal" && " (Internal)"}
                  {step.step_type === "external" && ` (External${step.vendor_name ? " — " + step.vendor_name : ""})`}
                </span>
                <span className={total > 0 ? "font-medium" : "text-slate-400"}>{total > 0 ? fmt(total) : "—"}</span>
              </div>
            ))}
          </>
        )}

        {rejectedQty > 0 && (
          <>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-3">Non-Conformance Deductions</div>
            <div className="flex justify-between text-amber-700">
              <span>{rejectedQty} unit{rejectedQty !== 1 ? "s" : ""} rejected — cost absorbed</span>
              <span>{fmt(rejectionCost)}</span>
            </div>
          </>
        )}

        <div className="border-t border-slate-200 mt-3 pt-3 space-y-1">
          <div className="flex justify-between font-semibold">
            <span>Total Cost (all stages)</span>
            <span>{fmt(totalCost)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Accepted Qty</span>
            <span>{acceptedQty} {jc.unit ?? ""}</span>
          </div>
          <div className="flex justify-between font-semibold text-blue-700">
            <span>Cost Per Accepted Unit</span>
            <span>{acceptedQty > 0 ? fmt(costPerUnit) : "—"}</span>
          </div>
          {standardCost > 0 && (
            <>
              <div className="flex justify-between text-slate-500">
                <span>Standard Cost (Items Master)</span>
                <span>{fmt(standardCost)}</span>
              </div>
              <div className={`flex justify-between font-medium ${variance > 0 ? "text-red-600" : variance < 0 ? "text-emerald-600" : "text-slate-500"}`}>
                <span>Variance</span>
                <span>
                  {variance >= 0 ? "+" : ""}{fmt(variance)}
                  {variancePct !== null && ` (${variance >= 0 ? "+" : ""}${variancePct.toFixed(1)}%)`}
                </span>
              </div>
            </>
          )}
          {standardCost === 0 && (
            <div className="text-slate-400 text-[11px]">Standard cost not set in Items Master</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function JobCardDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["job-work", id],
    queryFn: () => fetchJobWork(id!),
    enabled: !!id,
  });

  const { data: routes } = useQuery({
    queryKey: ["processing-routes", data?.item_id],
    queryFn: () => fetchProcessingRouteAll(data!.item_id!),
    enabled: !!data?.item_id,
  });

  if (isLoading) {
    return (
      <div className="p-6 text-muted-foreground text-sm animate-pulse">
        Loading job card…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-sm font-medium">Job card not found.</p>
        </div>
      </div>
    );
  }

  const steps = data.steps ?? [];
  const stepByStage = new Map<number, JobWorkStep>();
  for (const s of steps) {
    if (s.step_number != null) stepByStage.set(s.step_number, s);
  }
  const doneCount = steps.filter((s) => s.status === "done" || s.status === "pre_bizdocs").length;
  const activeStep = steps.find((s) => s.status === "in_progress" || s.status === "material_returned");
  const totalSteps = steps.filter((s) => s.status !== "pre_bizdocs").length;
  const completedSteps = steps.filter((s) => s.status === "done" || s.status === "material_returned").length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      {/* ── Header card ── */}
      <div className="paper-card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-mono tracking-wider">
              {data.jc_number}
            </p>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              {data.item_description ?? data.item_code ?? "—"}
            </h1>
            {data.item_code && data.item_description && (
              <p className="text-sm text-muted-foreground">{data.item_code}</p>
            )}
          </div>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${
              data.status === "completed"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : data.status === "on_hold"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}
          >
            {data.status.replace(/_/g, " ")}
          </span>
        </div>

        {/* ── Stage progress summary ── */}
        {steps.length > 0 && (
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600">
                {data.status === "completed"
                  ? `All ${totalSteps} stages complete`
                  : activeStep
                  ? `Stage ${activeStep.step_number} of ${totalSteps} — ${activeStep.name}`
                  : `${completedSteps} of ${totalSteps} stages complete`}
              </p>
              <span className="text-xs text-slate-400 tabular-nums">
                {completedSteps}/{totalSteps}
              </span>
            </div>
            {/* Segmented progress bar */}
            {totalSteps > 0 && (() => {
              const pct = Math.round((completedSteps / totalSteps) * 100);
              const pillColor = pct === 100 ? "bg-emerald-100 text-emerald-700" : pct > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
              return (
                <div className="space-y-1.5">
                  <div className="flex gap-0.5 h-3">
                    {Array.from({ length: totalSteps }).map((_, i) => {
                      const filled = i < completedSteps;
                      const isFirst = i === 0;
                      const isLast = i === totalSteps - 1;
                      return (
                        <div
                          key={i}
                          className={`flex-1 h-full transition-colors ${filled ? "bg-emerald-500" : "bg-slate-100"} ${isFirst ? "rounded-l-full" : ""} ${isLast ? "rounded-r-full" : ""}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {completedSteps} of {totalSteps} stages complete
                    </span>
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${pillColor}`}>
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Cost Summary ── */}
      <CostSummaryPanel jc={data} steps={steps} />

      {/* ── Vertical timeline ── */}
      <div className="paper-card space-y-0">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Processing Stages</h2>

        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stages added yet.</p>
        ) : (
          <div>
            {steps.map((step, i) => (
              <TimelineStep key={step.id} step={step} isLast={i === steps.length - 1} />
            ))}
          </div>
        )}
      </div>

      {/* ── Production Route ── */}
      {routes && routes.length > 0 && (
        <div className="paper-card space-y-0">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Production Route</h2>
            <span className="text-xs text-slate-400">({routes.length} stages from BOM)</span>
          </div>
          <div>
            {routes.map((route, i) => (
              <RouteRow
                key={route.id}
                route={route}
                step={stepByStage.get(route.stage_number)}
                isLast={i === routes.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
