import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { getNextDocNumber } from "@/lib/doc-number-utils";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SoLineItem {
  id?: string;
  serial_number: number;
  item_id?: string | null;
  item_code?: string;
  description: string;
  hsn_sac_code?: string;
  unit: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  line_total: number;
  delivery_date?: string;
  remarks?: string;
}

export interface SalesOrder {
  id: string;
  so_number: string;
  so_date: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_gstin: string | null;
  customer_state_code: string | null;
  customer_phone: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  reference_number: string | null;
  priority: string;
  delivery_date: string | null;
  payment_terms: string | null;
  special_instructions: string | null;
  internal_remarks: string | null;
  sub_total: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_gst: number;
  grand_total: number;
  gst_rate: number;
  status: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  line_items?: SoLineItem[];
}

export interface DnLineItem {
  id?: string;
  serial_number: number;
  item_code?: string;
  drawing_number?: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  serial_number_ref?: string;
  remarks?: string;
}

export interface PackingListItem {
  id?: string;
  serial_number: number;
  description: string;
  quantity: number;
  unit: string;
  weight_kg?: number;
  dimensions?: string;
  box_number?: string;
  remarks?: string;
}

export interface DispatchNote {
  id: string;
  dn_number: string;
  dn_date: string;
  so_id: string | null;
  so_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_gstin: string | null;
  customer_state_code: string | null;
  shipping_address: string | null;
  vehicle_number: string | null;
  driver_name: string | null;
  transporter: string | null;
  lr_number: string | null;
  lr_date: string | null;
  reference_number: string | null;
  special_instructions: string | null;
  internal_remarks: string | null;
  sub_total: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_gst: number;
  grand_total: number;
  gst_rate: number;
  status: string;
  issued_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  line_items?: DnLineItem[];
  packing_list?: PackingListItem[];
}

