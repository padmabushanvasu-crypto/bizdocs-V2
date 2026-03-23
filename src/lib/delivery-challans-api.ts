import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";
import { getNextDocNumber } from "@/lib/doc-number-utils";

export interface DCLineItem {
  id?: string;
  serial_number: number;
  item_code?: string;
  description: string;
  drawing_number?: string;
  hsn_sac_code?: string;
  unit?: string;
  quantity: number;
  rate: number;
  amount: number;
  remarks?: string;
  nature_of_process?: string;
  // Quantity in multiple units
  qty_nos?: number;
  qty_kg?: number;
  qty_kgs?: number;
  qty_sft?: number;
  material_type?: string;
  returned_qty_nos?: number;
  returned_qty_kg?: number;
  returned_qty_sft?: number;
}

export interface DeliveryChallan {
  id: string;
  dc_number: string;
  dc_date: string;
  dc_type: string;
  party_id: string | null;
  party_name: string | null;
  party_address: string | null;
  party_gstin: string | null;
  party_state_code: string | null;
  party_phone: string | null;
  reference_number: string | null;
  approximate_value: number;
  special_instructions: string | null;
  internal_remarks: string | null;
  return_due_date: string | null;
  nature_of_job_work: string | null;
  total_items: number;
  total_qty: number;
  status: string;
  issued_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  vehicle_number?: string | null;
  driver_name?: string | null;
  lo_number?: string | null;
  approx_value?: number | null;
  sub_total?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total_gst?: number;
  grand_total?: number;
  gst_rate?: number;
  po_reference?: string | null;
  po_date?: string | null;
  challan_category?: string;
  prepared_by?: string | null;
  checked_by?: string | null;
  line_items?: DCLineItem[];
}

export interface DCReturn {
  id: string;
  dc_id: string;
  return_date: string;
  received_by: string | null;
  notes: string | null;
  created_at: string;
  items?: DCReturnItem[];
}

export interface DCReturnItem {
  id?: string;
  return_id?: string;
  dc_line_item_id: string;
  returned_nos: number;
  returned_kg: number;
  returned_sft: number;
  remarks?: string;
}

export interface DCFilters {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchDeliveryChallans(filters: DCFilters = {}) {
  const { search, status = "all", page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("delivery_challans").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (status && status !== "all" && status !== "overdue") query = query.eq("status", status);
  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`dc_number.ilike.${term},party_name.ilike.${term}`);
    }
  }
  const { data, error, count } = await query;
  if (error) throw error;
  let dcs = (data ?? []) as unknown as DeliveryChallan[];
  if (status === "overdue") {
    const today = new Date().toISOString().split("T")[0];
    dcs = dcs.filter((dc) => dc.return_due_date && dc.return_due_date < today && !["fully_returned", "cancelled"].includes(dc.status));
  }
  return { data: dcs, count: count ?? 0 };
}

export async function fetchDeliveryChallan(id: string): Promise<DeliveryChallan> {
  const { data: dc, error } = await supabase.from("delivery_challans").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: items, error: itemsError } = await supabase.from("dc_line_items").select("*").eq("dc_id", id).order("serial_number", { ascending: true });
  if (itemsError) throw itemsError;
  return { ...(dc as unknown as DeliveryChallan), line_items: items as unknown as DCLineItem[] };
}

export async function getNextDCNumber(): Promise<string> {
  const companyId = await getCompanyId();
  return getNextDocNumber("delivery_challans", "dc_number", companyId);
}

interface CreateDCData {
  dc: Omit<DeliveryChallan, "id" | "created_at" | "updated_at" | "line_items">;
  lineItems: DCLineItem[];
}

