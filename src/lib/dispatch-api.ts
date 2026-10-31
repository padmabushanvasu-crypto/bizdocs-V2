import { supabase } from "@/integrations/supabase/client";

async function getCompanyId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  return (data as any)?.company_id ?? null;
}

async function getCurrentUser(): Promise<{ id: string; name: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("company_id, full_name").eq("id", user.id).single();
  return { id: user.id, name: (data as any)?.full_name ?? user.email ?? "Unknown" };
}

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface DispatchRecord {
  id: string;
  company_id: string;
  dr_number: string;
  dispatch_date: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_po_ref: string | null;
  /** Tally / GST tax invoice number raised for this dispatch, e.g. "131/26-27". */
  invoice_number: string | null;
  vehicle_number: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  notes: string | null;
  dispatched_by: string | null;
  status: 'draft' | 'dispatched' | 'delivered';
  dispatched_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  items?: DispatchRecordItem[];
}

export interface DispatchRecordItem {
  id: string;
  company_id: string;
  dispatch_record_id: string;
  serial_number_id: string | null;
  serial_number: string | null;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  quantity: number;
  unit: string;
  notes: string | null;
  created_at: string;
}


export interface FinishedGoodItem {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  /** Sellable quantity: stock_in_fg_ready for finished goods, stock_free for resale items. */
  stock_in_fg_ready: number;
  /** Bought-out item received, QC'd and sold as-is (items.is_resale). Relieved from stock_free. */
  is_resale?: boolean;
}

// ── Functions ──────────────────────────────────────────────────────────────────

export async function fetchDispatchRecords(filters?: { status?: string; search?: string }): Promise<DispatchRecord[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  // Lines come along so the list can lead with each unit's serial number.
  let query = (supabase as any)
    .from("dispatch_records")
    .select("*, items:dispatch_record_items(id, item_id, item_code, item_description, quantity, serial_number, serial_number_id)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(`dr_number.ilike.${term},customer_name.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DispatchRecord[];
}

export async function fetchDispatchRecord(id: string): Promise<DispatchRecord | null> {
  const companyId = await getCompanyId();
  if (!companyId) return null;

  const { data: dr, error } = await (supabase as any)
    .from("dispatch_records")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();

  if (error || !dr) return null;

  const { data: items } = await (supabase as any)
    .from("dispatch_record_items")
    .select("*")
    .eq("dispatch_record_id", id)
    .order("created_at", { ascending: true });

  return { ...dr, items: items ?? [] } as DispatchRecord;
}

export async function createDispatchRecord(
  data: Partial<DispatchRecord>,
  items: Partial<DispatchRecordItem>[]
): Promise<string> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const currentUser = await getCurrentUser();

  const { data: dr, error } = await (supabase as any)
    .from("dispatch_records")
    .insert({
      company_id: companyId,
      dr_number: '',
      dispatch_date: data.dispatch_date ?? new Date().toISOString().split('T')[0],
      customer_id: data.customer_id ?? null,
      customer_name: data.customer_name ?? null,
      customer_po_ref: data.customer_po_ref ?? null,
      invoice_number: data.invoice_number?.trim() || null,
      vehicle_number: data.vehicle_number ?? null,
      driver_name: data.driver_name ?? null,
      driver_contact: data.driver_contact ?? null,
      notes: data.notes ?? null,
      dispatched_by: currentUser?.name ?? null,
      status: data.status ?? 'draft',
    })
    .select()
    .single();

  if (error) throw error;

  if (items.length > 0) {
    const itemRows = items.map((item) => ({
      company_id: companyId,
      dispatch_record_id: dr.id,
      serial_number_id: item.serial_number_id ?? null,
      serial_number: item.serial_number ?? null,
      item_id: item.item_id ?? null,
      item_code: item.item_code ?? null,
      item_description: item.item_description ?? null,
      quantity: item.quantity ?? 1,
      unit: item.unit ?? 'NOS',
      notes: item.notes ?? null,
    }));

    const { error: itemError } = await (supabase as any)
      .from("dispatch_record_items")
      .insert(itemRows);

    if (itemError) throw itemError;
  }

  return dr.id as string;
}

