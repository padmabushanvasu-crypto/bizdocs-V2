import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";
import { getNextDocNumber } from "@/lib/doc-number-utils";
import { updateStockBucket } from "@/lib/items-api";
import { logAudit } from "@/lib/audit-api";

export type GRNStage = 'draft' | 'quantitative_pending' | 'quantitative_done' | 'quality_pending' | 'quality_done' | 'closed' | 'awaiting_store';
export type QualityVerdict = 'fully_accepted' | 'conditionally_accepted' | 'partially_returned' | 'returned';
export type NonConformanceType = 'dimensional' | 'surface_finish' | 'material_grade' | 'functional' | 'packaging' | 'documentation' | 'other';
export type Disposition = 'accept_as_is' | 'conditional_accept' | 'return_to_vendor' | 'scrap' | 'rework_our_scope';
export type InspectionMethod = '100_percent' | 'random_sample' | 'visual_only' | 'certificate_verification';

export interface GRNLineItem {
  id?: string;
  serial_number: number;
  po_line_item_id?: string;
  dc_line_item_id?: string | null;
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
  rejection_action?: string | null; // 'return_to_supplier'|'replacement_requested'|'scrap'|'hold'
  replacement_cycle?: number;
  is_replacement?: boolean;
  supplier_ref?: string | null;
  // Phase 14 new fields
  ordered_qty?: number;
  previously_received_qty?: number;
  received_now?: number;
  item_identity_match?: boolean;
  identity_mismatch_remarks?: string | null;
  stage1_checked_by?: string | null;
  stage1_verified_by?: string | null;
  stage1_date?: string | null;
  stage1_complete?: boolean;
  accepted_qty?: number;
  rejected_qty?: number;
  disposal_method?: 'return_to_vendor' | 'rework' | 'scrap' | 'use_as_is' | null;
  stage2_inspected_by?: string | null;
  stage2_approved_by?: string | null;
  stage2_date?: string | null;
  stage2_complete?: boolean;
  jigs_sent?: any[] | null;
  jigs_returned?: any[] | null;
  identity_matched_qty?: number;
  identity_not_matched_qty?: number;
  // Stage 1 — Quantitative
  received_qty?: number;
  qty_matched?: boolean;
  condition_on_arrival?: string | null;
  packing_intact?: boolean;
  vendor_invoice_ref?: string | null;
  quantitative_verified_by?: string | null;
  quantitative_verified_at?: string | null;
  quantitative_notes?: string | null;
  // Stage 2 — Qualitative
  qty_inspected?: number | null;
  inspection_method?: InspectionMethod | null;
  conforming_qty?: number | null;
  non_conforming_qty?: number | null;
  non_conformance_type?: NonConformanceType | null;
  deviation_description?: string | null;
  disposition?: Disposition | null;
  reference_drawing?: string | null;
  qc_inspected_by?: string | null;
  qc_inspected_at?: string | null;
  qc_notes?: string | null;
  // Jig / mould return confirmation (DC-GRN only)
  jig_confirmed?: boolean;
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
  transporter_name: string | null;
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
  qc_measurements?: GRNQCMeasurement[];
  // Phase 14 new fields
  grn_type?: 'po_grn' | 'dc_grn';
  driver_name?: string | null;
  driver_contact?: string | null;
  linked_dc_id?: string | null;
  linked_dc_number?: string | null;
  total_ordered_qty?: number;
  total_received_qty?: number;
  total_accepted_qty?: number;
  grn_stage?: GRNStage;
  quantitative_completed_at?: string | null;
  quantitative_completed_by?: string | null;
  quality_completed_at?: string | null;
  quality_completed_by?: string | null;
  overall_quality_verdict?: QualityVerdict | null;
  quality_remarks?: string | null;
  vendor_invoice_number?: string | null;
  vendor_invoice_date?: string | null;
  // QC Inspection fields
  qc_remarks?: string | null;
  qc_prepared_by?: string | null;
  qc_inspected_by?: string | null;
  qc_approved_by?: string | null;
}

export interface GrnInspectionLine {
  id?: string;
  grn_id?: string;
  company_id?: string;
  sl_no: number;
  characteristic: string;
  specification?: string;
  qty_checked?: number | null;
  result?: 'pass' | 'fail' | 'conditional' | null;
  measuring_instrument?: string;
  non_conformance_reason?: string;
  created_at?: string;
}

export interface GRNQCMeasurement {
  id?: string;
  company_id?: string;
  grn_id: string;
  grn_line_item_id: string;
  sl_no: number;
  characteristic: string;
  specification?: string;
  qty_checked?: number;
  sample_1?: string;
  sample_2?: string;
  sample_3?: string;
  sample_4?: string;
  sample_5?: string;
  result?: 'conforming' | 'non_conforming';
  measuring_instrument?: string;
  remarks?: string;
  conforming_qty?: number;
  non_conforming_qty?: number;
}

export interface GRNFilters {
  search?: string;
  status?: string;
  grn_type?: 'po_grn' | 'dc_grn' | 'all';
  grn_stage?: string;
  month?: string;
  page?: number;
  pageSize?: number;
  showDeleted?: boolean;
}

export interface GrnReceiptEvent {
  id: string;
  company_id: string;
  grn_id: string;
  receipt_date: string;
  vehicle_number: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  notes: string | null;
  created_at: string;
}

