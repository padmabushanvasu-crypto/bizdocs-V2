import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// Physical count = the authoritative FREE (on-shelf, issuable) qty per item.
// Two-step approval workflow: submitPhysicalCount creates a pending record
// with no stock effect; approvePhysicalCount (qc_team/admin only, enforced
// server-side) posts the 'physical_count' ledger event and sets stock_free
// to the counted value. rejectPhysicalCount/cancelPhysicalCount have zero
// stock effect. All four are thin RPC wrappers — no client-side stock or
// ledger logic here.

export interface CountWorklistRow {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  system_free: number;          // current items.stock_free
  counted: boolean;             // an approved physical_count ledger event exists
  last_counted_at: string | null;
  pending_count_id: string | null; // a physical_counts row is currently pending for this item
  pending_qty: number | null;      // that pending submission's counted_qty
}

export interface PhysicalCountRow {
  id: string;
  item_id: string;
  item_code: string | null;
  description: string | null;
  system_qty_at_submission: number;
  counted_qty: number;
  variance: number | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  ledger_id: string | null;
}

/**
 * Submit a physical count for one item. Creates a pending physical_counts
 * row — no stock or ledger effect until an approver acts on it. Resubmitting
 * while a prior submission for the same item is still pending supersedes it
 * (server-side, not something to replicate here).
 */
export async function submitPhysicalCount(
  itemId: string,
  countedQty: number,
  notes?: string
): Promise<PhysicalCountRow> {
  const { data, error } = await (supabase as any).rpc("rpc_submit_physical_count", {
    p_item_id: itemId,
    p_counted_qty: countedQty,
    p_notes: notes?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as PhysicalCountRow;
}

/**
 * Approve a pending physical count (qc_team/admin only — enforced by
 * is_stock_count_approver() server-side). Posts the ledger event and sets
 * stock_free to the counted value. Returns the actual prior/new free and
 * variance AS OF THE MOMENT OF APPROVAL — may differ from the row's own
 * `variance` column (computed at submission time) if stock moved between
 * submission and approval.
 */
export async function approvePhysicalCount(
  countId: string,
  reviewNotes?: string
): Promise<{ out_prior_free: number; out_new_free: number; out_variance: number }> {
  const { data, error } = await (supabase as any).rpc("rpc_approve_physical_count", {
    p_count_id: countId,
    p_review_notes: reviewNotes?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as { out_prior_free: number; out_new_free: number; out_variance: number };
}

/** Reject a pending physical count (qc_team/admin only). Zero stock effect. */
export async function rejectPhysicalCount(countId: string, reviewNotes: string): Promise<void> {
  const { error } = await (supabase as any).rpc("rpc_reject_physical_count", {
    p_count_id: countId,
    p_review_notes: reviewNotes,
  });
  if (error) throw new Error(error.message);
}

/** Cancel a pending physical count. Callable by the original submitter or an approver. */
export async function cancelPhysicalCount(countId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("rpc_cancel_physical_count", {
    p_count_id: countId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Active items + counting state. Company-scoped. `search` matches
 * code/description; `hideCounted` drops items that already have an
 * approved count (a pending submission still shows, regardless of this flag).
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

  // Latest APPROVED physical_count timestamp per item (company-scoped).
  // Paginated past PostgREST's default cap; we keep the max created_at per item_id.
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

  // Currently-pending submission per item (company-scoped). Same paginated
  // pattern as above — at most one pending row per item is expected
  // (rpc_submit_physical_count supersedes any prior pending one), but we
  // still page in case that invariant is ever violated by a direct write.
  const pendingByItem = new Map<string, { id: string; counted_qty: number }>();
  offset = 0;
  while (true) {
    const { data: pending, error: pErr } = await (supabase as any)
      .from("physical_counts")
      .select("id, item_id, counted_qty")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .range(offset, offset + PAGE - 1);
    if (pErr) throw pErr;
    const rows = (pending ?? []) as any[];
    for (const r of rows) {
      if (r.item_id) pendingByItem.set(r.item_id, { id: r.id, counted_qty: Number(r.counted_qty ?? 0) });
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const term = opts.search?.trim().toLowerCase() ?? "";
  let rows: CountWorklistRow[] = ((items ?? []) as any[]).map((it) => {
    const pending = pendingByItem.get(it.id) ?? null;
    return {
      id: it.id,
      item_code: it.item_code ?? "",
      description: it.description ?? "",
      unit: it.unit ?? "NOS",
      system_free: Number(it.stock_free ?? 0),
      counted: lastCountAt.has(it.id),
      last_counted_at: lastCountAt.get(it.id) ?? null,
      pending_count_id: pending?.id ?? null,
      pending_qty: pending?.counted_qty ?? null,
    };
  });

  if (term) {
    rows = rows.filter(
      (r) => r.item_code.toLowerCase().includes(term) || r.description.toLowerCase().includes(term)
    );
  }
  if (opts.hideCounted) rows = rows.filter((r) => !r.counted);
  return rows;
}

/** Every pending physical count, company-scoped, for the approval queue. */
export async function fetchPendingPhysicalCounts(): Promise<PhysicalCountRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data, error } = await (supabase as any)
    .from("physical_counts")
    .select("id, item_id, item_code, system_qty_at_submission, counted_qty, variance, notes, status, submitted_by, submitted_at, reviewed_by, reviewed_at, review_notes, ledger_id")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const itemIds = [...new Set(rows.map((r) => r.item_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.submitted_by).filter(Boolean))] as string[];

  const [itemsRes, usersRes] = await Promise.all([
    itemIds.length ? (supabase as any).from("items").select("id, description").in("id", itemIds) : Promise.resolve({ data: [] }),
    userIds.length ? (supabase as any).from("profiles").select("id, full_name, display_name, email").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);

  const itemMap = new Map((itemsRes.data ?? []).map((i: any) => [i.id, i.description as string]));
  const userMap = new Map((usersRes.data ?? []).map((u: any) => [u.id, u.display_name || u.full_name || u.email || u.id]));

  return rows.map((r) => ({
    id: r.id,
    item_id: r.item_id,
    item_code: r.item_code ?? null,
    description: (itemMap.get(r.item_id) as string) ?? null,
    system_qty_at_submission: Number(r.system_qty_at_submission ?? 0),
    counted_qty: Number(r.counted_qty ?? 0),
    variance: r.variance != null ? Number(r.variance) : null,
    notes: r.notes ?? null,
    status: r.status,
    submitted_by: r.submitted_by ?? null,
    submitted_by_name: r.submitted_by ? ((userMap.get(r.submitted_by) as string) ?? r.submitted_by) : null,
    submitted_at: r.submitted_at,
    reviewed_by: r.reviewed_by ?? null,
    reviewed_at: r.reviewed_at ?? null,
    review_notes: r.review_notes ?? null,
    ledger_id: r.ledger_id ?? null,
  }));
}