export async function updateDispatchRecord(
  id: string,
  data: Partial<DispatchRecord>,
  items: Partial<DispatchRecordItem>[]
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  // Header update runs through the database function, which refuses anything
  // but a draft when items are being replaced — so a posted record can never
  // have its items swapped out from under its ledger postings.
  const { error } = await (supabase as any).rpc("rpc_update_dispatch_record", {
    p_company_id: companyId,
    p_id: id,
    p_header: {
      dispatch_date: data.dispatch_date,
      customer_id: data.customer_id ?? null,
      customer_name: data.customer_name ?? null,
      customer_po_ref: data.customer_po_ref ?? null,
      invoice_number: data.invoice_number?.trim() || null,
      vehicle_number: data.vehicle_number ?? null,
      driver_name: data.driver_name ?? null,
      driver_contact: data.driver_contact ?? null,
      notes: data.notes ?? null,
    },
    p_replace_items: true,
  });
  if (error) throw new Error(error.message);

  // Delete and re-insert items
  const { error: delErr } = await (supabase as any)
    .from("dispatch_record_items")
    .delete()
    .eq("dispatch_record_id", id);
  if (delErr) throw delErr;

  if (items.length > 0) {
    const itemRows = items.map((item) => ({
      company_id: companyId,
      dispatch_record_id: id,
      serial_number_id: item.serial_number_id ?? null,
      serial_number: item.serial_number ?? null,
      item_id: item.item_id ?? null,
      item_code: item.item_code ?? null,
      item_description: item.item_description ?? null,
      quantity: item.quantity ?? 1,
      unit: item.unit ?? 'NOS',
      notes: item.notes ?? null,
    }));

    const { error: itemError } = await (supabase as any)
      .from("dispatch_record_items")
      .insert(itemRows);

    if (itemError) throw itemError;
  }
}

/**
 * Confirm a draft dispatch record. Everything — the invoice_dispatch ledger
 * rows, the fg_ready bucket, serial numbers and the status flip — happens in
 * ONE database transaction (rpc_confirm_dispatch_record): a failure anywhere
 * (e.g. not enough ready stock for one line) leaves the record a draft with no
 * stock movement, so it can simply be retried. A record that is not a draft is
 * refused, so a double click cannot deduct twice.
 */
