import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Inventory Ledger data access.
//
// This module reads ONLY the two correct read-model views:
//   - v_stock_ledger  : every movement with a precomputed `running_balance`
//                       and a monotonic `seq` for deterministic chronology.
//   - v_stock_current : one row per item with its `current_balance`.
//
// We NEVER read stock_ledger.balance_qty directly — `running_balance` from the
// view is the single source of truth for cumulative quantity.
// ─────────────────────────────────────────────────────────────────────────────

export interface InventoryLedgerRow {
  id: string;
  company_id: string;
  item_id: string;
  seq: number;
  transaction_date: string;
  transaction_type: string;
  qty_in: number;
  qty_out: number;
  running_balance: number;
  from_state: string | null;
  to_state: string | null;
  reference_type: string | null;
  reference_id: string | null;
  reference_number: string | null;
  unit_cost: number;
  total_value: number;
  notes: string | null;
  created_at: string;
  item_code: string | null;
  item_description: string | null;
  drawing_number: string | null;
  drawing_revision: string | null;
  item_type: string | null;
  unit: string | null;
}

export interface InventoryCurrentRow {
  company_id: string;
  item_id: string;
  item_code: string | null;
  item_description: string | null;
  drawing_number: string | null;
  item_type: string | null;
  unit: string | null;
  current_balance: number;
  last_movement_date: string | null;
}

const PAGE = 1000;

/**
 * Fetch ALL ledger rows for one item, ordered chronologically by `seq`.
 *
 * IMPORTANT: no date filter is applied at the DB level — the running balance
 * must be read over full history. Date-range narrowing is a display concern
 * handled in the page, not here.
 */
export async function fetchItemLedger(itemId: string): Promise<InventoryLedgerRow[]> {
  const all: InventoryLedgerRow[] = [];
  let offset = 0;
  // Paginate past PostgREST's ~1000-row default cap.
  while (true) {
    const { data, error } = await (supabase as any)
      .from("v_stock_ledger")
      .select("*")
      .eq("item_id", itemId)
      .order("seq", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as InventoryLedgerRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Closing stock across all items (one row per item) — sorted by item_code. */
export async function fetchCurrentStock(): Promise<InventoryCurrentRow[]> {
  const all: InventoryCurrentRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("v_stock_current")
      .select("*")
      .order("item_code", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as InventoryCurrentRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction-type metadata — all 16 ledger types with readable labels and a
// flow direction used to colour in/out movements differently.
// ─────────────────────────────────────────────────────────────────────────────

export type LedgerFlow = "in" | "out" | "neutral";

export const LEDGER_TYPE_META: Record<string, { label: string; flow: LedgerFlow }> = {
  opening_stock:        { label: "Opening Stock",        flow: "in" },
  grn_receipt:          { label: "GRN Receipt",          flow: "in" },
  dc_issue:             { label: "DC Issue",             flow: "out" },
  dc_return:            { label: "DC Return",            flow: "in" },
  job_card_issue:       { label: "Job Card Issue",       flow: "out" },
  job_card_return:      { label: "Job Card Return",      flow: "in" },
  assembly_issue:       { label: "Assembly Issue",       flow: "out" },
  assembly_consumption: { label: "Assembly Consumption", flow: "out" },
  assembly_output:      { label: "Assembly Output",      flow: "in" },
  assembly_return:      { label: "Assembly Return",      flow: "in" },
  consumable_issue:     { label: "Consumable Issue",     flow: "out" },
  consumable_return:    { label: "Consumable Return",    flow: "in" },
  invoice_dispatch:     { label: "Invoice Dispatch",     flow: "out" },
  scrap_write_off:      { label: "Scrap Write-Off",      flow: "out" },
  rejection_writeoff:   { label: "Rejection Write-Off",  flow: "out" },
  manual_adjustment:    { label: "Manual Adjustment",    flow: "neutral" },
};

export function ledgerTypeLabel(type: string): string {
  return LEDGER_TYPE_META[type]?.label ?? type;
}

export function ledgerTypeFlow(type: string): LedgerFlow {
  return LEDGER_TYPE_META[type]?.flow ?? "neutral";
}

/** Badge classes per flow — green = in, red = out, slate = neutral. */
export const FLOW_BADGE_CLS: Record<LedgerFlow, string> = {
  in: "bg-green-100 text-green-800",
  out: "bg-red-100 text-red-800",
  neutral: "bg-slate-100 text-slate-700",
};

// reference_type → app route, reused from the legacy Stock Ledger ROUTE_MAP.
export const REFERENCE_ROUTES: Record<string, string> = {
  assembly_order: "/assembly-orders",
  purchase_order: "/purchase-orders",
  delivery_challan: "/delivery-challans",
  invoice: "/invoices",
  grn: "/grn",
  job_card: "/delivery-challans",
};

const STATE_LABELS: Record<string, string> = {
  free: "Free",
  wip: "WIP",
  in_process: "In Process",
  incoming: "Incoming",
  consumed: "Consumed",
  dispatched: "Dispatched",
  scrapped: "Scrapped",
  finished_goods: "Finished",
  in_fg_ready: "FG Ready",
  in_fg_wip: "FG WIP",
  in_subassembly_wip: "Sub-Assy WIP",
};

export function stateLabel(state: string | null | undefined): string {
  if (!state) return "";
  return STATE_LABELS[state] ?? state.replace(/_/g, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Small client-side CSV export (the per-item ledger download).
// Excel exports reuse the shared export-utils helper instead.
// ─────────────────────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Quote if the value contains a delimiter, quote, or newline.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  filename: string,
): void {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvCell(row[c.key])).join(","))
    .join("\n");
  const csv = `${header}\n${body}`;
  // Prepend a UTF-8 BOM so Excel opens the file with correct encoding.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
