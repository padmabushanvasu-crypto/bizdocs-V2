import { supabase } from "@/integrations/supabase/client";

// One allowed item for a DC-linked GRN line: either the DC's own issued item
// (isOriginal) or an approved conversion target. `label` is the human-readable
// disambiguator (several conversion items share near-identical item_codes).
export interface GrnConversionOption {
  item_id: string;
  item_code: string | null;
  description: string | null;
  unit: string | null;
  label: string;
  isOriginal: boolean;
}

// Prefer item_conversions.label; fall back to composing from posn/has_vac/is_sgb
// (e.g. "9POS, with VAC, SGB only") when the pre-built label is missing.
export function composeConversionLabel(row: {
  label?: string | null;
  posn?: number | null;
  has_vac?: boolean | null;
  is_sgb?: boolean | null;
}): string {
  if (row.label && row.label.trim()) return row.label.trim();
  const parts: string[] = [];
  if (row.posn != null) parts.push(`${row.posn}POS`);
  if (row.has_vac === true) parts.push("with VAC");
  else if (row.has_vac === false) parts.push("no VAC");
  if (row.is_sgb) parts.push("SGB only");
  return parts.length ? parts.join(", ") : "Conversion";
}

// For each DC-linked GRN line, the set of item_ids the guard trigger
// (guard_grn_dc_item_conversion) will accept: the DC line's own item, plus any
// active (date-valid) item_conversions.to_item_id where from_item_id = that item.
// Keyed by dc_line_item_id. company-scoped in-app (item_conversions has no RLS).
// Non-DC (PO-GRN) lines get no entry — they carry no dc_line_item_id.
export async function fetchGrnConversionOptions(
  companyId: string | null | undefined,
  grn: { line_items?: Array<any> } | null | undefined,
): Promise<Record<string, GrnConversionOption[]>> {
  const lines = (grn?.line_items ?? []).filter((l: any) => l.dc_line_item_id);
  if (!companyId || lines.length === 0) return {};

  const dcLineItemIds = [...new Set(lines.map((l: any) => l.dc_line_item_id))] as string[];

  // 1) DC lines → their original item_id (the guard's "DC-issued item").
  const { data: dcLines, error: dcErr } = await (supabase as any)
    .from("dc_line_items")
    .select("id, item_id")
    .in("id", dcLineItemIds);
  if (dcErr) throw dcErr;
  const fromItemByDcLine = new Map<string, string>(
    ((dcLines ?? []) as any[]).filter((d) => d.item_id).map((d) => [d.id, d.item_id]),
  );
  const fromItemIds = [...new Set([...fromItemByDcLine.values()])];
  if (fromItemIds.length === 0) return {};

  // 2) Active conversions from those items (date validity filtered in JS).
  const today = new Date().toISOString().slice(0, 10);
  const { data: convs, error: convErr } = await (supabase as any)
    .from("item_conversions")
    .select("from_item_id, to_item_id, label, posn, has_vac, is_sgb, valid_from, valid_until")
    .eq("company_id", companyId)
    .in("from_item_id", fromItemIds);
  if (convErr) throw convErr;
  const validConvs = ((convs ?? []) as any[]).filter(
    (c) =>
      (c.valid_from == null || today >= c.valid_from) &&
      (c.valid_until == null || today <= c.valid_until),
  );

  // 3) Item display for every item that can appear in a picker.
  const allItemIds = [...new Set([...fromItemIds, ...validConvs.map((c) => c.to_item_id)])];
  const { data: items, error: itErr } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, unit")
    .in("id", allItemIds);
  if (itErr) throw itErr;
  const itemById = new Map<string, any>(((items ?? []) as any[]).map((it) => [it.id, it]));

  const convsByFrom = new Map<string, any[]>();
  for (const c of validConvs) {
    const arr = convsByFrom.get(c.from_item_id) ?? [];
    arr.push(c);
    convsByFrom.set(c.from_item_id, arr);
  }

  // 4) Per-dc-line option lists: own item first, then valid conversions.
  const result: Record<string, GrnConversionOption[]> = {};
  for (const dcLineId of dcLineItemIds) {
    const fromItemId = fromItemByDcLine.get(dcLineId);
    if (!fromItemId) continue;
    const own = itemById.get(fromItemId);
    const options: GrnConversionOption[] = [
      {
        item_id: fromItemId,
        item_code: own?.item_code ?? null,
        description: own?.description ?? null,
        unit: own?.unit ?? null,
        label: own?.description || own?.item_code || "As issued",
        isOriginal: true,
      },
    ];
    for (const c of convsByFrom.get(fromItemId) ?? []) {
      const to = itemById.get(c.to_item_id);
      options.push({
        item_id: c.to_item_id,
        item_code: to?.item_code ?? null,
        description: to?.description ?? null,
        unit: to?.unit ?? null,
        label: composeConversionLabel(c),
        isOriginal: false,
      });
    }
    result[dcLineId] = options;
  }
  return result;
}
