import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";
import { getNextDocNumber } from "@/lib/doc-number-utils";
import { updateStockBucket } from "@/lib/items-api";

const RETURNABLE_DC_TYPES = new Set([
  'job_work_143', 'job_work_out', 'job_work', 'sample', 'loan_borrow', 'returnable',
]);

export interface DCLineItem {
  id?: string;
  serial_number: number;
  item_id?: string | null;
  item_code?: string;
  description: string;
  drawing_number?: string;
  hsn_sac_code?: string;
  unit?: string;
  quantity: number;
  quantity_2?: number | null;
  unit_2?: string | null;
  returned_qty_2?: number | null;
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
  // Per-line Job Work fields
  job_work_id?: string | null;
  job_work_number?: string | null;
  job_work_step_id?: string | null;
  qty_received?: number | null;
  qty_accepted?: number | null;
  qty_rejected?: number | null;
  return_status?: string | null;
  rejection_reason?: string | null;
  stage_number?: number | null;
  stage_name?: string | null;
  is_rework?: boolean;
  rework_cycle?: number;
  parent_dc_line_id?: string | null;
  rejection_action?: string | null;
  processing_log_id?: string | null;
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
  party_contact_person?: string | null;
  party_email?: string | null;
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
  // Approval workflow
  approval_requested_at?: string | null;
  approval_requested_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejection_reason?: string | null;
  rejection_noted?: boolean;
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

export interface DCLineItemWithDC {
  id: string;
  dc_id: string;
  dc_number: string;
  dc_date: string;
  party_name: string | null;
  serial_number: number;
  description: string;
  drawing_number: string | null;
  item_code: string | null;
  quantity: number;
  unit: string | null;
  nature_of_process: string | null;
  job_work_step_id: string | null;
  qty_received: number | null;
  qty_accepted: number | null;
  qty_rejected: number | null;
  return_status: string | null;
}

export interface ComponentProcessingLog {
  id: string;
  company_id: string;
  item_id: string | null;
  drawing_number: string | null;
  batch_ref: string | null;
  total_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  scrapped_qty: number;
  current_stage: number;
  total_stages: number;
  current_status: string;
  last_dc_id: string | null;
  last_return_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnhancedReturnData {
  qty_returning: number;
  qty_accepted: number;
  qty_rejected: number;
  rejection_reason: string | null;
  accepted_action: string; // 'next_stage'|'hold'|'finished_goods'|'split'
  rejected_action: string | null; // 'rework_same_vendor'|'rework_different_vendor'|'next_stage'|'scrap'|'hold'
  rejected_vendor_id?: string | null;
  rejected_vendor_name?: string | null;
  split_next_stage_qty?: number;
  split_finished_qty?: number;
  split_hold_qty?: number;
  dc_id: string;
  dc_number: string;
  item_id: string | null;
  drawing_number: string | null;
  current_stage_number: number | null;
  current_rework_cycle: number;
  bom_stages: import('@/lib/bom-api').BomProcessingStage[];
}

export interface EnhancedReturnResult {
  nextDCPrefill: null | {
    dc_type: string;
    party_id: string | null;
    party_name: string | null;
    return_before_date: string;
    line_items: Array<{
      item_code: string;
      description: string;
      drawing_number: string;
      quantity: number;
      nature_of_process: string;
      stage_number: number;
      stage_name: string;
      is_rework: boolean;
      rework_cycle: number;
      parent_dc_line_id: string;
    }>;
  };
  reworkDCPrefill: null | {
    dc_type: string;
    party_id: string | null;
    party_name: string | null;
    return_before_date: string;
    line_items: Array<{
      item_code: string;
      description: string;
      drawing_number: string;
      quantity: number;
      nature_of_process: string;
      stage_number: number;
      stage_name: string;
      is_rework: boolean;
      rework_cycle: number;
      parent_dc_line_id: string;
    }>;
  };
}

export interface DCFilters {
  search?: string;
  status?: string;
  drawingNumber?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchDeliveryChallans(filters: DCFilters = {}) {
  const companyId = await getCompanyId();
  if (!companyId) return { data: [], count: 0 };
  const { search, status = "all", drawingNumber, page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let drawingDcIds: string[] | null = null;
  if (drawingNumber?.trim()) {
    const term = sanitizeSearchTerm(drawingNumber);
    if (term) {
      const { data: lineMatches } = await supabase
        .from("dc_line_items")
        .select("dc_id")
        .eq("company_id", companyId)
        .ilike("drawing_number", `%${term}%`);
      drawingDcIds = [...new Set(((lineMatches ?? []) as any[]).map((r) => r.dc_id).filter(Boolean))] as string[];
      if (drawingDcIds.length === 0) return { data: [], count: 0 };
    }
  }

  let query = supabase.from("delivery_challans").select("*", { count: "exact" }).order("created_at", { ascending: false });
  query = query.neq("status", "deleted");
  if (status && status !== "all" && status !== "overdue") query = query.eq("status", status);
  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`dc_number.ilike.${term},party_name.ilike.${term}`);
    }
  }
  if (drawingDcIds) query = query.in("id", drawingDcIds);
  query = query.range(from, to);
  const { data, error, count } = await query;
  if (error) throw error;
  let dcs = (data ?? []) as unknown as DeliveryChallan[];
  if (status === "overdue") {
    const today = new Date().toISOString().split("T")[0];
    dcs = dcs.filter((dc) => dc.return_due_date && dc.return_due_date < today && !["fully_returned", "cancelled"].includes(dc.status));
  }
  return { data: dcs, count: count ?? 0 };
}

// Fetch all DCs in a date range (no pagination) for the Export modal —
// embeds full line items.
export async function fetchAllDCsForExport(
  dateFrom: string,
  dateTo: string,
  companyId: string
): Promise<DeliveryChallan[]> {
  const { data, error } = await supabase
    .from("delivery_challans")
    .select(
      `*, line_items:dc_line_items(serial_number, description, drawing_number, quantity, unit, rate, amount, nature_of_process, qty_nos, qty_kg, qty_sft, returned_qty_nos, returned_qty_kg, returned_qty_sft)`
    )
    .eq("company_id", companyId)
    .neq("status", "deleted")
    .gte("dc_date", dateFrom)
    .lte("dc_date", dateTo)
    .order("dc_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DeliveryChallan[];
}

// Fetch DCs that have at least one return — i.e. status partially_returned or
// fully_returned — within the given date range. Includes line items with the
// returned-qty columns so the report can show qty pending per line.
export async function fetchAllDCReturnsForExport(
  dateFrom: string,
  dateTo: string,
  companyId: string
): Promise<DeliveryChallan[]> {
  const { data, error } = await supabase
    .from("delivery_challans")
    .select(
      `*, line_items:dc_line_items(serial_number, description, drawing_number, quantity, unit, rate, amount, nature_of_process, qty_nos, qty_kg, qty_sft, returned_qty_nos, returned_qty_kg, returned_qty_sft)`
    )
    .eq("company_id", companyId)
    .in("status", ["partially_returned", "fully_returned"])
    .gte("dc_date", dateFrom)
    .lte("dc_date", dateTo)
    .order("dc_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DeliveryChallan[];
}

export async function fetchDeliveryChallan(id: string): Promise<DeliveryChallan> {
  const { data: dc, error } = await supabase.from("delivery_challans").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: items, error: itemsError } = await supabase.from("dc_line_items").select("*").eq("dc_id", id).order("serial_number", { ascending: true });
  if (itemsError) throw itemsError;
  return { ...(dc as unknown as DeliveryChallan), line_items: items as unknown as DCLineItem[] };
}

/**
 * @deprecated The DB trigger trg_delivery_challans_assign_number assigns
 *   dc_number on insert. Pass `dc_number: ''` to createDeliveryChallan and
 *   read the value back from the returned row.
 */
export async function getNextDCNumber(): Promise<string> {
  const companyId = await getCompanyId();
  return getNextDocNumber("delivery_challans", "dc_number", companyId, "dc_prefix");
}

interface CreateDCData {
  dc: Omit<DeliveryChallan, "id" | "created_at" | "updated_at" | "line_items">;
  lineItems: DCLineItem[];
}

export async function createDeliveryChallan({ dc, lineItems }: CreateDCData) {
  const companyId = await getCompanyId();
  let newDC: any;
  try {
    const { data, error } = await supabase.from("delivery_challans").insert({
      company_id: companyId,
      // dc_number is assigned by trg_delivery_challans_assign_number on
      // insert. Manual override is preserved if a non-empty value is
      // supplied (e.g. legacy import paths).
      dc_number: dc.dc_number && dc.dc_number.trim() !== "" ? dc.dc_number : "",
      dc_date: dc.dc_date, dc_type: dc.dc_type,
      party_id: dc.party_id || null, party_name: dc.party_name, party_address: dc.party_address,
      party_gstin: dc.party_gstin, party_state_code: dc.party_state_code, party_phone: dc.party_phone,
      party_contact_person: dc.party_contact_person || null,
      reference_number: dc.reference_number, approximate_value: dc.approximate_value,
      special_instructions: dc.special_instructions, internal_remarks: dc.internal_remarks,
      return_due_date: dc.return_due_date, nature_of_job_work: dc.nature_of_job_work,
      total_items: dc.total_items, total_qty: dc.total_qty, status: dc.status, issued_at: dc.issued_at,
      vehicle_number: dc.vehicle_number || null, driver_name: dc.driver_name || null,
      approx_value: dc.approx_value || null,
      sub_total: dc.sub_total || 0, cgst_amount: dc.cgst_amount || 0, sgst_amount: dc.sgst_amount || 0,
      igst_amount: dc.igst_amount || 0, total_gst: dc.total_gst || 0, grand_total: dc.grand_total || 0,
      gst_rate: dc.gst_rate || 18, po_reference: dc.po_reference || null, po_date: dc.po_date || null,
      challan_category: dc.challan_category || "supply_on_approval",
      prepared_by: dc.prepared_by || null, checked_by: dc.checked_by || null,
    } as any).select().single();
    if (error) {
      console.error("[DC] create error:", error);
      throw error;
    }
    newDC = data;
  } catch (err) {
    console.error("[DC] createDeliveryChallan failed:", err);
    throw err;
  }

  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item) => ({
      company_id: companyId,
      dc_id: (newDC as any).id, serial_number: item.serial_number, description: item.description,
      item_id: item.item_id || null,
      item_code: item.item_code || null, hsn_sac_code: item.hsn_sac_code || null,
      unit: item.unit || "NOS", quantity: item.quantity || 0, rate: item.rate || 0, amount: item.amount || 0,
      quantity_2: item.quantity_2 ?? null, unit_2: item.unit_2 ?? null,
      drawing_number: item.drawing_number || null, remarks: item.remarks || null,
      qty_nos: item.qty_nos || item.quantity || 0, qty_kg: item.qty_kg || 0,
      qty_kgs: item.qty_kgs || null, qty_sft: item.qty_sft || null,
      nature_of_process: item.nature_of_process || null, material_type: item.material_type || "FINISH",
      job_work_id: item.job_work_id || null,
      job_work_number: item.job_work_number || null,
      job_work_step_id: item.job_work_step_id || null,
      return_status: item.return_status || 'pending',
      stage_number: item.stage_number ?? null,
      stage_name: item.stage_name ?? null,
      is_rework: item.is_rework ?? false,
      rework_cycle: item.rework_cycle ?? 1,
      parent_dc_line_id: item.parent_dc_line_id ?? null,
    }));
    const { error: itemsError } = await supabase.from("dc_line_items").insert(itemsToInsert as any);
    if (itemsError) throw itemsError;
  }
  return newDC as unknown as DeliveryChallan;
}

