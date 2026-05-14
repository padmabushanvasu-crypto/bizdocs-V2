import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { fetchProcessingRouteAll, type ProcessingRoute } from "@/lib/dc-intelligence-api";
import { createJobWork, createJobWorkStep, fetchCompletedStepsForItem } from "@/lib/job-works-api";
import { type DCLineItem } from "@/lib/delivery-challans-api";
import { supabase } from "@/integrations/supabase/client";

type JCItemState = {
  lineItem: DCLineItem;
  itemId: string | null;
  routes: ProcessingRoute[];
  selectedStageNumber: number | null;
  completedStageNumbers: Set<number>;
  skip: boolean;
  existingMode: boolean;
  existingJCNumber: string;
  useExisting: boolean;
  existingJCs: { id: string; jc_number: string; status: string }[];
};

export interface JobCardCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dcId: string;
  dcNumber: string;
  lineItems: DCLineItem[];
  partyId?: string | null;
  partyName?: string | null;
  itemIdByIndex?: Map<number, string>;
  existingJobCards?: Record<string, { id: string; jc_number: string; current_stage: number; status: string }[]>;
}

export function JobCardCreationDialog({
  open,
  onOpenChange,
  dcId,
  dcNumber,
  lineItems,
  partyId,
  partyName,
  itemIdByIndex = new Map(),
  existingJobCards = {},
}: JobCardCreationDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jcItems, setJcItems] = useState<JCItemState[]>([]);
  const [jcCreating, setJcCreating] = useState(false);
  const [jcResults, setJcResults] = useState<{ itemCode: string; jcNumber: string }[]>([]);
  const [jcDone, setJcDone] = useState(false);

  // Initialize state and fetch routes when dialog opens
  useEffect(() => {
    if (!open) return;
    const initial: JCItemState[] = lineItems
      .filter(li => li.description?.trim() || li.item_code?.trim())
      .map((li, idx) => {
        const itemId = (li as any).item_id ?? itemIdByIndex.get(idx) ?? null;
        const existingMatch = itemId ? existingJobCards[itemId]?.[0] : undefined;
        const suggestedStage = existingMatch ? (existingMatch.current_stage ?? 0) + 1 : null;
        return {
          lineItem: li,
          itemId,
          routes: [],
          selectedStageNumber: suggestedStage,
          completedStageNumbers: new Set<number>(),
          skip: false,
          existingMode: suggestedStage !== null && suggestedStage > 1,
          existingJCNumber: existingMatch?.jc_number ?? "",
          useExisting: existingMatch != null,
          existingJCs: existingMatch ? [existingMatch] : [],
        };
      });
    setJcItems(initial);
    setJcResults([]);
    setJcDone(false);

    initial.forEach((item, idx) => {
      if (!item.itemId) return;
      fetchProcessingRouteAll(item.itemId).then(routes => {
        setJcItems(prev => {
          const updated = [...prev];
          if (updated[idx]) updated[idx] = { ...updated[idx], routes };
          return updated;
        });
      }).catch(err => {
        toast({ title: "Failed to load processing routes", description: err.message, variant: "destructive" });
      });
      fetchCompletedStepsForItem(item.itemId).then(completedStageNumbers => {
        setJcItems(prev => {
          const updated = [...prev];
          if (updated[idx]) updated[idx] = { ...updated[idx], completedStageNumbers };
          return updated;
        });
      }).catch(() => {/* ignore — completed stages are a display enhancement */});
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchExistingJCs = async (idx: number, itemId: string | null) => {
    if (!itemId) return;
    const { data } = await (supabase as any)
      .from("job_cards")
      .select("id, jc_number, status")
      .eq("item_id", itemId)
      .in("status", ["in_progress", "on_hold"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (data?.length) {
      setJcItems(prev => {
        const updated = [...prev];
        if (updated[idx]) updated[idx] = { ...updated[idx], existingJCs: data };
        return updated;
      });
    }
  };

  const handleCreateJC = async () => {
    setJcCreating(true);
    const results: { itemCode: string; jcNumber: string; linked?: boolean }[] = [];
    try {
      for (const item of jcItems) {
        if (item.skip || item.selectedStageNumber === null) continue;

        // Link to existing JC — add new step to it instead of creating a new card
        if (item.existingMode && item.useExisting && item.existingJCNumber.trim()) {
          const jcNumTrimmed = item.existingJCNumber.trim();
          // Prefer id from the pre-fetched list; fall back to DB lookup for manual entry
          let existingJCId: string | null =
            item.existingJCs.find(jc => jc.jc_number === jcNumTrimmed)?.id ?? null;
          if (!existingJCId) {
            const { data: found } = await (supabase as any)
              .from("job_cards")
              .select("id")
              .eq("jc_number", jcNumTrimmed)
              .maybeSingle();
            existingJCId = (found as any)?.id ?? null;
          }

          if (existingJCId) {
            const selectedRoute = item.routes.find(r => r.stage_number === item.selectedStageNumber);
            if (selectedRoute) {
              await createJobWorkStep({
                job_card_id: existingJCId,
                step_number: item.selectedStageNumber ?? 1,
                step_type: selectedRoute.stage_type,
                name: selectedRoute.process_name,
                status: "in_progress",
                vendor_id: partyId ?? null,
                vendor_name: partyName ?? null,
                qty_sent: Number(item.lineItem.quantity) || 1,
                unit: item.lineItem.unit || "NOS",
                outward_dc_id: dcId || null,
              } as any);
            }
            // Ensure JC is in_progress and track current stage
            await (supabase as any)
              .from("job_cards")
              .update({
                status: "in_progress",
                current_stage: item.selectedStageNumber,
                current_stage_name: selectedRoute?.process_name ?? null,
                current_location: "at_vendor",
                current_vendor_name: partyName ?? null,
                current_vendor_since: new Date().toISOString(),
              })
              .eq("id", existingJCId);
          }

          results.push({
            itemCode: item.lineItem.item_code || item.lineItem.description || "?",
            jcNumber: jcNumTrimmed,
            linked: true,
          });
          continue;
        }

        // jc_number is assigned by trg_job_cards_assign_number on insert.
        // Pass empty string and read the trigger-assigned value back from
        // the returned row.
        const newJC = await createJobWork({
          jc_number: "",
          item_id: item.itemId ?? undefined,
          item_code: item.lineItem.item_code || undefined,
          item_description: item.lineItem.description || undefined,
          quantity_original: Number(item.lineItem.quantity) || 1,
          unit: item.lineItem.unit || "NOS",
          notes: `Created from DC ${dcNumber}. Stage: ${item.selectedStageNumber}`,
        } as any);
        const jcNumber = (newJC as any)?.jc_number ?? "";

        if ((newJC as any)?.id) {
          const selectedRoute = item.routes.find(r => r.stage_number === item.selectedStageNumber);

          // Create pre_bizdocs placeholder steps for all stages before the selected one
          const priorRoutes = item.routes.filter(r => r.stage_number < (item.selectedStageNumber ?? 0));
          for (const prior of priorRoutes) {
            await createJobWorkStep({
              job_card_id: (newJC as any).id,
              step_number: prior.stage_number,
              step_type: prior.stage_type,
              name: prior.process_name,
              status: "pre_bizdocs",
              qty_sent: null,
              unit: item.lineItem.unit || "NOS",
            } as any);
          }

          // Create the active step for the selected stage
          if (selectedRoute) {
            await createJobWorkStep({
              job_card_id: (newJC as any).id,
              step_number: item.selectedStageNumber ?? 1,
              step_type: selectedRoute.stage_type,
              name: selectedRoute.process_name,
              status: "in_progress",
              vendor_id: partyId ?? null,
              vendor_name: partyName ?? null,
              qty_sent: Number(item.lineItem.quantity) || 1,
              unit: item.lineItem.unit || "NOS",
              outward_dc_id: dcId || null,
            } as any);
          }

          // Create pending placeholder steps for all stages after the selected one
          const subsequentRoutes = item.routes.filter(r => r.stage_number > (item.selectedStageNumber ?? 0));
          for (const next of subsequentRoutes) {
            await createJobWorkStep({
              job_card_id: (newJC as any).id,
              step_number: next.stage_number,
              step_type: next.stage_type,
              name: next.process_name,
              status: "pending",
              qty_sent: null,
              unit: item.lineItem.unit || "NOS",
            } as any);
          }
        }

        results.push({
          itemCode: item.lineItem.item_code || item.lineItem.description || "?",
          jcNumber,
        });
      }
      setJcResults(results);
      setJcDone(true);
    } catch (err: any) {
      toast({ title: "Error creating job cards", description: err.message, variant: "destructive" });
    } finally {
      setJcCreating(false);
    }
  };

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
            {jcItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No line items to create job cards for.
              </p>
            )}
            {jcItems.map((item, idx) => (
              <div
                key={idx}
                className={`border rounded-lg p-3 space-y-2 ${item.skip ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-sm">{item.lineItem.item_code || "—"}</span>
                    {item.lineItem.description && (
                      <span className="text-xs text-muted-foreground ml-2">{item.lineItem.description}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-2">
                      × {item.lineItem.quantity} {item.lineItem.unit}
                    </span>
                  </div>
                  <button
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={() =>
                      setJcItems(prev => {
                        const u = [...prev];
                        u[idx] = { ...u[idx], skip: !u[idx].skip };
                        return u;
                      })
                    }
                  >
                    {item.skip ? "Undo skip" : "Skip"}
                  </button>
                </div>

                {!item.skip && (
                  <>
                    {item.itemId && existingJobCards[item.itemId]?.[0] && item.selectedStageNumber !== null && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        Continuing from Stage {existingJobCards[item.itemId][0].current_stage} ({existingJobCards[item.itemId][0].jc_number}) — suggesting Stage {item.selectedStageNumber}
                      </p>
                    )}
                    {item.routes.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No BOM processing route found — job card will be created with no stage.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {item.routes.map(route => {
                          const isDone = item.completedStageNumbers.has(route.stage_number);
                          const isSelected = item.selectedStageNumber === route.stage_number;
                          return (
                            <button
                              key={route.id}
                              disabled={isDone}
                              onClick={() => {
                                if (isDone) return;
                                const isStage2Plus = route.stage_number > 1;
                                setJcItems(prev => {
                                  const u = [...prev];
                                  u[idx] = {
                                    ...u[idx],
                                    selectedStageNumber: route.stage_number,
                                    existingMode: isStage2Plus,
                                  };
                                  return u;
                                });
                                if (isStage2Plus) fetchExistingJCs(idx, item.itemId);
                              }}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                route.stage_type === "external"
                                  ? isDone
                                    ? "bg-blue-50 text-blue-400 border-blue-200 line-through opacity-60 cursor-not-allowed"
                                    : isSelected
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-blue-50 text-blue-700 border-blue-400 hover:bg-blue-100"
                                  : isDone
                                  ? "bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60 cursor-not-allowed"
                                  : isSelected
                                  ? "bg-slate-600 text-white border-slate-600"
                                  : "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100"
                              }`}
                            >
                              {isDone ? "✓ " : ""}{route.stage_number}. {route.process_name}
                              <span className="ml-1 opacity-60">
                                {route.stage_type === "internal" ? "(internal)" : "(vendor)"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {item.selectedStageNumber !== null && item.selectedStageNumber > 1 && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs space-y-2">
                        <p className="font-medium text-amber-800">
                          Stage {item.selectedStageNumber} — does an existing job card cover earlier stages?
                        </p>
                        <div className="flex gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`jc-mode-${idx}`}
                              checked={item.existingMode && item.useExisting}
                              onChange={() =>
                                setJcItems(prev => {
                                  const u = [...prev];
                                  u[idx] = { ...u[idx], useExisting: true };
                                  return u;
                                })
                              }
                            />
                            <span>Yes, link existing JC</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`jc-mode-${idx}`}
                              checked={!item.useExisting}
                              onChange={() =>
                                setJcItems(prev => {
                                  const u = [...prev];
                                  u[idx] = { ...u[idx], useExisting: false };
                                  return u;
                                })
                              }
                            />
                            <span>No, create new JC</span>
                          </label>
                        </div>
                        {item.useExisting && (
                          item.existingJCs.length > 0 ? (
                            <select
                              className="w-full border rounded px-2 py-1 text-xs bg-white"
                              value={item.existingJCNumber}
                              onChange={e =>
                                setJcItems(prev => {
                                  const u = [...prev];
                                  u[idx] = { ...u[idx], existingJCNumber: e.target.value };
                                  return u;
                                })
                              }
                            >
                              <option value="">Select a job card…</option>
                              {item.existingJCs.map(jc => (
                                <option key={jc.id} value={jc.jc_number}>
                                  {jc.jc_number} ({jc.status})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="w-full border rounded px-2 py-1 text-xs"
                              placeholder="JC number (e.g. JW-0042)"
                              value={item.existingJCNumber}
                              onChange={e =>
                                setJcItems(prev => {
                                  const u = [...prev];
                                  u[idx] = { ...u[idx], existingJCNumber: e.target.value };
                                  return u;
                                })
                              }
                            />
                          )
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            <DialogFooter className="gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => { onOpenChange(false); navigate(`/delivery-challans/${dcId}`); }}
              >
                Skip — View DC
              </Button>
              <Button
                onClick={handleCreateJC}
                disabled={jcCreating || jcItems.every(i => i.skip || i.selectedStageNumber === null)}
              >
                {jcCreating ? "Saving…" : jcItems.some(i => !i.skip && i.selectedStageNumber !== null && i.existingMode && i.useExisting) ? "Save Job Cards" : "Create Job Cards"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
