import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// ── Field map ────────────────────────────────────────────────────────────────
// Loose, case-insensitive aliases for the 3 columns the Cost Master importer
// cares about. Header detection is delegated to parseExcelSmart, which uses
// normaliseHeader() from import-utils.
export const COST_MASTER_FIELD_MAP: Record<string, string[]> = {
  item_code: [
    "item code",
    "item_code",
    "code",
    "drawing no",
    "drawing_no",
    "drawing number",
    "drawing_number",
    "drg no",
    "drg.no",
    "part no",
    "part_no",
  ],
  description: [
    "description",
    "item description",
    "desc",
    "name",
    "item name",
  ],
  standard_cost: [
    "standard cost",
    "standard_cost",
    "cost",
    "rate",
    "rate per piece",
    "rate_per_piece",
    "costing per unit",
    "costing_per_unit",
    "unit cost",
    "price",
  ],
};

// ── Shared text normaliser ───────────────────────────────────────────────────
// Must mirror cost_master_bindings.source_text_norm so learned bindings line up
// with what we compute client-side at match time.
export function normalizeForMatch(s: string | null | undefined): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[\s\.]+/g, " ")
    .trim();
}

// ── Levenshtein-based similarity, 0..1 ───────────────────────────────────────
export function similarity(a: string, b: string): number {
  const s1 = normalizeForMatch(a);
  const s2 = normalizeForMatch(b);
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  const m = s1.length;
  const n = s2.length;
  if (s1 === s2) return 1;
  // Two-row dynamic programming for O(min(m,n)) memory
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s1.charCodeAt(i - 1) === s2.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  const distance = prev[n];
  const maxLen = Math.max(m, n);
  return 1 - distance / maxLen;
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface CostMasterRow {
  row_no: number;        // 1-based Excel row
  item_code: string;     // raw from xlsx
  description: string;   // raw from xlsx
  standard_cost: number; // already coerced to number; 0 means missing/invalid
}

export interface ItemLite {
  id: string;
  item_code: string;
  description: string;
  drawing_number: string | null;
  drawing_revision: string | null;
  standard_cost: number;
}

export interface BindingLite {
  source_text_norm: string;
  item_id: string;
}

export type MatchBucket =
  | "will_update"
  | "no_change"
  | "needs_review"
  | "skipped";

export type MatchVia =
  | "binding"
  | "item_code"
  | "item_code_norm"
  | "drawing_revision"
  | "drawing_number"
  | "fuzzy_description";

export interface MatchResult {
  row: CostMasterRow;
  bucket: MatchBucket;
  reason?: string;             // for skipped or needs_review
  matched_item?: ItemLite;     // for will_update / no_change
  candidates?: ItemLite[];     // top-N for needs_review (score-ordered)
  match_via?: MatchVia;
  binding_used?: boolean;      // true if step 1 matched
}

// ── Matcher ──────────────────────────────────────────────────────────────────
// 6-step priority cascade per row (stop at first hit):
//   1. cost_master_bindings exact on source_text_norm (item_code first;
//      fallback to description if item_code blank)
//   2. items.item_code exact (raw, case-insensitive)
//   3. items.item_code normalised (UPPER, strip [\s.])
//   4. items.drawing_revision exact (case-insensitive)
//   5. items.drawing_number exact (case-insensitive)
//   6. fuzzy items.description — top 3 by Levenshtein similarity, threshold 0.55
//
// Buckets:
//   - "will_update"  : single confident match (steps 1-5) AND new cost differs
//   - "no_change"    : single confident match (steps 1-5) AND new cost equals
//   - "needs_review" : 2+ matches at any step (e.g. duplicate "10MM" code), or
//                      only fuzzy candidates from step 6
//   - "skipped"      : no candidate at all OR cost <= 0 OR cost blank
//
// Test contract (mental cases — keep the matcher honest if you change anything):
//   - Empty rows[]                                → returns []
//   - Row with no match anywhere                  → skipped, "No matching item in master"
//   - Row matches one item by item_code, cost differs → will_update via item_code
//   - Row matches one item, cost identical        → no_change via item_code
//   - Row matches by binding                      → will_update via binding, binding_used
//   - Row matches 2+ items by same item_code      → needs_review with all candidates
//   - Row with cost = 0                           → skipped, "Cost must be positive"
//   - Row with cost = NaN / blank                 → skipped, "Cost is missing"
//   - Row with item_code blank, only fuzzy hits   → needs_review with top 3
//
// xlsx dedupe: if the same item_code appears 2+ times, last one wins. Done by
// the caller (the page) before invoking this matcher.
export function matchCostMasterRows(
  rows: CostMasterRow[],
  items: ItemLite[],
  bindings: BindingLite[],
): MatchResult[] {
  if (rows.length === 0) return [];

  // ── Index items for the cascade ────────────────────────────────────────────
  const byCodeLower = new Map<string, ItemLite[]>();
  const byCodeNorm = new Map<string, ItemLite[]>();
  const byDrawingRev = new Map<string, ItemLite[]>();
  const byDrawingNum = new Map<string, ItemLite[]>();

  const pushTo = (m: Map<string, ItemLite[]>, k: string, v: ItemLite) => {
    if (!k) return;
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };

  const stripCode = (s: string) => s.toUpperCase().replace(/[\s.]/g, "");

  for (const it of items) {
    if (it.item_code) {
      pushTo(byCodeLower, it.item_code.toLowerCase(), it);
      const stripped = stripCode(it.item_code);
      if (stripped) pushTo(byCodeNorm, stripped, it);
    }
    if (it.drawing_revision) pushTo(byDrawingRev, it.drawing_revision.toLowerCase(), it);
    if (it.drawing_number) pushTo(byDrawingNum, it.drawing_number.toLowerCase(), it);
  }

  const itemById = new Map(items.map((i) => [i.id, i]));
  const bindingByNorm = new Map(bindings.map((b) => [b.source_text_norm, b.item_id]));

  // ── Per-row cascade ────────────────────────────────────────────────────────
  return rows.map<MatchResult>((row) => {
    // Step 0: cost validation
    if (row.standard_cost === null || row.standard_cost === undefined || Number.isNaN(row.standard_cost)) {
      return { row, bucket: "skipped", reason: "Cost is missing" };
    }
    if (row.standard_cost <= 0) {
      return { row, bucket: "skipped", reason: "Cost must be positive" };
    }

    const code = (row.item_code ?? "").trim();
    const desc = (row.description ?? "").trim();

    const finalize = (item: ItemLite, via: MatchVia, opts?: { binding?: boolean }): MatchResult => {
      const isSame = Number(item.standard_cost ?? 0) === Number(row.standard_cost);
      return {
        row,
        bucket: isSame ? "no_change" : "will_update",
        matched_item: item,
        match_via: via,
        binding_used: !!opts?.binding,
      };
    };

    // Step 1: learned binding
    const bindingKey = normalizeForMatch(code || desc);
    if (bindingKey) {
      const itemId = bindingByNorm.get(bindingKey);
      if (itemId) {
        const item = itemById.get(itemId);
        if (item) return finalize(item, "binding", { binding: true });
        // Binding points at a deleted item — fall through to other steps.
      }
    }

    // Steps 2-5: exact lookups (any with 2+ matches → needs_review)
    if (code) {
      const exact = byCodeLower.get(code.toLowerCase());
      if (exact && exact.length === 1) return finalize(exact[0], "item_code");
      if (exact && exact.length > 1) {
        return {
          row,
          bucket: "needs_review",
          reason: `${exact.length} items share item_code "${code}"`,
          candidates: exact,
        };
      }

      const stripped = stripCode(code);
      if (stripped) {
        const norm = byCodeNorm.get(stripped);
        if (norm && norm.length === 1) return finalize(norm[0], "item_code_norm");
        if (norm && norm.length > 1) {
          return {
            row,
            bucket: "needs_review",
            reason: `${norm.length} items share normalised code "${stripped}"`,
            candidates: norm,
          };
        }
      }

      const rev = byDrawingRev.get(code.toLowerCase());
      if (rev && rev.length === 1) return finalize(rev[0], "drawing_revision");
      if (rev && rev.length > 1) {
        return {
          row,
          bucket: "needs_review",
          reason: `${rev.length} items share drawing_revision "${code}"`,
          candidates: rev,
        };
      }

      const num = byDrawingNum.get(code.toLowerCase());
      if (num && num.length === 1) return finalize(num[0], "drawing_number");
      if (num && num.length > 1) {
        return {
          row,
          bucket: "needs_review",
          reason: `${num.length} items share drawing_number "${code}"`,
          candidates: num,
        };
      }
    }

    // Step 6: fuzzy on description (top 3, threshold 0.55)
    if (desc) {
      const FUZZY_THRESHOLD = 0.55;
      const scored = items
        .map((it) => ({ it, score: similarity(desc, it.description) }))
        .filter((s) => s.score >= FUZZY_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (scored.length > 0) {
        return {
          row,
          bucket: "needs_review",
          reason: "Fuzzy description match — please confirm",
          candidates: scored.map((s) => s.it),
          match_via: "fuzzy_description",
        };
      }
    }

    return { row, bucket: "skipped", reason: "No matching item in master" };
  });
}

// ── DB fetchers ──────────────────────────────────────────────────────────────
export async function fetchItemsLite(): Promise<ItemLite[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data, error } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, drawing_number, drawing_revision, standard_cost")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("item_code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id as string,
    item_code: (r.item_code ?? "") as string,
    description: (r.description ?? "") as string,
    drawing_number: (r.drawing_number ?? null) as string | null,
    drawing_revision: (r.drawing_revision ?? null) as string | null,
    standard_cost: Number(r.standard_cost ?? 0),
  }));
}

export async function fetchCostMasterBindings(): Promise<BindingLite[]> {
  // RLS scopes by company — no explicit company_id filter needed.
  const { data, error } = await (supabase as any)
    .from("cost_master_bindings")
    .select("source_text_norm, item_id");
  if (error) throw error;
  return (data ?? []) as BindingLite[];
}
