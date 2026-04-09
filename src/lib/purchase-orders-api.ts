import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { getNextDocNumber } from "@/lib/doc-number-utils";

export interface POLineItem {
  id?: string;
  item_id?: string | null;
  serial_number: number;
  description: string;
  drawing_number?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  delivery_date?: string;
  line_total: number;
  gst_rate: number;
  hsn_sac_code?: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  po_date: string;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_address: string | null;
  vendor_gstin: string | null;
  vendor_state_code: string | null;
  vendor_phone: string | null;
  vendor_reference: string | null;
  vendor_email: string | null;
  reference_number: string | null;
  payment_terms: string | null;
  delivery_address: string | null;
  delivery_contact_person: string | null;
  delivery_contact_phone: string | null;
  special_instructions: string | null;
  internal_remarks: string | null;
  sub_total: number;
  additional_charges: { label: string; amount: number }[];
  taxable_value: number;
  igst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  total_gst: number;
  grand_total: number;
  gst_rate: number;
  status: string;
  issued_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  payment_status: string | null;
  amount_paid: number | null;
  payment_date: string | null;
  payment_reference: string | null;
  payment_notes: string | null;
  created_at: string;
  updated_at: string;
  line_items?: POLineItem[];
}

export interface POFilters {
  search?: string;
  status?: string;
  vendorSearch?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchPurchaseOrders(filters: POFilters = {}) {
  const companyId = await getCompanyId();
  if (!companyId) return { data: [], count: 0 };
  const { search, status = "all", vendorSearch, dateFrom, dateTo, page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("purchase_orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && status !== "all") query = query.eq("status", status);
  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`po_number.ilike.${term},vendor_name.ilike.${term}`);
    }
  }
  if (vendorSearch?.trim()) {
    const sanitizedVendor = sanitizeSearchTerm(vendorSearch);
    if (sanitizedVendor) query = query.ilike("vendor_name", `%${sanitizedVendor}%`);
  }
  if (dateFrom) query = query.gte("po_date", dateFrom);
  if (dateTo) query = query.lte("po_date", dateTo);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as unknown as PurchaseOrder[], count: count ?? 0 };
}

export async function fetchPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data: po, error } = await supabase.from("purchase_orders").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: items, error: itemsError } = await supabase.from("po_line_items").select("*").eq("po_id", id).order("serial_number", { ascending: true });
  if (itemsError) throw itemsError;
  return { ...(po as unknown as PurchaseOrder), line_items: items as unknown as POLineItem[] };
}

export async function getNextPONumber(): Promise<string> {
  const companyId = await getCompanyId();
  return getNextDocNumber("purchase_orders", "po_number", companyId, "po_prefix");
}

interface CreatePOData {
  po: Omit<PurchaseOrder, "id" | "created_at" | "updated_at" | "line_items">;
  lineItems: POLineItem[];
}

export async function createPurchaseOrder({ po, lineItems }: CreatePOData) {
  const companyId = await getCompanyId();
  const { data: newPO, error } = await supabase
    .from("purchase_orders")
    .insert({
      company_id: companyId,
      po_number: po.po_number, po_date: po.po_date,
      vendor_id: po.vendor_id || null, vendor_name: po.vendor_name, vendor_address: po.vendor_address,
      vendor_gstin: po.vendor_gstin, vendor_state_code: po.vendor_state_code, vendor_phone: po.vendor_phone,
      reference_number: po.reference_number, payment_terms: po.payment_terms,
      delivery_address: po.delivery_address,
        delivery_contact_person: po.delivery_contact_person,
        delivery_contact_phone: po.delivery_contact_phone,
        special_instructions: po.special_instructions,
      internal_remarks: po.internal_remarks, sub_total: po.sub_total,
      additional_charges: po.additional_charges as any, taxable_value: po.taxable_value,
      igst_amount: po.igst_amount, cgst_amount: po.cgst_amount, sgst_amount: po.sgst_amount,
      total_gst: po.total_gst, grand_total: po.grand_total, gst_rate: po.gst_rate,
      status: po.status, issued_at: po.issued_at,
    } as any)
    .select().single();
  if (error) {
    console.error("[PO] create error:", error);
    throw error;
  }

  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item) => ({
      company_id: companyId,
      po_id: (newPO as any).id, serial_number: item.serial_number, description: item.description,
      item_id: item.item_id || null,
      drawing_number: item.drawing_number || null, quantity: item.quantity, unit: item.unit,
      unit_price: item.unit_price, delivery_date: item.delivery_date || null,
      line_total: item.line_total, gst_rate: item.gst_rate, hsn_sac_code: item.hsn_sac_code || null,
    }));
    const { error: itemsError } = await supabase.from("po_line_items").insert(itemsToInsert as any);
    if (itemsError) {
      console.error("[PO] line items insert error:", itemsError);
      throw itemsError;
    }
  }
  return newPO as unknown as PurchaseOrder;
}