export async function confirmDispatch(id: string): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");
  const currentUser = await getCurrentUser();

  const { error } = await (supabase as any).rpc("rpc_confirm_dispatch_record", {
    p_company_id: companyId,
    p_id: id,
    p_confirmed_by: currentUser?.id ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Revert a dispatched/delivered record to draft (reason required): the
 * goods-leave postings are reversed with compensating ledger entries and the
 * stock, serials and status are restored in one transaction. The record can
 * then be edited and re-confirmed (reverse-then-repost).
 */
export async function revertDispatchRecord(
  id: string,
  reason: string
): Promise<{ dr_number: string; prior_status: string; ledger_rows_reversed: number; serials_restored: number }> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");
  const currentUser = await getCurrentUser();

  const { data, error } = await (supabase as any).rpc("rpc_revert_dispatch_record", {
    p_company_id: companyId,
    p_id: id,
    p_by: currentUser?.id ?? null,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Edit the non-stock fields of a posted (dispatched/delivered) record. The
 * database refuses anything else — customer, date and items are frozen until
 * the record is reverted to draft.
 */
export async function updateDispatchRecordDetails(
  id: string,
  fields: { vehicle_number?: string | null; driver_name?: string | null; driver_contact?: string | null; customer_po_ref?: string | null; invoice_number?: string | null; notes?: string | null }
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");
  const { error } = await (supabase as any).rpc("rpc_update_dispatch_record", {
    p_company_id: companyId,
    p_id: id,
    p_header: fields,
    p_replace_items: false,
  });
  if (error) throw new Error(error.message);
}

export async function fetchFinishedGoodItems(): Promise<FinishedGoodItem[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data, error } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, unit, stock_in_fg_ready")
    .eq("company_id", companyId)
    .in("item_type", ["finished_good", "product"])
    .gt("stock_in_fg_ready", 0)
    .order("item_code");

  if (error) throw error;
  const finished: FinishedGoodItem[] = ((data ?? []) as any[]).map((i) => ({
    id: i.id,
    item_code: i.item_code ?? "",
    description: i.description ?? "",
    unit: i.unit ?? "NOS",
    stock_in_fg_ready: Number(i.stock_in_fg_ready ?? 0),
  }));

  // Resale items: bought out, QC'd, sold as-is. Available = stock_free.
  const { data: resaleData, error: resaleError } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, unit, stock_free")
    .eq("company_id", companyId)
    .eq("is_resale", true)
    .eq("status", "active")
    .gt("stock_free", 0)
    .order("item_code");

  if (resaleError) throw resaleError;
  const resale: FinishedGoodItem[] = ((resaleData ?? []) as any[]).map((i) => ({
    id: i.id,
    item_code: i.item_code ?? "",
    description: i.description ?? "",
    unit: i.unit ?? "NOS",
    stock_in_fg_ready: Number(i.stock_free ?? 0),
    is_resale: true,
  }));

  return [...finished, ...resale];
}

export async function markDelivered(id: string): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const { error } = await (supabase as any)
    .from("dispatch_records")
    .update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) throw error;
}

export async function fetchDispatchStats(): Promise<{
  draft: number;
  dispatched: number;
  delivered_this_month: number;
  ready_to_dispatch: number;
}> {
  const companyId = await getCompanyId();
  if (!companyId) return { draft: 0, dispatched: 0, delivered_this_month: 0, ready_to_dispatch: 0 };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [draftRes, dispatchedRes, deliveredRes, readyRes] = await Promise.all([
    (supabase as any)
      .from("dispatch_records")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("status", "draft"),
    (supabase as any)
      .from("dispatch_records")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("status", "dispatched"),
    (supabase as any)
      .from("dispatch_records")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("status", "delivered")
      .gte("delivered_at", startOfMonth),
    (supabase as any)
      .from("items")
      .select("stock_in_fg_ready")
      .eq("company_id", companyId)
      .in("item_type", ["finished_good", "product"])
      .gt("stock_in_fg_ready", 0),
  ]);
  if (readyRes.error) throw readyRes.error;
  // Ready to dispatch = finished-good units in stock (stock_in_fg_ready), the same
  // bucket Dispatch Record confirm deducts — not serial_numbers rows.
  const readyUnits = ((readyRes.data ?? []) as any[]).reduce(
    (sum, r) => sum + Number(r.stock_in_fg_ready ?? 0),
    0
  );

  return {
    draft: draftRes.count ?? 0,
    dispatched: dispatchedRes.count ?? 0,
    delivered_this_month: deliveredRes.count ?? 0,
    ready_to_dispatch: readyUnits,
  };
}

/**
 * Delete a dispatch record (soft delete — the row is kept with deleted_at /
 * deleted_by / delete_reason). A draft has no stock impact. A dispatched or
 * delivered record is reversed first, inside the same database transaction:
 * compensating ledger entries (dispatched -> in_fg_ready, or -> free for
 * resale items), the fg_ready bucket restored, serial numbers back to
 * in_stock. A reason is required for non-draft records.
 */
export async function deleteDispatchRecord(
  id: string,
  reason?: string | null
): Promise<{ dr_number: string; prior_status: string; ledger_rows_reversed: number; serials_restored: number }> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");
  const currentUser = await getCurrentUser();

  const { data, error } = await (supabase as any).rpc("rpc_delete_dispatch_record", {
    p_company_id: companyId,
    p_id: id,
    p_deleted_by: (currentUser as any)?.id ?? null,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export interface InStockSerial {
  id: string;
  serial_number: string;
  item_id: string;
  /** Backfilled unit not yet confirmed by the team. */
  needs_verification?: boolean;
}

/**
 * Serial numbers currently in stock, grouped by item id. Informational and a
 * picker source only — stock quantities never come from serial rows (they come
 * from the ledger / items buckets). A serial becomes `dispatched` when a
 * Dispatch Record carrying it is confirmed, and returns to `in_stock` if that
 * record is reverted or deleted.
 */
export async function fetchInStockSerials(itemIds: string[]): Promise<Record<string, InStockSerial[]>> {
  const ids = [...new Set(itemIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const companyId = await getCompanyId();
  if (!companyId) return {};

  const { data, error } = await (supabase as any)
    .from("serial_numbers")
    .select("id, serial_number, item_id, created_at, needs_verification")
    .eq("company_id", companyId)
    .eq("status", "in_stock")
    .in("item_id", ids)
    .order("serial_number", { ascending: true });
  if (error) throw error;

  const out: Record<string, InStockSerial[]> = {};
  for (const r of (data ?? []) as any[]) {
    (out[r.item_id] ??= []).push({
      id: r.id,
      serial_number: r.serial_number,
      item_id: r.item_id,
      needs_verification: !!r.needs_verification,
    });
  }
  return out;
}
