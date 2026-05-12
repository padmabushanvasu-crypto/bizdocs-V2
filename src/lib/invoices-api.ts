import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";
import { updateStockBucket } from "@/lib/items-api";

export interface InvoiceLineItem {
  id?: string;
  serial_number: number;
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
  if (status === "unpaid") query = query.in("status", ["sent", "partially_paid"]).gt("amount_outstanding", 0);
  else if (status === "overdue") query = query.in("status", ["sent", "partially_paid"]).lt("due_date", new Date().toISOString().split("T")[0]);
  else if (status !== "all") query = query.eq("status", status);
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

export async function getNextInvoiceNumber(): Promise<string> {
  const companyId = await getCompanyId();
  const { getNextDocNumber } = await import("@/lib/doc-number-utils");
  return getNextDocNumber("invoices", "invoice_number", companyId, "invoice_prefix");
}

export async function createInvoice(invoice: Record<string, any>, lineItems: InvoiceLineItem[]) {
  const companyId = await getCompanyId();
  const { data: inv, error: invErr } = await supabase.from("invoices").insert({ ...invoice, company_id: companyId } as any).select().single();
  if (invErr) {
    console.error("[Invoice] create error:", invErr);
    throw invErr;
  }
  if (lineItems.length > 0) {
    const items = lineItems.map((li) => ({
      company_id: companyId,
      invoice_id: inv.id, serial_number: li.serial_number, description: li.description,
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
  const { error: invErr } = await supabase.from("invoices").update(invoice).eq("id", id);
  if (invErr) throw invErr;
  await supabase.from("invoice_line_items").delete().eq("invoice_id", id);
  if (lineItems.length > 0) {
    const items = lineItems.map((li) => ({
      company_id: companyId,
      invoice_id: id, serial_number: li.serial_number, description: li.description,
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

export async function issueInvoice(id: string) {
  const { error } = await supabase.from("invoices").update({ status: "sent", issued_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;

  // Stock dispatch: deduct each line item from inventory
  const companyId = await getCompanyId();
  const today = new Date().toISOString().split("T")[0];
  const { invoice, lineItems } = await fetchInvoice(id);

  for (const li of lineItems) {
    const line = li as any;
    const qty: number = line.quantity ?? 0;
    // Only process lines with a drawing_number (the reliable item lookup key)
    if (qty <= 0 || !line.drawing_number) continue;

    const { data: itemRecord } = await supabase
      .from("items")
      .select("id, item_code, description, current_stock, stock_finished_goods")
      .eq("drawing_revision", line.drawing_number)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!itemRecord) continue;
    const rec = itemRecord as any;
    const newStock = Math.max(0, (rec.current_stock ?? 0) - qty);
    const newFinishedGoods = Math.max(0, (rec.stock_finished_goods ?? 0) - qty);
    await supabase.from("items").update({ current_stock: newStock, stock_finished_goods: newFinishedGoods } as any).eq("id", rec.id);
    // Phase 13: deduct from free bucket on invoice dispatch
    await updateStockBucket(rec.id, 'free', -qty).catch(console.error);
    await addStockLedgerEntry({
      item_id: rec.id,
      item_code: rec.item_code,
      item_description: rec.description,
      transaction_date: today,
      transaction_type: "invoice_dispatch",
      qty_in: 0,
      qty_out: qty,
      balance_qty: newStock,
      unit_cost: line.unit_price ?? 0,
      total_value: qty * (line.unit_price ?? 0),
      reference_type: "invoice",
      reference_id: id,
      reference_number: (invoice as any).invoice_number,
      notes: `Invoice dispatch: ${(invoice as any).invoice_number}`,
      created_by: null,
      from_state: "finished_goods",
      to_state: "dispatched",
    });
  }
}

export async function cancelInvoice(id: string, reason: string) {
  const { error } = await supabase.from("invoices").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: reason }).eq("id", id);
  if (error) throw error;
}

export async function softDeleteInvoice(id: string) {
  const { error } = await supabase.from("invoices").update({ status: "deleted" } as any).eq("id", id);
  if (error) throw error;
}

export async function fetchInvoiceStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];
  const { data: all } = await supabase.from("invoices").select("grand_total, amount_paid, amount_outstanding, status, due_date, invoice_date").neq("status", "cancelled");
  const thisMonth = (all ?? []).filter((i: any) => i.invoice_date >= monthStart);
  const outstanding = (all ?? []).filter((i: any) => (i.amount_outstanding ?? 0) > 0);
  const overdue = outstanding.filter((i: any) => i.due_date && i.due_date < today);
  return {
    billedThisMonth: thisMonth.reduce((s: number, i: any) => s + (i.grand_total ?? 0), 0),
    collectedThisMonth: thisMonth.reduce((s: number, i: any) => s + (i.amount_paid ?? 0), 0),
    totalOutstanding: outstanding.reduce((s: number, i: any) => s + (i.amount_outstanding ?? 0), 0),
    overdueAmount: overdue.reduce((s: number, i: any) => s + (i.amount_outstanding ?? 0), 0),
  };
}

export async function recordPayment(payment: Record<string, any>) {
  const companyId = await getCompanyId();
  const { data: pmt, error: pmtErr } = await supabase.from("payments").insert({ ...payment, company_id: companyId } as any).select().single();
  if (pmtErr) throw pmtErr;
  const { data: inv } = await supabase.from("invoices").select("amount_paid, grand_total").eq("id", payment.invoice_id).single();
  if (inv) {
    const newPaid = (inv.amount_paid ?? 0) + payment.amount;
    const newOutstanding = Math.max(0, (inv.grand_total ?? 0) - newPaid);
    const newStatus = newOutstanding <= 0 ? "fully_paid" : "partially_paid";
    await supabase.from("invoices").update({ amount_paid: newPaid, amount_outstanding: newOutstanding, status: newStatus }).eq("id", payment.invoice_id);
  }
  return pmt;
}

export async function fetchInvoicePayments(invoiceId: string) {
  const { data, error } = await supabase.from("payments").select("*").eq("invoice_id", invoiceId).order("payment_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
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

export async function getNextReceiptNumber(): Promise<string> {
  const companyId = await getCompanyId();
  const { getNextDocNumber } = await import("@/lib/doc-number-utils");
  return getNextDocNumber("payments", "receipt_number", companyId, "rcp_prefix");
}

export async function fetchUnpaidInvoices(): Promise<{ id: string; invoice_number: string; customer_name: string; grand_total: number; amount_paid: number; amount_outstanding: number }[]> {
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_name, grand_total, amount_paid, amount_outstanding")
    .in("status", ["sent", "partially_paid"])
    .gt("amount_outstanding", 0)
    .order("invoice_date", { ascending: false })
    .limit(200);
  return (data ?? []) as any[];
}

export async function createReceipt(receipt: {
  receipt_number: string;
  receipt_date: string;
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  amount: number;
  payment_mode: string;
  reference_number?: string;
  bank_name?: string;
  notes?: string;
}): Promise<void> {
  const companyId = await getCompanyId();
  const { data: inv } = await supabase
    .from("invoices")
    .select("amount_paid, grand_total")
    .eq("id", receipt.invoice_id)
    .single();
  if (!inv) throw new Error("Invoice not found");

  const newPaid = Math.round(((inv.amount_paid ?? 0) + receipt.amount) * 100) / 100;
  const newOutstanding = Math.max(0, Math.round(((inv.grand_total ?? 0) - newPaid) * 100) / 100);
  const newStatus = newOutstanding <= 0 ? "fully_paid" : "partially_paid";

  const { error: pmtErr } = await supabase.from("payments").insert({
    ...receipt,
    company_id: companyId,
    payment_date: receipt.receipt_date,
  } as any);
  if (pmtErr) throw pmtErr;

  const { error: invErr } = await supabase
    .from("invoices")
    .update({ amount_paid: newPaid, amount_outstanding: newOutstanding, status: newStatus })
    .eq("id", receipt.invoice_id);
  if (invErr) throw invErr;
}
