import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// ── UOM master (shared reference table, not company-scoped) ────────────────────

export interface UomOption {
  code: string;
  name: string;
  category: string;
  decimals: number;
}

export async function fetchUomOptions(): Promise<UomOption[]> {
  const { data, error } = await (supabase as any)
    .from("uom_master")
    .select("code, name, category, decimals")
    .eq("is_active", true)
    .order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []) as UomOption[];
}

// ── Suggested components for a raw material (item_conversion_map) ──────────────
// item_conversion_map has two FKs to items (component_item_id, raw_material_item_id)
// -- queried as two plain steps rather than a PostgREST embed to sidestep that
// relationship ambiguity entirely.

export interface SuggestedComponent {
  item_id: string;
  item_code: string;
  description: string;
  unit: string;
  /** Group heading from the source list, e.g. "11 KV PIPE" on the tank cutting list. */
  group: string | null;
  sl_no: number | null;
}

export async function fetchSuggestedComponents(rawItemId: string): Promise<SuggestedComponent[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data: mapRows, error: mapError } = await (supabase as any)
    .from("item_conversion_map")
    .select("component_item_id, raw_material_size_text, sl_no")
    .eq("company_id", companyId)
    .eq("raw_material_item_id", rawItemId)
    .eq("match_status", "fully_matched")
    .not("component_item_id", "is", null);
  if (mapError) throw mapError;

  const map = (mapRows ?? []) as any[];
  const itemIds = [...new Set(map.map((r) => r.component_item_id as string))];
  if (itemIds.length === 0) return [];

  // Only active items are offered — an inactive item can't be posted to.
  const { data: items, error: itemsError } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, unit")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("id", itemIds);
  if (itemsError) throw itemsError;
  const itemById = new Map(((items ?? []) as any[]).map((i) => [i.id as string, i]));

  // Source-list order: group heading, then the list's own serial no., then
  // code. An item listed under two groups appears once, under the first.
  const ordered = map
    .filter((r) => itemById.has(r.component_item_id))
    .map((r) => {
      const i = itemById.get(r.component_item_id);
      return {
        item_id: i.id as string,
        item_code: (i.item_code ?? "") as string,
        description: (i.description ?? "") as string,
        unit: (i.unit ?? "NOS") as string,
        group: (r.raw_material_size_text ?? "").trim() || null,
        sl_no: r.sl_no != null ? Number(r.sl_no) : null,
      };
    })
    .sort(
      (a, b) =>
        (a.group ?? "").localeCompare(b.group ?? "", undefined, { numeric: true }) ||
        (a.sl_no ?? Number.MAX_SAFE_INTEGER) - (b.sl_no ?? Number.MAX_SAFE_INTEGER) ||
        a.item_code.localeCompare(b.item_code)
    );
  const seen = new Set<string>();
  return ordered.filter((s) => (seen.has(s.item_id) ? false : (seen.add(s.item_id), true)));
}

// ── rpc_post_rm_conversion payload ──────────────────────────────────────────────
// Mirrors the RPC's jsonb payload contract exactly (backend is authoritative;
// this shape is documentation, not a source of truth). quantity_2-style
// optional-pair convention for the alt fields, matching PO/DC line items.

export interface RmConversionInputPayload {
  item_id: string;
  source: "grn_direct" | "store";
  grn_line_item_id?: string | null; // required if source === "grn_direct"
  allocation_id?: string | null;
  entered_qty: number;
  entered_unit: string;
  qty_base: number;
  qty_alt?: number | null;
  alt_unit?: string | null;
  // Offcut/scrap is a part OF qty_base (the whole drawn quantity leaves the
  // store once); the RPC records it as a label on that draw, not a second
  // deduction. There is deliberately no "return" quantity: the RPC rejects
  // one, because the returned part was never put back into stock — enter
  // only what was actually used as the quantity.
  scrap_qty_base: number;
  notes?: string | null;
}

// One produced item. A conversion carries one or more of these — e.g. one
// tube cut into several drawing-number lengths. The RPC rejects the same
// item on two lines, a unit that differs from the item's base unit, and a
// non-positive qty; it shares the raw-material value across lines by qty.
export interface RmConversionOutputPayload {
  item_id: string;
  qty_base: number;
  unit: string;
  qty_alt?: number | null;
  alt_unit?: string | null;
  notes?: string | null;
}

// The RPC still accepts the older single-output fields (output_item_id,
// output_qty_base, ...) for callers that predate `outputs`; this client
// always sends `outputs`.
export interface RmConversionPostPayload {
  awo_id?: string | null;
  outputs: RmConversionOutputPayload[];
  notes?: string | null;
  inputs: RmConversionInputPayload[];
}

// The RPC returns the conversion id plus the FIRST output line only (its
// return shape predates multi-output). Read rm_conversion_outputs for the
// full list — never treat output_item_code/output_qty_base as the whole
// conversion.
export interface RmConversionPostResult {
  rm_conversion_id: string;
  output_item_code: string;
  output_qty_base: number;
  output_unit_cost: number;
}