export async function updateDeliveryChallan(id: string, { dc, lineItems }: CreateDCData) {
  const companyId = await getCompanyId();

  // Fetch current status and capture original lines BEFORE modification (for issued DC stock delta)
  const { data: currentDC } = await supabase
    .from('delivery_challans')
    .select('status')
    .eq('id', id)
    .single();
  const isIssued = (currentDC as any)?.status === 'issued';

  type OrigLine = { item_id: string | null; qty_nos: number | null; quantity: number | null };
  let originalLines: OrigLine[] = [];
  if (isIssued && RETURNABLE_DC_TYPES.has(dc.dc_type)) {
    const { data: origLines } = await supabase
      .from('dc_line_items')
      .select('item_id, qty_nos, quantity')
      .eq('dc_id', id);
    originalLines = (origLines ?? []) as OrigLine[];
  }

  const { error } = await supabase.from("delivery_challans").update({
    dc_number: dc.dc_number, dc_date: dc.dc_date, dc_type: dc.dc_type,
    party_id: dc.party_id, party_name: dc.party_name, party_address: dc.party_address,
    party_gstin: dc.party_gstin, party_state_code: dc.party_state_code, party_phone: dc.party_phone,
    party_contact_person: dc.party_contact_person || null,
    reference_number: dc.reference_number, approximate_value: dc.approximate_value,
    special_instructions: dc.special_instructions, internal_remarks: dc.internal_remarks,
    return_due_date: dc.return_due_date, nature_of_job_work: dc.nature_of_job_work,
    total_items: dc.total_items, total_qty: dc.total_qty, status: dc.status, issued_at: dc.issued_at,
    vehicle_number: dc.vehicle_number || null, driver_name: dc.driver_name || null,
    approx_value: dc.approx_value || null,
    sub_total: dc.sub_total || 0, cgst_amount: dc.cgst_amount || 0, sgst_amount: dc.sgst_amount || 0,
    igst_amount: dc.igst_amount || 0, total_gst: dc.total_gst || 0, grand_total: dc.grand_total || 0,
    gst_rate: dc.gst_rate || 18, po_reference: dc.po_reference || null, po_date: dc.po_date || null,
    challan_category: dc.challan_category || "supply_on_approval",
    prepared_by: dc.prepared_by || null, checked_by: dc.checked_by || null,
  } as any).eq("id", id);
  if (error) {
    console.error("[DC] update error:", error);
    throw error;
  }
  await supabase.from("dc_line_items").delete().eq("dc_id", id);
  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item) => ({
      company_id: companyId,
      dc_id: id, serial_number: item.serial_number, description: item.description,
      item_id: item.item_id || null,
      item_code: item.item_code || null, hsn_sac_code: item.hsn_sac_code || null,
      unit: item.unit || "NOS", quantity: item.quantity || 0, rate: item.rate || 0, amount: item.amount || 0,
      quantity_2: item.quantity_2 ?? null, unit_2: item.unit_2 ?? null,
      drawing_number: item.drawing_number || null, remarks: item.remarks || null,
      qty_nos: item.qty_nos || item.quantity || 0, qty_kg: item.qty_kg || 0,
      qty_kgs: item.qty_kgs || null, qty_sft: item.qty_sft || null,
      nature_of_process: item.nature_of_process || null, material_type: item.material_type || "FINISH",
      job_work_id: item.job_work_id || null,
      job_work_number: item.job_work_number || null,
      job_work_step_id: item.job_work_step_id || null,
      return_status: item.return_status || 'pending',
      stage_number: item.stage_number ?? null,
      stage_name: item.stage_name ?? null,
      is_rework: item.is_rework ?? false,
      rework_cycle: item.rework_cycle ?? 1,
      parent_dc_line_id: item.parent_dc_line_id ?? null,
    }));
    const { error: itemsError } = await supabase.from("dc_line_items").insert(itemsToInsert as any);
    if (itemsError) throw itemsError;
  }

  // Part 7: apply stock bucket deltas when editing an issued returnable DC
  if (isIssued && RETURNABLE_DC_TYPES.has(dc.dc_type) && originalLines.length > 0) {
    const today = new Date().toISOString().split('T')[0];

    // Build item_id → original qty map
    const origMap = new Map<string, number>();
    for (const ol of originalLines) {
      if (ol.item_id) {
        origMap.set(ol.item_id, (ol.qty_nos ?? ol.quantity ?? 0));
      }
    }

    // Build item_id → new qty map
    const newMap = new Map<string, number>();
    for (const nl of lineItems) {
      if (nl.item_id) {
        const qty = (nl.qty_nos ?? nl.quantity ?? 0);
        newMap.set(nl.item_id, (newMap.get(nl.item_id) ?? 0) + qty);
      }
    }

    const allItemIds = new Set([...origMap.keys(), ...newMap.keys()]);
    for (const itemId of allItemIds) {
      const origQty = origMap.get(itemId) ?? 0;
      const newQty = newMap.get(itemId) ?? 0;
      const delta = newQty - origQty;
      if (delta === 0) continue;

      if (delta > 0) {
        // Quantity increased — deduct more from free, add to in_process
        await updateStockBucket(itemId, 'free', -delta).catch(console.error);
        await updateStockBucket(itemId, 'in_process', +delta).catch(console.error);
      } else {
        // Quantity decreased or item removed — return from in_process to free
        await updateStockBucket(itemId, 'in_process', delta).catch(console.error);
        await updateStockBucket(itemId, 'free', Math.abs(delta)).catch(console.error);
      }

      try {
        await addStockLedgerEntry({
          item_id: itemId,
          item_code: null,
          item_description: null,
          transaction_date: today,
          transaction_type: 'manual_adjustment',
          qty_in: delta < 0 ? Math.abs(delta) : 0,
          qty_out: delta > 0 ? delta : 0,
          balance_qty: 0,
          unit_cost: 0,
          total_value: 0,
          reference_type: 'delivery_challan',
          reference_id: id,
          reference_number: dc.dc_number,
          notes: 'DC quantity edited after issuance — net delta applied',
          created_by: null,
        });
      } catch { /* ignore */ }
    }
  }
}

