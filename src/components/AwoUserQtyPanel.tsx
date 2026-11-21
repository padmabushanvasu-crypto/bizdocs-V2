import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/gst-utils";
import { setAwoUserQty, type AssemblyWorkOrder } from "@/lib/production-api";
import { useBomUserQtyLines } from "@/components/UserQtyFields";

/**
 * "Change bottle qty" on a draft / pending-materials work order, for BOM lines with
 * no fixed quantity (qty_group). All rules live in rpc_set_awo_user_qty:
 *  - raising is always allowed; lowering below what is already issued is blocked
 *    until those units are returned;
 *  - the group total must stay more than 0;
 *  - the open material request is updated in step (no stock moves here).
 */
export function AwoUserQtyPanel({ awo }: { awo: AssemblyWorkOrder }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editable = awo.status === "draft" || awo.status === "pending_materials";
  const { data: lines = [] } = useBomUserQtyLines(editable ? awo.item_id : null, awo.bom_variant_id ?? null);

  const current = useMemo(() => {
    const m: Record<string, { required: number; issued: number }> = {};
    for (const l of lines) m[l.item_id] = { required: 0, issued: 0 };
    for (const li of awo.line_items ?? []) {
      if (li.item_id && m[li.item_id]) {
        m[li.item_id] = { required: Number(li.required_qty ?? 0), issued: Number(li.issued_qty ?? 0) - Number(li.returned_qty ?? 0) };
      }
    }
    return m;
  }, [lines, awo.line_items]);

  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const [itemId, c] of Object.entries(current)) init[itemId] = String(c.required);
    setValues(init);
  }, [current]);

  const changes = lines
    .map((l) => ({ line: l, next: Number(values[l.item_id]), prev: current[l.item_id]?.required ?? 0 }))
    .filter((c) => values[c.line.item_id] !== undefined && values[c.line.item_id].trim() !== "" && c.next !== c.prev);
  const invalid = lines.some((l) => {
    const raw = values[l.item_id];
    const n = Number(raw);
    return raw === undefined || raw.trim() === "" || !Number.isFinite(n) || n < 0;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Increases first, then decreases — keeps the group total above 0 mid-way.
      const ordered = [...changes].sort((a, b) => (b.next - b.prev) - (a.next - a.prev));
      for (const c of ordered) await setAwoUserQty(awo.id, c.line.item_id, c.next);
    },
    onSuccess: () => {
      toast({ title: "Quantity updated", description: "Work order and material request updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Could not change quantity", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["awo-detail", awo.id] });
      queryClient.invalidateQueries({ queryKey: ["mirs", awo.id] });
    },
  });

  if (!editable || lines.length === 0) return null;
  const groups = Array.from(new Set(lines.map((l) => l.qty_group)));

  return (
    <div className="no-print rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3 space-y-3">
      {groups.map((group) => (
        <div key={group} className="space-y-2">
          <p className="text-sm font-semibold">{group} — quantity for this work order</p>
          {lines.filter((l) => l.qty_group === group).map((l) => {
            const issued = current[l.item_id]?.issued ?? 0;
            return (
              <div key={l.item_id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{l.item_code}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {l.description}{issued > 0 ? ` · ${formatNumber(issued)} already issued` : ""}
                  </p>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="w-28 text-right"
                  value={values[l.item_id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [l.item_id]: e.target.value }))}
                  disabled={saveMutation.isPending}
                />
                <span className="text-xs text-muted-foreground w-10">{l.unit}</span>
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={invalid || changes.length === 0 || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Change quantity"}
        </Button>
      </div>
    </div>
  );
}
