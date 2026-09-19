import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { formatNumber } from "@/lib/gst-utils";
import {
  fetchGrnLinesAvailableForConversion,
  type GrnLineAvailableForConversion,
} from "@/lib/production-api";

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
  onConfirm: (line: GrnLineAvailableForConversion, qty: number) => void;
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

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setQty(0);
    }
  }, [open]);

  const { data: eligibleLines = [], isLoading } = useQuery({
    queryKey: ["grn-lines-for-conversion", itemId],
    queryFn: () => fetchGrnLinesAvailableForConversion(itemId!),
    enabled: open && !!itemId,
  });

  const selectedLine = eligibleLines.find((g) => g.grn_line_item_id === selectedId);
  const unitMismatch =
    !!selectedLine && !!itemUnit && normalizeUnit(selectedLine.unit) !== normalizeUnit(itemUnit);

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
            <Label>Quantity to draw</Label>
            <Input
              type="number"
              min={0}
              max={selectedLine.available_qty}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
            {qty > selectedLine.available_qty && (
              <p className="text-xs text-red-600">
                Only {formatNumber(selectedLine.available_qty)} available on this GRN line.
              </p>
            )}
          </div>
        )}

        {unitMismatch && (
          <p className="text-xs text-red-600">
            This GRN line is in {selectedLine!.unit} but the item is mastered in {itemUnit}. Fix the
            unit on the item master, then try again.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!selectedLine) return;
              onConfirm(selectedLine, qty);
              onOpenChange(false);
            }}
            disabled={
              !selectedLine ||
              !(qty > 0) ||
              qty > (selectedLine?.available_qty ?? 0) ||
              unitMismatch
            }
          >
            Use This Line
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
