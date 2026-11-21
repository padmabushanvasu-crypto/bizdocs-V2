import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemSuggest } from "@/components/ItemSuggest";
import { GrnDrawPicker } from "@/components/GrnDrawPicker";
import { useToast } from "@/hooks/use-toast";
import { fetchItem, type Item } from "@/lib/items-api";
import { type GrnLineAvailableForConversion } from "@/lib/production-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { formatNumber } from "@/lib/gst-utils";
import {
  postRmConversion,
  fetchSuggestedComponents,
  type RmConversionInputPayload,
  type RmConversionOutputPayload,
  type SuggestedComponent,
} from "@/lib/rm-conversions-api";

interface InputRow {
  key: string;
  item: Item | null;
  itemSearch: string;
  source: "store" | "grn_direct";
  grnLine: GrnLineAvailableForConversion | null;
  qty: string; // primary qty, in the item's own base unit
  altQty: string;
  scrapQty: string; // offcut/scrap — a part OF qty, not on top of it
  notes: string;
  pickerOpen: boolean;
  // "GRN-direct" is off by default and hidden behind a disclosure link —
  // the office almost always enters actuals against store stock. Set once
  // the user clicks through to say the material never entered the store.
  showSourceToggle: boolean;
}

function newInputRow(): InputRow {
  return {
    key: crypto.randomUUID(),
    item: null,
    itemSearch: "",
    source: "store",
    grnLine: null,
    qty: "",
    altQty: "",
    scrapQty: "0",
    notes: "",
    pickerOpen: false,
    showSourceToggle: false,
  };
}

// One produced item. A conversion has one or more — e.g. a tube cut into
// several drawing-number lengths, each with its own quantity. There is no
// template: the office adds a row per item that actually came out.
interface OutputRow {
  key: string;
  item: Item | null;
  itemSearch: string;
  qty: string; // in the item's own base unit
  altQty: string;
  // "list" = pick from the raw material's cutting list (dropdown);
  // "search" = free search across every item. The list is used whenever the
  // raw material has one; search is always one tap away.
  mode: "list" | "search";
}

function newOutputRow(): OutputRow {
  return { key: crypto.randomUUID(), item: null, itemSearch: "", qty: "", altQty: "", mode: "list" };
}

const SEARCH_OTHER = "__search_other__";

function isBlankOutputRow(o: OutputRow): boolean {
  return !o.item && o.itemSearch.trim() === "" && o.qty.trim() === "" && o.altQty.trim() === "";
}

// Mirrors rpc_post_rm_conversion's own tolerance math exactly (read from the
// live function body, not guessed): implied_factor = qty_base / qty_alt,
// warn when abs(implied - item.alt_factor) / item.alt_factor * 100 exceeds
// company_settings.conversion_factor_tolerance_pct. 'fixed' mode items get
// no check at all — the RPC doesn't check it either (known, accepted gap).
// This is a WARNING only; the RPC is the real gate and raises its own error
// if it disagrees — never block submission on this client-side calculation.
function toleranceWarning(item: Item, qty: number, altQty: number, tolerancePct: number): string | null {
  if (item.alt_factor_mode !== "variable") return null;
  if (!item.alt_factor || item.alt_factor <= 0) return null;
  if (!(qty > 0) || !(altQty > 0)) return null;
  const implied = qty / altQty;
  const pctDiff = (Math.abs(implied - item.alt_factor) / item.alt_factor) * 100;
  if (pctDiff <= tolerancePct) return null;
  return `Implied factor ${implied.toFixed(4)} is ${pctDiff.toFixed(1)}% off the master factor ${item.alt_factor.toFixed(4)} (tolerance ${tolerancePct.toFixed(1)}%) — verify the weighment/count before posting.`;
}