export async function updatePurchaseOrder(id: string, { po, lineItems }: CreatePOData) {
  const companyId = await getCompanyId();
  const { error } = await supabase.from("purchase_orders").update({
    po_number: po.po_number, po_date: po.po_date,
    vendor_id: po.vendor_id, vendor_name: po.vendor_name, vendor_address: po.vendor_address,
    vendor_gstin: po.vendor_gstin, vendor_state_code: po.vendor_state_code, vendor_phone: po.vendor_phone,
    reference_number: po.reference_number, payment_terms: po.payment_terms,
    delivery_address: po.delivery_address,
    delivery_contact_person: po.delivery_contact_person,
    delivery_contact_phone: po.delivery_contact_phone,
    special_instructions: po.special_instructions,
    internal_remarks: po.internal_remarks, sub_total: po.sub_total,
    additional_charges: po.additional_charges as any, taxable_value: po.taxable_value,
    igst_amount: po.igst_amount, cgst_amount: po.cgst_amount, sgst_amount: po.sgst_amount,
    total_gst: po.total_gst, grand_total: po.grand_total, gst_rate: po.gst_rate,
    status: po.status, issued_at: po.issued_at,
  } as any).eq("id", id);
  if (error) throw error;

  await supabase.from("po_line_items").delete().eq("po_id", id);
  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item) => ({
      company_id: companyId,
      po_id: id, serial_number: item.serial_number, description: item.description,
      item_id: item.item_id || null,
      drawing_number: item.drawing_number || null, quantity: item.quantity, unit: item.unit,
      unit_price: item.unit_price, delivery_date: item.delivery_date || null,
      line_total: item.line_total, gst_rate: item.gst_rate, hsn_sac_code: item.hsn_sac_code || null,
    }));
    const { error: itemsError } = await supabase.from("po_line_items").insert(itemsToInsert as any);
    if (itemsError) throw itemsError;
  }
}

export async function issuePurchaseOrder(id: string) {
  const { error } = await supabase.from("purchase_orders").update({ status: "issued", issued_at: new Date().toISOString() } as any).eq("id", id);
  if (error) throw error;
}

export async function cancelPurchaseOrder(id: string, reason: string) {
  const { error } = await supabase.from("purchase_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: reason } as any).eq("id", id);
  if (error) throw error;
}

export async function duplicatePurchaseOrder(id: string) {
  const original = await fetchPurchaseOrder(id);
  const nextNumber = await getNextPONumber();
  return createPurchaseOrder({
    po: { ...original, po_number: nextNumber, po_date: new Date().toISOString().split("T")[0], status: "draft", issued_at: null, cancelled_at: null, cancellation_reason: null },
    lineItems: (original.line_items || []).map((item) => ({ ...item, id: undefined, received_quantity: undefined as any, pending_quantity: undefined as any })),
  });
}

export async function fetchPOStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const { data: allPOs, error } = await supabase.from("purchase_orders").select("id, po_date, grand_total, status, issued_at");
  if (error) throw error;
  const pos = (allPOs ?? []) as any[];
  const active = pos.filter((p) => p.status !== "cancelled");
  const thisMonth = active.filter((p) => p.po_date >= monthStart);
  const open = active.filter((p) => ["draft", "issued", "partially_received"].includes(p.status));
  const totalValueThisMonth = thisMonth.reduce((s: number, p: any) => s + (Number(p.grand_total) || 0), 0);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const overdue = active.filter((p) => p.status === "issued" && p.issued_at && p.issued_at < thirtyDaysAgo);
  return { totalThisMonth: thisMonth.length, openPOs: open.length, totalValueThisMonth, overduePOs: overdue.length };
}

export async function softDeletePurchaseOrder(id: string) {
  const { error } = await supabase.from("purchase_orders").update({ status: "deleted" } as any).eq("id", id);
  if (error) throw error;
}

export async function updatePOPayment(
  id: string,
  data: { amount_paid: number; payment_date: string; payment_reference?: string; payment_notes?: string },
  grandTotal: number
) {
  const amount = Math.max(0, data.amount_paid ?? 0);
  // Explicit order avoids 'paid' when both amount and total are 0
  const paymentStatus: "unpaid" | "partial" | "paid" =
    amount <= 0 ? "unpaid" : amount >= grandTotal ? "paid" : "partial";

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      amount_paid: amount,
      payment_date: data.payment_date,
      payment_reference: data.payment_reference || null,
      payment_notes: data.payment_notes || null,
      payment_status: paymentStatus,
    } as any)
    .eq("id", id);

  if (error) {
    // Schema cache miss means the payment columns don't exist yet.
    // Run the migration SQL in Supabase SQL Editor then re-try:
    //   ALTER TABLE purchase_orders
    //     ADD COLUMN IF NOT EXISTS payment_status  TEXT CHECK (payment_status IN ('unpaid','partial','paid')) DEFAULT 'unpaid',
    //     ADD COLUMN IF NOT EXISTS amount_paid     NUMERIC(14,2) DEFAULT 0,
    //     ADD COLUMN IF NOT EXISTS payment_date    DATE,
    //     ADD COLUMN IF NOT EXISTS payment_reference TEXT,
    //     ADD COLUMN IF NOT EXISTS payment_notes   TEXT;
    //   NOTIFY pgrst, 'reload schema';
    if (
      error.message?.includes("schema cache") ||
      error.message?.includes("amount_paid") ||
      error.message?.includes("payment_status")
    ) {
      throw new Error(
        "Payment columns missing from database. Run the payment migration SQL in Supabase, then refresh."
      );
    }
    throw error;
  }
}