export async function issueDeliveryChallan(id: string) {
  const { data: dcCheck, error: fetchErr } = await supabase
    .from('delivery_challans')
    .select('id, approved_at')
    .eq('id', id)
    .single();

  if (fetchErr || !dcCheck) {
    throw new Error('DC not found');
  }
  if (!(dcCheck as any).approved_at) {
    throw new Error(
      'This DC must be approved before it can be issued.'
    );
  }

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
    // Bucket updates for returnable DCs: free → in_process
    const isReturnable = RETURNABLE_DC_TYPES.has(dc.dc_type);
    if (isReturnable) {
      await updateStockBucket(rec.id, 'free', -qty).catch(console.error);
      await updateStockBucket(rec.id, 'in_process', +qty).catch(console.error);
    }
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
      from_state: isReturnable ? 'free' : null,
      to_state: isReturnable ? 'in_process' : null,
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

  // Fetch DC number and type once for ledger reference and bucket logic
  const { data: dcHeader } = await supabase.from("delivery_challans").select("dc_number, dc_type").eq("id", dcId).single();
  const dcNumber = (dcHeader as any)?.dc_number ?? "";
  const dcType: string = (dcHeader as any)?.dc_type ?? "";

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
            // Phase 13: bucket updates for returnable DC returns
            if (RETURNABLE_DC_TYPES.has(dcType)) {
              await updateStockBucket(rec.id, 'in_process', -item.returned_nos).catch(console.error);
              await updateStockBucket(rec.id, 'free', +item.returned_nos).catch(console.error);
            }
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
  const { data: lineItems } = await supabase.from("dc_line_items")
    .select("qty_nos, qty_kg, qty_sft, returned_qty_nos, returned_qty_kg, returned_qty_sft, return_status")
    .eq("dc_id", dcId);
  if (!lineItems) return;
  const items = lineItems as any[];
  let allReturned = true;
  let anyReturned = false;
  for (const item of items) {
    if ((item.qty_nos || 0) - (item.returned_qty_nos || 0) > 0 || (item.qty_kg || 0) - (item.returned_qty_kg || 0) > 0 || (item.qty_sft || 0) - (item.returned_qty_sft || 0) > 0) allReturned = false;
    if ((item.returned_qty_nos || 0) > 0 || (item.returned_qty_kg || 0) > 0 || (item.returned_qty_sft || 0) > 0) anyReturned = true;
  }
  const newStatus = allReturned ? "fully_returned" : anyReturned ? "partially_returned" : "issued";
  await supabase.from("delivery_challans").update({ status: newStatus } as any).eq("id", dcId);
}