export async function fetchGRNs(filters: GRNFilters = {}) {
  const companyId = await getCompanyId();
  if (!companyId) return { data: [], count: 0 };
  const { search, status = "all", grn_type, month, page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = (supabase as any).from("grns").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (!filters.showDeleted) query = query.neq("status", "deleted");
  if (status && status !== "all") query = query.eq("status", status);
  if (grn_type && grn_type !== "all") query = query.eq("grn_type", grn_type);
  if (filters.grn_stage && filters.grn_stage !== 'all') query = query.eq('grn_stage', filters.grn_stage);
  if (month) {
    const start = `${month}-01`;
    const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0).toISOString().split('T')[0];
    query = query.gte("grn_date", start).lte("grn_date", end);
  }
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

export async function fetchDcGrns(filters: GRNFilters = {}) {
  return fetchGRNs({ ...filters, grn_type: 'dc_grn' });
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
    grn_type: (grn as any).grn_type ?? 'po_grn',
    po_id: grn.po_id || null, po_number: grn.po_number || null,
    linked_dc_id: (grn as any).linked_dc_id ?? null,
    linked_dc_number: (grn as any).linked_dc_number ?? null,
    vendor_id: grn.vendor_id || null, vendor_name: grn.vendor_name || null,
    vendor_invoice_number: grn.vendor_invoice_number || null, vendor_invoice_date: grn.vendor_invoice_date || null,
    transporter_name: grn.transporter_name || null,
    vehicle_number: grn.vehicle_number || null, lr_reference: grn.lr_reference || null,
    driver_name: (grn as any).driver_name ?? null,
    driver_contact: (grn as any).driver_contact ?? null,
    received_by: grn.received_by || null, notes: grn.notes || null,
    total_received: grn.total_received, total_accepted: grn.total_accepted, total_rejected: grn.total_rejected,
    status: grn.status, recorded_at: grn.recorded_at,
    qc_remarks: grn.qc_remarks ?? null,
    qc_prepared_by: grn.qc_prepared_by ?? null,
    qc_inspected_by: grn.qc_inspected_by ?? null,
    qc_approved_by: grn.qc_approved_by ?? null,
  } as any).select().single();
  if (error) {
    console.error("[GRN] create error:", error);
    throw error;
  }

  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item) => ({
      company_id: companyId,
      grn_id: (newGRN as any).id, po_line_item_id: item.po_line_item_id || null,
      dc_line_item_id: item.dc_line_item_id || null,
      serial_number: item.serial_number, description: item.description,
      drawing_number: item.drawing_number || null, unit: item.unit,
      po_quantity: item.po_quantity, previously_received: item.previously_received,
      previously_received_qty: item.previously_received || 0,
      ordered_qty: item.po_quantity || 0,
      pending_quantity: item.pending_quantity, receiving_now: item.receiving_now,
      accepted_quantity: item.accepted_quantity, rejected_quantity: item.rejected_quantity,
      rejection_reason: item.rejection_reason || null, remarks: item.remarks || null,
      rejection_action: item.rejection_action || null,
      replacement_cycle: item.replacement_cycle || 1,
      is_replacement: item.is_replacement || false,
      jig_confirmed: item.jig_confirmed ?? false,
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
    // Update PO line item received quantities — validate first, then update atomically
    if (item.po_line_item_id && item.accepted_quantity > 0) {
      const { data: poItem } = await supabase.from("po_line_items").select("received_quantity, quantity").eq("id", item.po_line_item_id).single();
      if (poItem) {
        const pi = poItem as any;
        const currentReceived = pi.received_quantity || 0;
        const ordered = pi.quantity || 0;
        const maxAllowed = ordered - currentReceived;
        if (item.accepted_quantity > maxAllowed) {
          throw new Error(
            `Over-receipt for "${item.description}": trying to receive ${item.accepted_quantity} but only ${maxAllowed} pending (ordered ${ordered}, already received ${currentReceived}). Reduce the quantity or split into a separate GRN.`
          );
        }
        const newReceived = currentReceived + item.accepted_quantity;
        const newPending = Math.max(0, ordered - newReceived);
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
        // Phase 13: update stock bucket
        await updateStockBucket(rec.id, 'free', item.accepted_quantity).catch(console.error);
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

// Mirrors recalculatePOStatus but operates on a GRN's own status field.
// Uses received_qty (set at Stage 1) vs ordered_qty from grn_line_items.
async function recalculateGRNStatusFromLines(grnId: string): Promise<void> {
  const { data: lines } = await (supabase as any)
    .from('grn_line_items')
    .select('ordered_qty, received_qty, received_now')
    .eq('grn_id', grnId);
  if (!lines?.length) return;
  let allReceived = true, anyReceived = false;
  for (const line of (lines as any[])) {
    const ordered = (line.ordered_qty ?? 0) as number;
    const received = (line.received_qty ?? line.received_now ?? 0) as number;
    if (received < ordered) allReceived = false;
    if (received > 0) anyReceived = true;
  }
  const newStatus = allReceived ? 'fully_received' : anyReceived ? 'partially_received' : 'open';
  await (supabase as any).from('grns').update({ status: newStatus }).eq('id', grnId);
}

// Updates the parent DC status based on GRN receipts — mirrors recalculateDCStatus in
// delivery-challans-api but uses grn_line_items.received_qty (the GRN-based return flow)
// rather than dc_line_items.returned_qty_nos (the legacy direct-return flow).
async function recalculateDCStatusFromGRNReceipts(dcId: string): Promise<void> {
  // Gather all non-deleted GRNs linked to this DC
  const { data: grns } = await (supabase as any)
    .from('grns').select('id').eq('linked_dc_id', dcId).neq('status', 'deleted');
  if (!grns?.length) return;

  const grnIds = (grns as any[]).map((g: any) => g.id as string);

  // Sum received_qty per dc_line_item_id across all linked GRNs
  const { data: grnLines } = await (supabase as any)
    .from('grn_line_items')
    .select('dc_line_item_id, received_qty, received_now')
    .in('grn_id', grnIds);

  const receivedByDCLine: Record<string, number> = {};
  for (const item of (grnLines ?? []) as any[]) {
    const key = item.dc_line_item_id as string | null;
    if (!key) continue;
    receivedByDCLine[key] = (receivedByDCLine[key] ?? 0) + ((item.received_qty ?? item.received_now ?? 0) as number);
  }

  // Compare against original DC line quantities
  const { data: dcLines } = await (supabase as any)
    .from('dc_line_items').select('id, quantity').eq('dc_id', dcId);
  if (!dcLines?.length) return;

  let allReturned = true, anyReturned = false;
  for (const dcLine of (dcLines as any[])) {
    const received = receivedByDCLine[dcLine.id as string] ?? 0;
    const qty = (dcLine.quantity ?? 0) as number;
    if (received < qty) allReturned = false;
    if (received > 0) anyReturned = true;
  }

  const newStatus = allReturned ? 'fully_returned' : anyReturned ? 'partially_returned' : 'issued';
  await (supabase as any).from('delivery_challans').update({ status: newStatus }).eq('id', dcId);
}

export async function fetchGRNsForPO(poId: string): Promise<GRN[]> {
  const { data, error } = await supabase.from("grns").select("*").eq("po_id", poId).order("grn_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as GRN[];
}

export async function fetchGRNStats() {
  const companyId = await getCompanyId();
  if (!companyId) return { totalThisMonth: 0, totalAccepted: 0, totalRejected: 0, pendingVerification: 0 };
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

export async function softDeleteGRN(id: string) {
  const { error } = await supabase.from("grns").update({ status: "deleted" } as any).eq("id", id);
  if (error) throw error;
}

// ── Phase 14: Two-Stage GRN API functions ────────────────────────────────────

export async function fetchGrnLineItems(grnId: string): Promise<GRNLineItem[]> {
  const { data, error } = await (supabase as any).from("grn_line_items").select("*").eq("grn_id", grnId).order("serial_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GRNLineItem[];
}

export interface Stage1Data {
  received_now: number;
  item_identity_match: boolean;
  identity_mismatch_remarks?: string | null;
  stage1_checked_by?: string | null;
  stage1_verified_by?: string | null;
  stage1_date?: string | null;
  stage1_complete?: boolean;
  identity_matched_qty?: number;
  identity_not_matched_qty?: number;
}

export async function updateGrnLineStage1(lineId: string, data: Stage1Data): Promise<void> {
  const accepted_qty = data.stage1_complete ? data.received_now : undefined;
  const updatePayload: any = {
    received_now: data.received_now,
    receiving_now: data.received_now, // keep legacy field in sync
    item_identity_match: data.item_identity_match,
    identity_mismatch_remarks: data.identity_mismatch_remarks ?? null,
    stage1_checked_by: data.stage1_checked_by ?? null,
    stage1_verified_by: data.stage1_verified_by ?? null,
    stage1_date: data.stage1_date ?? null,
    stage1_complete: data.stage1_complete ?? false,
    identity_matched_qty: data.identity_matched_qty ?? null,
    identity_not_matched_qty: data.identity_not_matched_qty ?? null,
  };
  if (data.stage1_complete && accepted_qty !== undefined) {
    updatePayload.accepted_qty = accepted_qty;
    updatePayload.accepted_quantity = accepted_qty; // legacy
  }
  const { error } = await (supabase as any).from("grn_line_items").update(updatePayload).eq("id", lineId);
  if (error) throw error;
}

export interface Stage2Data {
  accepted_qty: number;
  rejected_qty: number;
  rejection_reason?: string | null;
  disposal_method?: 'return_to_vendor' | 'rework' | 'scrap' | 'use_as_is' | null;
  stage2_inspected_by?: string | null;
  stage2_approved_by?: string | null;
  stage2_date?: string | null;
  stage2_complete?: boolean;
}

export async function updateGrnLineStage2(lineId: string, data: Stage2Data): Promise<void> {
  const updatePayload: any = {
    accepted_qty: data.accepted_qty,
    accepted_quantity: data.accepted_qty, // legacy
    rejected_qty: data.rejected_qty,
    rejected_quantity: data.rejected_qty, // legacy
    rejection_reason: data.rejection_reason ?? null,
    disposal_method: data.disposal_method ?? null,
    // rejection_action intentionally not set — its check constraint only allows old values
    stage2_inspected_by: data.stage2_inspected_by ?? null,
    stage2_approved_by: data.stage2_approved_by ?? null,
    stage2_date: data.stage2_date ?? null,
    stage2_complete: data.stage2_complete ?? false,
  };
  const { error } = await (supabase as any).from("grn_line_items").update(updatePayload).eq("id", lineId);
  if (error) throw error;
}

export interface CreateGrnFromPOData {
  po_id: string;
  date: string;
  vehicle_number?: string | null;
  driver_name?: string | null;
  driver_contact?: string | null;
  vendor_invoice_number?: string | null;
  notes?: string | null;
}

export async function createGrnFromPO(data: CreateGrnFromPOData): Promise<GRN> {
  const companyId = await getCompanyId();
  const grnNumber = await getNextGRNNumber();

  // Fetch PO info
  const { data: po, error: poErr } = await supabase.from("purchase_orders").select("*").eq("id", data.po_id).single();
  if (poErr) throw poErr;
  const poAny = po as any;

  // Fetch PO line items
  const { data: poItems, error: liErr } = await supabase.from("po_line_items").select("*").eq("po_id", data.po_id).order("serial_number", { ascending: true });
  if (liErr) throw liErr;

  // Build pending items — filter out fully-received lines
  const pendingItems = (poItems ?? []).map((item: any) => {
    const prevReceived = item.received_quantity ?? 0;
    const pendingQty = Math.max(0, (item.quantity ?? 0) - prevReceived);
    return { item, prevReceived, pendingQty };
  }).filter(({ pendingQty }) => pendingQty > 0);

  if (pendingItems.length === 0) {
    throw new Error("This PO has been fully received. No pending quantity remaining.");
  }

  // Create GRN header
  const { data: newGRN, error: grnErr } = await (supabase as any).from("grns").insert({
    company_id: companyId,
    grn_number: grnNumber,
    grn_date: data.date,
    grn_type: 'po_grn',
    grn_stage: 'quantitative_pending',
    po_id: data.po_id,
    po_number: poAny.po_number,
    vendor_id: poAny.vendor_id,
    vendor_name: poAny.vendor_name,
    vendor_invoice_number: data.vendor_invoice_number ?? null,
    vehicle_number: data.vehicle_number ?? null,
    driver_name: data.driver_name ?? null,
    driver_contact: data.driver_contact ?? null,
    notes: data.notes ?? null,
    total_received: 0, total_accepted: 0, total_rejected: 0,
    status: 'draft',
  }).select().single();
  if (grnErr) throw grnErr;

  // Create line items from pending PO lines only
  const grnId = (newGRN as any).id;
  const lineItemsToInsert = pendingItems.map(({ item, prevReceived, pendingQty }, idx) => ({
    company_id: companyId,
    grn_id: grnId,
    serial_number: idx + 1,
    po_line_item_id: item.id,
    item_id: item.item_id ?? null,
    description: item.description,
    drawing_number: item.drawing_number ?? null,
    unit: item.unit ?? 'NOS',
    po_quantity: item.quantity ?? 0,
    ordered_qty: item.quantity ?? 0,
    previously_received: prevReceived,
    previously_received_qty: prevReceived,
    pending_quantity: pendingQty,
    receiving_now: 0,
    received_now: 0,
    accepted_quantity: 0,
    accepted_qty: 0,
    rejected_quantity: 0,
    rejected_qty: 0,
    stage1_complete: false,
    stage2_complete: false,
  }));
  const { error: liInsertErr } = await (supabase as any).from("grn_line_items").insert(lineItemsToInsert);
  if (liInsertErr) throw liInsertErr;

  return newGRN as unknown as GRN;
}

export interface CreateGrnFromDCData {
  dc_id: string;
  date: string;
  vehicle_number?: string | null;
  driver_name?: string | null;
  driver_contact?: string | null;
  notes?: string | null;
}

export async function createGrnFromDC(data: CreateGrnFromDCData): Promise<GRN> {
  const companyId = await getCompanyId();
  const grnNumber = await getNextGRNNumber();

  // Fetch DC info
  const { data: dc, error: dcErr } = await (supabase as any).from("delivery_challans").select("*").eq("id", data.dc_id).single();
  if (dcErr) throw dcErr;
  const dcAny = dc as any;

  // Fetch DC line items
  const { data: dcItems, error: liErr } = await (supabase as any).from("dc_line_items").select("*").eq("dc_id", data.dc_id).order("serial_number", { ascending: true });
  if (liErr) throw liErr;

  // PROBLEM 3: compute already-received quantities per dc_line_item_id
  const receiptSummary = await fetchDCReceiptSummary(data.dc_id);

  // Build list of items that still have pending quantity — skip fully-received lines
  const pendingItems = (dcItems ?? []).map((item: any) => {
    const prevReceived = receiptSummary[item.id as string] ?? 0;
    const pendingQty = Math.max(0, (item.quantity ?? 0) - prevReceived);
    return { item, prevReceived, pendingQty };
  }).filter(({ pendingQty }) => pendingQty > 0);

  if (pendingItems.length === 0) {
    throw new Error("This DC has been fully received. No pending quantity remaining.");
  }

  // Create GRN header — PROBLEM 1: set grn_stage: 'quantitative_pending'
  const { data: newGRN, error: grnErr } = await (supabase as any).from("grns").insert({
    company_id: companyId,
    grn_number: grnNumber,
    grn_date: data.date,
    grn_type: 'dc_grn',
    grn_stage: 'quantitative_pending',
    linked_dc_id: data.dc_id,
    linked_dc_number: dcAny.dc_number,
    vendor_id: dcAny.party_id ?? null,
    vendor_name: dcAny.party_name ?? null,
    vehicle_number: data.vehicle_number ?? null,
    driver_name: data.driver_name ?? null,
    driver_contact: data.driver_contact ?? null,
    notes: data.notes ?? null,
    total_received: 0, total_accepted: 0, total_rejected: 0,
    status: 'draft',
  }).select().single();
  if (grnErr) throw grnErr;

  // Create line items from pending DC items
  // PROBLEM 2: dc_line_item_id set to item.id
  // PROBLEM 3: previously_received and pending_quantity from receiptSummary
  // PROBLEM 5: copy nature_of_process and unit_rate (rate) from dc_line_item
  const grnId = (newGRN as any).id;
  const lineItemsToInsert = pendingItems.map(({ item, prevReceived, pendingQty }, idx) => ({
    company_id: companyId,
    grn_id: grnId,
    dc_line_item_id: item.id,
    serial_number: idx + 1,
    description: item.description,
    drawing_number: item.drawing_number ?? null,
    unit: item.unit ?? 'NOS',
    po_quantity: item.quantity ?? 0,
    ordered_qty: item.quantity ?? 0,
    previously_received: prevReceived,
    previously_received_qty: prevReceived,
    pending_quantity: pendingQty,
    receiving_now: pendingQty,
    received_now: 0,
    accepted_quantity: 0,
    accepted_qty: 0,
    rejected_quantity: 0,
    rejected_qty: 0,
    stage1_complete: false,
    stage2_complete: false,
    jigs_sent: item.jigs_sent ?? null,
    nature_of_process: item.nature_of_process ?? null,
    unit_rate: item.rate ?? null,
  }));

  if (lineItemsToInsert.length > 0) {
    const { error: liInsertErr } = await (supabase as any).from("grn_line_items").insert(lineItemsToInsert);
    if (liInsertErr) throw liInsertErr;
  }

  return newGRN as unknown as GRN;
}

// ── QC Inspection Lines ───────────────────────────────────────────────────────

export async function fetchGrnInspectionLines(grnId: string): Promise<GrnInspectionLine[]> {
  const { data, error } = await (supabase as any)
    .from("grn_inspection_lines")
    .select("*")
    .eq("grn_id", grnId)
    .order("sl_no", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GrnInspectionLine[];
}

export async function upsertGrnInspectionLines(
  grnId: string,
  companyId: string,
  lines: GrnInspectionLine[]
): Promise<void> {
  // Delete existing then re-insert
  const { error: delErr } = await (supabase as any)
    .from("grn_inspection_lines")
    .delete()
    .eq("grn_id", grnId);
  if (delErr) throw delErr;

  if (lines.length === 0) return;

  const toInsert = lines.map((l) => ({
    grn_id: grnId,
    company_id: companyId,
    sl_no: l.sl_no,
    characteristic: l.characteristic,
    specification: l.specification ?? null,
    qty_checked: l.qty_checked ?? null,
    result: l.result ?? null,
    measuring_instrument: l.measuring_instrument ?? null,
    non_conformance_reason: l.non_conformance_reason ?? null,
  }));

  const { error: insErr } = await (supabase as any)
    .from("grn_inspection_lines")
    .insert(toInsert);
  if (insErr) throw insErr;
}

export async function updateGrnQcFields(
  grnId: string,
  data: { qc_remarks?: string | null; qc_prepared_by?: string | null; qc_inspected_by?: string | null; qc_approved_by?: string | null }
): Promise<void> {
  const { error } = await (supabase as any)
    .from("grns")
    .update(data)
    .eq("id", grnId);
  if (error) throw error;
}

// Valid values per grn_line_items_rejection_action_check constraint
const VALID_REJECTION_ACTIONS = ['return_to_supplier', 'replacement_requested', 'scrap', 'hold'] as const;

export async function recordGrnRejectionAction(
  lineItemId: string,
  action: string,
  data: {
    qty: number;
    reason: string | null;
    supplier_ref?: string | null;
    item_id: string | null;
    drawing_number: string | null;
    grn_number: string;
  }
): Promise<void> {
  if (!VALID_REJECTION_ACTIONS.includes(action as any)) {
    throw new Error(
      `Invalid rejection_action "${action}". Must be one of: ${VALID_REJECTION_ACTIONS.join(', ')}`
    );
  }

  const companyId = await getCompanyId();
  const today = new Date().toISOString().split('T')[0];
  const { data: { user } } = await supabase.auth.getUser();

  await (supabase as any).from('grn_line_items').update({
    rejection_action: action,
    supplier_ref: data.supplier_ref ?? null,
  }).eq('id', lineItemId);

  if (action === 'scrap' && data.item_id) {
    try {
      await (supabase as any).from('scrap_register').insert({
        company_id: companyId,
        item_id: data.item_id,
        drawing_number: data.drawing_number,
        quantity: data.qty,
        reason: data.reason ?? 'GRN rejection — scrap',
        source: 'grn_rejection',
        source_ref: data.grn_number,
        scrapped_at: today,
        created_by: user?.id ?? null,
      });
    } catch (_e) {
      // scrap_register may not exist; ignore
    }
  }
}

// ── New Two-Stage API ─────────────────────────────────────────────────────────

export interface QuantitativeLineData {
  id: string;
  received_qty: number;
  qty_matched: number;
  condition_on_arrival: string;
  packing_intact: boolean;
  quantitative_notes?: string | null;
  vendor_invoice_ref?: string | null;
  product_match?: 'yes' | 'partial' | 'no';
  matching_units?: number | null;
  non_matching_units?: number | null;
  mismatch_reason?: string | null;
  mismatch_disposition?: string | null;
}

export async function saveQuantitativeStage(
  grnId: string,
  lines: QuantitativeLineData[],
  verifiedBy: string,
  vendorInvoiceNumber?: string | null,
  vendorInvoiceDate?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  // Update each line
  for (const line of lines) {
    const { error } = await (supabase as any)
      .from('grn_line_items')
      .update({
        received_qty: line.received_qty,
        receiving_now: line.received_qty, // keep legacy field in sync
        qty_matched: line.qty_matched >= line.received_qty, // legacy boolean: true if all received units matched
        qty_matched_qty: line.qty_matched, // new numeric: exact count of matched units
        condition_on_arrival: line.condition_on_arrival,
        packing_intact: line.packing_intact,
        quantitative_notes: line.quantitative_notes ?? null,
        vendor_invoice_ref: line.vendor_invoice_ref ?? null,
        quantitative_verified_by: verifiedBy,
        quantitative_verified_at: now,
        product_match: line.product_match ?? 'yes',
        matching_units: line.matching_units ?? null,
        non_matching_units: line.non_matching_units ?? null,
        mismatch_reason: line.mismatch_reason ?? null,
        mismatch_disposition: line.mismatch_disposition ?? null,
      })
      .eq('id', line.id);
    if (error) throw error;
  }

  // Determine next stage based on product identity check outcomes
  const allRejected = lines.length > 0 && lines.every(l => (l.product_match ?? 'yes') === 'no');

  // Update GRN header
  const updateData: any = {
    quantitative_completed_at: now,
    quantitative_completed_by: verifiedBy,
  };
  if (vendorInvoiceNumber !== undefined) updateData.vendor_invoice_number = vendorInvoiceNumber;
  if (vendorInvoiceDate !== undefined) updateData.vendor_invoice_date = vendorInvoiceDate || null;

  if (allRejected) {
    // All items rejected at Stage 1 — close GRN without QC
    updateData.grn_stage = 'closed';
    updateData.overall_quality_verdict = 'returned';
  } else {
    // At least some items pass identity check — proceed to QC
    updateData.grn_stage = 'quality_pending';
  }

  const { error: grnErr } = await (supabase as any)
    .from('grns')
    .update(updateData)
    .eq('id', grnId);
  if (grnErr) throw grnErr;

  // CHANGE 1+2: For DC return GRNs — update GRN status and parent DC status
  try {
    const { data: grnMeta } = await (supabase as any)
      .from('grns').select('grn_type, linked_dc_id').eq('id', grnId).single();
    if (grnMeta?.grn_type === 'dc_grn') {
      await recalculateGRNStatusFromLines(grnId);
      if (grnMeta.linked_dc_id) {
        await recalculateDCStatusFromGRNReceipts(grnMeta.linked_dc_id);
      }
    }
  } catch (dcStatusErr) {
    console.error('[GRN] DC/GRN status update failed (stage 1 save succeeded):', dcStatusErr);
  }
}

export interface QualitativeLineData {
  id: string;
  qty_inspected: number;
  inspection_method: InspectionMethod;
  conforming_qty: number;
  non_conforming_qty: number;
  non_conformance_type?: NonConformanceType | null;
  deviation_description?: string | null;
  disposition?: Disposition | null;
  reference_drawing?: string | null;
  qc_notes?: string | null;
}

export async function saveQualityStage(
  grnId: string,
  lines: QualitativeLineData[],
  inspectedBy: string,
  qualityRemarks?: string | null,
  inspectionDate?: string | null,
  approvedBy?: string | null,
  isFinalGrn?: boolean,
  finalGrnReason?: string | null,
  finalGrnPerLine?: Record<string, boolean>,
): Promise<void> {
  const now = inspectionDate ? new Date(inspectionDate).toISOString() : new Date().toISOString();
  for (const line of lines) {
    const lineIsFinal = finalGrnPerLine ? (finalGrnPerLine[line.id] ?? false) : (isFinalGrn ?? false);
    const { error } = await (supabase as any)
      .from('grn_line_items')
      .update({
        qty_inspected: line.qty_inspected,
        inspection_method: line.inspection_method,
        conforming_qty: line.conforming_qty,
        non_conforming_qty: line.non_conforming_qty,
        non_conformance_type: line.non_conformance_type ?? null,
        deviation_description: line.deviation_description ?? null,
        disposition: line.disposition ?? null,
        reference_drawing: line.reference_drawing ?? null,
        qc_notes: line.qc_notes ?? null,
        qc_inspected_by: inspectedBy,
        qc_inspected_at: now,
        accepted_qty: line.conforming_qty + (line.non_conforming_qty > 0 && ['accept_as_is','conditional_accept'].includes(line.disposition ?? '') ? line.non_conforming_qty : 0),
        rejected_qty: line.non_conforming_qty > 0 && ['return_to_vendor','scrap'].includes(line.disposition ?? '') ? line.non_conforming_qty : 0,
        is_final_grn: lineIsFinal,
      })
      .eq('id', line.id);
    if (error) throw error;
  }
  const anyFinalGrn = finalGrnPerLine
    ? Object.values(finalGrnPerLine).some(v => v)
    : (isFinalGrn ?? false);
  const totalConforming = lines.reduce((s, l) => s + l.conforming_qty, 0);
  const totalNonConforming = lines.reduce((s, l) => s + l.non_conforming_qty, 0);
  const { error: grnErr } = await (supabase as any)
    .from('grns')
    .update({
      quality_remarks: qualityRemarks ?? null,
      quality_completed_by: inspectedBy,
      total_accepted: totalConforming,
      total_rejected: totalNonConforming,
      qc_approved_by: approvedBy ?? null,
      is_final_grn: anyFinalGrn,
      final_grn_reason: finalGrnReason ?? null,
    })
    .eq('id', grnId);
  if (grnErr) throw grnErr;
  // If any line is final GRN, override stage to awaiting_store
  if (anyFinalGrn) {
    const { error: stageErr } = await (supabase as any)
      .from('grns')
      .update({ grn_stage: 'awaiting_store' })
      .eq('id', grnId);
    if (stageErr) throw stageErr;
  } else {
    // No final GRN lines — goods are going back out for more processing.
    // Transition to quality_done so the GRN is not left stuck at quality_pending.
    const { error: qualDoneErr } = await (supabase as any)
      .from('grns')
      .update({ grn_stage: 'quality_done' })
      .eq('id', grnId);
    if (qualDoneErr) throw qualDoneErr;
  }

  // CHANGE 2: For DC return GRNs — update parent DC status after QC stage
  try {
    const { data: grnMeta } = await (supabase as any)
      .from('grns').select('grn_type, linked_dc_id').eq('id', grnId).single();
    if (grnMeta?.grn_type === 'dc_grn' && grnMeta.linked_dc_id) {
      await recalculateDCStatusFromGRNReceipts(grnMeta.linked_dc_id);
    }
  } catch (dcStatusErr) {
    console.error('[GRN] DC status update failed (quality stage save succeeded):', dcStatusErr);
  }

  // Update linked Job Card step if this GRN is linked to a DC
  try {
    const { data: grnHeader } = await (supabase as any)
      .from("grns")
      .select("linked_dc_id, grn_stage, overall_quality_verdict")
      .eq("id", grnId)
      .single();

    if (grnHeader?.linked_dc_id) {
      const { data: linkedStep } = await (supabase as any)
        .from("job_card_steps")
        .select("id, job_card_id, step_number")
        .eq("outward_dc_id", grnHeader.linked_dc_id)
        .eq("status", "in_progress")
        .single();

      if (linkedStep) {
        await (supabase as any)
          .from("job_card_steps")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            qty_received: totalConforming,
          })
          .eq("id", linkedStep.id);

        const { data: nextStep } = await (supabase as any)
          .from("job_card_steps")
          .select("id, step_number, name")
          .eq("job_card_id", linkedStep.job_card_id)
          .eq("status", "pending")
          .neq("status", "pre_bizdocs")
          .order("step_number", { ascending: true })
          .limit(1)
          .single();

        if (nextStep) {
          await (supabase as any)
            .from("job_cards")
            .update({
              current_stage: nextStep.step_number,
              current_stage_name: nextStep.name,
              updated_at: new Date().toISOString(),
            })
            .eq("id", linkedStep.job_card_id);
        } else {
          await (supabase as any)
            .from("job_cards")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", linkedStep.job_card_id);
        }

        await logAudit(
          "job_card",
          linkedStep.job_card_id,
          "Job Card Step Completed via GRN",
          { step_number: linkedStep.step_number, grn_id: grnId }
        );
      }
    }
  } catch (jcErr) {
    console.error("Job Card step update failed (GRN save succeeded):", jcErr);
  }
}

/**
 * Returns a map of { dc_line_item_id → total_received_now } across all
 * non-deleted GRNs that were created against the given DC. Used to
 * compute previously_received quantities when creating a new DC-GRN.
 */
export async function fetchDCReceiptSummary(dcId: string): Promise<Record<string, number>> {
  const { data: grns } = await (supabase as any)
    .from('grns')
    .select('id')
    .eq('linked_dc_id', dcId)
    .neq('status', 'deleted');
  if (!grns?.length) return {};
  const grnIds = (grns as any[]).map((g: any) => g.id);
  const { data: items } = await (supabase as any)
    .from('grn_line_items')
    .select('dc_line_item_id, received_now, receiving_now')
    .in('grn_id', grnIds);
  const summary: Record<string, number> = {};
  for (const item of (items ?? []) as any[]) {
    const key: string | null = item.dc_line_item_id;
    if (!key) continue;
    summary[key] = (summary[key] ?? 0) + (item.received_now ?? item.receiving_now ?? 0);
  }
  return summary;
}

export async function fetchGRNWithStages(id: string): Promise<GRN> {
  const { data: grn, error } = await (supabase as any).from('grns').select('*').eq('id', id).single();
  if (error) throw error;
  const { data: items, error: itemsError } = await (supabase as any)
    .from('grn_line_items').select('*').eq('grn_id', id).order('serial_number', { ascending: true });
  if (itemsError) throw itemsError;
  const { data: measurements } = await (supabase as any)
    .from('grn_qc_measurements').select('*').eq('grn_id', id)
    .order('grn_line_item_id', { ascending: true }).order('sl_no', { ascending: true });
  return {
    ...(grn as unknown as GRN),
    line_items: items as unknown as GRNLineItem[],
    qc_measurements: (measurements ?? []) as GRNQCMeasurement[],
  };
}

export async function fetchPendingQCGRNs(): Promise<GRN[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data, error } = await (supabase as any)
    .from('grns')
    .select('*')
    .eq('grn_stage', 'quality_pending')
    .neq('status', 'deleted')
    .neq('status', 'cancelled')
    .order('quantitative_completed_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as GRN[];
}

export async function fetchGRNQCMeasurements(grnId: string): Promise<GRNQCMeasurement[]> {
  const { data, error } = await (supabase as any)
    .from('grn_qc_measurements')
    .select('*')
    .eq('grn_id', grnId)
    .order('grn_line_item_id', { ascending: true })
    .order('sl_no', { ascending: true });
  if (error) throw error;
  return (data ?? []) as GRNQCMeasurement[];
}

export async function saveGRNQCMeasurements(
  grnId: string,
  measurements: GRNQCMeasurement[]
): Promise<void> {
  const companyId = await getCompanyId();
  // Delete existing rows for this GRN first
  const { error: delError } = await (supabase as any)
    .from('grn_qc_measurements')
    .delete()
    .eq('grn_id', grnId);
  if (delError) throw delError;
  if (measurements.length === 0) return;
  const rows = measurements.map((m) => ({
    company_id: companyId,
    grn_id: grnId,
    grn_line_item_id: m.grn_line_item_id,
    sl_no: m.sl_no,
    characteristic: m.characteristic,
    specification: m.specification ?? null,
    qty_checked: m.qty_checked ?? null,
    sample_1: m.sample_1 ?? null,
    sample_2: m.sample_2 ?? null,
    sample_3: m.sample_3 ?? null,
    sample_4: m.sample_4 ?? null,
    sample_5: m.sample_5 ?? null,
    result: m.result ?? null,
    measuring_instrument: m.measuring_instrument ?? null,
    remarks: m.remarks ?? null,
    conforming_qty: m.conforming_qty ?? null,
    non_conforming_qty: m.non_conforming_qty ?? null,
  }));
  const { error } = await (supabase as any)
    .from('grn_qc_measurements')
    .insert(rows);
  if (error) throw error;
}

export interface GRNScrapItem {
  material_type: string;
  quantity?: number | null;
  unit?: string;
  notes?: string;
}

export async function saveGRNScrapItems(
  grnId: string,
  scrapReturned: boolean,
  scrapNotes: string | null,
  items: GRNScrapItem[]
): Promise<void> {
  const companyId = await getCompanyId();
  // Update grn header flags
  const { error: grnErr } = await (supabase as any)
    .from('grns')
    .update({ scrap_returned: scrapReturned, scrap_notes: scrapNotes })
    .eq('id', grnId);
  if (grnErr) throw grnErr;
  // Delete then re-insert scrap items
  const { error: delErr } = await (supabase as any)
    .from('grn_scrap_items')
    .delete()
    .eq('grn_id', grnId);
  if (delErr) throw delErr;
  if (scrapReturned && items.length > 0) {
    const rows = items.map((item) => ({
      company_id: companyId,
      grn_id: grnId,
      material_type: item.material_type,
      quantity: item.quantity ?? null,
      unit: item.unit || null,
      notes: item.notes || null,
    }));
    const { error: insErr } = await (supabase as any)
      .from('grn_scrap_items')
      .insert(rows);
    if (insErr) throw insErr;
  }
}

export async function storeConfirmGRN(
  grnId: string,
  data: { confirmedBy: string; confirmedAt: string; location?: string | null; notes?: string | null }
): Promise<void> {
  // For DC return GRNs: move accepted stock from in_process → free on storekeeper confirmation
  const { data: grnHeader } = await (supabase as any)
    .from('grns')
    .select('grn_type, linked_dc_id, company_id')
    .eq('id', grnId)
    .single();

  if (grnHeader?.grn_type === 'dc_grn') {
    const today = new Date().toISOString().split('T')[0];
    const { data: lines } = await (supabase as any)
      .from('grn_line_items')
      .select('item_id, conforming_qty, is_final_grn')
      .eq('grn_id', grnId)
      .eq('is_final_grn', true);

    for (const line of (lines ?? []) as any[]) {
      const qty: number = line.conforming_qty ?? 0;
      if (!line.item_id || qty <= 0) continue;
      await updateStockBucket(line.item_id, 'in_process', -qty).catch(console.error);
      await updateStockBucket(line.item_id, 'free', +qty).catch(console.error);
      await addStockLedgerEntry({
        item_id: line.item_id,
        item_code: null,
        item_description: null,
        transaction_date: today,
        transaction_type: 'dc_return',
        qty_in: qty,
        qty_out: 0,
        balance_qty: 0,
        unit_cost: 0,
        total_value: 0,
        reference_type: 'grn',
        reference_id: grnId,
        reference_number: null,
        notes: 'DC return — storekeeper confirmed',
        created_by: null,
        from_state: 'in_process',
        to_state: 'free',
      });
    }
  }

  const { error } = await (supabase as any)
    .from('grns')
    .update({
      store_confirmed:    true,
      store_confirmed_by: data.confirmedBy,
      store_confirmed_at: new Date(data.confirmedAt).toISOString(),
      store_location:     data.location ?? null,
      store_notes:        data.notes ?? null,
      grn_stage:          'closed',
    })
    .eq('id', grnId);
  if (error) throw error;

  // CHANGE 1+2: For DC return GRNs — set GRN status fully_received and update DC status
  if (grnHeader?.grn_type === 'dc_grn') {
    await recalculateGRNStatusFromLines(grnId).catch(console.error);
    if (grnHeader.linked_dc_id) {
      await recalculateDCStatusFromGRNReceipts(grnHeader.linked_dc_id).catch(console.error);
    }
  }
}

export async function fetchAwaitingStoreCount(): Promise<number> {
  const companyId = await getCompanyId();
  if (!companyId) return 0;
  const { count } = await (supabase as any)
    .from('grn_line_items')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_final_grn', true)
    .neq('store_confirmed', true);
  return count ?? 0;
}

export interface AwaitingStoreLineItem {
  id: string;
  grn_id: string;
  grn_number: string;
  grn_date: string;
  vendor_name: string | null;
  description: string;
  drawing_number: string | null;
  conforming_qty: number | null;
}

export async function fetchAwaitingStoreLineItems(): Promise<AwaitingStoreLineItem[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data: lineItems, error } = await (supabase as any)
    .from('grn_line_items')
    .select('id, grn_id, description, drawing_number, conforming_qty')
    .eq('company_id', companyId)
    .eq('is_final_grn', true)
    .neq('store_confirmed', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!lineItems?.length) return [];

  const grnIds = [...new Set((lineItems as any[]).map((l: any) => l.grn_id as string))];
  const { data: grns } = await (supabase as any)
    .from('grns')
    .select('id, grn_number, grn_date, vendor_name')
    .in('id', grnIds);
  const grnMap: Record<string, any> = {};
  for (const g of (grns ?? []) as any[]) grnMap[g.id] = g;

  return (lineItems as any[]).map((l: any) => ({
    id: l.id,
    grn_id: l.grn_id,
    grn_number: grnMap[l.grn_id]?.grn_number ?? '—',
    grn_date: grnMap[l.grn_id]?.grn_date ?? '',
    vendor_name: grnMap[l.grn_id]?.vendor_name ?? null,
    description: l.description,
    drawing_number: l.drawing_number ?? null,
    conforming_qty: l.conforming_qty ?? null,
  }));
}

export async function storeConfirmLineItem(
  lineItemId: string,
  data: { confirmedBy: string; confirmedAt: string; location?: string | null }
): Promise<void> {
  const { error } = await (supabase as any)
    .from('grn_line_items')
    .update({
      store_confirmed:    true,
      store_confirmed_by: data.confirmedBy,
      store_confirmed_at: new Date(data.confirmedAt).toISOString(),
      store_location:     data.location ?? null,
    })
    .eq('id', lineItemId);
  if (error) throw error;
}

/** @deprecated Use fetchAwaitingStoreLineItems instead */
export async function fetchAwaitingStoreGRNs(): Promise<any[]> {
  return [];
}

export interface StoreConfirmedItem {
  id: string;
  grn_id: string;
  grn_number: string;
  grn_date: string;
  vendor_name: string | null;
  description: string;
  drawing_number: string | null;
  conforming_qty: number | null;
  unit: string | null;
  store_confirmed_by: string | null;
  store_confirmed_at: string | null;
  store_location: string | null;
  is_final_grn: boolean;
  linked_dc_id: string | null;
  linked_dc_number: string | null;
}

export async function fetchStoreConfirmedHistory(): Promise<StoreConfirmedItem[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data: lineItems, error } = await (supabase as any)
    .from('grn_line_items')
    .select('id, grn_id, description, drawing_number, conforming_qty, unit, store_confirmed_by, store_confirmed_at, store_location, is_final_grn')
    .eq('company_id', companyId)
    .eq('store_confirmed', true)
    .order('store_confirmed_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!lineItems?.length) return [];

  const grnIds = [...new Set((lineItems as any[]).map((l: any) => l.grn_id as string))];
  const { data: grns } = await (supabase as any)
    .from('grns')
    .select('id, grn_number, grn_date, vendor_name, linked_dc_id, linked_dc_number')
    .in('id', grnIds)
    .neq('status', 'deleted');
  const grnMap: Record<string, any> = {};
  for (const g of (grns ?? []) as any[]) grnMap[g.id] = g;

  return (lineItems as any[])
    .filter((l: any) => grnMap[l.grn_id])
    .map((l: any) => ({
      id: l.id,
      grn_id: l.grn_id,
      grn_number: grnMap[l.grn_id]?.grn_number ?? '—',
      grn_date: grnMap[l.grn_id]?.grn_date ?? '',
      vendor_name: grnMap[l.grn_id]?.vendor_name ?? null,
      description: l.description,
      drawing_number: l.drawing_number ?? null,
      conforming_qty: l.conforming_qty ?? null,
      unit: l.unit ?? null,
      store_confirmed_by: l.store_confirmed_by ?? null,
      store_confirmed_at: l.store_confirmed_at ?? null,
      store_location: l.store_location ?? null,
      is_final_grn: l.is_final_grn ?? false,
      linked_dc_id: grnMap[l.grn_id]?.linked_dc_id ?? null,
      linked_dc_number: grnMap[l.grn_id]?.linked_dc_number ?? null,
    }));
}
