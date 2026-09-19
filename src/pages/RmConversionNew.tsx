import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemSuggest } from "@/components/ItemSuggest";
import { GrnDrawPicker } from "@/components/GrnDrawPicker";
import { useToast } from "@/hooks/use-toast";
import { type Item } from "@/lib/items-api";
import { type GrnLineAvailableForConversion } from "@/lib/production-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { formatNumber } from "@/lib/gst-utils";
import {
  postRmConversion,
  type RmConversionInputPayload,
} from "@/lib/rm-conversions-api";

interface InputRow {
  key: string;
  item: Item | null;
  itemSearch: string;
  source: "store" | "grn_direct";
  grnLine: GrnLineAvailableForConversion | null;
  qty: string; // primary qty, in the item's own base unit
  altQty: string;
  scrapQty: string;
  returnQty: string;
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
    returnQty: "0",
    notes: "",
    pickerOpen: false,
    showSourceToggle: false,
  };
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

  const [rows, setRows] = useState<InputRow[]>([newInputRow()]);
  const [outputItem, setOutputItem] = useState<Item | null>(null);
  const [outputSearch, setOutputSearch] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [outputAltQty, setOutputAltQty] = useState("");
  const [notes, setNotes] = useState("");

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
    setOutputItem(null);
    setOutputSearch("");
    setOutputQty("");
    setOutputAltQty("");
    setNotes("");
    idempotencyKeyRef.current = crypto.randomUUID();
  };

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!outputItem) throw new Error("Select an output item.");
      const outQty = Number(outputQty);
      if (!(outQty > 0)) throw new Error("Output quantity must be positive.");

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
        const ret = Number(r.returnQty || 0);
        if (scrap + ret > qty) {
          throw new Error(`${r.item.item_code}: scrap + return cannot exceed the drawn quantity.`);
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
          return_qty_base: ret,
          notes: r.notes.trim() || null,
        });
      }
      if (inputs.length === 0) throw new Error("Add at least one input line.");

      const outAltQty = outputAltQty.trim() !== "" ? Number(outputAltQty) : null;

      return postRmConversion(
        {
          awo_id: null,
          output_item_id: outputItem.id,
          output_qty_base: outQty,
          output_unit: outputItem.unit,
          output_qty_alt: outAltQty,
          output_alt_unit: outAltQty != null ? (outputItem.alt_unit ?? null) : null,
          notes: notes.trim() || null,
          inputs,
        },
        idempotencyKeyRef.current
      );
    },
    onSuccess: (result) => {
      toast({
        title: "RM conversion posted",
        description: `${result.output_item_code}: ${formatNumber(result.output_qty_base)} produced.`,
      });
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
          produce one output item.
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
                        <Label className="text-xs">Scrap Qty</Label>
                        <Input
                          type="number"
                          min={0}
                          value={row.scrapQty}
                          onChange={(e) => updateRow(row.key, { scrapQty: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Return Qty</Label>
                        <Input
                          type="number"
                          min={0}
                          value={row.returnQty}
                          onChange={(e) => updateRow(row.key, { returnQty: e.target.value })}
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

      {/* ── Output ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Output</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Item</Label>
            <ItemSuggest
              value={outputItem ? `${outputItem.item_code} — ${outputItem.description}` : outputSearch}
              onChange={(v) => { setOutputSearch(v); setOutputItem(null); }}
              onSelect={(item) => { setOutputItem(item); setOutputSearch(""); setOutputAltQty(""); }}
              placeholder="Search output item..."
            />
          </div>
          <div>
            <Label className="text-xs">Qty produced {outputItem ? `(${outputItem.unit})` : ""}</Label>
            <Input
              type="number"
              min={0}
              value={outputQty}
              onChange={(e) => setOutputQty(e.target.value)}
              disabled={!outputItem}
            />
          </div>
          {outputItem?.alt_unit && (
            <div>
              <Label className="text-xs text-indigo-600 dark:text-indigo-400">
                Alt Qty ({outputItem.alt_unit})
              </Label>
              <Input
                type="number"
                min={0}
                value={outputAltQty}
                onChange={(e) => setOutputAltQty(e.target.value)}
                className="border-indigo-200 focus-visible:ring-indigo-400"
              />
            </div>
          )}
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
