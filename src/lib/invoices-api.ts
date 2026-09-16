import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";

export interface InvoiceLineItem {
  id?: string;
  serial_number: number;
  item_id: string | null;
  description: string;
  drawing_number?: string;
  hsn_sac_code?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  taxable_amount: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  line_total: number;
  drained_qty?: number;
  backflushed_qty?: number;
}

export interface InvoiceFilters {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchInvoices(filters: InvoiceFilters = {}) {
  const companyId = await getCompanyId();
  if (!companyId) return { data: [], count: 0 };
  const { search, status = "all", page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = supabase.from("invoices").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (status !== "all") query = query.eq("status", status);
  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`invoice_number.ilike.${term},customer_name.ilike.${term}`);
    }
  }
  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function fetchInvoice(id: string) {
  const [invoiceRes, itemsRes] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", id).single(),
    supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("serial_number"),
  ]);
  if (invoiceRes.error) throw invoiceRes.error;
  if (itemsRes.error) throw itemsRes.error;
  return { invoice: invoiceRes.data, lineItems: itemsRes.data ?? [] };
}

export async function createInvoice(invoice: Record<string, any>, lineItems: InvoiceLineItem[]) {
  const companyId = await getCompanyId();
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({ ...invoice, company_id: companyId, status: "draft" } as any)
    .select()
    .single();
  if (invErr) {
    console.error("[Invoice] create error:", invErr);
    throw invErr;
  }
  if (lineItems.length > 0) {
    const items = lineItems.map((li) => ({
      company_id: companyId,
      invoice_id: inv.id, serial_number: li.serial_number, item_id: li.item_id, description: li.description,
      drawing_number: li.drawing_number || null, hsn_sac_code: li.hsn_sac_code || null,
      quantity: li.quantity, unit: li.unit, unit_price: li.unit_price,
      discount_percent: li.discount_percent, discount_amount: li.discount_amount,
      taxable_amount: li.taxable_amount, gst_rate: li.gst_rate,
      cgst: li.cgst, sgst: li.sgst, igst: li.igst, line_total: li.line_total,
    }));
    const { error: liErr } = await supabase.from("invoice_line_items").insert(items as any);
    if (liErr) {
      console.error("[Invoice] line items insert error:", liErr);
      throw liErr;
    }
  }
  return inv;
}

export async function updateInvoice(id: string, invoice: Record<string, any>, lineItems: InvoiceLineItem[]) {
  const companyId = await getCompanyId();
  const { error: invErr } = await supabase.from("invoices").update({ ...invoice, status: "draft" } as any).eq("id", id);
  if (invErr) throw invErr;
  await supabase.from("invoice_line_items").delete().eq("invoice_id", id);
  if (lineItems.length > 0) {
    const items = lineItems.map((li) => ({
      company_id: companyId,
      invoice_id: id, serial_number: li.serial_number, item_id: li.item_id, description: li.description,
      drawing_number: li.drawing_number || null, hsn_sac_code: li.hsn_sac_code || null,
      quantity: li.quantity, unit: li.unit, unit_price: li.unit_price,
      discount_percent: li.discount_percent, discount_amount: li.discount_amount,
      taxable_amount: li.taxable_amount, gst_rate: li.gst_rate,
      cgst: li.cgst, sgst: li.sgst, igst: li.igst, line_total: li.line_total,
    }));
    const { error } = await supabase.from("invoice_line_items").insert(items as any);
    if (error) throw error;
  }
}

/**
 * Numbers, totals and stock are server-authoritative — this only invokes the RPC.
 * DB error messages are user-facing by design; callers surface them verbatim.
 */
export async function completeSale(id: string): Promise<{ invoice_number: string; grand_total: number; lines: number; backflush_rows: number; shortfalls: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("rpc_complete_sale", {
    p_invoice_id: id,
    p_completed_by: user?.id ?? null,
  } as any);
  if (error) throw new Error(error.message);
  return data as any;
}

export async function cancelSale(id: string, reason: string, unbuild: boolean): Promise<{ invoice_number: string; status: string; lines_returned: number; backflush_reversed: number; unbuild: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("rpc_cancel_sale", {
    p_invoice_id: id,
    p_reason: reason,
    p_cancelled_by: user?.id ?? null,
    p_unbuild: unbuild,
  } as any);
  if (error) throw new Error(error.message);
  return data as any;
}

export async function softDeleteInvoice(id: string) {
  const { data: inv, error: fetchErr } = await supabase.from("invoices").select("status").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  if (inv.status !== "draft") throw new Error("Only a draft invoice can be deleted");
  const { error } = await supabase.from("invoices").update({ status: "deleted" } as any).eq("id", id);
  if (error) throw error;
}

export async function fetchInvoiceStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const { data: all } = await supabase
    .from("invoices")
    .select("grand_total, invoice_date, status")
    .eq("status", "sale_complete");
  const thisMonth = (all ?? []).filter((i: any) => i.invoice_date >= monthStart);
  return {
    billedThisMonth: thisMonth.reduce((s: number, i: any) => s + (i.grand_total ?? 0), 0),
    fyRevenue: (all ?? []).reduce((s: number, i: any) => s + (i.grand_total ?? 0), 0),
  };
}

export async function fetchPayments(filters: { search?: string; page?: number; pageSize?: number } = {}) {
  const { search, page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = supabase.from("payments").select("*", { count: "exact" }).order("payment_date", { ascending: false }).range(from, to);
  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`receipt_number.ilike.${term},customer_name.ilike.${term},invoice_number.ilike.${term}`);
    }
  }
  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export interface SaleShortfall {
  id: string;
  invoice_line_id: string;
  child_item_id: string;
  qty_short: number;
  position_after: number;
  resolved_at: string | null;
  item_code: string;
  description: string;
}

export async function fetchSaleShortfalls(invoiceId: string): Promise<SaleShortfall[]> {
  const { data, error } = await supabase
    .from("sale_shortfalls")
    .select("id, invoice_line_id, child_item_id, qty_short, position_after, resolved_at, items:child_item_id(item_code, description)")
    .eq("invoice_id", invoiceId)
    .is("resolved_at", null);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    invoice_line_id: r.invoice_line_id,
    child_item_id: r.child_item_id,
    qty_short: r.qty_short,
    position_after: r.position_after,
    resolved_at: r.resolved_at,
    item_code: r.items?.item_code ?? "",
    description: r.items?.description ?? "",
  }));
}
