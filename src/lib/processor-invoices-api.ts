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
