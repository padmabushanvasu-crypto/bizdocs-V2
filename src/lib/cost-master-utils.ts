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
//
// Character class covers ASCII whitespace (`\s`), U+00A0 NBSP and U+200B ZWSP
// — both creep in when users paste from Word / Excel — plus the literal `.`
// so "ASSY." and "ASSY" collapse to the same key.
export function normalizeForMatch(s: string | null | undefined): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[\s\u00A0\u200B\.]+/g, " ")
    .trim();
}

// \u2500\u2500 Binding key normaliser \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Used ONLY for cost_master_bindings storage and lookup. Deliberately weaker
// than normalizeForMatch \u2014 case-insensitive raw text, nothing else. This stops
// physically different items from colliding into one binding key:
//   "10MM"  and "10mm"        \u2192 SAME key
//   "10MM"  and "10 MM"       \u2192 DIFFERENT keys (space matters)
//   "10MM"  and "10mm WASHER" \u2192 DIFFERENT keys (entire string matters)
// Old bindings written with normalizeForMatch stay in the DB but won't match
// anything in the new flow until the user re-confirms \u2014 which is the desired
// behaviour, since some of those old bindings were the bug.
export function normalizeForBinding(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().trim();
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

  if (items.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[CostMaster] matchCostMasterRows received 0 items in haystack — every row will be classified as 'No matching item in master'. Check fetchItemsLite.",
    );
  }

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

  // Same character class as normalizeForMatch — covers NBSP / ZWSP / ASCII ws + `.`
  const stripCode = (s: string) => s.toUpperCase().replace(/[\s\u00A0\u200B\.]/g, "");

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

    // Step 1: learned binding (uses lowercase-trim only — see normalizeForBinding)
    const bindingKey = normalizeForBinding(code || desc);
    if (bindingKey) {
      const itemId = bindingByNorm.get(bindingKey);
      if (itemId) {
        const item = itemById.get(itemId);
        if (item) return finalize(item, "binding", { binding: true });
        // Binding points at a deleted item — fall through to other steps.
      }
    }

    // Short item_codes (≤6 chars) like "10MM", "6mm", "3x10" are too generic
    // for an item_code-only match to be safe — "RIVET 6mm" and "HOLE LUG"
    // both legitimately have item_code "6MM" in some masters. When the source
    // row carries a description, we require at least faint description
    // similarity (≥ 0.30) to corroborate the code match. Returns a demoted
    // needs_review MatchResult, or null if the match should stand.
    const SHORT_CODE_LEN = 6;
    const CORROBORATION_THRESHOLD = 0.30;
    const corroborate = (item: ItemLite): MatchResult | null => {
      if (item.item_code.length <= SHORT_CODE_LEN && desc) {
        const sim = similarity(
          desc.toUpperCase().trim(),
          (item.description ?? "").toUpperCase().trim(),
        );
        if (sim < CORROBORATION_THRESHOLD) {
          return {
            row,
            bucket: "needs_review",
            reason: "Short item_code match — please confirm description matches",
            candidates: [item],
          };
        }
      }
      return null;
    };

    // Steps 2-5: exact lookups (any with 2+ matches → needs_review)
    if (code) {
      const exact = byCodeLower.get(code.toLowerCase());
      if (exact && exact.length === 1) {
        const demoted = corroborate(exact[0]);
        if (demoted) return demoted;
        return finalize(exact[0], "item_code");
      }
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
        if (norm && norm.length === 1) {
          const demoted = corroborate(norm[0]);
          if (demoted) return demoted;
          return finalize(norm[0], "item_code_norm");
        }
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
// PostgREST silently caps a single response at the server's `max-rows` setting
// (default 1000). With ~1000+ active items, a one-shot select drops the tail
// of the alphabet — V-codes etc. — and the matcher classifies them as
// "No matching item in master". Paginate via .range() until a chunk is short.
export async function fetchItemsLite(): Promise<ItemLite[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const PAGE = 1000;
  const all: any[] = [];
  let start = 0;
  let pages = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("items")
      .select("id, item_code, description, drawing_number, drawing_revision, standard_cost")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("item_code", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    pages++;
    if (data.length < PAGE) break;
    start += PAGE;
  }

  // eslint-disable-next-line no-console
  console.info(`[CostMaster] fetched ${all.length} active items in ${pages} page${pages === 1 ? "" : "s"}`);

  return all.map((r: any) => ({
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
  // Same paginated pattern as fetchItemsLite — bindings table will grow over
  // time as users resolve ambiguous matches; future-proof against the 1000-row cap.
  const PAGE = 1000;
  const all: any[] = [];
  let start = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("cost_master_bindings")
      .select("source_text_norm, item_id")
      .range(start, start + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    start += PAGE;
  }
  return all as BindingLite[];
}

// ── Apply ────────────────────────────────────────────────────────────────────
export interface ApplyPlanItem {
  item_id: string;
  new_cost: number;
  old_cost: number;
  source_text: string;        // raw — for binding source_text and audit details
  source_text_norm: string;   // normalised — for binding key
  match_via: MatchVia;
  binding_used: boolean;
  needs_binding_persist: boolean;  // true for needs_review rows that user resolved
  source_row_no: number;
}

export interface ApplyResult {
  total_planned: number;
  updated: number;
  failed: number;
  failures: Array<{ item_id: string; error: string }>;
  bindings_saved: number;
  audit_rows_written: number;
  batch_id: string;
}

export interface ApplyMeta {
  source_file_name: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
}

// Apply standard_cost updates to items, write audit rows, persist user bindings.
//
// Flow:
//   1. Generate batch_id (one per apply call, stamped on every audit row).
//   2. Update items in chunks of 100 — parallel within chunk via allSettled,
//      sequential across chunks. Per-item failures are collected, never abort.
//   3. After every chunk, fire onProgress(done, total).
//   4. Build audit_log rows for successful updates only and insert in chunks
//      of 200. Audit-insert errors are logged, not thrown — the cost change
//      is real even if its log row fails. We never roll back a successful
//      update on audit failure.
//   5. UPSERT cost_master_bindings for items where needs_binding_persist is
//      true AND the update succeeded. Conflict target is the unique index
//      (company_id, source_text_norm). Chunks of 100.
//   6. Return ApplyResult — totals, batch_id, per-item failures.
export async function applyCostMasterUpdates(
  plan: ApplyPlanItem[],
  meta: ApplyMeta,
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyResult> {
  const batch_id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const total = plan.length;
  const result: ApplyResult = {
    total_planned: total,
    updated: 0,
    failed: 0,
    failures: [],
    bindings_saved: 0,
    audit_rows_written: 0,
    batch_id,
  };

  if (total === 0) return result;

  const companyId = await getCompanyId();

  // ── Step 2-3: update items in chunks of 100 ───────────────────────────────
  const UPDATE_CHUNK = 100;
  const successfulItemIds = new Set<string>();
  let done = 0;

  for (let i = 0; i < plan.length; i += UPDATE_CHUNK) {
    const chunk = plan.slice(i, i + UPDATE_CHUNK);
    const settled = await Promise.allSettled(
      chunk.map(async (p) => {
        const { error } = await (supabase as any)
          .from("items")
          .update({ standard_cost: p.new_cost })
          .eq("id", p.item_id);
        if (error) throw new Error(error.message ?? JSON.stringify(error));
        return p.item_id;
      }),
    );
    settled.forEach((s, idx) => {
      const p = chunk[idx];
      if (s.status === "fulfilled") {
        successfulItemIds.add(p.item_id);
        result.updated++;
      } else {
        result.failed++;
        result.failures.push({
          item_id: p.item_id,
          error: s.reason?.message ?? String(s.reason ?? "unknown"),
        });
      }
    });
    done += chunk.length;
    onProgress?.(done, total);
  }

  // ── Step 4: audit rows (best-effort) ──────────────────────────────────────
  const auditRows = plan
    .filter((p) => successfulItemIds.has(p.item_id))
    .map((p) => ({
      company_id: companyId,
      document_type: "item",
      document_id: p.item_id,
      action: "cost_updated_via_master",
      details: {
        old_cost: p.old_cost,
        new_cost: p.new_cost,
        source_file_name: meta.source_file_name,
        source_text: p.source_text,
        match_via: p.match_via,
        binding_used: p.binding_used,
        batch_id,
      },
      user_id: meta.user_id,
      user_email: meta.user_email,
      user_name: meta.user_name,
    }));

  const AUDIT_CHUNK = 200;
  for (let i = 0; i < auditRows.length; i += AUDIT_CHUNK) {
    const chunk = auditRows.slice(i, i + AUDIT_CHUNK);
    try {
      const { error } = await (supabase as any).from("audit_log").insert(chunk);
      if (error) throw error;
      result.audit_rows_written += chunk.length;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[CostMaster] audit_log insert failed (cost change still applied):", err);
    }
  }

  // ── Step 5: persist user-confirmed bindings (UPSERT) ──────────────────────
  // source_text_norm is ALWAYS recomputed here via normalizeForBinding so the
  // function enforces the binding-key contract regardless of what the caller
  // put on the plan item. Old bindings written with the aggressive
  // normalizeForMatch are left in the DB but won't match anything in the new
  // lookup; users will re-confirm and the new binding lands here cleanly.
  const bindingRows = plan
    .filter((p) => p.needs_binding_persist && successfulItemIds.has(p.item_id) && p.source_text)
    .map((p) => ({
      company_id: companyId,
      source_text: p.source_text,
      source_text_norm: normalizeForBinding(p.source_text),
      item_id: p.item_id,
      confirmed_by: meta.user_id,
    }))
    .filter((b) => b.source_text_norm.length > 0);

  // De-dupe inside this batch on source_text_norm (last wins) so the upsert
  // doesn't get "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const dedup = new Map<string, (typeof bindingRows)[number]>();
  for (const b of bindingRows) dedup.set(b.source_text_norm, b);
  const dedupedBindings = Array.from(dedup.values());

  const BIND_CHUNK = 100;
  for (let i = 0; i < dedupedBindings.length; i += BIND_CHUNK) {
    const chunk = dedupedBindings.slice(i, i + BIND_CHUNK);
    try {
      const { error } = await (supabase as any)
        .from("cost_master_bindings")
        .upsert(chunk, { onConflict: "company_id,source_text_norm" });
      if (error) throw error;
      result.bindings_saved += chunk.length;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[CostMaster] cost_master_bindings upsert failed:", err);
    }
  }

  return result;
}
