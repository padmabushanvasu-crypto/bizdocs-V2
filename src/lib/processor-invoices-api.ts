import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// Processor (job-work) invoice tracking. Actual cost is REPORTING ONLY — nothing
// here touches item cost or job_work_charges. The tables are SELECT-only under
// RLS; every write goes through the RPCs below. Views only cover job_work_out /
// job_work_143 DCs that are issued / partially_returned / fully_returned.
// Live-DB column lists verified by Vasu; no types.ts entries, hence `as any`.

export type DcInvoiceStatus = "Invoice pending" | "Invoice partly received" | "Invoice received";
export type DcLineInvoiceStatus = "pending" | "invoiced";

/** v_dc_invoice_status — one row per DC. */
export interface DcInvoiceStatusRow {
  company_id: string;
  dc_id: string;
  dc_number: string;
  dc_date: string;
  party_id: string | null;
  party_name: string | null;
  dc_status: string;
  line_count: number;
  lines_invoiced: number;
  estimate_amount: number;
  actual_taxable: number;
  variance_amount: number;
  invoice_status: DcInvoiceStatus;
}

/** v_dc_line_estimate_vs_actual — one row per DC line. */
export interface DcLineEstimateVsActualRow {
  company_id: string;
  dc_id: string;
  dc_number: string;
  dc_date: string;
  party_id: string | null;
  party_name: string | null;
  dc_status: string;
  dc_line_item_id: string;
  serial_number: number | null;
  item_id: string | null;
  item_code: string | null;
  description: string | null;
  job_card_id: string | null;
  step_number: number | null;
  unit: string | null;
  dc_qty: number;
  estimate_rate: number;
  estimate_amount: number;
  billed_qty: number;
  actual_taxable: number;
  actual_gst: number;
  actual_rate_avg: number | null;
  variance_amount: number;
  line_invoice_status: DcLineInvoiceStatus;
  /** billed_qty >= dc_qty. 'invoiced' status alone means "has any billing". */
  line_fully_billed: boolean;
}

/** v_job_card_processing_cost — one row per job card step. */
export interface JobCardProcessingCostRow {
  company_id: string;
  job_card_id: string;
  step_number: number;
  estimate_amount: number;
  actual_taxable: number;
  lines_invoice_pending: number;
  variance_amount: number;
}

export interface ProcessorInvoiceLineInput {
  dc_line_item_id: string;
  qty_billed: number;
  actual_rate: number;
  /** Must be within Rs 1 of qty_billed * actual_rate (enforced by the RPC). */
  taxable_amount?: number;
  /** RPC defaults to 18 when omitted. */
  gst_rate?: number;
  grn_line_item_id?: string | null;
}

export interface SaveProcessorInvoiceParams {
  partyId: string;
  invoiceNumber: string;
  invoiceDate: string;
  remarks?: string | null;
  lines: ProcessorInvoiceLineInput[];
}

// PostgREST may hand numeric columns back as strings; normalise so callers can
// do arithmetic without surprises.
const NUMERIC_KEYS_DC = ["line_count", "lines_invoiced", "estimate_amount", "actual_taxable", "variance_amount"] as const;
const NUMERIC_KEYS_LINE = [
  "dc_qty", "estimate_rate", "estimate_amount", "billed_qty", "actual_taxable", "actual_gst", "variance_amount",
] as const;
const NUMERIC_KEYS_JC = ["estimate_amount", "actual_taxable", "lines_invoice_pending", "variance_amount"] as const;

function coerce<T>(row: any, keys: readonly string[]): T {
  const out = { ...row };
  for (const k of keys) out[k] = Number(out[k] ?? 0);
  if ("actual_rate_avg" in out) out.actual_rate_avg = out.actual_rate_avg == null ? null : Number(out.actual_rate_avg);
  return out as T;
}

async function requireCompanyId(): Promise<string> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company found for the current user");
  return companyId;
}

/** Per-step estimate vs actual for one job card (empty array if nothing issued yet). */
export async function fetchJobCardProcessingCost(jobCardId: string): Promise<JobCardProcessingCostRow[]> {
  const companyId = await requireCompanyId();
  const { data, error } = await (supabase as any)
    .from("v_job_card_processing_cost")
    .select("*")
    .eq("company_id", companyId)
    .eq("job_card_id", jobCardId)
    .order("step_number", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => coerce<JobCardProcessingCostRow>(r, NUMERIC_KEYS_JC));
}

/** Invoice status for a set of DCs (e.g. the visible register page). */
export async function fetchDcInvoiceStatuses(dcIds: string[]): Promise<DcInvoiceStatusRow[]> {
  if (dcIds.length === 0) return [];
  const companyId = await requireCompanyId();
  const { data, error } = await (supabase as any)
    .from("v_dc_invoice_status")
    .select("*")
    .eq("company_id", companyId)
    .in("dc_id", dcIds);
  if (error) throw error;
  return (data ?? []).map((r: any) => coerce<DcInvoiceStatusRow>(r, NUMERIC_KEYS_DC));
}

