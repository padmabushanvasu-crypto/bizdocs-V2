import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { fetchDcSourceOptions, setDcLineSources } from "@/lib/delivery-challans-api";

interface DcSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dcLineId: string;
  itemLabel: string;
  lineQty: number;
  unit?: string | null;
}

// rpc_dc_source_options / rpc_set_dc_line_sources only apply to plain
// (non job-card) lines of items with track_source = true, on a DC that
// isn't issued yet — the caller (DcSourceLink) only renders this dialog
// under those conditions.
export function DcSourceDialog({ open, onOpenChange, dcLineId, itemLabel, lineQty, unit }: DcSourceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qtyByGrnLine, setQtyByGrnLine] = useState<Record<string, string>>({});

  const { data: options, isLoading } = useQuery({
    queryKey: ["dc-source-options", dcLineId],
    queryFn: () => fetchDcSourceOptions(dcLineId),
    enabled: open,
  });

  const grnRows = (options ?? []).filter((o) => o.source_type === "grn");

  useEffect(() => {
    if (!open || !options) return;
    const initial: Record<string, string> = {};
    for (const row of grnRows) {
      if (row.chosen_qty > 0) initial[row.grn_line_item_id as string] = String(row.chosen_qty);
    }
    setQtyByGrnLine(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options]);

  const totalGrn = grnRows.reduce(
    (sum, row) => sum + (parseFloat(qtyByGrnLine[row.grn_line_item_id as string] ?? "") || 0),
    0
  );
  const storeRemainder = Math.max(0, lineQty - totalGrn);
  const overLineQty = totalGrn > lineQty + 0.0005;

  const rowErrors = new Map<string, string>();
  for (const row of grnRows) {
    const qty = parseFloat(qtyByGrnLine[row.grn_line_item_id as string] ?? "") || 0;
    if (qty > row.available + 0.0005) {
      rowErrors.set(row.grn_line_item_id as string, `Only ${row.available} available`);
    }
  }
  const hasErrors = overLineQty || rowErrors.size > 0;

  const saveMutation = useMutation({
    mutationFn: () => {
      const sources = grnRows
        .map((row) => ({
          grn_line_item_id: row.grn_line_item_id as string,
          qty: parseFloat(qtyByGrnLine[row.grn_line_item_id as string] ?? "") || 0,
        }))
        .filter((s) => s.qty > 0);
      return setDcLineSources(dcLineId, sources);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dc-source-options", dcLineId] });
      toast({ title: "Source updated" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Could not set source", description: e.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: () => setDcLineSources(dcLineId, []),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dc-source-options", dcLineId] });
      toast({ title: "Reset to automatic" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Could not reset source", description: e.message, variant: "destructive" }),
  });

  const busy = saveMutation.isPending || resetMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose source</DialogTitle>
          <DialogDescription>
            {itemLabel} — {lineQty} {unit ?? ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : grnRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No GRN stock currently held for this item — everything comes from Store.
          </p>
        ) : (
          <div className="space-y-2 py-2">
            {grnRows.map((row) => (
              <div key={row.grn_line_item_id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.grn_number}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {row.vendor_name ?? "—"}
                    {row.grn_date ? ` · ${format(new Date(row.grn_date), "dd MMM yyyy")}` : ""} · {row.available} available
                  </p>
                  {rowErrors.get(row.grn_line_item_id as string) && (
                    <p className="text-xs text-red-600">{rowErrors.get(row.grn_line_item_id as string)}</p>
                  )}
                </div>
                <Input
                  type="number"
                  min={0}
                  max={row.available}
                  className="w-24 shrink-0"
                  value={qtyByGrnLine[row.grn_line_item_id as string] ?? ""}
                  onChange={(e) =>
                    setQtyByGrnLine((prev) => ({ ...prev, [row.grn_line_item_id as string]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2 mt-1 border-t">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Store (remainder)</p>
              </div>
              <p className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{storeRemainder}</p>
            </div>
            {overLineQty && (
              <p className="text-xs text-red-600">
                Total ({totalGrn}) is more than the line quantity ({lineQty}).
              </p>
            )}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => resetMutation.mutate()} disabled={busy}>
            Reset to automatic
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={busy || hasErrors}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