export async function fetchDCStats() {
  const companyId = await getCompanyId();
  if (!companyId) return { totalThisMonth: 0, openDCs: 0, overdueDCs: 0, pendingReturns: 0 };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];
  // Push status filter to the DB. Both 'deleted' (softDeleteDeliveryChallan)
  // and 'cancelled' (cancelDeliveryChallan) are terminal and excluded from
  // every stat below. Matches prior JS-side filter exactly. dc_type is not
  // filtered here — DC stats are aggregate across all DC types (job_work_out,
  // job_work_143, returnable, etc.); the breakdown lives on the list page.
  const { data: allDCs, error } = await supabase
    .from("delivery_challans")
    .select("id, dc_date, status, return_due_date, total_items")
    .neq("status", "deleted")
    .neq("status", "cancelled");
  if (error) throw error;
  const dcs = (allDCs ?? []) as any[];
  const thisMonth = dcs.filter((d) => d.dc_date >= monthStart);
  const open = dcs.filter((d) => ["issued", "partially_returned"].includes(d.status));
  const overdue = dcs.filter((d) => d.return_due_date && d.return_due_date < today && !["fully_returned"].includes(d.status));
  const pendingReturns = dcs.filter((d) => d.status === "partially_returned");
  return { totalThisMonth: thisMonth.length, openDCs: open.length, overdueDCs: overdue.length, pendingReturns: pendingReturns.length };
}