/** DC-level report rows; optionally filtered by party / invoice status. */
export async function fetchDcInvoiceStatusReport(
  filters: { partyId?: string; invoiceStatus?: DcInvoiceStatus } = {},
): Promise<DcInvoiceStatusRow[]> {
  const companyId = await requireCompanyId();
  let q = (supabase as any).from("v_dc_invoice_status").select("*").eq("company_id", companyId);
  if (filters.partyId) q = q.eq("party_id", filters.partyId);
  if (filters.invoiceStatus) q = q.eq("invoice_status", filters.invoiceStatus);
  const { data, error } = await q.order("dc_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => coerce<DcInvoiceStatusRow>(r, NUMERIC_KEYS_DC));
}

/** Line-level rows for a DC (detail badge / per-line view). */
export async function fetchDcLineEstimateVsActual(dcId: string): Promise<DcLineEstimateVsActualRow[]> {
  const companyId = await requireCompanyId();
  const { data, error } = await (supabase as any)
    .from("v_dc_line_estimate_vs_actual")
    .select("*")
    .eq("company_id", companyId)
    .eq("dc_id", dcId)
    .order("serial_number", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => coerce<DcLineEstimateVsActualRow>(r, NUMERIC_KEYS_LINE));
}

/** DC lines still awaiting an invoice for one processor (invoice entry page). */
export async function fetchPendingInvoiceLines(partyId: string): Promise<DcLineEstimateVsActualRow[]> {
  const companyId = await requireCompanyId();
  const { data, error } = await (supabase as any)
    .from("v_dc_line_estimate_vs_actual")
    .select("*")
    .eq("company_id", companyId)
    .eq("party_id", partyId)
    .eq("line_invoice_status", "pending")
    .order("dc_date", { ascending: true })
    .order("serial_number", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => coerce<DcLineEstimateVsActualRow>(r, NUMERIC_KEYS_LINE));
}

/** Variance = actual taxable − estimate rate × billed qty (same as the views). */
export function computeLineVariance(estimateRate: number, qtyBilled: number, actualRate: number): number {
  return Math.round((actualRate - estimateRate) * qtyBilled * 100) / 100;
}

/** Saves a processor invoice; RPC errors (check_violation) propagate verbatim. */
export async function saveProcessorInvoice(params: SaveProcessorInvoiceParams): Promise<string> {
  const companyId = await requireCompanyId();
  const { data, error } = await (supabase as any).rpc("rpc_save_processor_invoice", {
    p_company_id: companyId,
    p_party_id: params.partyId,
    p_invoice_number: params.invoiceNumber,
    p_invoice_date: params.invoiceDate,
    p_remarks: params.remarks ?? null,
    p_lines: params.lines,
  });
  if (error) throw error;
  return data as string;
}

/** Cancels an active processor invoice; RPC errors propagate verbatim. */
export async function cancelProcessorInvoice(invoiceId: string, reason: string): Promise<void> {
  const { error } = await (supabase as any).rpc("rpc_cancel_processor_invoice", {
    p_invoice_id: invoiceId,
    p_reason: reason,
  });
  if (error) throw error;
}

// ── Invoice register + entry-form reads ──────────────────────────────────────

export interface ProcessorPartyOption {
  id: string;
  name: string;
}

/** Active parties with vendor_type processor / both (same rule as DeliveryChallanDetail). */
export async function fetchProcessorParties(): Promise<ProcessorPartyOption[]> {
  const companyId = await requireCompanyId();
  const { data, error } = await (supabase as any)
    .from("parties")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("vendor_type", ["processor", "both"])
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProcessorPartyOption[];
}

const PAGE = 1000; // PostgREST default max rows per request

/**
 * DC lines for one processor that can still be billed: pending OR partly billed
 * (billed_qty < dc_qty). The view only exposes 'pending' | 'invoiced', so the
 * remaining-qty filter is applied here. Pages through the view so a busy
 * processor never silently truncates at the 1000-row API cap.
 */
export async function fetchInvoiceableLines(partyId: string): Promise<DcLineEstimateVsActualRow[]> {
  const companyId = await requireCompanyId();
  const rows: DcLineEstimateVsActualRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase as any)
      .from("v_dc_line_estimate_vs_actual")
      .select("*")
      .eq("company_id", companyId)
      .eq("party_id", partyId)
      .order("dc_date", { ascending: true })
      .order("dc_id", { ascending: true })
      .order("serial_number", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []).map((r: any) => coerce<DcLineEstimateVsActualRow>(r, NUMERIC_KEYS_LINE));
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows.filter((r) => remainingQty(r) > 0);
}