/**
 * Posts an RM conversion. idempotencyKey must be generated once client-side
 * per submit ATTEMPT (not per click) — reuse the same key on a retry after a
 * network error so a duplicate network send resolves to the same row
 * (rpc_post_rm_conversion returns the existing row for a known
 * idempotency_key instead of posting again); generate a fresh key only when
 * starting a genuinely new conversion.
 */
export async function postRmConversion(
  payload: RmConversionPostPayload,
  idempotencyKey: string
): Promise<RmConversionPostResult> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await (supabase as any).rpc("rpc_post_rm_conversion", {
    p_company_id: companyId,
    p_payload: payload,
    p_posted_by: user.id,
    p_idempotency_key: idempotencyKey,
  });
  // The RPC raises descriptive exceptions (tolerance, unit mismatch,
  // insufficient stock, etc.) — surface verbatim, don't reword.
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as RmConversionPostResult;
}

/** Reverses a posted RM conversion. p_reason is required by the RPC itself
 * (empty/whitespace rejected) — validate client-side too so the error
 * surfaces before a round trip. Reverses every output line and every input
 * together; blocks, reversing nothing, if ANY output item's stock_free has
 * already dropped below its produced quantity (partially issued/dispatched).
 */
export async function reverseRmConversion(rmConversionId: string, reason: string): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to reverse an RM conversion.");
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await (supabase as any).rpc("rpc_reverse_rm_conversion", {
    p_company_id: companyId,
    p_rm_conversion_id: rmConversionId,
    p_reason: trimmed,
    p_reversed_by: user.id,
  });
  if (error) throw new Error(error.message);
}

// ── Register (list + expandable detail) ─────────────────────────────────────────

export interface RmConversionOutputRow {
  line_no: number;
  item_id: string;
  item_code: string | null;
  description: string | null;
  unit: string;
  qty_base: number;
  alt_unit: string | null;
  qty_alt: number | null;
  unit_cost: number | null;
}

export interface RmConversionRow {
  id: string;
  awo_id: string | null;
  // Header fields mirror the FIRST output line (kept by the RPC for the
  // older single-output shape). `outputs` is the complete list — render
  // from it.
  output_item_id: string;
  output_item_code: string | null;
  output_item_description: string | null;
  output_unit: string;
  output_qty_base: number;
  output_alt_unit: string | null;
  output_qty_alt: number | null;
  output_unit_cost: number | null;
  outputs: RmConversionOutputRow[];
  status: string; // 'posted' | 'reversed'
  posted_at: string;
  posted_by: string | null;
  posted_by_name: string | null;
  reversed_at: string | null;
  reversed_by_name: string | null;
  reversal_reason: string | null;
  notes: string | null;
}

export interface RmConversionListResult {
  rows: RmConversionRow[];
  count: number;
}

/**
 * Output lines for a set of conversions, keyed by conversion id and ordered
 * by line_no. Plain queries (outputs, then items by id) rather than a
 * PostgREST embed — same reasoning as fetchSuggestedComponents above, and it
 * keeps the register independent of relationship detection on a new table.
 * Bounded by the caller's page of conversion ids.
 */
async function fetchOutputsByConversion(
  companyId: string,
  conversionIds: string[]
): Promise<Map<string, RmConversionOutputRow[]>> {
  const byConversion = new Map<string, RmConversionOutputRow[]>();
  if (conversionIds.length === 0) return byConversion;

  // Read in fixed-size chunks until a short chunk comes back, so a page of
  // conversions with many lines can never be silently cut off by the API's
  // per-request row cap.
  const CHUNK = 500;
  const rows: any[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data: outRows, error: outError } = await (supabase as any)
      .from("rm_conversion_outputs")
      .select("rm_conversion_id, line_no, item_id, unit, qty_base, alt_unit, qty_alt, unit_cost")
      .eq("company_id", companyId)
      .in("rm_conversion_id", conversionIds)
      .order("rm_conversion_id", { ascending: true })
      .order("line_no", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (outError) throw outError;
    const chunk = (outRows ?? []) as any[];
    rows.push(...chunk);
    if (chunk.length < CHUNK) break;
  }

  const itemIds = [...new Set(rows.map((r) => r.item_id as string))];
  const itemMap = new Map<string, { item_code: string | null; description: string | null }>();
  if (itemIds.length > 0) {
    const { data: items, error: itemsError } = await (supabase as any)
      .from("items")
      .select("id, item_code, description")
      .eq("company_id", companyId)
      .in("id", itemIds);
    if (itemsError) throw itemsError;
    for (const i of (items ?? []) as any[]) {
      itemMap.set(i.id, { item_code: i.item_code ?? null, description: i.description ?? null });
    }
  }

  for (const r of rows) {
    const list = byConversion.get(r.rm_conversion_id) ?? [];
    list.push({
      line_no: Number(r.line_no),
      item_id: r.item_id,
      item_code: itemMap.get(r.item_id)?.item_code ?? null,
      description: itemMap.get(r.item_id)?.description ?? null,
      unit: r.unit,
      qty_base: Number(r.qty_base ?? 0),
      alt_unit: r.alt_unit ?? null,
      qty_alt: r.qty_alt != null ? Number(r.qty_alt) : null,
      unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
    });
    byConversion.set(r.rm_conversion_id, list);
  }
  return byConversion;
}

