import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchBomUserQtyLines, type BomUserQtyLine } from "@/lib/production-api";

/**
 * Raise-WO fields for BOM lines with no fixed quantity (qty_group set), e.g. the
 * vacuum bottles on VAC. TECH. FRONT PLATE ASSY. (Import vs CG Power).
 *
 * The user types the TOTAL qty for the work order for every line in the group.
 * No defaults: every box must be filled (0 allowed) and each group's total must
 * be more than 0. The DB enforces the same rules in rpc_create_awo.
 */

export type UserQtyValues = Record<string, string>; // item_id -> raw input

export function useBomUserQtyLines(itemId: string | null | undefined, bomVariantId?: string | null) {
  return useQuery({
    queryKey: ["bom-user-qty-lines", itemId, bomVariantId || null],
    queryFn: () => fetchBomUserQtyLines(itemId!, bomVariantId || null),
    enabled: !!itemId,
  });
}

function parseQty(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Returns an error message, or null when the entered quantities are complete and valid. */
export function userQtyError(lines: BomUserQtyLine[], values: UserQtyValues): string | null {
  for (const l of lines) {
    if (parseQty(values[l.item_id]) === null) return `Enter the quantity for ${l.item_code} (0 if not used)`;
  }
  const totals = new Map<string, number>();
  for (const l of lines) totals.set(l.qty_group, (totals.get(l.qty_group) ?? 0) + (parseQty(values[l.item_id]) ?? 0));
  for (const [group, total] of totals) {
    if (total <= 0) return `${group} — total quantity must be more than 0`;
  }
  return null;
}

export function toUserQtys(lines: BomUserQtyLine[], values: UserQtyValues): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) out[l.item_id] = parseQty(values[l.item_id]) ?? 0;
  return out;
}

export function UserQtyFields({
  lines,
  values,
  onChange,
}: {
  lines: BomUserQtyLine[];
  values: UserQtyValues;
  onChange: (next: UserQtyValues) => void;
}) {
  if (lines.length === 0) return null;
  const groups = Array.from(new Set(lines.map((l) => l.qty_group)));
  const error = userQtyError(lines, values);

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const groupLines = lines.filter((l) => l.qty_group === group);
        const total = groupLines.reduce((s, l) => s + (parseQty(values[l.item_id]) ?? 0), 0);
        return (
          <div key={group} className="rounded-md border border-amber-300 bg-amber-50/60 p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label className="text-sm font-semibold">{group} — enter quantity</Label>
              <span className="text-xs text-muted-foreground">Total for this WO: {total}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Total for the whole work order. Enter 0 for a type you are not using.
            </p>
            {groupLines.map((l) => (
              <div key={l.item_id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{l.item_code}</p>
                  <p className="text-xs text-muted-foreground truncate">{l.description}</p>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="w-28 text-right"
                  placeholder="Qty"
                  value={values[l.item_id] ?? ""}
                  onChange={(e) => onChange({ ...values, [l.item_id]: e.target.value })}
                />
                <span className="text-xs text-muted-foreground w-10">{l.unit}</span>
              </div>
            ))}
          </div>
        );
      })}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