/** Qty still unbilled on a DC line (rounded to kill float dust). */
export function remainingQty(r: Pick<DcLineEstimateVsActualRow, "dc_qty" | "billed_qty">): number {
  return Math.max(0, Math.round((r.dc_qty - r.billed_qty) * 1000) / 1000);
}

export interface ProcessorInvoiceRow {
  id: string;
  company_id: string;
  party_id: string;
  party_name: string | null;
  invoice_number: string;
  invoice_date: string;
  status: "active" | "cancelled";
  remarks: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  line_count: number;
  taxable_total: number;
  gst_total: number;
}

export interface ProcessorInvoiceFilters {
  partyId?: string;
  status?: "active" | "cancelled";
}

/** Invoice register: invoices + party name + totals summed from their lines. */
export async function fetchProcessorInvoices(filters: ProcessorInvoiceFilters = {}): Promise<ProcessorInvoiceRow[]> {
  const companyId = await requireCompanyId();
  let q = (supabase as any).from("processor_invoices").select("*").eq("company_id", companyId);
  if (filters.partyId) q = q.eq("party_id", filters.partyId);
  if (filters.status) q = q.eq("status", filters.status);
  const { data: invoices, error } = await q
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (error) throw error;
  const list = (invoices ?? []) as any[];
  if (list.length === 0) return [];

  const partyIds = [...new Set(list.map((i) => i.party_id).filter(Boolean))] as string[];
  const { data: parties, error: pErr } = await (supabase as any)
    .from("parties").select("id, name").eq("company_id", companyId).in("id", partyIds);
  if (pErr) throw pErr;
  const nameById = new Map<string, string>((parties ?? []).map((p: any) => [p.id, p.name]));

  // Chunk the id list so the request URL stays short.
  const totals = new Map<string, { n: number; taxable: number; gst: number }>();
  const ids = list.map((i) => i.id as string);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (let from = 0; ; from += PAGE) {
      const { data: lines, error: lErr } = await (supabase as any)
        .from("processor_invoice_lines")
        .select("id, invoice_id, taxable_amount, gst_amount")
        .eq("company_id", companyId)
        .in("invoice_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (lErr) throw lErr;
      for (const l of lines ?? []) {
        const t = totals.get(l.invoice_id) ?? { n: 0, taxable: 0, gst: 0 };
        t.n += 1;
        t.taxable += Number(l.taxable_amount ?? 0);
        t.gst += Number(l.gst_amount ?? 0);
        totals.set(l.invoice_id, t);
      }
      if ((lines ?? []).length < PAGE) break;
    }
  }

  return list.map((i) => {
    const t = totals.get(i.id) ?? { n: 0, taxable: 0, gst: 0 };
    return {
      ...i,
      party_name: nameById.get(i.party_id) ?? null,
      line_count: t.n,
      taxable_total: Math.round(t.taxable * 100) / 100,
      gst_total: Math.round(t.gst * 100) / 100,
    } as ProcessorInvoiceRow;
  });
}

// ── Report reads (full result sets; filtering + totals happen client-side) ───

