import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";
import { getNextDocNumber } from "@/lib/doc-number-utils";

export interface GRNLineItem {
  id?: string;
  serial_number: number;
  po_line_item_id?: string;
  description: string;
  drawing_number?: string;
  unit: string;
  po_quantity: number;
  previously_received: number;
  pending_quantity: number;
  receiving_now: number;
  accepted_quantity: number;
  rejected_quantity: number;
  rejection_reason?: string;
  remarks?: string;
}

export interface GRN {
  id: string;
  grn_number: string;
  grn_date: string;
  po_id: string | null;
  po_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_invoice_number: string | null;
  vendor_invoice_date: string | null;
  vehicle_number: string | null;
  lr_reference: string | null;
  received_by: string | null;
  notes: string | null;
  total_received: number;
  total_accepted: number;
  total_rejected: number;
  status: string;
  recorded_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  line_items?: GRNLineItem[];
  job_card_id?: string | null;
  job_card_number?: string | null;
}

export interface GRNFilters {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchGRNs(filters: GRNFilters = {}) {
  const { search, status = "all", page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = supabase.from("grns").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (status && status !== "all") query = query.eq("status", status);
  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`grn_number.ilike.${term},vendor_name.ilike.${term},po_number.ilike.${term}`);
    }
  }
  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as unknown as GRN[], count: count ?? 0 };
}

export async function fetchGRN(id: string): Promise<GRN> {
  const { data: grn, error } = await supabase.from("grns").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: items, error: itemsError } = await supabase.from("grn_line_items").select("*").eq("grn_id", id).order("serial_number", { ascending: true });
  if (itemsError) throw itemsError;
  return { ...(grn as unknown as GRN), line_items: items as unknown as GRNLineItem[] };
}

export async function getNextGRNNumber(): Promise<string> {
  const companyId = await getCompanyId();
  return getNextDocNumber("grns", "grn_number", companyId, "grn_prefix");
}

export async function fetchOpenPOs() {
  const { data, error } = await supabase.from("purchase_orders").select("id, po_number, po_date, vendor_id, vendor_name, vendor_gstin, status, grand_total").in("status", ["issued", "partially_received"]).order("po_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function fetchPOLineItemsForGRN(poId: string) {
  const { data, error } = await supabase.from("po_line_items").select("*").eq("po_id", poId).order("serial_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as any[];
}

interface CreateGRNData {
  grn: Omit<GRN, "id" | "created_at" | "updated_at" | "line_items">;
  lineItems: GRNLineItem[];
}

export async function createGRN({ grn, lineItems }: CreateGRNData) {
  const companyId = await getCompanyId();
  const { data: newGRN, error } = await supabase.from("grns").insert({
    company_id: companyId,
    grn_number: grn.grn_number, grn_date: grn.grn_date,
    po_id: grn.po_id || null, po_number: grn.po_number || null,
    vendor_id: grn.vendor_id || null, vendor_name: grn.vendor_name || null,
    vendor_invoice_number: grn.vendor_invoice_number || null, vendor_invoice_date: grn.vendor_invoice_date || null,
    vehicle_number: grn.vehicle_number || null, lr_reference: grn.lr_reference || null,
    received_by: grn.received_by || null, notes: grn.notes || null,
    total_received: grn.total_received, total_accepted: grn.total_accepted, total_rejected: grn.total_rejected,
    status: grn.status, recorded_at: grn.recorded_at,
    job_card_id: grn.job_card_id ?? null,
    job_card_number: grn.job_card_number ?? null,
  } as any).select().single();
  if (error) throw error;

  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item) => ({
      company_id: companyId,
      grn_id: (newGRN as any).id, po_line_item_id: item.po_line_item_id || null,
      serial_number: item.serial_number, description: item.description,
      drawing_number: item.drawing_number || null, unit: item.unit,
      po_quantity: item.po_quantity, previously_received: item.previously_received,
      pending_quantity: item.pending_quantity, receiving_now: item.receiving_now,
      accepted_quantity: item.accepted_quantity, rejected_quantity: item.rejected_quantity,
      rejection_reason: item.rejection_reason || null, remarks: item.remarks || null,
    }));
    const { error: itemsError } = await supabase.from("grn_line_items").insert(itemsToInsert as any);
    if (itemsError) throw itemsError;
  }
  return newGRN as unknown as GRN;
}