export interface SoFilters {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface DnFilters {
  search?: string;
  status?: string;
  soId?: string;
  page?: number;
  pageSize?: number;
}

// ─── Sales Orders ─────────────────────────────────────────────────────────────

export async function fetchSalesOrders(filters: SoFilters = {}) {
  const { search, status = "all", page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("sales_orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && status !== "all") query = query.eq("status", status);
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`so_number.ilike.${term},customer_name.ilike.${term},reference_number.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as SalesOrder[], count: count ?? 0 };
}

export async function fetchSalesOrder(id: string): Promise<SalesOrder> {
  const { data: so, error } = await (supabase as any)
    .from("sales_orders")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: items, error: itemsErr } = await (supabase as any)
    .from("so_line_items")
    .select("*")
    .eq("so_id", id)
    .order("serial_number", { ascending: true });
  if (itemsErr) throw itemsErr;

  return { ...so, line_items: items ?? [] };
}

interface CreateSOData {
  so: Omit<SalesOrder, "id" | "created_at" | "updated_at" | "so_number" | "line_items">;
  lineItems: SoLineItem[];
}

export async function createSalesOrder({ so, lineItems }: CreateSOData) {
  const companyId = await getCompanyId();
  let { data: newSO, error } = await (supabase as any)
    .from("sales_orders")
    .insert({ company_id: companyId, ...so })
    .select()
    .single();
  if (error) throw error;

  // Fallback: if DB trigger didn't set so_number, generate it
  if (!newSO.so_number) {
    const soNumber = await getNextDocNumber("sales_orders", "so_number", companyId, "so_prefix");
    await (supabase as any).from("sales_orders").update({ so_number: soNumber }).eq("id", newSO.id);
    newSO = { ...newSO, so_number: soNumber };
  }

  if (lineItems.length > 0) {
    const items = lineItems.map((item) => ({
      company_id: companyId,
      so_id: newSO.id,
      serial_number: item.serial_number,
      item_id: item.item_id || null,
      item_code: item.item_code || null,
      description: item.description,
      hsn_sac_code: item.hsn_sac_code || null,
      unit: item.unit,
      quantity: item.quantity,
      unit_price: item.unit_price,
      gst_rate: item.gst_rate,
      line_total: item.line_total,
      delivery_date: item.delivery_date || null,
      remarks: item.remarks || null,
    }));
    const { error: itemsErr } = await (supabase as any).from("so_line_items").insert(items);
    if (itemsErr) throw itemsErr;
  }

  return newSO as SalesOrder;
}

export async function updateSalesOrder(id: string, { so, lineItems }: CreateSOData) {
  const companyId = await getCompanyId();
  const { error } = await (supabase as any).from("sales_orders").update(so).eq("id", id);
  if (error) throw error;

  await (supabase as any).from("so_line_items").delete().eq("so_id", id);
  if (lineItems.length > 0) {
    const items = lineItems.map((item) => ({
      company_id: companyId,
      so_id: id,
      serial_number: item.serial_number,
      item_id: item.item_id || null,
      item_code: item.item_code || null,
      description: item.description,
      hsn_sac_code: item.hsn_sac_code || null,
      unit: item.unit,
      quantity: item.quantity,
      unit_price: item.unit_price,
      gst_rate: item.gst_rate,
      line_total: item.line_total,
      delivery_date: item.delivery_date || null,
      remarks: item.remarks || null,
    }));
    const { error: itemsErr } = await (supabase as any).from("so_line_items").insert(items);
    if (itemsErr) throw itemsErr;
  }
}

export async function confirmSalesOrder(id: string) {
  const { error } = await (supabase as any)
    .from("sales_orders")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelSalesOrder(id: string, reason: string) {
  const { error } = await (supabase as any)
    .from("sales_orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: reason })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchSoStats() {
  try {
    const { data, error } = await (supabase as any)
      .from("sales_orders")
      .select("status");
    if (error) return { draft: 0, confirmed: 0, inProduction: 0, dispatched: 0 };
    const rows = data ?? [];
    return {
      draft:        rows.filter((r: any) => r.status === "draft").length,
      confirmed:    rows.filter((r: any) => r.status === "confirmed").length,
      inProduction: rows.filter((r: any) => r.status === "in_production").length,
      dispatched:   rows.filter((r: any) => r.status === "dispatched").length,
    };
  } catch {
    return { draft: 0, confirmed: 0, inProduction: 0, dispatched: 0 };
  }
}

export async function fetchRecentSalesOrders(limit = 4): Promise<SalesOrder[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("sales_orders")
      .select("id, so_number, customer_name, grand_total, status, so_date, priority")
      .in("status", ["confirmed", "in_production"])
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as SalesOrder[];
  } catch {
    return [];
  }
}

// ─── Dispatch Notes ───────────────────────────────────────────────────────────

export async function fetchDispatchNotes(filters: DnFilters = {}) {
  const { search, status = "all", soId, page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("dispatch_notes")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && status !== "all") query = query.eq("status", status);
  if (soId) query = query.eq("so_id", soId);
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`dn_number.ilike.${term},customer_name.ilike.${term},so_number.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as DispatchNote[], count: count ?? 0 };
}

export async function fetchDispatchNote(id: string): Promise<DispatchNote> {
  const { data: dn, error } = await (supabase as any)
    .from("dispatch_notes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const [itemsRes, packingRes] = await Promise.all([
    (supabase as any).from("dn_line_items").select("*").eq("dn_id", id).order("serial_number", { ascending: true }),
    (supabase as any).from("packing_list_items").select("*").eq("dn_id", id).order("serial_number", { ascending: true }),
  ]);
  if (itemsRes.error) throw itemsRes.error;

  return { ...dn, line_items: itemsRes.data ?? [], packing_list: packingRes.data ?? [] };
}

export async function fetchDispatchNotesForSO(soId: string): Promise<DispatchNote[]> {
  const { data, error } = await (supabase as any)
    .from("dispatch_notes")
    .select("id, dn_number, dn_date, status, grand_total")
    .eq("so_id", soId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as DispatchNote[];
}

interface CreateDNData {
  dn: Omit<DispatchNote, "id" | "created_at" | "updated_at" | "dn_number" | "line_items" | "packing_list">;
  lineItems: DnLineItem[];
  packingList: PackingListItem[];
}

export async function createDispatchNote({ dn, lineItems, packingList }: CreateDNData) {
  const companyId = await getCompanyId();
  let { data: newDN, error } = await (supabase as any)
    .from("dispatch_notes")
    .insert({ company_id: companyId, ...dn })
    .select()
    .single();
  if (error) throw error;

  // Fallback: if DB trigger didn't set dn_number, generate it
  if (!newDN.dn_number) {
    const dnNumber = await getNextDocNumber("dispatch_notes", "dn_number", companyId, "dn_prefix");
    await (supabase as any).from("dispatch_notes").update({ dn_number: dnNumber }).eq("id", newDN.id);
    newDN = { ...newDN, dn_number: dnNumber };
  }

  if (lineItems.length > 0) {
    const items = lineItems.map((item) => ({
      company_id: companyId,
      dn_id: newDN.id,
      serial_number: item.serial_number,
      item_code: item.item_code || null,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      rate: item.rate,
      amount: item.amount,
      serial_number_ref: item.serial_number_ref || null,
      remarks: item.remarks || null,
    }));
    const { error: err } = await (supabase as any).from("dn_line_items").insert(items);
    if (err) throw err;
  }

  if (packingList.length > 0) {
    const items = packingList.map((item) => ({
      company_id: companyId,
      dn_id: newDN.id,
      serial_number: item.serial_number,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      weight_kg: item.weight_kg ?? null,
      dimensions: item.dimensions || null,
      box_number: item.box_number || null,
      remarks: item.remarks || null,
    }));
    const { error: err } = await (supabase as any).from("packing_list_items").insert(items);
    if (err) throw err;
  }

  return newDN as DispatchNote;
}

export async function updateDispatchNote(id: string, { dn, lineItems, packingList }: CreateDNData) {
  const companyId = await getCompanyId();
  const { error } = await (supabase as any).from("dispatch_notes").update(dn).eq("id", id);
  if (error) throw error;

  await Promise.all([
    (supabase as any).from("dn_line_items").delete().eq("dn_id", id),
    (supabase as any).from("packing_list_items").delete().eq("dn_id", id),
  ]);

  if (lineItems.length > 0) {
    const items = lineItems.map((item) => ({
      company_id: companyId,
      dn_id: id,
      serial_number: item.serial_number,
      item_code: item.item_code || null,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      rate: item.rate,
      amount: item.amount,
      serial_number_ref: item.serial_number_ref || null,
      remarks: item.remarks || null,
    }));
    const { error: err } = await (supabase as any).from("dn_line_items").insert(items);
    if (err) throw err;
  }

  if (packingList.length > 0) {
    const items = packingList.map((item) => ({
      company_id: companyId,
      dn_id: id,
      serial_number: item.serial_number,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      weight_kg: item.weight_kg ?? null,
      dimensions: item.dimensions || null,
      box_number: item.box_number || null,
      remarks: item.remarks || null,
    }));
    const { error: err } = await (supabase as any).from("packing_list_items").insert(items);
    if (err) throw err;
  }
}

export async function issueDN(id: string) {
  const { error } = await (supabase as any)
    .from("dispatch_notes")
    .update({ status: "issued", issued_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelDN(id: string, reason: string) {
  const { error } = await (supabase as any)
    .from("dispatch_notes")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: reason })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchDnStats() {
  try {
    const { data, error } = await (supabase as any)
      .from("dispatch_notes")
      .select("status");
    if (error) return { draft: 0, issued: 0, cancelled: 0 };
    const rows = data ?? [];
    return {
      draft:     rows.filter((r: any) => r.status === "draft").length,
      issued:    rows.filter((r: any) => r.status === "issued").length,
      cancelled: rows.filter((r: any) => r.status === "cancelled").length,
    };
  } catch {
    return { draft: 0, issued: 0, cancelled: 0 };
  }
}
