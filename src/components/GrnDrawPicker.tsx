import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber } from "@/lib/gst-utils";
import { UNITS } from "@/lib/constants";
import {
  fetchGrnLinesAvailableForConversion,
  type GrnLineAvailableForConversion,
} from "@/lib/production-api";
import {
  reconcileGrnUnitToStore,
  type ReconcileGrnUnitResult,
} from "@/lib/rm-conversions-api";

const normalizeUnit = (u: string | null | undefined) => (u ?? "").trim().toUpperCase();

// Same picker UX/query as AssemblyWorkOrderDetail.tsx's "Draw from GRN"
// dialog (v_grn_lines_available_for_conversion, item-scoped — no AWO
// context required), factored out as a standalone component so RM
// Conversion can reuse it without an immediate allocation call: this
// component only resolves (grn line, qty) and hands it back via
// onConfirm — the caller decides what to do with it.

interface GrnDrawPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string | null;
  itemLabel?: string | null;
  itemUnit?: string | null;
  // reconciled is set only when the GRN line's unit didn't match the item's
  // base unit and the user explicitly reconciled it first -- qty is then
  // already in the item's base unit (qty_base from the RPC), and the caller
  // must post this input with source: 'store', never 'grn_direct'.
  onConfirm: (
    line: GrnLineAvailableForConversion,
    qty: number,
    reconciled?: { fromUnit: string; conversionFactor: number }
  ) => void;
}

