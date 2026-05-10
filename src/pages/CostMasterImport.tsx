import { useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Upload,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
} from "lucide-react";
import {
  parseExcelSmart,
  resolveColumns,
  extractRow,
  type SkipReason,
} from "@/lib/import-utils";
import {
  COST_MASTER_FIELD_MAP,
  applyCostMasterUpdates,
  fetchCostMasterBindings,
  fetchItemsLite,
  matchCostMasterRows,
  normalizeForBinding,
  type ApplyPlanItem,
  type ApplyResult,
  type CostMasterRow,
  type ItemLite,
  type MatchResult,
  type MatchVia,
} from "@/lib/cost-master-utils";
import { formatCurrency } from "@/lib/gst-utils";

type ParseSummary = {
  fileName: string;
  rowsCount: number;
  skipped: SkipReason[];
};

type ReviewSelection = string | "skip"; // item_id or "skip"

const VIA_LABEL: Record<MatchVia, string> = {
  binding: "binding",
  item_code: "code",
  item_code_norm: "code",
  drawing_revision: "drawing",
  drawing_number: "drawing",
  fuzzy_description: "fuzzy",
};

export default function CostMasterImport() {
  const { role, user, profile } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<CostMasterRow[]>([]);
  const [parseSummary, setParseSummary] = useState<ParseSummary | null>(null);

  const [isMatching, setIsMatching] = useState(false);
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null);
  const [reviewSelections, setReviewSelections] = useState<Record<number, ReviewSelection>>({});

  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  // Big-apply confirmation: applies > 50 rows must be typed-confirmed.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pendingPlan, setPendingPlan] = useState<ApplyPlanItem[] | null>(null);
  const BIG_APPLY_THRESHOLD = 50;

  if (role !== "admin" && role !== "finance") {
    return <Navigate to="/" replace />;
  }

  const resetAll = () => {
    setFile(null);
    setParsedRows([]);
    setParseSummary(null);
    setMatchResults(null);
    setReviewSelections({});
    setApplyResult(null);
    setApplyProgress(null);
    setConfirmOpen(false);
    setConfirmText("");
    setPendingPlan(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setIsParsing(true);
    setParsedRows([]);
    setParseSummary(null);
    setMatchResults(null);
    setReviewSelections({});

    try {
      const { rows: raw, rowNums, skipped } = await parseExcelSmart(picked, COST_MASTER_FIELD_MAP);
      if (raw.length === 0) {
        toast({
          title: "No data found",
          description: "The file is empty or contains only headers.",
          variant: "destructive",
        });
        setIsParsing(false);
        return;
      }

      const headers = Object.keys(raw[0]);
      const colMap = resolveColumns(headers, COST_MASTER_FIELD_MAP);
      const extracted = raw.map((r) => extractRow(r, headers, colMap));

      // Coerce + dedupe by item_code (last-wins, with console warning)
      const seen = new Map<string, number>(); // code → index in finalRows
      const finalRows: CostMasterRow[] = [];

      extracted.forEach((rec, i) => {
        const code = (rec.item_code ?? "").trim();
        const desc = (rec.description ?? "").trim();
        const rawCost = (rec.standard_cost ?? "").toString().replace(/[,\s₹]/g, "");
        const cost = rawCost === "" ? NaN : Number(rawCost);
        const row: CostMasterRow = {
          row_no: rowNums[i] ?? (i + 2),
          item_code: code,
          description: desc,
          standard_cost: cost,
        };

        if (code) {
          const dupIdx = seen.get(code);
          if (dupIdx != null) {
            // eslint-disable-next-line no-console
            console.warn(
              `[CostMaster] Duplicate item_code "${code}" — row ${row.row_no} overrides row ${finalRows[dupIdx].row_no}.`,
            );
            finalRows[dupIdx] = row;
            return;
          }
          seen.set(code, finalRows.length);
        }
        finalRows.push(row);
      });

      setParsedRows(finalRows);
      setParseSummary({
        fileName: picked.name,
        rowsCount: finalRows.length,
        skipped,
      });
    } catch (err: any) {
      toast({
        title: "Failed to parse file",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleMatch = async () => {
    if (parsedRows.length === 0) return;
    setIsMatching(true);
    try {
      const [items, bindings] = await Promise.all([
        fetchItemsLite(),
        fetchCostMasterBindings(),
      ]);
      const results = matchCostMasterRows(parsedRows, items, bindings);
      setMatchResults(results);

      // Default review selections: top candidate
      const defaults: Record<number, ReviewSelection> = {};
      results.forEach((r, idx) => {
        if (r.bucket === "needs_review" && r.candidates && r.candidates.length > 0) {
          defaults[idx] = r.candidates[0].id;
        }
      });
      setReviewSelections(defaults);
    } catch (err: any) {
      toast({
        title: "Matching failed",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setIsMatching(false);
    }
  };

  // Build the apply plan from current matchResults + reviewSelections.
  //   - will_update rows  → auto-matched, no binding to persist
  //   - needs_review rows → only those the user resolved (non-skip), with a
  //     binding write so next upload auto-matches
  const buildPlan = (): ApplyPlanItem[] => {
    if (!matchResults) return [];
    const plan: ApplyPlanItem[] = [];
    matchResults.forEach((r, idx) => {
      const sourceText = (r.row.item_code || r.row.description || "").trim();
      const sourceTextNorm = normalizeForBinding(sourceText);

      if (r.bucket === "will_update" && r.matched_item && r.match_via) {
        plan.push({
          item_id: r.matched_item.id,
          new_cost: r.row.standard_cost,
          old_cost: Number(r.matched_item.standard_cost ?? 0),
          source_text: sourceText,
          source_text_norm: sourceTextNorm,
          match_via: r.match_via,
          binding_used: !!r.binding_used,
          needs_binding_persist: false,
          source_row_no: r.row.row_no,
        });
        return;
      }

      if (r.bucket === "needs_review") {
        const sel = reviewSelections[idx];
        if (!sel || sel === "skip") return;
        const chosen = (r.candidates ?? []).find((c) => c.id === sel);
        if (!chosen) return;
        plan.push({
          item_id: chosen.id,
          new_cost: r.row.standard_cost,
          old_cost: Number(chosen.standard_cost ?? 0),
          source_text: sourceText,
          source_text_norm: sourceTextNorm,
          match_via: r.match_via ?? "fuzzy_description",
          binding_used: false,
          needs_binding_persist: true,
          source_row_no: r.row.row_no,
        });
      }
    });
    return plan;
  };

  // Actually run the apply against the DB. Always invoked with a non-empty plan.
  const runApply = async (plan: ApplyPlanItem[]) => {
    if (!parseSummary) return;
    setIsApplying(true);
    setApplyProgress({ done: 0, total: plan.length });

    try {
      const userName =
        profile?.display_name ||
        profile?.full_name ||
        (user?.user_metadata as any)?.full_name ||
        (user?.user_metadata as any)?.name ||
        user?.email ||
        null;

      const res = await applyCostMasterUpdates(
        plan,
        {
          source_file_name: parseSummary.fileName,
          user_id: user?.id ?? null,
          user_email: user?.email ?? null,
          user_name: userName,
        },
        (done, total) => setApplyProgress({ done, total }),
      );

      if (res.failures.length > 0) {
        // eslint-disable-next-line no-console
        console.warn("[CostMaster] per-item failures:", res.failures);
      }

      setApplyResult(res);
      toast({
        title: "Cost Master applied",
        description:
          `${res.updated} updated · ${res.failed} failed · ` +
          `${res.bindings_saved} binding${res.bindings_saved === 1 ? "" : "s"} saved`,
      });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[CostMaster] apply failed:", err);
      toast({
        title: "Apply failed",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Apply button entry point. Decides direct-run (≤50) vs typed confirmation.
  const handleApply = async () => {
    if (!matchResults || !parseSummary) return;
    const plan = buildPlan();
    if (plan.length === 0) {
      toast({
        title: "Nothing to apply",
        description: "No will-update rows and no resolved review rows.",
      });
      return;
    }
    if (plan.length > BIG_APPLY_THRESHOLD) {
      setPendingPlan(plan);
      setConfirmText("");
      setConfirmOpen(true);
      return;
    }
    await runApply(plan);
  };

  const handleConfirmApply = async () => {
    const plan = pendingPlan;
    setConfirmOpen(false);
    setConfirmText("");
    setPendingPlan(null);
    if (plan && plan.length > 0) await runApply(plan);
  };

  const handleConfirmCancel = () => {
    setConfirmOpen(false);
    setConfirmText("");
    setPendingPlan(null);
  };

  // ── Bucket the results ──
  const buckets = useMemo(() => {
    const willUpdate: Array<{ idx: number; r: MatchResult }> = [];
    const noChange: Array<{ idx: number; r: MatchResult }> = [];
    const needsReview: Array<{ idx: number; r: MatchResult }> = [];
    const skipped: Array<{ idx: number; r: MatchResult }> = [];
    (matchResults ?? []).forEach((r, idx) => {
      if (r.bucket === "will_update") willUpdate.push({ idx, r });
      else if (r.bucket === "no_change") noChange.push({ idx, r });
      else if (r.bucket === "needs_review") needsReview.push({ idx, r });
      else skipped.push({ idx, r });
    });
    return { willUpdate, noChange, needsReview, skipped };
  }, [matchResults]);

  const resolvedReviewCount = buckets.needsReview.filter(
    ({ idx }) => reviewSelections[idx] && reviewSelections[idx] !== "skip",
  ).length;

  const applyDisabled =
    buckets.willUpdate.length === 0 && resolvedReviewCount === 0;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Cost Master</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload an Excel file to update standard cost across the items master.
          Other item fields are not changed.
        </p>
      </div>

      {/* ── Upload card (hidden once we have results) ── */}
      {!matchResults && !applyResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" />
              Upload Cost Master
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <Upload className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700 mb-1">
                Choose an Excel file (.xlsx / .xls)
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                We'll parse it locally and show you the matches before any update is applied.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFile}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileRef.current?.click()}
                disabled={isParsing}
              >
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Parsing…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> Choose File
                  </>
                )}
              </Button>
            </div>

            {parseSummary && (
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">
                  Parsed {parseSummary.rowsCount} row
                  {parseSummary.rowsCount === 1 ? "" : "s"} from{" "}
                  <span className="font-mono">{parseSummary.fileName}</span>.
                  {parseSummary.skipped.length > 0 && (
                    <>
                      {" "}
                      {parseSummary.skipped.length} skipped (header / blank rows).
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleMatch}
                disabled={isMatching || parsedRows.length === 0}
              >
                {isMatching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Matching…
                  </>
                ) : (
                  "Match"
                )}
              </Button>
              {file && (
                <Button size="sm" variant="ghost" onClick={resetAll} disabled={isMatching}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Results ── */}
      {matchResults && !applyResult && (
        <div className="space-y-4">
          {/* Summary banner */}
          <div className="rounded-lg border bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">
              <span className="text-emerald-700">{buckets.willUpdate.length}</span> items will update.{" "}
              <span className="text-amber-700">{buckets.needsReview.length}</span> need your review.{" "}
              <span className="text-slate-600">{buckets.noChange.length}</span> already up to date.{" "}
              <span className="text-slate-600">{buckets.skipped.length}</span> skipped.
            </p>
            {parseSummary && (
              <p className="text-xs text-muted-foreground mt-1">
                Source: <span className="font-mono">{parseSummary.fileName}</span> ·{" "}
                {parseSummary.rowsCount} parsed row
                {parseSummary.rowsCount === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {/* a) Will Update */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Will Update ({buckets.willUpdate.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {buckets.willUpdate.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No rows ready to update.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Matched To</TableHead>
                        <TableHead className="text-right">Old Cost</TableHead>
                        <TableHead className="text-right">New Cost</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                        <TableHead>Via</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {buckets.willUpdate.map(({ idx, r }) => {
                        const item = r.matched_item!;
                        const diff = r.row.standard_cost - Number(item.standard_cost ?? 0);
                        const diffClass =
                          diff > 0 ? "text-emerald-700" : diff < 0 ? "text-red-700" : "text-slate-600";
                        const diffSign = diff > 0 ? "+" : "";
                        const via = r.match_via ? VIA_LABEL[r.match_via] : "—";
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{r.row.row_no}</TableCell>
                            <TableCell className="font-mono text-xs">{r.row.item_code || "—"}</TableCell>
                            <TableCell className="text-xs">{r.row.description || "—"}</TableCell>
                            <TableCell className="text-xs">
                              <span className="font-mono">{item.item_code}</span>
                              <span className="text-muted-foreground"> — {item.description}</span>
                            </TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(Number(item.standard_cost ?? 0))}</TableCell>
                            <TableCell className="text-right text-xs font-medium">{formatCurrency(r.row.standard_cost)}</TableCell>
                            <TableCell className={`text-right text-xs font-medium ${diffClass}`}>
                              {diffSign}{formatCurrency(diff)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px]">
                                {via}
                                {r.binding_used ? " ✓" : ""}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* b) Needs Review */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Needs Review ({buckets.needsReview.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {buckets.needsReview.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing needs your review — clean run.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">New Cost</TableHead>
                        <TableHead>Choose Match</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {buckets.needsReview.map(({ idx, r }) => {
                        const candidates = r.candidates ?? [];
                        const value = reviewSelections[idx] ?? (candidates[0]?.id ?? "skip");
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{r.row.row_no}</TableCell>
                            <TableCell className="font-mono text-xs">{r.row.item_code || "—"}</TableCell>
                            <TableCell className="text-xs">
                              {r.row.description || "—"}
                              {r.reason && (
                                <p className="text-[10px] text-muted-foreground italic mt-0.5">
                                  {r.reason}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium">
                              {formatCurrency(r.row.standard_cost)}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={value}
                                onValueChange={(v) =>
                                  setReviewSelections((prev) => ({ ...prev, [idx]: v as ReviewSelection }))
                                }
                                disabled={isApplying}
                              >
                                <SelectTrigger className="h-8 text-xs min-w-[260px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {candidates.map((c: ItemLite) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      <span className="font-mono">{c.item_code}</span>
                                      {" — "}
                                      <span className="text-muted-foreground">{c.description}</span>
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="skip">Skip this row</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* c) Already Up To Date — collapsible */}
          <Collapsible>
            <Card>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full text-left"
                >
                  <CardHeader className="cursor-pointer hover:bg-slate-50">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]_&]:rotate-90" />
                      Already Up To Date ({buckets.noChange.length})
                    </CardTitle>
                  </CardHeader>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  {buckets.noChange.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No rows in this bucket.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Row</TableHead>
                            <TableHead>Item Code</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Cost</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {buckets.noChange.map(({ idx, r }) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs">{r.row.row_no}</TableCell>
                              <TableCell className="font-mono text-xs">{r.row.item_code || "—"}</TableCell>
                              <TableCell className="text-xs">{r.row.description || "—"}</TableCell>
                              <TableCell className="text-right text-xs">{formatCurrency(r.row.standard_cost)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* d) Skipped — collapsible */}
          <Collapsible>
            <Card>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full text-left"
                >
                  <CardHeader className="cursor-pointer hover:bg-slate-50">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ChevronDown className="h-4 w-4" />
                      Skipped ({buckets.skipped.length})
                    </CardTitle>
                  </CardHeader>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  {buckets.skipped.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No rows skipped.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Row</TableHead>
                            <TableHead>Item Code</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Cost (raw)</TableHead>
                            <TableHead>Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {buckets.skipped.map(({ idx, r }) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs">{r.row.row_no}</TableCell>
                              <TableCell className="font-mono text-xs">{r.row.item_code || "—"}</TableCell>
                              <TableCell className="text-xs">{r.row.description || "—"}</TableCell>
                              <TableCell className="text-right text-xs">
                                {Number.isFinite(r.row.standard_cost) ? r.row.standard_cost : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <XCircle className="h-3 w-3 text-red-500" />
                                  {r.reason ?? "—"}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Action bar */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={resetAll} disabled={isApplying}>
              Cancel / Start Over
            </Button>
            <Button onClick={handleApply} disabled={applyDisabled || isApplying}>
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying… ({applyProgress?.done ?? 0} of {applyProgress?.total ?? 0})
                </>
              ) : (
                <>
                  Apply Updates
                  {(buckets.willUpdate.length > 0 || resolvedReviewCount > 0) && (
                    <span className="ml-1 text-xs opacity-90">
                      ({buckets.willUpdate.length + resolvedReviewCount})
                    </span>
                  )}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Apply result banner ── */}
      {applyResult && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">Cost Master applied</h2>
                <p className="text-sm text-slate-700 mt-1">
                  <span className="font-medium text-emerald-700">{applyResult.updated}</span>{" "}
                  item{applyResult.updated === 1 ? "" : "s"} updated.
                </p>
                {applyResult.failed > 0 && (
                  <p className="text-sm text-red-700 mt-0.5">
                    <XCircle className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                    {applyResult.failed} item{applyResult.failed === 1 ? "" : "s"} failed —
                    see browser console for details.
                  </p>
                )}
                <p className="text-sm text-slate-600 mt-0.5">
                  {applyResult.bindings_saved} user-confirmed binding
                  {applyResult.bindings_saved === 1 ? "" : "s"} remembered for next upload.
                </p>
                <p className="text-xs text-muted-foreground mt-2 font-mono">
                  batch: {applyResult.batch_id}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={resetAll}>Start Over</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Big-apply typed confirmation ── */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !isApplying) handleConfirmCancel();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Cost Master apply</DialogTitle>
            <DialogDescription>
              You are about to update{" "}
              <span className="font-semibold text-slate-900">
                {pendingPlan?.length ?? 0}
              </span>{" "}
              item costs. This action writes to the items master and cannot be
              auto-undone (audit log is preserved). Type{" "}
              <span className="font-mono font-semibold">APPLY</span> in the box
              below to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Type APPLY"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={isApplying}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={handleConfirmCancel}
              disabled={isApplying}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmApply}
              disabled={confirmText !== "APPLY" || isApplying}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
