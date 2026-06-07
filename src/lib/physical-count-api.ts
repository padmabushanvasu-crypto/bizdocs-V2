import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { updateStockBucket } from "@/lib/items-api";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";
import { STOCK_STATE } from "@/lib/stock-states";

// Physical count = the authoritative FREE (on-shelf, issuable) qty per item.
// It posts a 'physical_count' RESET event to the ledger (qty_in = the absolute
// counted value, NOT a delta) which E3's free-view treats as the base
// ("free = latest physical_count value + free-legs after it"), and sets the
// free bucket so availability is correct immediately. FREE only — never touches
// in_process / wip (that stock isn't on the shelf).

export interface CountWorklistRow {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  system_free: number;          // current items.stock_free
  counted: boolean;             // a physical_count row already exists
  last_counted_at: string | null;
}

export interface RecordedCount {
  item_id: string;
  prior_free: number;
  counted_free: number;
  variance: number;             // counted − system
  counted_at: string;
}

/**
 * Record a physical count for one item. Posts the RESET ledger event and sets
 * the FREE bucket (and force-synced current_stock) to the counted absolute value.
 */
export async function recordPhysicalCount(
  itemId: string,
  countedFree: number,
  notes?: string
): Promise<RecordedCount> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  // priorFree — current on-shelf system value, for the audit note + variance.
  const { data: itemRow, error: readErr } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, stock_free")
    .eq("id", itemId)
    .eq("company_id", companyId)
    .single();
  if (readErr || !itemRow) throw readErr ?? new Error("Item not found");
  const priorFree = Number((itemRow as any).stock_free ?? 0);
  const counted = Math.max(0, Number(countedFree) || 0);

  // RESET event: qty_in = the ABSOLUTE counted value (E3's base), not a delta.
  await addStockLedgerEntry({
    item_id: itemId,
    item_code: (itemRow as any).item_code ?? null,
    item_description: (itemRow as any).description ?? null,
    transaction_date: new Date().toISOString().split("T")[0],
    transaction_type: "physical_count",
    qty_in: counted,
    qty_out: 0,
    balance_qty: 0,
    unit_cost: 0,
    total_value: 0,
    reference_type: "stock_count",
    reference_id: null,
    reference_number: null,
    notes:
      `Physical count: system ${priorFree}, counted ${counted}` +
      (notes?.trim() ? ` — ${notes.trim()}` : ""),
    created_by: null,
    from_state: null,
    to_state: STOCK_STATE.FREE,
  });

  // Set the FREE bucket to the absolute counted value via a delta. updateStockBucket
  // force-syncs current_stock = stock_free, so availability is correct immediately.
  // FREE only — in_process / wip are untouched.
  await updateStockBucket(itemId, "free", counted - priorFree);

  return {
    item_id: itemId,
    prior_free: priorFree,
    counted_free: counted,
    variance: counted - priorFree,
    counted_at: new Date().toISOString(),
  };
}

/**
 * Active items + whether they've been physically counted yet. Company-scoped.
 * `search` matches code/description; `hideCounted` drops already-counted items.
 */
export async function fetchCountWorklist(
  opts: { search?: string; hideCounted?: boolean } = {}
): Promise<CountWorklistRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data: items, error } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, unit, stock_free")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("item_code", { ascending: true });
  if (error) throw error;

  // Latest physical_count timestamp per item (company-scoped). Paginated past
  // PostgREST's default cap; we keep the max created_at per item_id.
  const lastCountAt = new Map<string, string>();
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data: counts, error: cErr } = await (supabase as any)
      .from("stock_ledger")
      .select("item_id, created_at")
      .eq("company_id", companyId)
      .eq("transaction_type", "physical_count")
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (cErr) throw cErr;
    const rows = (counts ?? []) as any[];
    for (const r of rows) {
      if (r.item_id) lastCountAt.set(r.item_id, r.created_at); // ascending → last wins
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const term = opts.search?.trim().toLowerCase() ?? "";
  let rows: CountWorklistRow[] = ((items ?? []) as any[]).map((it) => ({
    id: it.id,
    item_code: it.item_code ?? "",
    description: it.description ?? "",
    unit: it.unit ?? "NOS",
    system_free: Number(it.stock_free ?? 0),
    counted: lastCountAt.has(it.id),
    last_counted_at: lastCountAt.get(it.id) ?? null,
  }));

  if (term) {
    rows = rows.filter(
      (r) => r.item_code.toLowerCase().includes(term) || r.description.toLowerCase().includes(term)
    );
  }
  if (opts.hideCounted) rows = rows.filter((r) => !r.counted);
  return rows;
}