export async function createDeliveryChallan({ dc, lineItems }: CreateDCData) {
  const companyId = await getCompanyId();
  const { data: newDC, error } = await supabase.from("delivery_challans").insert({
    company_id: companyId,
    dc_number: dc.dc_number, dc_date: dc.dc_date, dc_type: dc.dc_type,
    party_id: dc.party_id, party_name: dc.party_name, party_address: dc.party_address,
    party_gstin: dc.party_gstin, party_state_code: dc.party_state_code, party_phone: dc.party_phone,
    reference_number: dc.reference_number, approximate_value: dc.approximate_value,
    special_instructions: dc.special_instructions, internal_remarks: dc.internal_remarks,
    return_due_date: dc.return_due_date, nature_of_job_work: dc.nature_of_job_work,
    total_items: dc.total_items, total_qty: dc.total_qty, status: dc.status, issued_at: dc.issued_at,
    vehicle_number: dc.vehicle_number || null, driver_name: dc.driver_name || null,
    lo_number: dc.lo_number || null, approx_value: dc.approx_value || null,
    sub_total: dc.sub_total || 0, cgst_amount: dc.cgst_amount || 0, sgst_amount: dc.sgst_amount || 0,
    igst_amount: dc.igst_amount || 0, total_gst: dc.total_gst || 0, grand_total: dc.grand_total || 0,
    gst_rate: dc.gst_rate || 18, po_reference: dc.po_reference || null, po_date: dc.po_date || null,
    challan_category: dc.challan_category || "supply_on_approval",
    prepared_by: dc.prepared_by || null, checked_by: dc.checked_by || null,
  } as any).select().single();
  if (error) throw error;

  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item) => ({
      company_id: companyId,
      dc_id: (newDC as any).id, serial_number: item.serial_number, description: item.description,
      item_code: item.item_code || null, hsn_sac_code: item.hsn_sac_code || null,
      unit: item.unit || "NOS", quantity: item.quantity || 0, rate: item.rate || 0, amount: item.amount || 0,
      drawing_number: item.drawing_number || null, remarks: item.remarks || null,
      qty_nos: item.qty_nos || item.quantity || 0, qty_kg: item.qty_kg || 0,
      qty_kgs: item.qty_kgs || null, qty_sft: item.qty_sft || null,
      nature_of_process: item.nature_of_process || null, material_type: item.material_type || "FINISH",
    }));
    const { error: itemsError } = await supabase.from("dc_line_items").insert(itemsToInsert as any);
    if (itemsError) throw itemsError;
  }
  return newDC as unknown as DeliveryChallan;
}

export async function updateDeliveryChallan(id: string, { dc, lineItems }: CreateDCData) {
  const companyId = await getCompanyId();
  const { error } = await supabase.from("delivery_challans").update({
    dc_number: dc.dc_number, dc_date: dc.dc_date, dc_type: dc.dc_type,
    party_id: dc.party_id, party_name: dc.party_name, party_address: dc.party_address,
    party_gstin: dc.party_gstin, party_state_code: dc.party_state_code, party_phone: dc.party_phone,
    reference_number: dc.reference_number, approximate_value: dc.approximate_value,
    special_instructions: dc.special_instructions, internal_remarks: dc.internal_remarks,
    return_due_date: dc.return_due_date, nature_of_job_work: dc.nature_of_job_work,
    total_items: dc.total_items, total_qty: dc.total_qty, status: dc.status, issued_at: dc.issued_at,
    vehicle_number: dc.vehicle_number || null, driver_name: dc.driver_name || null,
    lo_number: dc.lo_number || null, approx_value: dc.approx_value || null,
    sub_total: dc.sub_total || 0, cgst_amount: dc.cgst_amount || 0, sgst_amount: dc.sgst_amount || 0,
    igst_amount: dc.igst_amount || 0, total_gst: dc.total_gst || 0, grand_total: dc.grand_total || 0,
    gst_rate: dc.gst_rate || 18, po_reference: dc.po_reference || null, po_date: dc.po_date || null,
    challan_category: dc.challan_category || "supply_on_approval",
    prepared_by: dc.prepared_by || null, checked_by: dc.checked_by || null,
  } as any).eq("id", id);
  if (error) throw error;
  await supabase.from("dc_line_items").delete().eq("dc_id", id);
  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item) => ({
      company_id: companyId,
      dc_id: id, serial_number: item.serial_number, description: item.description,
      item_code: item.item_code || null, hsn_sac_code: item.hsn_sac_code || null,
      unit: item.unit || "NOS", quantity: item.quantity || 0, rate: item.rate || 0, amount: item.amount || 0,
      drawing_number: item.drawing_number || null, remarks: item.remarks || null,
      qty_nos: item.qty_nos || item.quantity || 0, qty_kg: item.qty_kg || 0,
      qty_kgs: item.qty_kgs || null, qty_sft: item.qty_sft || null,
      nature_of_process: item.nature_of_process || null, material_type: item.material_type || "FINISH",
    }));
    const { error: itemsError } = await supabase.from("dc_line_items").insert(itemsToInsert as any);
    if (itemsError) throw itemsError;
  }
}