export async function recordGRNAndUpdatePO(grnData: CreateGRNData) {
  const grn = await createGRN(grnData);
  const companyId = await getCompanyId();
  const today = new Date().toISOString().split("T")[0];

  for (const item of grnData.lineItems) {
    // Update PO line item received quantities
    if (item.po_line_item_id && item.accepted_quantity > 0) {
      const { data: poItem } = await supabase.from("po_line_items").select("received_quantity, quantity").eq("id", item.po_line_item_id).single();
      if (poItem) {
        const pi = poItem as any;
        const newReceived = (pi.received_quantity || 0) + item.accepted_quantity;
        const newPending = Math.max(0, pi.quantity - newReceived);
        await supabase.from("po_line_items").update({ received_quantity: newReceived, pending_quantity: newPending } as any).eq("id", item.po_line_item_id);
      }
    }

    // Stock update: look up item by drawing_revision (drawing_number on GRN line)
    if (item.accepted_quantity > 0 && item.drawing_number) {
      const { data: itemRecord } = await supabase
        .from("items")
        .select("id, item_code, description, current_stock, stock_raw_material")
        .eq("drawing_revision", item.drawing_number)
        .eq("company_id", companyId)
        .maybeSingle();

      if (itemRecord) {
        const rec = itemRecord as any;
        const newStock = (rec.current_stock ?? 0) + item.accepted_quantity;
        const newRawMat = (rec.stock_raw_material ?? 0) + item.accepted_quantity;
        await supabase.from("items").update({ current_stock: newStock, stock_raw_material: newRawMat } as any).eq("id", rec.id);
        await addStockLedgerEntry({
          item_id: rec.id,
          item_code: rec.item_code,
          item_description: rec.description,
          transaction_date: today,
          transaction_type: "grn_receipt",
          qty_in: item.accepted_quantity,
          qty_out: 0,
          balance_qty: newStock,
          unit_cost: 0,
          total_value: 0,
          reference_type: "grn",
          reference_id: grn.id,
          reference_number: grn.grn_number,
          notes: `GRN receipt: ${grn.grn_number}`,
          created_by: null,
          from_state: null,
          to_state: "raw_material",
        });
      }
    }
  }

  if (grnData.grn.po_id) await recalculatePOStatus(grnData.grn.po_id);
  return grn;
}

async function recalculatePOStatus(poId: string) {
  const { data: lineItems } = await supabase.from("po_line_items").select("quantity, received_quantity").eq("po_id", poId);
  if (!lineItems || lineItems.length === 0) return;
  let allReceived = true, anyReceived = false;
  for (const item of lineItems as any[]) {
    if ((item.received_quantity || 0) < (item.quantity || 0)) allReceived = false;
    if ((item.received_quantity || 0) > 0) anyReceived = true;
  }
  const newStatus = allReceived ? "fully_received" : anyReceived ? "partially_received" : "issued";
  await supabase.from("purchase_orders").update({ status: newStatus } as any).eq("id", poId);
}

export async function fetchGRNsForPO(poId: string): Promise<GRN[]> {
  const { data, error } = await supabase.from("grns").select("*").eq("po_id", poId).order("grn_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as GRN[];
}

export async function fetchGRNStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const { data: allGRNs, error } = await supabase.from("grns").select("id, grn_date, status, total_accepted, total_rejected");
  if (error) throw error;
  const grns = (allGRNs ?? []) as any[];
  const active = grns.filter((g) => g.status !== "cancelled" && g.status !== "deleted");
  const thisMonth = active.filter((g) => g.grn_date >= monthStart);
  return {
    totalThisMonth: thisMonth.length,
    totalAccepted: thisMonth.reduce((s: number, g: any) => s + (g.total_accepted || 0), 0),
    totalRejected: thisMonth.reduce((s: number, g: any) => s + (g.total_rejected || 0), 0),
    pendingVerification: active.filter((g) => g.status === "recorded").length,
  };
}

export async function fetchGrnsForJobCard(jobCardId: string): Promise<GRN[]> {
  const { data, error } = await supabase
    .from("grns")
    .select("*")
    .eq("job_card_id", jobCardId)
    .order("grn_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as GRN[];
}

export async function softDeleteGRN(id: string) {
  const { error } = await supabase.from("grns").update({ status: "deleted" } as any).eq("id", id);
  if (error) throw error;
}