export default function RmConversionNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<InputRow[]>([newInputRow()]);
  const [outputs, setOutputs] = useState<OutputRow[]>([newOutputRow()]);
  const [notes, setNotes] = useState("");
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  // Suggested output components for the first input row's raw material
  // (item_conversion_map, fully_matched links only). Purely a shortcut —
  // free search is always available and never restricted by this.
  const firstInputItem = rows[0]?.item ?? null;
  const { data: suggestedComponents = [] } = useQuery({
    queryKey: ["rm-conversion-suggested-components", firstInputItem?.id],
    queryFn: () => fetchSuggestedComponents(firstInputItem!.id),
    enabled: !!firstInputItem,
  });

  const updateOutput = (key: string, patch: Partial<OutputRow>) => {
    setOutputs((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  };
  const removeOutput = (key: string) => {
    setOutputs((prev) => (prev.length <= 1 ? prev : prev.filter((o) => o.key !== key)));
  };
  const addOutput = () => setOutputs((prev) => [...prev, newOutputRow()]);

  // A newly added output row lands at the bottom of the page, where the item
  // picker's dropdown would open below the screen edge. Bring the new row to
  // the middle of the screen so its search results are visible straight away.
  const outputRowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevOutputCountRef = useRef(outputs.length);
  useEffect(() => {
    if (outputs.length > prevOutputCountRef.current) {
      const last = outputs[outputs.length - 1];
      outputRowRefs.current.get(last.key)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
    prevOutputCountRef.current = outputs.length;
  }, [outputs]);

  // Items chosen on more than one output row. The RPC rejects this too
  // ("listed more than once") — flagged inline so it is fixed before posting.
  const duplicateOutputItemIds = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const o of outputs) {
      if (!o.item) continue;
      if (seen.has(o.item.id)) dup.add(o.item.id);
      seen.add(o.item.id);
    }
    return dup;
  }, [outputs]);

  // The raw material's cutting list, grouped by its heading (e.g. 11 KV PIPE),
  // in the list's own order.
  const suggestionGroups = useMemo(() => {
    const groups: { label: string; items: SuggestedComponent[] }[] = [];
    for (const s of suggestedComponents) {
      const label = s.group ?? "Parts";
      let g = groups.find((x) => x.label === label);
      if (!g) groups.push((g = { label, items: [] }));
      g.items.push(s);
    }
    return groups;
  }, [suggestedComponents]);
  const suggestionIds = useMemo(() => new Set(suggestedComponents.map((s) => s.item_id)), [suggestedComponents]);
  const chosenOutputIds = useMemo(
    () => new Set(outputs.map((o) => o.item?.id).filter(Boolean) as string[]),
    [outputs]
  );

  // Picks an item from the cutting list onto one output row.
  const pickFromList = async (key: string, itemId: string) => {
    if (itemId === SEARCH_OTHER) {
      updateOutput(key, { mode: "search", item: null, itemSearch: "", altQty: "" });
      return;
    }
    if (!itemId) {
      updateOutput(key, { item: null, altQty: "" });
      return;
    }
    setSuggestionLoading(true);
    try {
      const item = await fetchItem(itemId);
      updateOutput(key, { item, itemSearch: "", altQty: "" });
    } catch (err: any) {
      toast({ title: "Could not load item", description: err.message, variant: "destructive" });
    } finally {
      setSuggestionLoading(false);
    }
  };

  // Adds every part of one list group that is not already on a row: fills
  // blank rows first, then appends. Rows already in use are never replaced.
  // The office then enters each quantity and removes any part not cut.
  const addWholeGroup = async (items: SuggestedComponent[]) => {
    const missing = items.filter((s) => !chosenOutputIds.has(s.item_id));
    if (missing.length === 0) return;
    setSuggestionLoading(true);
    try {
      const loaded = await Promise.all(missing.map((s) => fetchItem(s.item_id)));
      setOutputs((prev) => {
        const next = [...prev];
        for (const item of loaded) {
          if (next.some((o) => o.item?.id === item.id)) continue;
          const blankIdx = next.findIndex(isBlankOutputRow);
          if (blankIdx === -1) next.push({ ...newOutputRow(), item });
          else next[blankIdx] = { ...next[blankIdx], item, itemSearch: "", altQty: "", mode: "list" };
        }
        return next;
      });
    } catch (err: any) {
      toast({ title: "Could not load items", description: err.message, variant: "destructive" });
    } finally {
      setSuggestionLoading(false);
    }
  };

  // Generated once per submit ATTEMPT, not per click — reused across a
  // retry-after-error so a duplicate network send resolves idempotently.
  // Only rotated after a successful post, when the form resets for a new
  // conversion (see onSuccess below).
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });
  const tolerancePct = companySettings?.conversion_factor_tolerance_pct ?? 15;

  const updateRow = (key: string, patch: Partial<InputRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const removeRow = (key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };
  const addRow = () => setRows((prev) => [...prev, newInputRow()]);

  const resetForm = () => {
    setRows([newInputRow()]);
    setOutputs([newOutputRow()]);
    setNotes("");
    idempotencyKeyRef.current = crypto.randomUUID();
  };

  const postMutation = useMutation({
    mutationFn: async () => {
      const inputs: RmConversionInputPayload[] = [];
      for (const r of rows) {
        if (!r.item) continue; // skip fully-empty rows silently
        const qty = Number(r.qty);
        if (!(qty > 0)) throw new Error(`Enter a positive quantity for ${r.item.item_code}.`);
        if (r.source === "grn_direct" && !r.grnLine) {
          throw new Error(`Pick a GRN line for ${r.item.item_code} (source is GRN-direct).`);
        }
        const altQty = r.altQty.trim() !== "" ? Number(r.altQty) : null;
        const scrap = Number(r.scrapQty || 0);
        if (!(scrap >= 0)) {
          throw new Error(`${r.item.item_code}: scrap quantity cannot be negative.`);
        }
        if (scrap > qty) {
          throw new Error(`${r.item.item_code}: scrap cannot exceed the quantity used.`);
        }
        inputs.push({
          item_id: r.item.id,
          source: r.source,
          grn_line_item_id: r.source === "grn_direct" ? r.grnLine!.grn_line_item_id : null,
          allocation_id: null,
          entered_qty: qty,
          entered_unit: r.item.unit,
          qty_base: qty,
          qty_alt: altQty,
          alt_unit: altQty != null ? (r.item.alt_unit ?? null) : null,
          scrap_qty_base: scrap,
          notes: r.notes.trim() || null,
        });
      }
      if (inputs.length === 0) throw new Error("Add at least one input line.");

      // Pre-flight checks only — the RPC is the real gate and re-checks all
      // of this (positive qty, unit, no item twice). A row with something
      // typed but no item picked is an error, never silently dropped: a
      // quantity the office entered must not vanish from the posting.
      const outputLines: RmConversionOutputPayload[] = [];
      const summary: string[] = [];
      const seenOutputItems = new Set<string>();
      outputs.forEach((o, idx) => {
        if (isBlankOutputRow(o)) return;
        if (!o.item) throw new Error(`Output line ${idx + 1}: pick an item from the list.`);
        const qty = Number(o.qty);
        if (!(qty > 0)) throw new Error(`Enter a positive quantity for output ${o.item.item_code}.`);
        if (seenOutputItems.has(o.item.id)) {
          throw new Error(`Output ${o.item.item_code} is listed more than once — combine it into one line.`);
        }
        seenOutputItems.add(o.item.id);
        const altQty = o.altQty.trim() !== "" ? Number(o.altQty) : null;
        if (altQty != null && !(altQty > 0)) {
          throw new Error(`Output ${o.item.item_code}: alt qty must be positive, or left blank.`);
        }
        outputLines.push({
          item_id: o.item.id,
          qty_base: qty,
          unit: o.item.unit,
          qty_alt: altQty,
          alt_unit: altQty != null ? (o.item.alt_unit ?? null) : null,
        });
        summary.push(`${o.item.item_code} × ${formatNumber(qty)}`);
      });
      if (outputLines.length === 0) throw new Error("Add at least one output line.");

      const result = await postRmConversion(
        {
          awo_id: null,
          outputs: outputLines,
          notes: notes.trim() || null,
          inputs,
        },
        idempotencyKeyRef.current
      );
      return { result, summary };
    },
    onSuccess: ({ summary }) => {
      const shown = summary.slice(0, 3).join(", ");
      const more = summary.length > 3 ? ` +${summary.length - 3} more` : "";
      toast({
        title: "RM conversion posted",
        description: `${summary.length} output ${summary.length === 1 ? "line" : "lines"}: ${shown}${more}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["rm-conversions"] });
      resetForm();
      navigate("/rm-conversions");
    },
    onError: (err: Error) => {
      // Surface the RPC's exception message verbatim (tolerance breach, unit
      // mismatch, insufficient stock, GRN-line unit mismatch, etc.) — never
      // reword, never a generic "something went wrong". Idempotency key is
      // deliberately NOT rotated here, so a retry click reuses the same key.
      toast({ title: "Could not post conversion", description: err.message, variant: "destructive" });
    },
  });

  const rowWarnings = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!r.item) continue;
      const w = toleranceWarning(r.item, Number(r.qty), Number(r.altQty), tolerancePct);
      if (w) map.set(r.key, w);
    }
    return map;
  }, [rows, tolerancePct]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <button
        onClick={() => navigate("/rm-conversions")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" /> Back to RM Conversions
      </button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">New RM Conversion</h1>
        <p className="text-sm text-slate-500 mt-1">
          Consume raw material inputs (from store or drawn directly off an un-stored GRN line) and
          produce one or more output items — add a line for each item that came out.
        </p>
      </div>

      {/* ── Inputs ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Inputs</h2>
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Input
          </Button>
        </div>

        <div className="space-y-3">
          {rows.map((row) => {
            const warning = rowWarnings.get(row.key);
            return (
              <div key={row.key} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">Item</Label>
                    <ItemSuggest
                      value={row.item ? `${row.item.item_code} — ${row.item.description}` : row.itemSearch}
                      onChange={(v) => updateRow(row.key, { itemSearch: v, item: null })}
                      onSelect={(item) =>
                        updateRow(row.key, {
                          item,
                          itemSearch: "",
                          source: "store",
                          grnLine: null,
                          altQty: "",
                          showSourceToggle: false,
                        })
                      }
                      placeholder="Search raw material..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length <= 1}
                    className="mt-6 h-8 w-8 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    title="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {row.item && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 items-end">
                      <div>
                        <Label className="text-xs">Source</Label>
                        {row.showSourceToggle ? (
                          <div className="flex gap-1.5 mt-1">
                            <button
                              type="button"
                              onClick={() => updateRow(row.key, { source: "store", grnLine: null })}
                              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                                row.source === "store"
                                  ? "bg-slate-900 text-white border-slate-900"
                                  : "border-slate-200 hover:border-slate-400"
                              }`}
                            >
                              Store
                            </button>
                            <button
                              type="button"
                              onClick={() => updateRow(row.key, { source: "grn_direct" })}
                              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                                row.source === "grn_direct"
                                  ? "bg-slate-900 text-white border-slate-900"
                                  : "border-slate-200 hover:border-slate-400"
                              }`}
                            >
                              GRN-direct
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1.5">
                            <button
                              type="button"
                              onClick={() => updateRow(row.key, { showSourceToggle: true })}
                              className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-900"
                            >
                              Material never entered the store?
                            </button>
                          </div>
                        )}
                      </div>

                      {row.source === "store" ? (
                        <div>
                          <Label className="text-xs">Qty used ({row.item.unit})</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.qty}
                            onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                          />
                          {Number(row.qty) > (row.item.stock_free ?? 0) && (
                            <p className="text-[11px] text-amber-600 mt-0.5">
                              Only {formatNumber(row.item.stock_free ?? 0)} in store.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="col-span-2">
                          <Label className="text-xs">GRN Line</Label>
                          {row.grnLine ? (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-mono bg-slate-100 rounded px-2 py-1">
                                {row.grnLine.grn_number} · {formatNumber(Number(row.qty))} {row.item.unit}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => updateRow(row.key, { pickerOpen: true })}
                              >
                                Change
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-1"
                              onClick={() => updateRow(row.key, { pickerOpen: true })}
                            >
                              Pick GRN Line
                            </Button>
                          )}
                        </div>
                      )}

                      {row.item.alt_unit && (
                        <div>
                          <Label className="text-xs text-indigo-600 dark:text-indigo-400">
                            Alt Qty ({row.item.alt_unit})
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.altQty}
                            onChange={(e) => updateRow(row.key, { altQty: e.target.value })}
                            className="border-indigo-200 focus-visible:ring-indigo-400"
                          />
                        </div>
                      )}

                      <div>
                        <Label className="text-xs">Of which scrap / offcut ({row.item.unit})</Label>
                        <Input
                          type="number"
                          min={0}
                          value={row.scrapQty}
                          onChange={(e) => updateRow(row.key, { scrapQty: e.target.value })}
                        />
                      </div>
                    </div>

                    {warning && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{warning}</span>
                      </div>
                    )}

                    <GrnDrawPicker
                      open={row.pickerOpen}
                      onOpenChange={(open) => updateRow(row.key, { pickerOpen: open })}
                      itemId={row.item.id}
                      itemLabel={row.item.description}
                      itemUnit={row.item.unit}
                      onConfirm={(line, qty) =>
                        updateRow(row.key, {
                          grnLine: line,
                          qty: String(qty),
                          source: "grn_direct",
                        })
                      }
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Outputs ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Outputs</h2>
          <Button variant="outline" size="sm" onClick={addOutput} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Output
          </Button>
        </div>

        {suggestionGroups.length > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">
              Cutting list for {firstInputItem?.item_code} — pick each part from the dropdown, or add a whole set
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestionGroups.map((g) => {
                const left = g.items.filter((s) => !chosenOutputIds.has(s.item_id)).length;
                return (
                  <button
                    key={g.label}
                    type="button"
                    disabled={suggestionLoading || left === 0}
                    onClick={() => addWholeGroup(g.items)}
                    className="inline-flex items-center gap-1 text-xs bg-white border border-blue-200 rounded px-2 py-1 hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    All {g.label} ({g.items.length})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {outputs.map((o, idx) => {
            const isDuplicate = !!o.item && duplicateOutputItemIds.has(o.item.id);
            return (
              <div
                key={o.key}
                ref={(el) => {
                  if (el) outputRowRefs.current.set(o.key, el);
                  else outputRowRefs.current.delete(o.key);
                }}
                className="rounded-lg border border-slate-200 p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">Output {idx + 1} — Item</Label>
                    {o.mode === "list" && suggestionGroups.length > 0 && (!o.item || suggestionIds.has(o.item.id)) ? (
                      // Native select: opens the phone's own picker on mobile.
                      <select
                        aria-label={`Output ${idx + 1} item`}
                        value={o.item?.id ?? ""}
                        disabled={suggestionLoading}
                        onChange={(e) => pickFromList(o.key, e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        <option value="">Select part from {firstInputItem?.item_code} list…</option>
                        {suggestionGroups.map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.items.map((s) => (
                              <option
                                key={s.item_id}
                                value={s.item_id}
                                disabled={chosenOutputIds.has(s.item_id) && o.item?.id !== s.item_id}
                              >
                                {s.item_code} — {s.description}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        <optgroup label="Not on the list">
                          <option value={SEARCH_OTHER}>Other item — search all items…</option>
                        </optgroup>
                      </select>
                    ) : (
                      <>
                        <ItemSuggest
                          value={o.item ? `${o.item.item_code} — ${o.item.description}` : o.itemSearch}
                          onChange={(v) => updateOutput(o.key, { itemSearch: v, item: null })}
                          onSelect={(item) => updateOutput(o.key, { item, itemSearch: "", altQty: "" })}
                          placeholder="Search drawing no. or description..."
                        />
                        {suggestionGroups.length > 0 && (
                          <button
                            type="button"
                            onClick={() => updateOutput(o.key, { mode: "list", item: null, itemSearch: "", altQty: "" })}
                            className="mt-1 text-xs text-blue-700 hover:underline"
                          >
                            Back to the {firstInputItem?.item_code} list
                          </button>
                        )}
                      </>
                    )}
                    {o.item && (
                      // Several parts share a drawing no. and differ only by the
                      // length in the description, and a phone-width box cuts the
                      // description off — so spell it out, with the store qty, to
                      // confirm the right item was picked.
                      <div className="mt-1 text-xs text-slate-500">
                        <p className="md:hidden break-words">{o.item.description}</p>
                        <p>
                          In store now: {formatNumber(o.item.stock_free ?? 0)} {o.item.unit}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOutput(o.key)}
                    disabled={outputs.length <= 1}
                    className="mt-6 h-8 w-8 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    title="Remove output"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {o.item && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 items-end">
                    <div>
                      <Label className="text-xs">Qty produced ({o.item.unit})</Label>
                      <Input
                        type="number"
                        min={0}
                        value={o.qty}
                        onChange={(e) => updateOutput(o.key, { qty: e.target.value })}
                      />
                    </div>
                    {o.item.alt_unit && (
                      <div>
                        <Label className="text-xs text-indigo-600 dark:text-indigo-400">
                          Alt Qty ({o.item.alt_unit})
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={o.altQty}
                          onChange={(e) => updateOutput(o.key, { altQty: e.target.value })}
                          className="border-indigo-200 focus-visible:ring-indigo-400"
                        />
                      </div>
                    )}
                  </div>
                )}

                {isDuplicate && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>This item is on more than one output line — combine it into one line.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => postMutation.mutate()}
          disabled={postMutation.isPending}
        >
          {postMutation.isPending ? "Posting…" : "Post Conversion"}
        </Button>
      </div>
    </div>
  );
}