/** DCs whose processor invoice is not fully received, oldest first. Pages past the 1000-row cap. */
export async function fetchDcsInvoicePending(): Promise<DcInvoiceStatusRow[]> {
  const companyId = await requireCompanyId();
  const rows: DcInvoiceStatusRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase as any)
      .from("v_dc_invoice_status")
      .select("*")
      .eq("company_id", companyId)
      .neq("invoice_status", "Invoice received")
      .order("dc_date", { ascending: true })
      .order("dc_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []).map((r: any) => coerce<DcInvoiceStatusRow>(r, NUMERIC_KEYS_DC));
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/** All invoiced DC lines (estimate vs actual). Pages past the 1000-row cap. */
export async function fetchInvoicedLines(): Promise<DcLineEstimateVsActualRow[]> {
  const companyId = await requireCompanyId();
  const rows: DcLineEstimateVsActualRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase as any)
      .from("v_dc_line_estimate_vs_actual")
      .select("*")
      .eq("company_id", companyId)
      .eq("line_invoice_status", "invoiced")
      .order("dc_date", { ascending: true })
      .order("dc_id", { ascending: true })
      .order("serial_number", { ascending: true })
      .order("dc_line_item_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []).map((r: any) => coerce<DcLineEstimateVsActualRow>(r, NUMERIC_KEYS_LINE));
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

// ── Price movement (v_processor_rate_monthly / v_processor_rate_history) ─────
// Columns verified against the live DB. Rates are per `unit` — callers must
// group by unit and never average across units.

export interface ProcessorRateMonthlyRow {
  company_id: string;
  party_id: string;
  party_name: string | null;
  item_id: string | null;
  item_code: string | null;
  description: string | null;
  nature_of_process: string | null;
  unit: string | null;
  rate_basis: string | null;
  invoice_month: string; // date, first of month
  qty_billed: number;
  taxable_amount: number;
  avg_actual_rate: number;
  avg_estimate_rate: number | null;
  min_rate: number;
  max_rate: number;
  invoice_lines: number;
}

export interface ProcessorRateHistoryRow {
  company_id: string;
  party_id: string;
  party_name: string | null;
  item_id: string | null;
  item_code: string | null;
  description: string | null;
  nature_of_process: string | null;
  rate_basis: string | null;
  unit: string | null;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  invoice_month: string;
  dc_id: string;
  dc_number: string;
  dc_date: string;
  dc_line_item_id: string;
  qty_billed: number;
  actual_rate: number;
  estimate_rate: number | null;
  taxable_amount: number;
  gst_amount: number;
  variance_amount: number;
}

const nullableNum = (v: any) => (v == null ? null : Number(v));

/** Every monthly rate row for the company (pages past the 1000-row cap). */
export async function fetchProcessorRateMonthly(): Promise<ProcessorRateMonthlyRow[]> {
  const companyId = await requireCompanyId();
  const rows: ProcessorRateMonthlyRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase as any)
      .from("v_processor_rate_monthly")
      .select("*")
      .eq("company_id", companyId)
      .order("invoice_month", { ascending: true })
      .order("party_id", { ascending: true })
      .order("item_id", { ascending: true })
      .order("nature_of_process", { ascending: true })
      .order("unit", { ascending: true })
      .order("rate_basis", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []).map((r: any) => ({
      ...r,
      qty_billed: Number(r.qty_billed ?? 0),
      taxable_amount: Number(r.taxable_amount ?? 0),
      avg_actual_rate: Number(r.avg_actual_rate ?? 0),
      avg_estimate_rate: nullableNum(r.avg_estimate_rate),
      min_rate: Number(r.min_rate ?? 0),
      max_rate: Number(r.max_rate ?? 0),
      invoice_lines: Number(r.invoice_lines ?? 0),
    })) as ProcessorRateMonthlyRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export interface ProcessorRateHistoryParams {
  partyId: string;
  itemId: string | null;
  natureOfProcess: string | null;
  unit: string | null;
  rateBasis: string | null;
  /** Inclusive invoice_month bounds, yyyy-MM-dd; optional. */
  monthFrom?: string;
  monthTo?: string;
}

/** Invoice-line history for one processor + item + process + unit (+ basis). */
export async function fetchProcessorRateHistory(p: ProcessorRateHistoryParams): Promise<ProcessorRateHistoryRow[]> {
  const companyId = await requireCompanyId();
  const rows: ProcessorRateHistoryRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = (supabase as any)
      .from("v_processor_rate_history")
      .select("*")
      .eq("company_id", companyId)
      .eq("party_id", p.partyId);
    q = p.itemId == null ? q.is("item_id", null) : q.eq("item_id", p.itemId);
    q = p.natureOfProcess == null ? q.is("nature_of_process", null) : q.eq("nature_of_process", p.natureOfProcess);
    q = p.unit == null ? q.is("unit", null) : q.eq("unit", p.unit);
    q = p.rateBasis == null ? q.is("rate_basis", null) : q.eq("rate_basis", p.rateBasis);
    if (p.monthFrom) q = q.gte("invoice_month", p.monthFrom);
    if (p.monthTo) q = q.lte("invoice_month", p.monthTo);
    const { data, error } = await q
      .order("invoice_date", { ascending: false })
      .order("invoice_id", { ascending: false })
      .order("dc_line_item_id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []).map((r: any) => ({
      ...r,
      qty_billed: Number(r.qty_billed ?? 0),
      actual_rate: Number(r.actual_rate ?? 0),
      estimate_rate: nullableNum(r.estimate_rate),
      taxable_amount: Number(r.taxable_amount ?? 0),
      gst_amount: Number(r.gst_amount ?? 0),
      variance_amount: Number(r.variance_amount ?? 0),
    })) as ProcessorRateHistoryRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/**
 * Invoice numbers per DC line (one batched read per DC), oldest invoice first,
 * de-duplicated. Keyed by dc_line_item_id; lines with no billing are absent.
 */
export async function fetchDcLineInvoiceNumbers(dcId: string): Promise<Record<string, string[]>> {
  const companyId = await requireCompanyId();
  const out: Record<string, string[]> = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase as any)
      .from("v_processor_rate_history")
      .select("dc_line_item_id, invoice_id, invoice_number, invoice_date")
      .eq("company_id", companyId)
      .eq("dc_id", dcId)
      .order("invoice_date", { ascending: true })
      .order("invoice_id", { ascending: true })
      .order("dc_line_item_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      const list = (out[r.dc_line_item_id] ??= []);
      if (!list.includes(r.invoice_number)) list.push(r.invoice_number);
    }
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}
