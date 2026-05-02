import { supabase } from "@/integrations/supabase/client";
import { updateStockBucket } from "@/lib/items-api";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";

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

export interface ReadyToDispatchUnit {
  id: string; // serial_number table id
  serial_number: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  assembly_wo_ref: string | null;
  fat_completed_at: string | null;
  days_since_fat: number;
  status: string;
}

export interface FinishedGoodItem {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  stock_in_fg_ready: number;
}

// ── Functions ──────────────────────────────────────────────────────────────────

export async function fetchDispatchRecords(filters?: { status?: string; search?: string }): Promise<DispatchRecord[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  let query = (supabase as any)
    .from("dispatch_records")
    .select("*")
    .eq("company_id", companyId)
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

  const { error } = await (supabase as any)
    .from("dispatch_records")
    .update({
      dispatch_date: data.dispatch_date,
      customer_id: data.customer_id ?? null,
      customer_name: data.customer_name ?? null,
      customer_po_ref: data.customer_po_ref ?? null,
      vehicle_number: data.vehicle_number ?? null,
      driver_name: data.driver_name ?? null,
      driver_contact: data.driver_contact ?? null,
      notes: data.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("status", "draft");

  if (error) throw error;

  // Delete and re-insert items
  await (supabase as any)
    .from("dispatch_record_items")
    .delete()
    .eq("dispatch_record_id", id);

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

export async function confirmDispatch(id: string): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const dr = await fetchDispatchRecord(id);
  if (!dr) throw new Error("Dispatch record not found");

  const today = new Date().toISOString().split('T')[0];

  for (const item of dr.items ?? []) {
    if (!item.item_id) continue;

    await updateStockBucket(item.item_id, 'in_fg_ready', -item.quantity);

    // Update serial number status — only if a serial is linked to this line
    if (item.serial_number_id) {
      await (supabase as any)
        .from("serial_numbers")
        .update({ status: 'dispatched', dispatch_date: today })
        .eq("id", item.serial_number_id);
    } else if (item.serial_number) {
      await (supabase as any)
        .from("serial_numbers")
        .update({ status: 'dispatched', dispatch_date: today })
        .eq("serial_number", item.serial_number)
        .eq("company_id", companyId);
    }

    // Stock ledger entry — match StockLedgerEntry shape used elsewhere
    await addStockLedgerEntry({
      item_id: item.item_id,
      item_code: item.item_code ?? null,
      item_description: item.item_description ?? null,
      transaction_date: today,
      transaction_type: 'invoice_dispatch',
      qty_in: 0,
      qty_out: item.quantity,
      balance_qty: 0,
      unit_cost: 0,
      total_value: 0,
      reference_type: 'dispatch_record',
      reference_id: dr.id,
      reference_number: dr.dr_number,
      notes: `Dispatched to ${dr.customer_name ?? 'Customer'} — DR ${dr.dr_number}`,
      created_by: null,
    });
  }

  const { error } = await (supabase as any)
    .from("dispatch_records")
    .update({
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) throw error;
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

  if (error) return [];
  return ((data ?? []) as any[]).map((i) => ({
    id: i.id,
    item_code: i.item_code ?? "",
    description: i.description ?? "",
    unit: i.unit ?? "NOS",
    stock_in_fg_ready: Number(i.stock_in_fg_ready ?? 0),
  }));
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
      .eq("status", "draft"),
    (supabase as any)
      .from("dispatch_records")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "dispatched"),
    (supabase as any)
      .from("dispatch_records")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "delivered")
      .gte("delivered_at", startOfMonth),
    (supabase as any)
      .from("serial_numbers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "in_stock"),
  ]);

  return {
    draft: draftRes.count ?? 0,
    dispatched: dispatchedRes.count ?? 0,
    delivered_this_month: deliveredRes.count ?? 0,
    ready_to_dispatch: readyRes.count ?? 0,
  };
}

export async function fetchReadyToDispatch(): Promise<ReadyToDispatchUnit[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data: serials, error } = await (supabase as any)
    .from("serial_numbers")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "in_stock")
    .order("fat_completed_at", { ascending: true });

  if (error || !serials) return [];

  // Fetch item descriptions for all unique item_ids
  const itemIds = [...new Set((serials as any[]).map((s: any) => s.item_id).filter(Boolean))] as string[];
  const itemMap: Record<string, { item_code: string; description: string }> = {};

  if (itemIds.length > 0) {
    const { data: itemData } = await supabase
      .from("items")
      .select("id, item_code, description")
      .in("id", itemIds);

    for (const item of itemData ?? []) {
      itemMap[(item as any).id] = { item_code: (item as any).item_code, description: (item as any).description };
    }
  }

  const now = new Date();

  return (serials as any[]).map((s: any) => {
    const fatAt = s.fat_completed_at ? new Date(s.fat_completed_at) : null;
    const daysSinceFat = fatAt ? Math.floor((now.getTime() - fatAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const itemInfo = s.item_id ? itemMap[s.item_id] : null;

    return {
      id: s.id,
      serial_number: s.serial_number,
      item_id: s.item_id ?? null,
      item_code: s.item_code ?? itemInfo?.item_code ?? null,
      item_description: s.item_description ?? itemInfo?.description ?? null,
      assembly_wo_ref: s.assembly_order_id ?? null,
      fat_completed_at: s.fat_completed_at ?? null,
      days_since_fat: daysSinceFat,
      status: s.status,
    } as ReadyToDispatchUnit;
  });
}