export async function issueDeliveryChallan(id: string) {
  const { error } = await supabase.from("delivery_challans").update({ status: "issued", issued_at: new Date().toISOString() } as any).eq("id", id);
  if (error) throw error;

  // Stock deduction: items sent out on this DC
  const companyId = await getCompanyId();
  const today = new Date().toISOString().split("T")[0];
  const dc = await fetchDeliveryChallan(id);
  const lineItems = dc.line_items ?? [];

  for (const line of lineItems) {
    const qty: number = line.qty_nos ?? line.quantity ?? 0;
    // Only process lines with a known item_code
    if (qty <= 0 || !line.item_code) continue;

    const { data: itemRecord } = await supabase
      .from("items")
      .select("id, item_code, description, current_stock")
      .eq("item_code", line.item_code)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!itemRecord) continue;
    const rec = itemRecord as any;
    const newStock = Math.max(0, (rec.current_stock ?? 0) - qty);
    await supabase.from("items").update({ current_stock: newStock } as any).eq("id", rec.id);
    await addStockLedgerEntry({
      item_id: rec.id,
      item_code: rec.item_code,
      item_description: rec.description,
      transaction_date: today,
      transaction_type: "dc_issue",
      qty_in: 0,
      qty_out: qty,
      balance_qty: newStock,
      unit_cost: 0,
      total_value: 0,
      reference_type: "delivery_challan",
      reference_id: id,
      reference_number: dc.dc_number,
      notes: `DC issued: ${dc.dc_number}`,
      created_by: null,
    });
  }
}

export async function cancelDeliveryChallan(id: string, reason: string) {
  const { error } = await supabase.from("delivery_challans").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: reason } as any).eq("id", id);
  if (error) throw error;
}

export async function fetchDCReturns(dcId: string): Promise<DCReturn[]> {
  const { data: returns, error } = await supabase.from("dc_returns").select("*").eq("dc_id", dcId).order("return_date", { ascending: false });
  if (error) throw error;
  const result: DCReturn[] = [];
  for (const ret of (returns ?? []) as any[]) {
    const { data: items, error: itemsErr } = await supabase.from("dc_return_items").select("*").eq("return_id", ret.id);
    if (itemsErr) throw itemsErr;
    result.push({ ...ret, items: items as unknown as DCReturnItem[] });
  }
  return result;
}