export type DcDeleteStockAction = 'recalled' | 'immediate_return' | 'write_off';

export async function softDeleteDeliveryChallan(
  id: string,
  options: { deletion_reason?: string; stockAction?: DcDeleteStockAction } = {}
): Promise<void> {
  const { deletion_reason, stockAction } = options;
  const companyId = await getCompanyId();
  const today = new Date().toISOString().split('T')[0];

  if (stockAction) {
    const { data: dcHeader } = await supabase
      .from('delivery_challans')
      .select('dc_number')
      .eq('id', id)
      .single();
    const dcNumber = (dcHeader as any)?.dc_number ?? '';

    const { data: lines } = await supabase
      .from('dc_line_items')
      .select('item_id, item_code, description, qty_nos, quantity')
      .eq('dc_id', id);

    for (const line of (lines ?? []) as any[]) {
      if (!line.item_id) continue;
      const qty: number = line.qty_nos ?? line.quantity ?? 0;
      if (qty <= 0) continue;

      if (stockAction === 'recalled' || stockAction === 'immediate_return') {
        await updateStockBucket(line.item_id, 'in_process', -qty).catch(console.error);
        await updateStockBucket(line.item_id, 'free', +qty).catch(console.error);
        const notesLabel = stockAction === 'recalled'
          ? 'DC deleted — recalled before dispatch'
          : 'DC deleted — immediate vendor return';
        const notes = deletion_reason ? `${notesLabel}: ${deletion_reason}` : notesLabel;
        try {
          await addStockLedgerEntry({
            item_id: line.item_id,
            item_code: line.item_code ?? null,
            item_description: line.description ?? null,
            transaction_date: today,
            transaction_type: 'dc_return',
            qty_in: qty,
            qty_out: 0,
            balance_qty: 0,
            unit_cost: 0,
            total_value: 0,
            reference_type: 'delivery_challan',
            reference_id: id,
            reference_number: dcNumber,
            notes,
            created_by: null,
          });
        } catch { /* ignore */ }
      } else if (stockAction === 'write_off') {
        await updateStockBucket(line.item_id, 'in_process', -qty).catch(console.error);
        const notes = deletion_reason
          ? `DC deleted — stock written off: ${deletion_reason}`
          : 'DC deleted — stock written off';
        try {
          await addStockLedgerEntry({
            item_id: line.item_id,
            item_code: line.item_code ?? null,
            item_description: line.description ?? null,
            transaction_date: today,
            transaction_type: 'rejection_writeoff',
            qty_in: 0,
            qty_out: qty,
            balance_qty: 0,
            unit_cost: 0,
            total_value: 0,
            reference_type: 'delivery_challan',
            reference_id: id,
            reference_number: dcNumber,
            notes,
            created_by: null,
          });
        } catch { /* ignore */ }
      }
    }
  }

  const { error } = await (supabase as any)
    .from('delivery_challans')
    .update({ status: 'deleted', deletion_reason: deletion_reason ?? null })
    .eq('id', id);
  if (error) throw error;
}

