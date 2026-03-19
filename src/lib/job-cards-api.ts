import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit-api";

// ============================================================
// Interfaces
// ============================================================

export interface StageTemplate {
  id: string;
  company_id: string;
  name: string;
  category: string;
  description: string | null;
  default_cost: number;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface JobCard {
  id: string;
  company_id: string;
  jc_number: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  tracking_mode: "batch" | "single";
  batch_ref: string | null;
  quantity_original: number;
  quantity_accepted: number;
  quantity_rejected: number;
  initial_cost: number;
  standard_cost: number;
  current_location: "in_house" | "at_vendor";
  current_vendor_name: string | null;
  current_vendor_since: string | null;
  status: "in_progress" | "completed" | "on_hold";
  notes: string | null;
  completed_at: string | null;
  linked_grn_id: string | null;
  drawing_number: string | null;
  drawing_revision: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobCardSummary extends JobCard {
  total_step_cost: number;
  total_cost: number;
  cost_per_unit: number | null;
  variance: number;
  step_count: number;
  completed_steps: number;
}

export interface JobCardStep {
  id: string;
  company_id: string;
  job_card_id: string;
  step_number: number;
  step_type: "internal" | "external";
  name: string;
  stage_template_id: string | null;
  status: "pending" | "in_progress" | "done";
  // Internal
  labour_cost: number;
  material_cost: number;
  additional_cost: number;
  // External
  vendor_id: string | null;
  vendor_name: string | null;
  outward_dc_id: string | null;
  expected_return_date: string | null;
  return_dc_id: string | null;
  return_grn_id: string | null;
  qty_sent: number | null;
  qty_returned: number | null;
  job_work_charges: number;
  transport_cost_out: number;
  transport_cost_in: number;
  material_consumed: number;
  // Inspection
  inspection_result: "accepted" | "partially_accepted" | "rejected" | null;
  qty_accepted: number | null;
  qty_rejected: number | null;
  rejection_reason: string | null;
  inspected_by: string | null;
  inspected_at: string | null;
  // Rework
  is_rework: boolean;
  rework_reason: string | null;
  // General
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobCardFilters {
  search?: string;
  status?: string;
  location?: string;
  item_id?: string;
  page?: number;
  pageSize?: number;
}

export interface WipEntry {
  id: string;
  company_id: string;
  jc_number: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  tracking_mode: "batch" | "single";
  batch_ref: string | null;
  quantity_original: number;
  quantity_accepted: number;
  quantity_rejected: number;
  initial_cost: number;
  current_location: "in_house" | "at_vendor";
  current_vendor_name: string | null;
  current_vendor_since: string | null;
  status: "in_progress" | "on_hold";
  notes: string | null;
  created_at: string;
  days_active: number;
  days_at_vendor: number | null;
  current_step_id: string | null;
  current_step_name: string | null;
  current_step_type: "internal" | "external" | null;
  current_step_number: number | null;
  current_step_vendor: string | null;
  expected_return_date: string | null;
  is_overdue: boolean;
  days_overdue: number | null;
  total_cost: number;
  total_step_cost: number;
  step_count: number;
  completed_steps: number;
}

export interface WipFilters {
  search?: string;
  location?: "all" | "in_house" | "at_vendor";
  overdueOnly?: boolean;
}

export interface WipSummary {
  totalActive: number;
  atVendor: number;
  overdueReturns: number;
  inHouse: number;
}

// ============================================================
// Auto-numbering
// ============================================================

export async function getNextJCNumber(): Promise<string> {
  const now = new Date();
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStr = `${String(fy).slice(2)}${String(fy + 1).slice(2)}`;
  const prefix = `JC-${fyStr}-`;
  const { data } = await supabase
    .from("job_cards" as any)
    .select("jc_number")
    .ilike("jc_number", `${prefix}%`)
    .order("jc_number", { ascending: false })
    .limit(1);
  if (data && data.length > 0) {
    const num = parseInt((data[0] as any).jc_number.split("-").pop() || "0", 10);
    return `${prefix}${String(num + 1).padStart(3, "0")}`;
  }
  return `${prefix}001`;
}

// ============================================================
// Job Cards
// ============================================================

export async function fetchJobCards(filters: JobCardFilters = {}) {
  const { search, status = "all", location = "all", item_id, page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("job_card_summary")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status !== "all") query = query.eq("status", status);
  if (location !== "all") query = query.eq("current_location", location);
  if (item_id) query = query.eq("item_id", item_id);

  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(
        `jc_number.ilike.${term},item_code.ilike.${term},item_description.ilike.${term},batch_ref.ilike.${term}`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as JobCardSummary[], count: count ?? 0 };
}

export async function fetchJobCard(id: string): Promise<JobCard & { steps: JobCardStep[] }> {
  const [jcRes, stepsRes] = await Promise.all([
    (supabase as any).from("job_cards").select("*").eq("id", id).single(),
    (supabase as any)
      .from("job_card_steps")
      .select("*")
      .eq("job_card_id", id)
      .order("step_number", { ascending: true }),
  ]);
  if (jcRes.error) throw jcRes.error;
  if (stepsRes.error) throw stepsRes.error;
  return { ...(jcRes.data as JobCard), steps: (stepsRes.data ?? []) as JobCardStep[] };
}

export async function fetchJobCardSummary(id: string): Promise<JobCardSummary> {
  const { data, error } = await (supabase as any)
    .from("job_card_summary")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as JobCardSummary;
}

export async function createJobCard(
  data: Partial<JobCard> & { item_id?: string }
): Promise<JobCard> {
  const companyId = await getCompanyId();

  let standardCost = data.standard_cost ?? 0;
  let drawingNumber: string | null = null;
  let drawingRevision: string | null = null;
  if (data.item_id) {
    const { data: item } = await (supabase as any)
      .from("items")
      .select("standard_cost, drawing_number, drawing_revision")
      .eq("id", data.item_id)
      .single();
    if (item?.standard_cost != null) standardCost = item.standard_cost;
    if (item?.drawing_number) drawingNumber = item.drawing_number;
    if (item?.drawing_revision) drawingRevision = item.drawing_revision;
  }

  const { data: jc, error } = await (supabase as any)
    .from("job_cards")
    .insert({
      company_id: companyId,
      jc_number: data.jc_number,
      item_id: data.item_id ?? null,
      item_code: data.item_code ?? null,
      item_description: data.item_description ?? null,
      tracking_mode: data.tracking_mode ?? "batch",
      batch_ref: data.batch_ref ?? null,
      quantity_original: data.quantity_original ?? 1,
      quantity_accepted: data.quantity_accepted ?? data.quantity_original ?? 1,
      quantity_rejected: 0,
      initial_cost: data.initial_cost ?? 0,
      standard_cost: standardCost,
      current_location: "in_house",
      status: "in_progress",
      notes: data.notes ?? null,
      linked_grn_id: data.linked_grn_id ?? null,
      drawing_number: drawingNumber,
      drawing_revision: drawingRevision,
    })
    .select()
    .single();
  if (error) throw error;

  const created = jc as JobCard;
  const createdSummary = [
    created.jc_number,
    created.item_code,
    created.item_description,
    `qty ${created.quantity_original}`,
    created.initial_cost > 0
      ? `initial cost ₹${created.initial_cost.toLocaleString("en-IN")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  logAudit("job_card", created.id, "Job Card Created", {
    summary: createdSummary,
    jc_number: created.jc_number,
    item_code: created.item_code,
    item_description: created.item_description,
    quantity: created.quantity_original,
    initial_cost: created.initial_cost,
  }).catch(console.error);

  return jc as JobCard;
}

export async function updateJobCard(id: string, data: Partial<JobCard>): Promise<JobCard> {
  const { data: jc, error } = await (supabase as any)
    .from("job_cards")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return jc as JobCard;
}

export async function deleteJobCard(id: string): Promise<void> {
  const { error } = await (supabase as any).from("job_cards").delete().eq("id", id);
  if (error) throw error;
}

export async function completeJobCard(
  id: string,
  outcome: "stock" | "assembly" | "customer",
  outcomeNote?: string
): Promise<void> {
  // Fetch job card for audit and stock update
  const { data: jc, error: jcErr } = await (supabase as any)
    .from("job_cards")
    .select("item_id, quantity_accepted, jc_number")
    .eq("id", id)
    .single();
  if (jcErr) throw jcErr;

  const { error } = await (supabase as any)
    .from("job_cards")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  // If outcome is "stock" and item linked, increase current_stock
  if (outcome === "stock" && (jc as any)?.item_id && ((jc as any)?.quantity_accepted ?? 0) > 0) {
    const { data: item } = await (supabase as any)
      .from("items")
      .select("current_stock")
      .eq("id", (jc as any).item_id)
      .single();
    if (item) {
      await (supabase as any)
        .from("items")
        .update({ current_stock: ((item as any).current_stock ?? 0) + (jc as any).quantity_accepted })
        .eq("id", (jc as any).item_id);
    }
  }

  const outcomeLabels: Record<string, string> = {
    stock: "Move to Stock",
    assembly: "Consumed into Assembly",
    customer: "Sent to Customer",
  };
  const qtyAccepted = (jc as any)?.quantity_accepted ?? 0;

  // Fetch summary view for total_cost / cost_per_unit
  const { data: jcSummary } = await (supabase as any)
    .from("job_card_summary")
    .select("total_cost, cost_per_unit")
    .eq("id", id)
    .single();
  const totalCost = (jcSummary as any)?.total_cost ?? 0;
  const costPerUnit = (jcSummary as any)?.cost_per_unit;

  const completedSummaryParts = [
    outcomeLabels[outcome],
    `${qtyAccepted} units accepted`,
    `total cost ₹${totalCost.toLocaleString("en-IN")}`,
    costPerUnit != null
      ? `₹${Number(costPerUnit).toLocaleString("en-IN", { maximumFractionDigits: 2 })} / unit`
      : null,
  ].filter(Boolean);

  logAudit("job_card", id, "Job Card Completed", {
    summary: completedSummaryParts.join(" · "),
    outcome: outcomeLabels[outcome],
    outcome_note: outcomeNote || undefined,
    quantity_accepted: qtyAccepted,
    total_cost: totalCost,
    cost_per_unit: costPerUnit,
  }).catch(console.error);
}

export async function updateJobCardStatus(
  id: string,
  status: "in_progress" | "on_hold"
): Promise<void> {
  const { error } = await (supabase as any)
    .from("job_cards")
    .update({ status })
    .eq("id", id);
  if (error) throw error;

  const statusAction = status === "on_hold" ? "Placed On Hold" : "Resumed";
  logAudit("job_card", id, statusAction, {
    summary: status === "on_hold" ? "Job Card placed on hold" : "Job Card resumed",
  }).catch(console.error);
}

export async function fetchItemCurrentStock(itemId: string): Promise<number> {
  const { data } = await (supabase as any)
    .from("items")
    .select("current_stock")
    .eq("id", itemId)
    .single();
  return (data as any)?.current_stock ?? 0;
}

export async function fetchJobCardStats() {
  const { data, error } = await (supabase as any)
    .from("job_cards")
    .select("id, status, current_location");
  if (error) throw error;
  const all = (data ?? []) as any[];
  return {
    inProgress: all.filter((j) => j.status === "in_progress").length,
    completed: all.filter((j) => j.status === "completed").length,
    onHold: all.filter((j) => j.status === "on_hold").length,
    atVendor: all.filter((j) => j.current_location === "at_vendor").length,
    total: all.length,
  };
}

// ============================================================
// Job Card Steps
// ============================================================

export async function fetchJobCardSteps(jobCardId: string): Promise<JobCardStep[]> {
  const { data, error } = await (supabase as any)
    .from("job_card_steps")
    .select("*")
    .eq("job_card_id", jobCardId)
    .order("step_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as JobCardStep[];
}

export async function createJobCardStep(
  data: Partial<JobCardStep> & { job_card_id: string }
): Promise<JobCardStep> {
  const companyId = await getCompanyId();

  const { data: existing } = await (supabase as any)
    .from("job_card_steps")
    .select("step_number")
    .eq("job_card_id", data.job_card_id)
    .order("step_number", { ascending: false })
    .limit(1);
  const nextStepNumber = existing && existing.length > 0 ? existing[0].step_number + 1 : 1;

  const { data: step, error } = await (supabase as any)
    .from("job_card_steps")
    .insert({
      company_id: companyId,
      job_card_id: data.job_card_id,
      step_number: data.step_number ?? nextStepNumber,
      step_type: data.step_type,
      name: data.name,
      stage_template_id: data.stage_template_id ?? null,
      status: data.status ?? "pending",
      labour_cost: data.labour_cost ?? 0,
      material_cost: data.material_cost ?? 0,
      additional_cost: data.additional_cost ?? 0,
      vendor_id: data.vendor_id ?? null,
      vendor_name: data.vendor_name ?? null,
      outward_dc_id: data.outward_dc_id ?? null,
      expected_return_date: data.expected_return_date ?? null,
      qty_sent: data.qty_sent ?? null,
      job_work_charges: data.job_work_charges ?? 0,
      transport_cost_out: data.transport_cost_out ?? 0,
      transport_cost_in: data.transport_cost_in ?? 0,
      material_consumed: data.material_consumed ?? 0,
      is_rework: data.is_rework ?? false,
      rework_reason: data.rework_reason ?? null,
      notes: data.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  // If external step, update job card location to at_vendor
  if (data.step_type === "external" && data.vendor_name) {
    await (supabase as any)
      .from("job_cards")
      .update({
        current_location: "at_vendor",
        current_vendor_name: data.vendor_name,
        current_vendor_since: new Date().toISOString(),
      })
      .eq("id", data.job_card_id);
  }

  const stepNum = (step as any).step_number;
  const stepName = data.name ?? "";
  if (data.step_type === "internal") {
    const stepTotalCost =
      (data.labour_cost ?? 0) + (data.material_cost ?? 0) + (data.additional_cost ?? 0);
    logAudit("job_card", data.job_card_id, "Internal Step Added", {
      summary: `Step ${stepNum} — ${stepName} added (₹${stepTotalCost.toLocaleString("en-IN")})`,
      step_number: stepNum,
      step_name: stepName,
      total_cost: stepTotalCost,
    }).catch(console.error);
  } else {
    const vendor = data.vendor_name ?? "vendor";
    const charges = data.job_work_charges ?? 0;
    const duePart = data.expected_return_date ? `, due ${data.expected_return_date}` : "";
    const costPart = charges > 0 ? ` (₹${charges.toLocaleString("en-IN")})` : "";
    logAudit("job_card", data.job_card_id, "External Job Work Added", {
      summary: `Step ${stepNum} — ${stepName} sent to ${vendor}${costPart}${duePart}`,
      step_number: stepNum,
      step_name: stepName,
      vendor_name: vendor,
      expected_return_date: data.expected_return_date ?? null,
      job_work_charges: charges,
    }).catch(console.error);
  }

  return step as JobCardStep;
}

export async function updateJobCardStep(
  id: string,
  data: Partial<JobCardStep>
): Promise<JobCardStep> {
  const { data: step, error } = await (supabase as any)
    .from("job_card_steps")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  logAudit("job_card", (step as any).job_card_id, "Step Updated", {
    summary: `Step ${(step as any).step_number} — ${(step as any).name}`,
    step_number: (step as any).step_number,
    step_name: (step as any).name,
  }).catch(console.error);

  return step as JobCardStep;
}

export async function deleteJobCardStep(id: string): Promise<void> {
  // Fetch step info before deleting for audit
  const { data: step } = await (supabase as any)
    .from("job_card_steps")
    .select("job_card_id, name, step_number")
    .eq("id", id)
    .single();

  const { error } = await (supabase as any).from("job_card_steps").delete().eq("id", id);
  if (error) throw error;

  if (step) {
    logAudit("job_card", (step as any).job_card_id, "Step Deleted", {
      summary: `Step ${(step as any).step_number} — ${(step as any).name} removed`,
      step_number: (step as any).step_number,
      step_name: (step as any).name,
    }).catch(console.error);
  }
}

export interface RecordReturnData {
  qty_returned: number;
  inspection_result: "accepted" | "partially_accepted" | "rejected";
  qty_accepted: number;
  qty_rejected: number;
  rejection_reason?: string;
  inspected_by?: string;
  notes?: string;
  return_dc_id?: string;
  return_grn_id?: string;
}

export async function recordStepReturn(
  stepId: string,
  returnData: RecordReturnData
): Promise<JobCardStep> {
  // 1. Update the step
  const { data: step, error: stepErr } = await (supabase as any)
    .from("job_card_steps")
    .update({
      qty_returned: returnData.qty_returned,
      inspection_result: returnData.inspection_result,
      qty_accepted: returnData.qty_accepted,
      qty_rejected: returnData.qty_rejected,
      rejection_reason: returnData.rejection_reason ?? null,
      inspected_by: returnData.inspected_by ?? null,
      inspected_at: new Date().toISOString(),
      notes: returnData.notes ?? null,
      return_dc_id: returnData.return_dc_id ?? null,
      return_grn_id: returnData.return_grn_id ?? null,
      status: "done",
      completed_at: new Date().toISOString(),
    })
    .eq("id", stepId)
    .select()
    .single();
  if (stepErr) throw stepErr;

  // 2. Update job card quantities and location
  const jcId = (step as any).job_card_id;
  const { data: jc } = await (supabase as any)
    .from("job_cards")
    .select("quantity_accepted, quantity_rejected")
    .eq("id", jcId)
    .single();

  if (jc) {
    const rejectedDelta = returnData.qty_rejected ?? 0;
    const newAccepted = Math.max(0, (jc as any).quantity_accepted - rejectedDelta);
    const newRejected = (jc as any).quantity_rejected + rejectedDelta;

    await (supabase as any)
      .from("job_cards")
      .update({
        quantity_accepted: newAccepted,
        quantity_rejected: newRejected,
        current_location: "in_house",
        current_vendor_name: null,
        current_vendor_since: null,
      })
      .eq("id", jcId);
  }

  const vendorName = (step as any).vendor_name ?? "vendor";
  const result = returnData.inspection_result;
  const returnAction =
    result === "accepted"
      ? "Return Recorded — Accepted"
      : result === "partially_accepted"
      ? "Return Recorded — Partial"
      : "Return Recorded — Rejected";

  let returnSummary: string;
  if (result === "accepted") {
    returnSummary = `${vendorName} returned ${returnData.qty_returned} units — all accepted`;
  } else if (result === "partially_accepted") {
    returnSummary = `${vendorName} returned ${returnData.qty_returned} units — ${returnData.qty_accepted} accepted, ${returnData.qty_rejected} rejected`;
    if (returnData.rejection_reason) returnSummary += ` (${returnData.rejection_reason})`;
  } else {
    returnSummary = `${vendorName} returned ${returnData.qty_returned} units — all rejected`;
    if (returnData.rejection_reason) returnSummary += ` (${returnData.rejection_reason})`;
  }

  logAudit("job_card", jcId, returnAction, {
    summary: returnSummary,
    vendor_name: vendorName,
    qty_returned: returnData.qty_returned,
    qty_accepted: returnData.qty_accepted,
    qty_rejected: returnData.qty_rejected,
    rejection_reason: returnData.rejection_reason ?? null,
  }).catch(console.error);

  return step as JobCardStep;
}

// ============================================================
// Stage Templates
// ============================================================

export interface StageTemplateFilters {
  search?: string;
  category?: string;
  status?: string;
}

export async function fetchStageTemplates(
  filters: StageTemplateFilters = {}
): Promise<StageTemplate[]> {
  const { search, category = "all", status = "active" } = filters;

  let query = (supabase as any)
    .from("stage_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (status !== "all") query = query.eq("status", status);
  if (category !== "all") query = query.eq("category", category);

  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`name.ilike.${term},description.ilike.${term}`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StageTemplate[];
}

export async function createStageTemplate(
  data: Partial<StageTemplate>
): Promise<StageTemplate> {
  const companyId = await getCompanyId();
  const { data: tmpl, error } = await (supabase as any)
    .from("stage_templates")
    .insert({
      company_id: companyId,
      name: data.name,
      category: data.category ?? "Other",
      description: data.description ?? null,
      default_cost: data.default_cost ?? 0,
      sort_order: data.sort_order ?? 0,
      status: "active",
    })
    .select()
    .single();
  if (error) throw error;
  return tmpl as StageTemplate;
}

export async function updateStageTemplate(
  id: string,
  data: Partial<StageTemplate>
): Promise<StageTemplate> {
  const { data: tmpl, error } = await (supabase as any)
    .from("stage_templates")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return tmpl as StageTemplate;
}

export async function deleteStageTemplate(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("stage_templates")
    .update({ status: "inactive" })
    .eq("id", id);
  if (error) throw error;
}

// ============================================================
// WIP Register
// ============================================================

export async function fetchWipRegister(filters: WipFilters = {}): Promise<WipEntry[]> {
  const { search, location = "all", overdueOnly = false } = filters;

  let query = (supabase as any)
    .from("wip_register")
    .select("*");

  if (location !== "all") query = query.eq("current_location", location);
  if (overdueOnly) query = query.eq("is_overdue", true);

  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(
        `jc_number.ilike.${term},item_code.ilike.${term},item_description.ilike.${term},current_vendor_name.ilike.${term}`
      );
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as WipEntry[];
}

// ============================================================
// Vendor Scorecard
// ============================================================

export interface VendorScorecard {
  vendor_id: string;
  company_id: string;
  vendor_name: string;
  city: string | null;
  phone1: string | null;
  gstin: string | null;
  total_steps: number;
  total_qty_sent: number;
  total_qty_accepted: number;
  total_qty_rejected: number;
  rejection_rate_pct: number;
  avg_turnaround_days: number | null;
  on_time_rate_pct: number | null;
  overdue_steps: number;
  total_charges: number;
  performance_rating: "reliable" | "watch" | "review" | "new";
  last_used_at: string | null;
}

export interface VendorJobWorkStep extends JobCardStep {
  jc_number: string;
  item_code: string | null;
  item_description: string | null;
}

export async function fetchVendorScorecards(search?: string): Promise<VendorScorecard[]> {
  let query = (supabase as any).from("vendor_scorecard").select("*");
  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      query = query.ilike("vendor_name", `%${sanitized}%`);
    }
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as VendorScorecard[];
}

export async function fetchVendorScorecard(vendorId: string): Promise<VendorScorecard | null> {
  const { data, error } = await (supabase as any)
    .from("vendor_scorecard")
    .select("*")
    .eq("vendor_id", vendorId)
    .single();
  if (error) return null;
  return data as VendorScorecard;
}

export async function fetchVendorJobWorkSteps(vendorId: string): Promise<VendorJobWorkStep[]> {
  const { data: steps, error } = await (supabase as any)
    .from("job_card_steps")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("step_type", "external")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const stepsData = (steps ?? []) as JobCardStep[];
  if (stepsData.length === 0) return [];

  const jcIds = [...new Set(stepsData.map((s) => s.job_card_id))];
  const { data: jcs } = await (supabase as any)
    .from("job_cards")
    .select("id, jc_number, item_code, item_description")
    .in("id", jcIds);
  const jcMap = new Map(((jcs ?? []) as any[]).map((jc) => [jc.id, jc]));

  return stepsData.map((step) => ({
    ...step,
    jc_number: (jcMap.get(step.job_card_id) as any)?.jc_number ?? "—",
    item_code: (jcMap.get(step.job_card_id) as any)?.item_code ?? null,
    item_description: (jcMap.get(step.job_card_id) as any)?.item_description ?? null,
  })) as VendorJobWorkStep[];
}

export async function bulkDeleteJobCards(ids: string[]): Promise<void> {
  const { error } = await (supabase as any).from("job_cards").delete().in("id", ids);
  if (error) throw error;
  logAudit("job_card", ids[0], "Bulk Deleted", { count: ids.length, ids }).catch(console.error);
}

export async function fetchWipSummary(): Promise<WipSummary> {
  const { data, error } = await (supabase as any)
    .from("wip_register")
    .select("current_location, is_overdue");
  if (error) throw error;
  const all = (data ?? []) as any[];
  return {
    totalActive: all.length,
    atVendor: all.filter((r) => r.current_location === "at_vendor").length,
    overdueReturns: all.filter((r) => r.is_overdue === true).length,
    inHouse: all.filter((r) => r.current_location === "in_house").length,
  };
}
