import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fetchProcessingRouteAll, type ProcessingRoute } from "@/lib/dc-intelligence-api";
import {
  openJobCard,
  fetchLiveJobCardsForItem,
  fetchExternalStageAvailability,
  fetchCurrentExternalStages,
  type LiveJobCardCandidate,
  type EligibleExternalStage,
} from "@/lib/job-works-api";
import { linkDcLineToJobCardWithStep } from "@/lib/delivery-challans-api";
import { type DCLineItem } from "@/lib/delivery-challans-api";

// Row-level decision the user makes for one DC line item. mode "new" (the
// default) opens a brand-new job card via rpc_open_job_card; mode "existing"
// links the line to a live job card that already covers earlier stages via
// rpc_link_dc_line_to_job_card only. `ready` is computed entirely inside
// JCItemRow (it's the only place that has the routes/eligible-stage data
// needed to validate) and read back here just to gate the Confirm button.
interface JCDecision {
  skip: boolean;
  mode: "new" | "existing";
  entryStage: number | null;
  reason: string;
  jobCardId: string | null;
  jcNumber: string | null;
  stepNumber: number | null;
  ready: boolean;
}

const defaultDecision = (): JCDecision => ({
  skip: false,
  mode: "new",
  entryStage: null,
  reason: "",
  jobCardId: null,
  jcNumber: null,
  stepNumber: null,
  ready: false,
});

export interface JobCardCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dcId: string;
  dcNumber: string;
  lineItems: DCLineItem[];
  itemIdByIndex?: Map<number, string>;
}

interface JCItemRowProps {
  lineItem: DCLineItem;
  itemId: string | null;
  decision: JCDecision;
  onChange: (patch: Partial<JCDecision>) => void;
}

