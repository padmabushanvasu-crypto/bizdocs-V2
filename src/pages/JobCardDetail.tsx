import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, AlertTriangle, TrendingUp } from "lucide-react";
import { fetchJobWork, type JobWork, type JobWorkStep } from "@/lib/job-works-api";
import { format } from "date-fns";

// ── Stage Progress Bar with rich tooltips ─────────────────────────────────────

function StageProgressBar({ steps }: { steps: JobWorkStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">
        No stages added yet — add steps below to begin tracking progress.
      </p>
    );
  }

  return (
    <div className="flex items-end gap-0 flex-wrap">
      {steps.map((step, i) => {
        const done   = step.status === "done";
        const active = step.status === "in_progress";

        return (
          <div key={step.id} className="flex items-end">
            {/* Dot + number + tooltip */}
            <div className="relative group flex flex-col items-center">
              <div
                className={`rounded-full shrink-0 cursor-default transition-transform group-hover:scale-110 ${
                  done   ? "bg-blue-600 w-3 h-3" :
                  active ? "bg-amber-500 w-4 h-4 animate-pulse" :
                           "bg-white border-2 border-slate-300 w-3 h-3"
                }`}
              />
              <span className="text-[10px] text-slate-400 mt-1 leading-none">
                {step.step_number}
              </span>

              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none
                              opacity-0 group-hover:opacity-100 transition-opacity
                              bg-slate-800 text-white rounded-lg shadow-xl px-3 py-2
                              text-xs whitespace-nowrap min-w-[160px]">
                <p className="font-semibold text-white">{step.name}</p>
                <p className="text-slate-300 mt-0.5">
                  {step.step_type === "external" ? "External" : "Internal"}
                </p>
                <p className={`mt-0.5 font-medium ${
                  done   ? "text-blue-300" :
                  active ? "text-amber-300" :
                           "text-slate-400"
                }`}>
                  {done ? "Done" : active ? "In Progress" : "Pending"}
                </p>
                {step.vendor_name && (
                  <p className="text-slate-300 mt-0.5">Vendor: {step.vendor_name}</p>
                )}
                {step.completed_at && (
                  <p className="text-slate-300 mt-0.5">
                    Completed: {format(new Date(step.completed_at), "dd MMM yyyy")}
                  </p>
                )}
                {/* Tooltip arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
              </div>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 w-4 mx-0.5 mb-3.5 ${done ? "bg-blue-300" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
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

  // Cost absorbed by rejections — proportional estimate
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
        {/* Raw material */}
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-2">Raw Material Cost</div>
        {rawMaterialCost > 0 ? (
          <div className="flex justify-between">
            <span className="text-slate-600">{jc.item_code ?? jc.item_description ?? "Item"} × {originalQty} {jc.unit ?? ""}</span>
            <span className="font-medium">{fmt(rawMaterialCost)}</span>
          </div>
        ) : (
          <div className="text-slate-400 italic">No raw material cost recorded</div>
        )}

        {/* Processing steps */}
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

        {/* Non-conformance deductions */}
        {rejectedQty > 0 && (
          <>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-3">Non-Conformance Deductions</div>
            <div className="flex justify-between text-amber-700">
              <span>{rejectedQty} unit{rejectedQty !== 1 ? "s" : ""} rejected — cost absorbed</span>
              <span>{fmt(rejectionCost)}</span>
            </div>
          </>
        )}

        {/* Divider + totals */}
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
  const doneCount = steps.filter((s) => s.status === "done").length;

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

        {/* ── Stage progress bar ── */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-500 mb-3">
            Stage Progress
            {steps.length > 0 && (
              <span className="ml-2 text-slate-400">
                ({doneCount} of {steps.length} done)
              </span>
            )}
          </p>
          <StageProgressBar steps={steps} />
        </div>
      </div>

      {/* ── Cost Summary ── */}
      <CostSummaryPanel jc={data} steps={steps} />

      {/* ── Steps list ── */}
      <div className="paper-card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Processing Steps</h2>

        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No steps added yet.</p>
        ) : (
          <div className="space-y-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`rounded-lg border p-3 flex items-start gap-3 transition-colors ${
                  step.status === "done"
                    ? "bg-blue-50/40 border-blue-100"
                    : step.status === "in_progress"
                    ? "bg-amber-50/40 border-amber-200"
                    : "bg-slate-50/30 border-slate-200"
                }`}
              >
                <div
                  className={`mt-0.5 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0 ${
                    step.status === "done"
                      ? "bg-blue-600 text-white"
                      : step.status === "in_progress"
                      ? "bg-amber-500 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {step.step_number}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900">{step.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                      {step.step_type === "external" ? "External" : "Internal"}
                    </span>
                  </div>
                  {step.vendor_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Vendor: {step.vendor_name}
                    </p>
                  )}
                  {step.completed_at && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Completed: {format(new Date(step.completed_at), "dd MMM yyyy")}
                    </p>
                  )}
                </div>

                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    step.status === "done"
                      ? "bg-blue-100 text-blue-700"
                      : step.status === "in_progress"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {step.status === "in_progress"
                    ? "In Progress"
                    : step.status === "done"
                    ? "Done"
                    : "Pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