export async function recordLineItemReturn(
  lineItemId: string,
  data: {
    qty_received: number;
    qty_accepted: number;
    qty_rejected: number;
    rejection_reason?: string;
    notes?: string;
  }
): Promise<void> {
  const companyId = await getCompanyId();
  const today = new Date().toISOString().split("T")[0];
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch line item
  const { data: lineItem, error: liErr } = await (supabase as any)
    .from("dc_line_items")
    .select("id, dc_id, job_work_id, job_work_step_id, item_code, description")
    .eq("id", lineItemId)
    .single();
  if (liErr) throw liErr;
  const li = lineItem as any;

  // 1. Update dc_line_items
  await (supabase as any).from("dc_line_items").update({
    qty_received: data.qty_received,
    qty_accepted: data.qty_accepted,
    qty_rejected: data.qty_rejected,
    return_status: "returned",
    rejection_reason: data.rejection_reason || null,
    returned_qty_nos: data.qty_accepted,
  }).eq("id", lineItemId);

  // 2. Update job_card_step if linked
  if (li.job_work_step_id) {
    const inspResult = data.qty_rejected === 0 ? "accepted" : data.qty_accepted === 0 ? "rejected" : "partially_accepted";
    await (supabase as any).from("job_card_steps").update({
      status: "done",
      qty_returned: data.qty_received,
      qty_accepted: data.qty_accepted,
      qty_rejected: data.qty_rejected,
      rejection_reason: data.rejection_reason || null,
      inspection_result: inspResult,
      inspected_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", li.job_work_step_id);

    // Get job_card_id from step to check location
    const { data: step } = await (supabase as any)
      .from("job_card_steps")
      .select("job_card_id")
      .eq("id", li.job_work_step_id)
      .single();
    if (step) {
      const jcId = (step as any).job_card_id;
      // Update JC quantities
      const { data: jcQty } = await (supabase as any)
        .from("job_cards")
        .select("quantity_accepted, quantity_rejected")
        .eq("id", jcId)
        .single();
      if (jcQty) {
        const newAccepted = Math.max(0, (jcQty as any).quantity_accepted - data.qty_rejected);
        const newRejected = (jcQty as any).quantity_rejected + data.qty_rejected;
        await (supabase as any).from("job_cards").update({ quantity_accepted: newAccepted, quantity_rejected: newRejected }).eq("id", jcId);
      }
      // Reset location if no more open external steps
      const { data: openSteps } = await (supabase as any)
        .from("job_card_steps")
        .select("id")
        .eq("job_card_id", jcId)
        .eq("step_type", "external")
        .neq("status", "done");
      if (!openSteps?.length) {
        await (supabase as any).from("job_cards").update({ current_location: "in_house", current_vendor_name: null, current_vendor_since: null }).eq("id", jcId);
      }
    }
  }

  // 3. Move stock: wip → finished_goods
  if (li.job_work_id && data.qty_accepted > 0) {
    const { data: jc } = await (supabase as any)
      .from("job_cards")
      .select("item_id, item_code, item_description, jc_number")
      .eq("id", li.job_work_id)
      .single();
    if (jc && (jc as any).item_id) {
      const { data: item } = await (supabase as any)
        .from("items")
        .select("id, item_code, description, current_stock, stock_wip, stock_finished_goods, standard_cost")
        .eq("id", (jc as any).item_id)
        .single();
      if (item) {
        const newWip = Math.max(0, ((item as any).stock_wip ?? 0) - data.qty_accepted);
        const newFg = ((item as any).stock_finished_goods ?? 0) + data.qty_accepted;
        await (supabase as any).from("items").update({ stock_wip: newWip, stock_finished_goods: newFg }).eq("id", (item as any).id);
        const { data: dcHeader } = await supabase.from("delivery_challans").select("dc_number").eq("id", li.dc_id).single();
        const dcNumber = (dcHeader as any)?.dc_number ?? "";
        await addStockLedgerEntry({
          item_id: (item as any).id,
          item_code: (item as any).item_code,
          item_description: (item as any).description ?? (jc as any).item_description ?? "",
          transaction_date: today,
          transaction_type: "job_work_return",
          qty_in: data.qty_accepted,
          qty_out: 0,
          balance_qty: (item as any).current_stock ?? 0,
          unit_cost: (item as any).standard_cost ?? 0,
          total_value: data.qty_accepted * ((item as any).standard_cost ?? 0),
          reference_type: "delivery_challan",
          reference_id: li.dc_id,
          reference_number: dcNumber,
          notes: `Job work return (per line): ${dcNumber}`,
          created_by: user?.id ?? null,
          from_state: "wip",
          to_state: "finished_goods",
        });
      }
    }
  }

  // 4. Recalculate DC status
  await recalculateDCStatus(li.dc_id);
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

export async function fetchBomStagesForItemDC(itemId: string): Promise<import('@/lib/bom-api').BomProcessingStage[]> {
  const companyId = await getCompanyId();
  const { data, error } = await (supabase as any)
    .from('bom_processing_stages')
    .select('*')
    .eq('item_id', itemId)
    .eq('company_id', companyId)
    .order('stage_number', { ascending: true });
  if (error) return [];
  return (data ?? []) as import('@/lib/bom-api').BomProcessingStage[];
}

export async function fetchComponentProcessingLog(
  companyId: string,
  itemId: string
): Promise<ComponentProcessingLog | null> {
  const { data, error } = await (supabase as any)
    .from('component_processing_log')
    .select('*')
    .eq('item_id', itemId)
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as ComponentProcessingLog | null;
}

export async function createProcessingLog(
  companyId: string,
  data: Partial<ComponentProcessingLog>
): Promise<ComponentProcessingLog> {
  const { data: row, error } = await (supabase as any)
    .from('component_processing_log')
    .insert({ ...data, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return row as ComponentProcessingLog;
}

export async function updateProcessingLog(
  logId: string,
  updates: Partial<ComponentProcessingLog>
): Promise<void> {
  const { error } = await (supabase as any)
    .from('component_processing_log')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', logId);
  if (error) throw error;
}

export async function recordEnhancedReturn(
  lineItemId: string,
  returnData: EnhancedReturnData
): Promise<EnhancedReturnResult> {
  const companyId = await getCompanyId();
  const today = new Date().toISOString().split('T')[0];
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch line item
  const { data: lineItem, error: liErr } = await (supabase as any)
    .from('dc_line_items')
    .select('id, dc_id, item_code, description, quantity, qty_received, qty_accepted, qty_rejected, rework_cycle, is_rework, stage_number, stage_name')
    .eq('id', lineItemId)
    .single();
  if (liErr) throw liErr;
  const li = lineItem as any;

  const priorReceived = (li.qty_received ?? 0);
  const newTotalReceived = priorReceived + returnData.qty_returning;
  const totalSent = li.quantity ?? 0;
  const newReturnStatus = newTotalReceived >= totalSent ? 'returned' : 'partially_returned';

  // Step 1: Update dc_line_items
  await (supabase as any).from('dc_line_items').update({
    qty_received: newTotalReceived,
    qty_accepted: (li.qty_accepted ?? 0) + returnData.qty_accepted,
    qty_rejected: (li.qty_rejected ?? 0) + returnData.qty_rejected,
    rejection_reason: returnData.rejection_reason ?? null,
    rejection_action: returnData.rejected_action ?? null,
    return_status: newReturnStatus,
  }).eq('id', lineItemId);

  // Step 2: Stock movements for accepted
  const finishedQty = returnData.accepted_action === 'finished_goods'
    ? returnData.qty_accepted
    : returnData.accepted_action === 'split'
    ? (returnData.split_finished_qty ?? 0)
    : 0;

  if (finishedQty > 0 && returnData.item_id) {
    const { data: item } = await (supabase as any)
      .from('items')
      .select('id, item_code, description, current_stock, stock_wip, stock_finished_goods, standard_cost')
      .eq('id', returnData.item_id)
      .single();
    if (item) {
      const rec = item as any;
      const newWip = Math.max(0, (rec.stock_wip ?? 0) - finishedQty);
      const newFg = (rec.stock_finished_goods ?? 0) + finishedQty;
      await (supabase as any).from('items').update({ stock_wip: newWip, stock_finished_goods: newFg }).eq('id', rec.id);
      await addStockLedgerEntry({
        item_id: rec.id,
        item_code: rec.item_code,
        item_description: rec.description,
        transaction_date: today,
        transaction_type: 'processing_return',
        qty_in: finishedQty,
        qty_out: 0,
        balance_qty: rec.current_stock ?? 0,
        unit_cost: rec.standard_cost ?? 0,
        total_value: finishedQty * (rec.standard_cost ?? 0),
        reference_type: 'delivery_challan',
        reference_id: returnData.dc_id,
        reference_number: returnData.dc_number,
        notes: `Processing return — moved to finished goods: ${returnData.dc_number}`,
        created_by: user?.id ?? null,
        from_state: 'wip',
        to_state: 'finished_goods',
      });
    }
  }

  // Step 3: Stock for rejected — scrap
  if (returnData.rejected_action === 'scrap' && returnData.qty_rejected > 0 && returnData.item_id) {
    const { data: item } = await (supabase as any)
      .from('items')
      .select('id, item_code, description, current_stock, stock_wip, standard_cost')
      .eq('id', returnData.item_id)
      .single();
    if (item) {
      const rec = item as any;
      const newWip = Math.max(0, (rec.stock_wip ?? 0) - returnData.qty_rejected);
      await (supabase as any).from('items').update({ stock_wip: newWip }).eq('id', rec.id);
      try {
        await (supabase as any).from('scrap_register').insert({
          company_id: companyId,
          item_id: returnData.item_id,
          drawing_number: returnData.drawing_number,
          quantity: returnData.qty_rejected,
          reason: returnData.rejection_reason ?? 'Processing rejection',
          source: 'dc_return',
          source_ref: returnData.dc_number,
          scrapped_at: today,
          created_by: user?.id ?? null,
        }).select().single();
      } catch (_e) {
        // scrap_register may not exist; ignore
      }
      await addStockLedgerEntry({
        item_id: rec.id,
        item_code: rec.item_code,
        item_description: rec.description,
        transaction_date: today,
        transaction_type: 'scrap',
        qty_in: 0,
        qty_out: returnData.qty_rejected,
        balance_qty: rec.current_stock ?? 0,
        unit_cost: rec.standard_cost ?? 0,
        total_value: returnData.qty_rejected * (rec.standard_cost ?? 0),
        reference_type: 'delivery_challan',
        reference_id: returnData.dc_id,
        reference_number: returnData.dc_number,
        notes: `Scrap from processing rejection: ${returnData.dc_number}`,
        created_by: user?.id ?? null,
        from_state: 'wip',
        to_state: 'scrapped',
      });
    }
  }

  // Step 4: Update component_processing_log
  if (returnData.item_id) {
    const existingLog = await fetchComponentProcessingLog(companyId, returnData.item_id);
    let newStatus = 'stage_complete';
    if (returnData.accepted_action === 'finished_goods') newStatus = 'finished_goods';
    else if (returnData.rejected_action === 'rework_same_vendor' || returnData.rejected_action === 'rework_different_vendor') newStatus = 'rework_at_vendor';

    const currentStage = returnData.current_stage_number ?? 1;
    const totalStages = returnData.bom_stages.length || 1;

    if (existingLog) {
      await updateProcessingLog(existingLog.id, {
        accepted_qty: (existingLog.accepted_qty ?? 0) + returnData.qty_accepted,
        rejected_qty: (existingLog.rejected_qty ?? 0) + returnData.qty_rejected,
        current_status: newStatus,
        current_stage: newStatus === 'finished_goods' ? totalStages : currentStage,
        total_stages: totalStages,
        last_dc_id: returnData.dc_id,
        last_return_date: today,
      });
    } else {
      await createProcessingLog(companyId, {
        item_id: returnData.item_id,
        drawing_number: returnData.drawing_number,
        total_qty: li.quantity ?? 0,
        accepted_qty: returnData.qty_accepted,
        rejected_qty: returnData.qty_rejected,
        scrapped_qty: returnData.rejected_action === 'scrap' ? returnData.qty_rejected : 0,
        current_stage: newStatus === 'finished_goods' ? totalStages : currentStage,
        total_stages: totalStages,
        current_status: newStatus,
        last_dc_id: returnData.dc_id,
        last_return_date: today,
      });
    }
  }

  // Step 5: Recalculate DC status
  await recalculateDCStatus(returnData.dc_id);

  // Step 6: Build prefill data for next DC or rework DC
  const result: EnhancedReturnResult = { nextDCPrefill: null, reworkDCPrefill: null };

  const baseLineItem = {
    item_code: li.item_code ?? '',
    description: li.description ?? '',
    drawing_number: returnData.drawing_number ?? '',
    parent_dc_line_id: lineItemId,
  };

  if (returnData.accepted_action === 'next_stage' || (returnData.accepted_action === 'split' && (returnData.split_next_stage_qty ?? 0) > 0)) {
    const nextStageQty = returnData.accepted_action === 'split'
      ? (returnData.split_next_stage_qty ?? 0)
      : returnData.qty_accepted;
    const currentStageIdx = returnData.bom_stages.findIndex(s => s.stage_number === returnData.current_stage_number);
    const nextStage = currentStageIdx >= 0 && currentStageIdx < returnData.bom_stages.length - 1
      ? returnData.bom_stages[currentStageIdx + 1]
      : null;
    if (nextStage) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (nextStage.expected_days ?? 7));
      result.nextDCPrefill = {
        dc_type: 'job_work_out',
        party_id: nextStage.vendor_id ?? null,
        party_name: nextStage.vendor_name ?? null,
        return_before_date: dueDate.toISOString().split('T')[0],
        line_items: [{
          ...baseLineItem,
          quantity: nextStageQty,
          nature_of_process: nextStage.process_name,
          stage_number: nextStage.stage_number,
          stage_name: nextStage.stage_name,
          is_rework: false,
          rework_cycle: 1,
        }],
      };
    }
  }

  if (returnData.rejected_action === 'rework_same_vendor' || returnData.rejected_action === 'rework_different_vendor') {
    const reworkVendorId = returnData.rejected_action === 'rework_different_vendor'
      ? (returnData.rejected_vendor_id ?? null)
      : null;
    const reworkVendorName = returnData.rejected_action === 'rework_different_vendor'
      ? (returnData.rejected_vendor_name ?? null)
      : null;
    const currentStage = returnData.bom_stages.find(s => s.stage_number === returnData.current_stage_number);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (currentStage?.expected_days ?? 7));
    result.reworkDCPrefill = {
      dc_type: 'job_work_out',
      party_id: reworkVendorId,
      party_name: reworkVendorName,
      return_before_date: dueDate.toISOString().split('T')[0],
      line_items: [{
        ...baseLineItem,
        quantity: returnData.qty_rejected,
        nature_of_process: currentStage?.process_name ?? '',
        stage_number: returnData.current_stage_number ?? 1,
        stage_name: currentStage?.stage_name ?? '',
        is_rework: true,
        rework_cycle: (returnData.current_rework_cycle ?? 1) + 1,
      }],
    };
  }

  return result;
}

// ─── DC Approval Workflow ─────────────────────────────────────────────────────

// TODO: Add RLS policy to restrict UPDATE of approved_at/approved_by columns to
// admin, finance, and purchase_team roles so this guard is enforced server-side.
export async function approveDC(id: string, approvedBy: string): Promise<void> {
  const { error } = await supabase
    .from('delivery_challans')
    .update({ status: 'draft', approved_at: new Date().toISOString(), approved_by: approvedBy } as any)
    .eq('id', id);
  if (error) throw error;
}

export async function rejectDC(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('delivery_challans')
    .update({ status: 'rejected', rejection_reason: reason, rejection_noted: false } as any)
    .eq('id', id);
  if (error) throw error;
}

export async function markDCRejectionNoted(id: string): Promise<void> {
  const { error } = await supabase
    .from('delivery_challans')
    .update({ rejection_noted: true } as any)
    .eq('id', id);
  if (error) throw error;
}

export async function fetchPendingDCApprovalCount(): Promise<number> {
  const companyId = await getCompanyId();
  if (!companyId) return 0;
  const { count, error } = await supabase
    .from('delivery_challans')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending_approval');
  if (error) return 0;
  return count ?? 0;
}

export async function fetchUnreadDCRejectionCount(): Promise<number> {
  const companyId = await getCompanyId();
  if (!companyId) return 0;
  const { count, error } = await supabase
    .from('delivery_challans')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'rejected')
    .eq('rejection_noted', false);
  if (error) return 0;
  return count ?? 0;
}

export interface PendingApprovalDC extends DeliveryChallan {
  line_item_count: number;
}

export async function fetchPendingDCApprovals(): Promise<PendingApprovalDC[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data, error } = await supabase
    .from('delivery_challans')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'pending_approval')
    .order('approval_requested_at', { ascending: true });
  if (error) throw error;
  const dcs = (data ?? []) as unknown as DeliveryChallan[];
  if (dcs.length === 0) return [];
  const dcIds = dcs.map((d) => d.id);
  const { data: lineItems } = await supabase
    .from('dc_line_items')
    .select('delivery_challan_id')
    .in('delivery_challan_id', dcIds);
  const countMap: Record<string, number> = {};
  (lineItems ?? []).forEach((li: any) => {
    countMap[li.delivery_challan_id] = (countMap[li.delivery_challan_id] ?? 0) + 1;
  });
  return dcs.map((d) => ({ ...d, line_item_count: countMap[d.id] ?? 0 }));
}

export async function fetchDCApprovalHistory(search?: string): Promise<DeliveryChallan[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  let query = supabase
    .from('delivery_challans')
    .select('*')
    .eq('company_id', companyId)
    .not('approval_requested_at', 'is', null)
    .neq('status', 'pending_approval')
    .order('approval_requested_at', { ascending: false });
  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      query = query.or(`dc_number.ilike.%${sanitized}%,party_name.ilike.%${sanitized}%`);
    }
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as DeliveryChallan[];
}