export function GrnDrawPicker({
  open,
  onOpenChange,
  itemId,
  itemLabel,
  itemUnit,
  onConfirm,
}: GrnDrawPickerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(0);

  // Unit reconciliation state -- only relevant while needsReconciliation is true.
  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [conversionFactor, setConversionFactor] = useState<string>("");
  const [reconcileNotes, setReconcileNotes] = useState<string>("");
  const [reconcileResult, setReconcileResult] = useState<ReconcileGrnUnitResult | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setQty(0);
      setSelectedUnit("");
      setConversionFactor("");
      setReconcileNotes("");
      setReconcileResult(null);
    }
  }, [open]);

  const { data: eligibleLines = [], isLoading } = useQuery({
    queryKey: ["grn-lines-for-conversion", itemId],
    queryFn: () => fetchGrnLinesAvailableForConversion(itemId!),
    enabled: open && !!itemId,
  });

  const selectedLine = eligibleLines.find((g) => g.grn_line_item_id === selectedId);
  const needsReconciliation =
    !!selectedLine && !!itemUnit && normalizeUnit(selectedLine.unit) !== normalizeUnit(itemUnit);

  // Reset reconciliation state whenever the picked line changes, and default
  // the unit dropdown to the GRN line's own recorded unit (that's the unit
  // "Quantity to draw" above is actually measured in and validated against).
  useEffect(() => {
    setSelectedUnit(selectedLine?.unit || itemUnit || "");
    setConversionFactor("");
    setReconcileNotes("");
    setReconcileResult(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const factorNum = Number(conversionFactor);
  const canReconcile =
    needsReconciliation &&
    !reconcileResult &&
    qty > 0 &&
    selectedUnit.trim() !== "" &&
    conversionFactor.trim() !== "" &&
    factorNum > 0 &&
    reconcileNotes.trim() !== "";

  const reconcileMutation = useMutation({
    mutationFn: () =>
      reconcileGrnUnitToStore({
        grnLineItemId: selectedLine!.grn_line_item_id,
        itemId: itemId!,
        enteredQty: qty,
        fromUnit: selectedUnit,
        conversionFactor: factorNum,
        notes: reconcileNotes.trim(),
      }),
    onSuccess: (result) => setReconcileResult(result),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draw from GRN</DialogTitle>
          <DialogDescription>
            For material received on a GRN that never physically entered the store (Final GRN left
            unticked). Pick the GRN line it came in on.
          </DialogDescription>
        </DialogHeader>
        {itemLabel && (
          <p className="text-sm text-muted-foreground">
            For <b className="text-foreground">{itemLabel}</b>
            {itemUnit ? ` (${itemUnit})` : ""}
          </p>
        )}
        <div className="max-h-[40vh] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left"></th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">GRN Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">PO Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Available</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">Loading eligible GRN lines…</td>
                </tr>
              ) : eligibleLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                    No GRN lines available for this item — nothing was received off-book, or it's all
                    already in the store or converted.
                  </td>
                </tr>
              ) : (
                eligibleLines.map((g) => (
                  <tr
                    key={g.grn_line_item_id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => { setSelectedId(g.grn_line_item_id); setQty(g.available_qty); }}
                  >
                    <td className="px-3 py-2 border-b border-slate-100 text-center">
                      <input
                        type="radio"
                        checked={selectedId === g.grn_line_item_id}
                        onChange={() => { setSelectedId(g.grn_line_item_id); setQty(g.available_qty); }}
                      />
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{g.grn_number}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{g.po_number ?? "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{g.description ?? "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatNumber(g.available_qty)} {g.unit}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {selectedLine && (
          <div className="space-y-1 max-w-xs">
            <Label>Quantity to draw ({selectedLine.unit ?? itemUnit ?? "NOS"})</Label>
            <Input
              type="number"
              min={0}
              max={selectedLine.available_qty}
              value={qty}
              onChange={(e) => { setQty(Number(e.target.value)); setReconcileResult(null); }}
            />
            {qty > selectedLine.available_qty && (
              <p className="text-xs text-red-600">
                Only {formatNumber(selectedLine.available_qty)} available on this GRN line.
              </p>
            )}
          </div>
        )}

        {needsReconciliation && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                This GRN line is recorded in <b>{selectedLine!.unit}</b>, but {itemLabel ?? "this item"} is
                tracked in <b>{itemUnit}</b> — draws are blocked until reconciled. Confirm the unit the
                quantity above is in, then supply the conversion factor to credit stock in {itemUnit}.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Select
                  value={selectedUnit}
                  onValueChange={(v) => { setSelectedUnit(v); setReconcileResult(null); }}
                  disabled={!!reconcileResult}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select unit…" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Conversion factor (1 {selectedUnit || "unit"} = X {itemUnit})
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.000001"
                  value={conversionFactor}
                  onChange={(e) => { setConversionFactor(e.target.value); setReconcileResult(null); }}
                  disabled={!!reconcileResult}
                  placeholder="e.g. 4.1"
                />
              </div>
            </div>

            {factorNum > 0 && qty > 0 && !reconcileResult && (
              <p className="text-xs text-amber-700">
                = {formatNumber(qty * factorNum)} {itemUnit} will be credited to stock_free.
              </p>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Reason / reference (required)</Label>
              <Input
                value={reconcileNotes}
                onChange={(e) => { setReconcileNotes(e.target.value); setReconcileResult(null); }}
                disabled={!!reconcileResult}
                placeholder="e.g. GRN recorded in KGS, item tracked in NOS — 1 KG yields 4.1 NOS"
                className="h-8 text-sm"
              />
            </div>

            {reconcileMutation.isError && (
              <p className="text-xs text-red-600">{(reconcileMutation.error as Error).message}</p>
            )}

            {reconcileResult ? (
              <div className="flex items-start gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Reconciled {formatNumber(qty)} {selectedUnit} → {formatNumber(reconcileResult.qty_base)}{" "}
                  {itemUnit}, credited to stock.
                </span>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => reconcileMutation.mutate()}
                disabled={!canReconcile || reconcileMutation.isPending}
              >
                {reconcileMutation.isPending ? "Reconciling…" : "Reconcile & Credit Store"}
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!selectedLine) return;
              if (needsReconciliation) {
                if (!reconcileResult) return;
                onConfirm(selectedLine, reconcileResult.qty_base, {
                  fromUnit: selectedUnit,
                  conversionFactor: factorNum,
                });
              } else {
                onConfirm(selectedLine, qty);
              }
              onOpenChange(false);
            }}
            disabled={
              !selectedLine ||
              !(qty > 0) ||
              qty > (selectedLine?.available_qty ?? 0) ||
              (needsReconciliation && !reconcileResult)
            }
          >
            {needsReconciliation ? "Use Reconciled Quantity" : "Use This Line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
