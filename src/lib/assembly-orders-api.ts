import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";

// ============================================================
// Interfaces
// ============================================================

export interface BomLine {
  id: string;
  company_id: string;
  parent_item_id: string;
  child_item_id: string;
  quantity: number;
  unit: string | null;
  bom_level: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined child item fields
  child_item_code?: string | null;
  child_item_description?: string | null;
  child_item_type?: string | null;
  child_current_stock?: number;
  child_standard_cost?: number;
  child_unit?: string | null;
}

export interface SerialNumber {
  id: string;
  company_id: string;
  serial_number: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  assembly_order_id: string | null;
  status: "in_production" | "in_stock" | "dispatched" | "under_warranty" | "scrapped" | "cancelled";
  invoice_id: string | null;
  invoice_number: string | null;
  customer_name: string | null;
  dispatch_date: string | null;
  warranty_months: number;
  warranty_expiry: string | null;
  fat_completed: boolean;
  fat_completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockLedgerEntry {
  id: string;
  company_id: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  transaction_date: string;
  transaction_type:
    | "grn_receipt"
    | "job_card_issue"
    | "job_card_return"
    | "job_work_return"
    | "assembly_consumption"
    | "assembly_output"
    | "assembly_issue"
    | "assembly_return"
    | "scrap_write_off"
    | "consumable_issue"
    | "invoice_dispatch"
    | "dc_issue"
    | "dc_return"
    | "opening_stock"
    | "physical_count"
    | "manual_adjustment"
    | "rejection_writeoff"
    | "vendor_return";
  qty_in: number;
  qty_out: number;
  balance_qty: number;
  unit_cost: number;
  total_value: number;
  reference_type: string | null;
  reference_id: string | null;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  from_state?: string | null;
  to_state?: string | null;
}

export interface StockLedgerFilters {
  item_id?: string;
  transaction_type?: string;
  date_from?: string;
  date_to?: string;
  stock_state?: string;
  page?: number;
  pageSize?: number;
}

export interface SerialNumberFilters {
  item_id?: string;
  status?: string;
  search?: string;
}

// ============================================================
// BOM Lines
// ============================================================

export async function fetchBomLines(parentItemId: string): Promise<BomLine[]> {
  const { data, error } = await (supabase as any)
    .from("bom_lines")
    .select("*")
    .eq("parent_item_id", parentItemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const childIds = (data as any[]).map((l) => l.child_item_id);
  const { data: childItems } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type, unit, current_stock, standard_cost")
    .in("id", childIds);

  const itemMap = new Map(((childItems ?? []) as any[]).map((i) => [i.id, i]));

  return (data as any[]).map((bl) => {
    const child = itemMap.get(bl.child_item_id) as any;
    return {
      ...bl,
      child_item_code: child?.item_code ?? null,
      child_item_description: child?.description ?? null,
      child_item_type: child?.item_type ?? null,
      child_current_stock: child?.current_stock ?? 0,
      child_standard_cost: child?.standard_cost ?? 0,
      child_unit: child?.unit ?? bl.unit ?? null,
    };
  }) as BomLine[];
}

export async function createBomLine(data: {
  parent_item_id: string;
  child_item_id: string;
  quantity: number;
  unit?: string;
  bom_level?: number;
  notes?: string;
}): Promise<BomLine> {
  const companyId = await getCompanyId();
  const { data: bl, error } = await (supabase as any)
    .from("bom_lines")
    .insert({
      company_id: companyId,
      parent_item_id: data.parent_item_id,
      child_item_id: data.child_item_id,
      quantity: data.quantity,
      unit: data.unit ?? null,
      bom_level: data.bom_level ?? 1,
      notes: data.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return bl as BomLine;
}

export async function updateBomLine(
  id: string,
  data: Partial<BomLine>
): Promise<BomLine> {
  const { data: bl, error } = await (supabase as any)
    .from("bom_lines")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return bl as BomLine;
}

export async function deleteBomLine(id: string): Promise<void> {
  const { error } = await (supabase as any).from("bom_lines").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// Stock Ledger
// ============================================================

export async function fetchStockLedger(filters: StockLedgerFilters = {}) {
  const { item_id, transaction_type, date_from, date_to, stock_state, page = 1, pageSize = 50 } = filters;

  // balance_qty is computed at read time, not from the stored column.
  // Historical callers pass 0 or inconsistent values for the stored column,
  // so we recompute the running balance from qty_in / qty_out across all
  // of an item's ledger rows. Stored balance_qty column is effectively
  // legacy — see B-side tech-debt for eventual removal.
  //
  // Only item_id is applied at the DB level. Date, transaction_type, and
  // stock_state filters narrow the *rows shown* not the *items*, so we apply
  // them in JS AFTER computing the running balance — otherwise a filtered-out
  // intermediate movement would be missing from its item's running total.

  // Fetch all rows for the universe (company via RLS, optionally item_id).
  // Paginated past PostgREST's default ~1000 row cap.
  const PAGE = 1000;
  const allRows: any[] = [];
  let offset = 0;
  while (true) {
    let q = (supabase as any)
      .from("stock_ledger")
      // Join items via item_id FK so the page can surface drawing_number
      // alongside item_code without needing a stored copy on every ledger row.
      // Old rows with null item_id silently return items: null and fall back
      // to the bare item_code render in the UI.
      .select("*, items(drawing_number, drawing_revision)")
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (item_id) q = q.eq("item_id", item_id);
    const { data: chunk, error } = await q;
    if (error) throw error;
    const rows = (chunk ?? []) as any[];
    if (rows.length === 0) break;
    allRows.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Compute per-item running balance over the chronologically sorted set.
  // Already sorted by (transaction_date ASC, created_at ASC); we just need
  // to bucket per item_id while walking.
  const balanceByItem = new Map<string, number>();
  for (const row of allRows) {
    const key = row.item_id ?? "__unkeyed__";
    const prev = balanceByItem.get(key) ?? 0;
    const next = prev + Number(row.qty_in ?? 0) - Number(row.qty_out ?? 0);
    balanceByItem.set(key, next);
    row.balance_qty = next;
  }

  // Apply display filters in JS, after balance is set.
  let filtered = allRows;
  if (transaction_type && transaction_type !== "all") {
    filtered = filtered.filter((r) => r.transaction_type === transaction_type);
  }
  if (date_from) filtered = filtered.filter((r) => r.transaction_date >= date_from);
  if (date_to) filtered = filtered.filter((r) => r.transaction_date <= date_to);
  if (stock_state && stock_state !== "all") {
    if (stock_state === "in") {
      filtered = filtered.filter((r) => r.to_state != null);
    } else if (stock_state === "out") {
      filtered = filtered.filter((r) => r.from_state != null);
    } else {
      filtered = filtered.filter((r) => r.from_state === stock_state || r.to_state === stock_state);
    }
  }

  // Resort to display order (newest first) and paginate in JS.
  filtered.sort((a, b) => {
    if (a.transaction_date !== b.transaction_date) {
      return a.transaction_date < b.transaction_date ? 1 : -1;
    }
    const ac = a.created_at ?? "";
    const bc = b.created_at ?? "";
    return ac < bc ? 1 : ac > bc ? -1 : 0;
  });
  const count = filtered.length;
  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  return { data: pageRows as StockLedgerEntry[], count };
}

export async function addStockLedgerEntry(
  data: Omit<StockLedgerEntry, "id" | "company_id" | "created_at">
): Promise<void> {
  const companyId = await getCompanyId();
  const { data: { user } } = await supabase.auth.getUser();

  // Compute the new running balance at write time so direct SQL consumers
  // (audits, exports, BI reports) see correct cumulative balances on every
  // row without needing the JS-side fetchStockLedger pass. fetchStockLedger
  // still recomputes at read for defence in depth — if a write here misses
  // or a row arrives backdated, the UI is self-healing.
  //
  // Concurrency caveat (acknowledged, accepted for single-operator usage):
  // two concurrent writes against the same item_id can both read the same
  // previous balance and produce duplicate next values. Mitigation deferred
  // pending a row-level lock or trigger. Low risk on this app.
  //
  // Backdating caveat: previous-balance is the LATEST row by
  // (transaction_date DESC, created_at DESC) regardless of the new row's
  // transaction_date. A backdated entry will get the post-everything total
  // as its stored balance. The read-time JS pass shows correct chronological
  // balances regardless. Acceptable given backdating is rare here.
  const qtyIn = Number(data.qty_in ?? 0);
  const qtyOut = Number(data.qty_out ?? 0);
  let computedBalance = qtyIn - qtyOut;
  if (data.item_id) {
    const { data: prev, error: prevErr } = await (supabase as any)
      .from("stock_ledger")
      .select("balance_qty")
      .eq("item_id", data.item_id)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevErr) throw prevErr;
    const previousBalance = Number((prev as any)?.balance_qty ?? 0);
    computedBalance = previousBalance + qtyIn - qtyOut;
  }

  const { error } = await (supabase as any).from("stock_ledger").insert({
    ...data,
    balance_qty: computedBalance,
    company_id: companyId,
    created_by: data.created_by ?? user?.id ?? null,
  });
  // Errors propagate to callers. The prior silent-swallow caused
  // bucket-vs-ledger drift: Store Confirm could move items.stock_free
  // without writing a ledger row. Callers must handle (toast + abort).
  if (error) throw error;
}

// ============================================================
// Serial Numbers
// ============================================================

export async function fetchSerialNumbers(filters: SerialNumberFilters = {}) {
  const { item_id, status, search } = filters;

  let query = (supabase as any)
    .from("serial_numbers")
    .select("*")
    .order("created_at", { ascending: false });

  if (item_id) query = query.eq("item_id", item_id);
  if (status && status !== "all") query = query.eq("status", status);

  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(
        `serial_number.ilike.${term},item_code.ilike.${term},customer_name.ilike.${term}`
      );
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SerialNumber[];
}

export async function fetchSerialNumber(id: string): Promise<SerialNumber> {
  const { data, error } = await (supabase as any)
    .from("serial_numbers")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as SerialNumber;
}

export async function updateSerialNumber(
  id: string,
  data: Partial<SerialNumber>
): Promise<SerialNumber> {
  const { data: sn, error } = await (supabase as any)
    .from("serial_numbers")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return sn as SerialNumber;
}