function JCItemRow({ lineItem, itemId, decision, onChange }: JCItemRowProps) {
  const lineQty = Number(lineItem.quantity) || 0;

  const { data: routes = [] } = useQuery({
    queryKey: ["processing-route-all", itemId],
    queryFn: () => fetchProcessingRouteAll(itemId!),
    enabled: !!itemId,
  });

  const { data: candidates = [], isLoading: candidatesLoading } = useQuery({
    queryKey: ["live-job-cards-for-item", itemId],
    queryFn: () => fetchLiveJobCardsForItem(itemId!),
    enabled: !!itemId && decision.mode === "existing",
  });

  const candidateIds = candidates.map((c) => c.id);
  const { data: currentStages = [] } = useQuery({
    queryKey: ["current-external-stage", candidateIds],
    queryFn: () => fetchCurrentExternalStages(candidateIds),
    enabled: decision.mode === "existing" && candidateIds.length > 1,
  });

  const { data: eligibleStages, isLoading: eligibleLoading } = useQuery({
    queryKey: ["external-stage-availability", decision.jobCardId],
    queryFn: () => fetchExternalStageAvailability(decision.jobCardId!),
    enabled: decision.mode === "existing" && !!decision.jobCardId,
  });

  const minStage = routes.length > 0 ? Math.min(...routes.map((r) => r.stage_number)) : null;
  const isPastMin = decision.mode === "new" && minStage != null && decision.entryStage != null && decision.entryStage > minStage;

  // "No, create new JC" default: pre-select Stage 1 once routes load.
  useEffect(() => {
    if (decision.mode === "new" && decision.entryStage === null && routes.length > 0) {
      const stageOne = routes.find((r) => r.stage_number === 1);
      onChange({ entryStage: stageOne ? 1 : Math.min(...routes.map((r) => r.stage_number)) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.mode, decision.entryStage, routes]);

  // Single live candidate auto-selects; more than one waits for the picker.
  useEffect(() => {
    if (decision.mode === "existing" && !decision.jobCardId && candidates.length === 1) {
      onChange({ jobCardId: candidates[0].id, jcNumber: candidates[0].jc_number });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.mode, decision.jobCardId, candidates]);

  // Suggestion = lowest external step with eligible_qty > 0 — only
  // auto-picked when it's also actually usable for this line's quantity.
  useEffect(() => {
    if (decision.mode === "existing" && decision.jobCardId && decision.stepNumber === null && eligibleStages) {
      const suggestion = eligibleStages.find((s) => s.eligible_qty > 0);
      if (suggestion && suggestion.eligible_qty >= lineQty) {
        onChange({ stepNumber: suggestion.step_number });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.mode, decision.jobCardId, decision.stepNumber, eligibleStages]);

  // Report readiness up to the parent so the Confirm button can gate on it.
  useEffect(() => {
    let ready = false;
    if (decision.skip) {
      ready = true;
    } else if (decision.mode === "new") {
      ready = decision.entryStage !== null && (!isPastMin || decision.reason.trim() !== "");
    } else {
      ready = decision.jobCardId !== null && decision.stepNumber !== null;
    }
    if (ready !== decision.ready) onChange({ ready });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.skip, decision.mode, decision.entryStage, decision.reason, decision.jobCardId, decision.stepNumber, isPastMin]);

  const setMode = (mode: "new" | "existing") => {
    if (mode === decision.mode) return;
    onChange({
      mode,
      entryStage: mode === "new" ? decision.entryStage : null,
      reason: "",
      jobCardId: null,
      jcNumber: null,
      stepNumber: null,
    });
  };

  return (
    <>
      <div className="flex gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
          <input type="radio" name={`jc-mode-${itemId}`} checked={decision.mode === "new"} onChange={() => setMode("new")} />
          <span>No, create new JC</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
          <input type="radio" name={`jc-mode-${itemId}`} checked={decision.mode === "existing"} onChange={() => setMode("existing")} />
          <span>Yes, link existing JC</span>
        </label>
      </div>

      {decision.mode === "new" ? (
        <div className="space-y-2">
          {routes.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No BOM processing route found — job card will be created with no stage.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {routes.map((route: ProcessingRoute) => {
                const isSelected = decision.entryStage === route.stage_number;
                return (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => onChange({ entryStage: route.stage_number })}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      route.stage_type === "external"
                        ? isSelected
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-blue-50 text-blue-700 border-blue-400 hover:bg-blue-100"
                        : isSelected
                        ? "bg-slate-600 text-white border-slate-600"
                        : "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {route.stage_number}. {route.process_name}
                    <span className="ml-1 opacity-60">{route.stage_type === "internal" ? "(internal)" : "(vendor)"}</span>
                  </button>
                );
              })}
            </div>
          )}
          {isPastMin && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-800">
                Reason for skipping to stage {decision.entryStage} *
              </p>
              <Textarea
                value={decision.reason}
                onChange={(e) => onChange({ reason: e.target.value })}
                rows={2}
                className="text-xs"
                placeholder={`e.g. stages ${minStage}–${(decision.entryStage ?? 1) - 1} already done outside BizDocs`}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs">
          {candidatesLoading ? (
            <p className="text-muted-foreground">Loading job cards…</p>
          ) : candidates.length === 0 ? (
            <p className="text-red-700 font-medium">No open job cards found for this item.</p>
          ) : candidates.length > 1 && !decision.jobCardId ? (
            <div className="space-y-1.5">
              <p className="font-medium text-emerald-800">Multiple job cards found — pick one:</p>
              {candidates.map((c: LiveJobCardCandidate) => {
                const current = currentStages.find((s) => s.job_card_id === c.id);
                return (
                  <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`jc-candidate-${itemId}`}
                      checked={decision.jobCardId === c.id}
                      onChange={() => onChange({ jobCardId: c.id, jcNumber: c.jc_number, stepNumber: null })}
                    />
                    <span>
                      {c.jc_number} — qty {c.quantity_original} {c.unit ?? ""} —{" "}
                      {current ? `stage ${current.step_number} (${current.process_name})` : `entry stage ${c.entry_stage}`}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <>
              {decision.jobCardId && (
                <p className="text-emerald-800 font-medium">
                  {decision.jcNumber} {candidates.length > 1 && (
                    <button className="ml-2 underline font-normal" onClick={() => onChange({ jobCardId: null, jcNumber: null, stepNumber: null })}>
                      change
                    </button>
                  )}
                </p>
              )}
              {eligibleLoading ? (
                <p className="text-muted-foreground">Loading eligible stages…</p>
              ) : !eligibleStages || eligibleStages.length === 0 ? (
                <p className="text-red-700 font-medium">No external stages found on this job card.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {eligibleStages.map((s: EligibleExternalStage) => {
                    const selectable = s.eligible_qty >= lineQty;
                    const isSelected = decision.stepNumber === s.step_number;
                    return (
                      <button
                        key={s.step_number}
                        type="button"
                        disabled={!selectable}
                        onClick={() => selectable && onChange({ stepNumber: s.step_number })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          !selectable
                            ? "bg-slate-50 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-blue-50 text-blue-700 border-blue-400 hover:bg-blue-100"
                        }`}
                      >
                        {s.step_number}. {s.process_name}
                        <span className="ml-1 opacity-60">(eligible {s.eligible_qty})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

export function JobCardCreationDialog({
  open,
  onOpenChange,
  dcId,
  dcNumber,
  lineItems,
  itemIdByIndex = new Map(),
}: JobCardCreationDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<{ lineItem: DCLineItem; itemId: string | null }[]>([]);
  const [decisions, setDecisions] = useState<JCDecision[]>([]);
  const [jcCreating, setJcCreating] = useState(false);
  const [jcResults, setJcResults] = useState<{ itemCode: string; jcNumber: string; linked?: boolean }[]>([]);
  const [jcDone, setJcDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initialRows = lineItems
      .filter((li) => li.description?.trim() || li.item_code?.trim())
      .map((li, idx) => ({
        lineItem: li,
        itemId: (li as any).item_id ?? itemIdByIndex.get(idx) ?? null,
      }));
    setRows(initialRows);
    setDecisions(initialRows.map(() => defaultDecision()));
    setJcResults([]);
    setJcDone(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchDecision = (idx: number, patch: Partial<JCDecision>) => {
    setDecisions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const handleCreateJC = async () => {
    setJcCreating(true);
    const results: { itemCode: string; jcNumber: string; linked?: boolean }[] = [];
    try {
      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const decision = decisions[idx];
        if (decision.skip) continue;

        const dcLineItemId = row.lineItem.id;
        if (!dcLineItemId) throw new Error(`Line item ${row.lineItem.item_code ?? idx} has no id — cannot link to a job card.`);
        const itemCode = row.lineItem.item_code || row.lineItem.description || "?";

        if (decision.mode === "existing") {
          if (!decision.jobCardId || decision.stepNumber === null) continue;
          await linkDcLineToJobCardWithStep(dcLineItemId, decision.jobCardId, decision.stepNumber);
          results.push({ itemCode, jcNumber: decision.jcNumber ?? "", linked: true });
        } else {
          if (!row.itemId || decision.entryStage === null) continue;
          const newJC = await openJobCard({
            item_id: row.itemId,
            qty: Number(row.lineItem.quantity) || 1,
            entry_stage: decision.entryStage,
            reason: decision.reason.trim() || null,
            notes: `Created from DC ${dcNumber}`,
          });
          await linkDcLineToJobCardWithStep(dcLineItemId, newJC.job_card_id, decision.entryStage);
          results.push({ itemCode, jcNumber: newJC.jc_number });
        }
      }
      setJcResults(results);
      setJcDone(true);
    } catch (err: any) {
      // Surfaced verbatim — these are RPC-authored messages meant to be read
      // by a human (e.g. why rpc_open_job_card or rpc_link_dc_line_to_job_card rejected).
      toast({ title: "Error creating job cards", description: err.message, variant: "destructive" });
    } finally {
      setJcCreating(false);
    }
  };

  const activeDecisions = decisions.filter((d) => !d.skip);
  const canConfirm = !jcCreating && activeDecisions.length > 0 && activeDecisions.every((d) => d.ready);
  const anyLinking = activeDecisions.some((d) => d.mode === "existing");

  return (
    <Dialog open={open} onOpenChange={v => { if (!jcCreating) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Job Cards</DialogTitle>
          <DialogDescription>
            Select the processing stage for each item sent for job work.
          </DialogDescription>
        </DialogHeader>

        {jcDone ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                {jcResults.filter(r => !r.linked).length > 0 && (
                  <>{jcResults.filter(r => !r.linked).length} job card{jcResults.filter(r => !r.linked).length !== 1 ? "s" : ""} created</>
                )}
                {jcResults.filter(r => !r.linked).length > 0 && jcResults.filter(r => r.linked).length > 0 && ", "}
                {jcResults.filter(r => r.linked).length > 0 && (
                  <>{jcResults.filter(r => r.linked).length} existing card{jcResults.filter(r => r.linked).length !== 1 ? "s" : ""} updated</>
                )}
              </span>
            </div>
            <div className="space-y-1">
              {jcResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm border rounded px-3 py-1.5">
                  <span className="font-mono text-xs text-muted-foreground">{r.jcNumber}</span>
                  <div className="flex items-center gap-2">
                    {r.linked && (
                      <span className="text-xs text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded">Stage Added</span>
                    )}
                    <span className="font-medium">{r.itemCode}</span>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => { onOpenChange(false); navigate("/delivery-challans/new"); }}
              >
                Create Another DC
              </Button>
              <Button onClick={() => navigate("/job-works")}>View Job Cards →</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No line items to create job cards for.
              </p>
            )}
            {rows.map((row, idx) => {
              const decision = decisions[idx];
              if (!decision) return null;
              return (
                <div
                  key={row.lineItem.id ?? idx}
                  className={`border rounded-lg p-3 space-y-2 ${decision.skip ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-sm">{row.lineItem.item_code || "—"}</span>
                      {row.lineItem.description && (
                        <span className="text-xs text-muted-foreground ml-2">{row.lineItem.description}</span>
                      )}
                      <span className="text-xs text-muted-foreground ml-2">
                        × {row.lineItem.quantity} {row.lineItem.unit}
                      </span>
                    </div>
                    <button
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={() => patchDecision(idx, { skip: !decision.skip })}
                    >
                      {decision.skip ? "Undo skip" : "Skip"}
                    </button>
                  </div>

                  {!decision.skip && (
                    <JCItemRow
                      lineItem={row.lineItem}
                      itemId={row.itemId}
                      decision={decision}
                      onChange={(patch) => patchDecision(idx, patch)}
                    />
                  )}
                </div>
              );
            })}

            <DialogFooter className="gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => { onOpenChange(false); navigate(`/delivery-challans/${dcId}`); }}
              >
                Skip — View DC
              </Button>
              <Button onClick={handleCreateJC} disabled={!canConfirm}>
                {jcCreating ? "Saving…" : anyLinking ? "Save Job Cards" : "Create Job Cards"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