export async function recordDCReturn(dcId: string, returnDate: string, receivedBy: string, notes: string, items: DCReturnItem[]) {
  const companyId = await getCompanyId();
  const { data: newReturn, error } = await supabase.from("dc_returns").insert({ company_id: companyId, dc_id: dcId, return_date: returnDate, received_by: receivedBy, notes } as any).select().single();
  if (error) throw error;

  if (items.length > 0) {
    const returnItems = items.map((item) => ({
      company_id: companyId, return_id: (newReturn as any).id, dc_line_item_id: item.dc_line_item_id,
      returned_nos: item.returned_nos, returned_kg: item.returned_kg, returned_sft: item.returned_sft,
      remarks: item.remarks || null,
    }));
    const { error: itemsErr } = await supabase.from("dc_return_items").insert(returnItems as any);
    if (itemsErr) throw itemsErr;
  }

  // Fetch DC number once for ledger reference
  const { data: dcHeader } = await supabase.from("delivery_challans").select("dc_number").eq("id", dcId).single();
  const dcNumber = (dcHeader as any)?.dc_number ?? "";

  for (const item of items) {
    if (item.returned_nos > 0 || item.returned_kg > 0 || item.returned_sft > 0) {
      const { data: lineItem } = await supabase
        .from("dc_line_items")
        .select("returned_qty_nos, returned_qty_kg, returned_qty_sft, item_code, description")
        .eq("id", item.dc_line_item_id)
        .single();
      if (lineItem) {
        const li = lineItem as any;
        await supabase.from("dc_line_items").update({
          returned_qty_nos: (li.returned_qty_nos || 0) + item.returned_nos,
          returned_qty_kg: (li.returned_qty_kg || 0) + item.returned_kg,
          returned_qty_sft: (li.returned_qty_sft || 0) + item.returned_sft,
        } as any).eq("id", item.dc_line_item_id);

        // Stock return: add returned NOS qty back to item stock
        if (item.returned_nos > 0 && li.item_code) {
          const { data: itemRecord } = await supabase
            .from("items")
            .select("id, item_code, description, current_stock")
            .eq("item_code", li.item_code)
            .eq("company_id", companyId)
            .maybeSingle();

          if (itemRecord) {
            const rec = itemRecord as any;
            const newStock = (rec.current_stock ?? 0) + item.returned_nos;
            await supabase.from("items").update({ current_stock: newStock } as any).eq("id", rec.id);
            await addStockLedgerEntry({
              item_id: rec.id,
              item_code: rec.item_code,
              item_description: rec.description,
              transaction_date: returnDate,
              transaction_type: "dc_return",
              qty_in: item.returned_nos,
              qty_out: 0,
              balance_qty: newStock,
              unit_cost: 0,
              total_value: 0,
              reference_type: "delivery_challan",
              reference_id: dcId,
              reference_number: dcNumber,
              notes: `DC return: ${dcNumber}`,
              created_by: null,
            });
          }
        }
      }
    }
  }
  await recalculateDCStatus(dcId);
}

async function recalculateDCStatus(dcId: string) {
  const { data: lineItems } = await supabase.from("dc_line_items").select("qty_nos, qty_kg, qty_sft, returned_qty_nos, returned_qty_kg, returned_qty_sft").eq("dc_id", dcId);
  if (!lineItems) return;
  let allReturned = true;
  let anyReturned = false;
  for (const item of lineItems as any[]) {
    if ((item.qty_nos || 0) - (item.returned_qty_nos || 0) > 0 || (item.qty_kg || 0) - (item.returned_qty_kg || 0) > 0 || (item.qty_sft || 0) - (item.returned_qty_sft || 0) > 0) allReturned = false;
    if ((item.returned_qty_nos || 0) > 0 || (item.returned_qty_kg || 0) > 0 || (item.returned_qty_sft || 0) > 0) anyReturned = true;
  }
  const newStatus = allReturned ? "fully_returned" : anyReturned ? "partially_returned" : "issued";
  await supabase.from("delivery_challans").update({ status: newStatus } as any).eq("id", dcId);
}

export async function fetchDCStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];
  const { data: allDCs, error } = await supabase.from("delivery_challans").select("id, dc_date, status, return_due_date, total_items");
  if (error) throw error;
  const dcs = (allDCs ?? []) as any[];
  const active = dcs.filter((d) => d.status !== "cancelled" && d.status !== "deleted");
  const thisMonth = active.filter((d) => d.dc_date >= monthStart);
  const open = active.filter((d) => ["issued", "partially_returned"].includes(d.status));
  const overdue = active.filter((d) => d.return_due_date && d.return_due_date < today && !["fully_returned"].includes(d.status));
  const pendingReturns = active.filter((d) => d.status === "partially_returned");
  return { totalThisMonth: thisMonth.length, openDCs: open.length, overdueDCs: overdue.length, pendingReturns: pendingReturns.length };
}

export async function softDeleteDeliveryChallan(id: string) {
  const { error } = await supabase.from("delivery_challans").update({ status: "deleted" } as any).eq("id", id);
  if (error) throw error;
}

export async function fetchProcessSuggestions(): Promise<string[]> {
  const { data, error } = await supabase.from("dc_line_items").select("nature_of_process").not("nature_of_process", "is", null).limit(100);
  if (error) return [];
  const processes = new Set<string>();
  for (const item of (data ?? []) as any[]) {
    if (item.nature_of_process) processes.add(item.nature_of_process);
  }
  return Array.from(processes);
}
