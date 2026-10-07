import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { monthRange } from "@/lib/date-ist";

// DC balance — plan vs received, one row per DC line, from v_dc_line_balance
// (security_invoker, RLS-scoped; company_id still filtered explicitly). All
// quantities come straight from the view — never recomputed from
// dc_line_items.returned_* or grn columns.

export type DcBalanceStatusFilter = "open" | "all" | "pending" | "partially_received" | "fully_received";

export interface DcBalanceFilters {
  search?: string;
  /** "open" = Pending + Partial (the default view). */
  status?: DcBalanceStatusFilter;
  vendor?: string;
  overdueOnly?: boolean;
  /** 'YYYY-MM', matched on dc_date. */
  month?: string;
  page?: number;
  pageSize?: number;
}

export interface DcBalanceRow {
  dc_id: string;
  dc_number: string;
  dc_date: string;
  dc_type: string | null;
  dc_status: string | null;
  vendor_name: string | null;
  return_due_date: string | null;
  dc_line_item_id: string;
  serial_number: number;
  item_id: string | null;
  item_code: string | null;
  drawing_number: string | null;
  description: string | null;
  nature_of_process: string | null;
  unit: string | null;
  plan_qty: number;
  plan_qty_2: number | null;
  unit_2: string | null;
  received_qty: number;
  balance_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  store_confirmed_qty: number;
  grn_count: number;
  grn_numbers: string | null;
  last_grn_date: string | null;
  line_status: "pending" | "partially_received" | "fully_received";
  days_overdue: number | null;
}

const VIEW = "v_dc_line_balance";
const PAGE = 1000;
const MAX_PAGES = 20;

/** Applies the screen's filters (and the stable ordering) to a v_dc_line_balance query. */
export function applyDcBalanceFilters(query: any, companyId: string, f: DcBalanceFilters) {
  query = query.eq("company_id", companyId);

  const status = f.status ?? "open";
  if (status === "open") query = query.in("line_status", ["pending", "partially_received"]);
  else if (status !== "all") query = query.eq("line_status", status);

  if (f.vendor) query = query.eq("vendor_name", f.vendor);
  if (f.overdueOnly) query = query.not("days_overdue", "is", null);

  if (f.month) {
    const { from, to } = monthRange(f.month);
    query = query.gte("dc_date", from).lte("dc_date", to);
  }

  if (f.search?.trim()) {
    const sanitized = sanitizeSearchTerm(f.search);
    if (sanitized) {
      const t = `%${sanitized}%`;
      query = query.or(
        [`dc_number.ilike.${t}`, `vendor_name.ilike.${t}`, `item_code.ilike.${t}`, `drawing_number.ilike.${t}`, `description.ilike.${t}`].join(","),
      );
    }
  }

  return query
    .order("dc_date", { ascending: false })
    .order("dc_number", { ascending: true })
    .order("serial_number", { ascending: true })
    .order("dc_line_item_id", { ascending: true });
}

function num(v: unknown, col: string): number {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) {
    throw new Error(`${VIEW} returned a non-numeric ${col}`);
  }
  return n;
}
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function normalizeDcBalanceRow(r: any): DcBalanceRow {
  return {
    ...r,
    plan_qty: num(r.plan_qty, "plan_qty"),
    plan_qty_2: numOrNull(r.plan_qty_2),
    received_qty: num(r.received_qty, "received_qty"),
    balance_qty: num(r.balance_qty, "balance_qty"),
    accepted_qty: Number(r.accepted_qty ?? 0),
    rejected_qty: Number(r.rejected_qty ?? 0),
    store_confirmed_qty: Number(r.store_confirmed_qty ?? 0),
    grn_count: Number(r.grn_count ?? 0),
    days_overdue: numOrNull(r.days_overdue),
  } as DcBalanceRow;
}

export async function fetchDcBalance(filters: DcBalanceFilters = {}): Promise<{ data: DcBalanceRow[]; count: number }> {
  const companyId = await getCompanyId();
  if (!companyId) return { data: [], count: 0 };
  const { page = 1, pageSize = 25 } = filters;
  const from = (page - 1) * pageSize;
  const query = applyDcBalanceFilters(supabase.from(VIEW as any).select("*", { count: "exact" }), companyId, filters);
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  return { data: ((data ?? []) as any[]).map(normalizeDcBalanceRow), count: count ?? 0 };
}

/** Every row matching the filters (all pages, 1000 per page). Aborts rather than truncating. */
export async function fetchDcBalanceForExport(filters: DcBalanceFilters = {}): Promise<DcBalanceRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Cannot export: account not linked to a company.");
  const all: DcBalanceRow[] = [];
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      throw new Error(`DC balance exceeds ${MAX_PAGES * PAGE} rows — export aborted to avoid a truncated report.`);
    }
    const start = page * PAGE;
    const query = applyDcBalanceFilters(supabase.from(VIEW as any).select("*"), companyId, filters);
    const { data, error } = await query.range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    all.push(...rows.map(normalizeDcBalanceRow));
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Distinct vendor names on any DC line in the view (for the vendor filter). */
export async function fetchDcBalanceVendors(): Promise<string[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const names = new Set<string>();
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) throw new Error("Vendor list exceeds 20,000 rows — aborted.");
    const start = page * PAGE;
    const { data, error } = await (supabase as any)
      .from(VIEW)
      .select("vendor_name, dc_line_item_id")
      .eq("company_id", companyId)
      .order("dc_line_item_id", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    for (const r of rows) if (r.vendor_name) names.add(r.vendor_name);
    if (rows.length < PAGE) break;
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