/** Paginated — page is 0-based. No unbounded fetch. */
export async function fetchRmConversions(
  page: number,
  pageSize: number
): Promise<RmConversionListResult> {
  const companyId = await getCompanyId();
  if (!companyId) return { rows: [], count: 0 };

  const from = page * pageSize;
  const { data, error, count } = await (supabase as any)
    .from("rm_conversions")
    .select(
      "id, awo_id, output_item_id, output_unit, output_qty_base, output_alt_unit, output_qty_alt, output_unit_cost, status, posted_at, posted_by, reversed_at, reversed_by, reversal_reason, notes, items(item_code, description)",
      { count: "exact" }
    )
    .eq("company_id", companyId)
    .order("posted_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const outputsByConversion = await fetchOutputsByConversion(companyId, rows.map((r) => r.id as string));
  const userIds = [
    ...new Set(rows.flatMap((r) => [r.posted_by, r.reversed_by]).filter(Boolean)),
  ] as string[];
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, display_name, email")
      .in("id", userIds);
    for (const u of (users ?? []) as any[]) {
      userMap.set(u.id, u.display_name || u.full_name || u.email || u.id);
    }
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      awo_id: r.awo_id ?? null,
      output_item_id: r.output_item_id,
      output_item_code: r.items?.item_code ?? null,
      output_item_description: r.items?.description ?? null,
      output_unit: r.output_unit,
      output_qty_base: Number(r.output_qty_base ?? 0),
      output_alt_unit: r.output_alt_unit ?? null,
      output_qty_alt: r.output_qty_alt != null ? Number(r.output_qty_alt) : null,
      output_unit_cost: r.output_unit_cost != null ? Number(r.output_unit_cost) : null,
      // Every conversion has its output lines recorded server-side. The
      // header-derived fallback only covers a row whose lines could not be
      // read, so the register never renders a conversion with no output.
      outputs:
        outputsByConversion.get(r.id) ?? [
          {
            line_no: 1,
            item_id: r.output_item_id,
            item_code: r.items?.item_code ?? null,
            description: r.items?.description ?? null,
            unit: r.output_unit,
            qty_base: Number(r.output_qty_base ?? 0),
            alt_unit: r.output_alt_unit ?? null,
            qty_alt: r.output_qty_alt != null ? Number(r.output_qty_alt) : null,
            unit_cost: r.output_unit_cost != null ? Number(r.output_unit_cost) : null,
          },
        ],
      status: r.status,
      posted_at: r.posted_at,
      posted_by: r.posted_by ?? null,
      posted_by_name: r.posted_by ? (userMap.get(r.posted_by) ?? r.posted_by) : null,
      reversed_at: r.reversed_at ?? null,
      reversed_by_name: r.reversed_by ? (userMap.get(r.reversed_by) ?? r.reversed_by) : null,
      reversal_reason: r.reversal_reason ?? null,
      notes: r.notes ?? null,
    })),
    count: count ?? 0,
  };
}

export interface RmConversionInputRow {
  id: string;
  item_id: string;
  item_code: string | null;
  description: string | null;
  source: "grn_direct" | "store";
  grn_line_item_id: string | null;
  entered_qty: number;
  entered_unit: string;
  qty_base: number;
  qty_alt: number | null;
  alt_unit: string | null;
  implied_factor: number | null;
  scrap_qty_base: number;
  notes: string | null;
}

/** Detail rows for one conversion's expanded row in the register. */
export async function fetchRmConversionInputs(rmConversionId: string): Promise<RmConversionInputRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data, error } = await (supabase as any)
    .from("rm_conversion_inputs")
    .select(
      "id, item_id, source, grn_line_item_id, entered_qty, entered_unit, qty_base, qty_alt, alt_unit, implied_factor, scrap_qty_base, notes, items(item_code, description)"
    )
    .eq("company_id", companyId)
    .eq("rm_conversion_id", rmConversionId)
    .order("entered_qty", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    item_id: r.item_id,
    item_code: r.items?.item_code ?? null,
    description: r.items?.description ?? null,
    source: r.source,
    grn_line_item_id: r.grn_line_item_id ?? null,
    entered_qty: Number(r.entered_qty ?? 0),
    entered_unit: r.entered_unit,
    qty_base: Number(r.qty_base ?? 0),
    qty_alt: r.qty_alt != null ? Number(r.qty_alt) : null,
    alt_unit: r.alt_unit ?? null,
    implied_factor: r.implied_factor != null ? Number(r.implied_factor) : null,
    scrap_qty_base: Number(r.scrap_qty_base ?? 0),
    notes: r.notes ?? null,
  }));
}
