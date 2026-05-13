import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { updateStockBucket } from "@/lib/items-api";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";

// ============================================================
// Interfaces
// ============================================================

export interface ConsumableIssueLine {
  id: string;
  company_id: string;
  consumable_issue_id: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  drawing_number: string | null;
  unit: string;
  qty_issued: number;
  return_status: "returned" | "not_returned";
  qty_returned: number;
  return_reason: string | null;
  disposition: "scrap" | null;
  created_at: string;
}

export interface ConsumableIssue {
  id: string;
  company_id: string;
  issue_number: string;
  issue_date: string;
  issued_to: string;
  issued_by: string | null;
  notes: string | null;
  status: "draft" | "issued" | "deleted";
  deletion_reason: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  stock_action: ConsumableIssueDeleteStockAction | null;
  created_at: string;
  updated_at: string;
  lines?: ConsumableIssueLine[];
}

export type ConsumableIssueDeleteStockAction =
  | "recall_unused"
  | "already_consumed"
  | "partial_return";

export interface ConsumableIssueFilters {
  month?: string;
  status?: string;
  search?: string;
}

export interface ConsumableStats {
  issues_this_month: number;
  qty_issued_this_month: number;
  qty_returned_this_month: number;
  pending_returns: number;
}

// ============================================================
// Fetch list
// ============================================================

export async function fetchConsumableIssues(
  filters: ConsumableIssueFilters = {}
): Promise<ConsumableIssue[]> {
  const companyId = await getCompanyId();
  const { month, status, search } = filters;

  let query = (supabase as any)
    .from("consumable_issues")
    .select("*, lines:consumable_issue_lines(*)")
    .eq("company_id", companyId)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (month) {
    const [year, mon] = month.split("-");
    const from = `${year}-${mon}-01`;
    const lastDay = new Date(Number(year), Number(mon), 0).getDate();
    const to = `${year}-${mon}-${String(lastDay).padStart(2, "0")}`;
    query = query.gte("issue_date", from).lte("issue_date", to);
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search?.trim()) {
    query = query.or(
      `issue_number.ilike.%${search.trim()}%,issued_to.ilike.%${search.trim()}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ConsumableIssue[];
}

// ============================================================
// Fetch single
// ============================================================

export async function fetchConsumableIssue(id: string): Promise<ConsumableIssue> {
  const companyId = await getCompanyId();
  const { data, error } = await (supabase as any)
    .from("consumable_issues")
    .select("*, lines:consumable_issue_lines(*)")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  if (error) throw error;
  return data as ConsumableIssue;
}

// ============================================================
// Fetch items for line item selector
// ============================================================

export interface ConsumableItem {
  id: string;
  item_code: string;
  description: string;
  drawing_number: string | null;
  unit: string;
  stock_free: number;
  item_type: string;
}

export async function fetchConsumableItems(): Promise<ConsumableItem[]> {
  const companyId = await getCompanyId();
  // Scoped to is_consumable=true items only (drill bits, taps, reamers, end mills,
  // centre bits etc). The is_consumable flag was added to the items master to make
  // the picker tractable — was previously showing every non-finished_good item.
  const { data, error } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, drawing_number, unit, stock_free, item_type")
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("is_consumable", true)
    .order("item_code", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ConsumableItem[];
}

// ============================================================
// Stats
// ============================================================

export async function fetchConsumableStats(): Promise<ConsumableStats> {
  const companyId = await getCompanyId();
  const now = new Date();
  const year = now.getFullYear();
  const mon = now.getMonth() + 1;
  const monthFrom = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const monthTo = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: issuesData, error: issuesErr } = await (supabase as any)
    .from("consumable_issues")
    .select("id, issue_date")
    .eq("company_id", companyId)
    .gte("issue_date", monthFrom)
    .lte("issue_date", monthTo);
  if (issuesErr) return { issues_this_month: 0, qty_issued_this_month: 0, qty_returned_this_month: 0, pending_returns: 0 };

  const issueIds = (issuesData ?? []).map((i: any) => i.id) as string[];

  let qty_issued_this_month = 0;
  let qty_returned_this_month = 0;
  let pending_returns = 0;

  if (issueIds.length > 0) {
    const { data: linesData } = await (supabase as any)
      .from("consumable_issue_lines")
      .select("qty_issued, qty_returned, return_status")
      .eq("company_id", companyId)
      .in("consumable_issue_id", issueIds);

    for (const line of (linesData ?? []) as any[]) {
      qty_issued_this_month += Number(line.qty_issued) || 0;
      qty_returned_this_month += Number(line.qty_returned) || 0;
    }
  }

  // Pending returns: all time lines not returned
  const { count: pendingCount } = await (supabase as any)
    .from("consumable_issue_lines")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("return_status", "not_returned");

  pending_returns = pendingCount ?? 0;

  return {
    issues_this_month: issueIds.length,
    qty_issued_this_month,
    qty_returned_this_month,
    pending_returns,
  };
}

// ============================================================
// Create
// ============================================================

export interface ConsumableIssueLineInput {
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  drawing_number: string | null;
  unit: string;
  qty_issued: number;
  return_status: "returned" | "not_returned";
  qty_returned: number;
  return_reason: string | null;
  disposition: "scrap" | null;
}

export interface CreateConsumableIssueInput {
  issue_date: string;
  issued_to: string;
  issued_by: string | null;
  notes: string | null;
  lines: ConsumableIssueLineInput[];
}

export async function createConsumableIssue(
  input: CreateConsumableIssueInput
): Promise<ConsumableIssue> {
  const companyId = await getCompanyId();

  // 1. Insert header — trigger generates issue_number
  const { data: header, error: headerError } = await (supabase as any)
    .from("consumable_issues")
    .insert({
      company_id: companyId,
      issue_number: "",
      issue_date: input.issue_date,
      issued_to: input.issued_to,
      issued_by: input.issued_by,
      notes: input.notes,
      status: "issued",
    })
    .select()
    .single();
  if (headerError) throw headerError;

  const issue = header as ConsumableIssue;

  // 2. Insert lines
  const lineRows = input.lines.map((l) => ({
    company_id: companyId,
    consumable_issue_id: issue.id,
    item_id: l.item_id,
    item_code: l.item_code,
    item_description: l.item_description,
    drawing_number: l.drawing_number,
    unit: l.unit,
    qty_issued: l.qty_issued,
    return_status: l.return_status,
    qty_returned: l.qty_returned,
    return_reason: l.return_reason,
    disposition: l.disposition,
  }));

  const { error: linesError } = await (supabase as any)
    .from("consumable_issue_lines")
    .insert(lineRows);
  if (linesError) throw linesError;

  // 3. Stock movements + ledger entries per line
  for (const line of input.lines) {
    if (!line.item_id || line.qty_issued <= 0) continue;

    // Decrement free stock
    await updateStockBucket(line.item_id, "free", -line.qty_issued);

    // Stock ledger entry
    await addStockLedgerEntry({
      item_id: line.item_id,
      item_code: line.item_code,
      item_description: line.item_description,
      transaction_date: input.issue_date,
      transaction_type: "consumable_issue",
      qty_in: 0,
      qty_out: line.qty_issued,
      balance_qty: 0,
      unit_cost: 0,
      total_value: 0,
      reference_type: "consumable_issue",
      reference_id: issue.id,
      reference_number: issue.issue_number,
      notes: `Consumable issue to: ${input.issued_to}`,
      created_by: null,
      from_state: "free",
      to_state: "consumed",
    });

    // If returned as scrap: insert scrap_register audit record only
    // Do NOT call createScrapEntry — stock already decremented above
    if (
      line.return_status === "returned" &&
      line.disposition === "scrap" &&
      line.qty_returned > 0
    ) {
      await (supabase as any).from("scrap_register").insert({
        company_id: companyId,
        scrap_number: "",
        scrap_date: input.issue_date,
        item_id: line.item_id,
        item_code: line.item_code,
        item_description: line.item_description,
        drawing_number: line.drawing_number ?? null,
        qty_scrapped: line.qty_returned,
        unit: line.unit,
        scrap_reason: line.return_reason ?? "Consumable returned as scrap",
        scrap_category: "other",
        cost_per_unit: 0,
        total_scrap_value: 0,
        disposal_method: "write_off",
        scrap_sale_value: 0,
        remarks: `From consumable issue ${issue.issue_number}`,
        recorded_by: input.issued_by,
      });
    }
  }

  return issue;
}

// ============================================================
// Soft delete with stock reversal
// ============================================================
// Mirrors the GRN / DC softDelete pattern. Header gets
// status='deleted' + deletion_reason + deleted_at + deleted_by +
// stock_action. Per-line stock_ledger reversal rows are written
// according to the chosen stock action:
//   - recall_unused   : credit qty_issued back to free
//                       and delete the matching scrap_register
//                       row for any line with disposition='scrap'
//   - partial_return  : credit qty_returned only (skip if zero)
//   - already_consumed: write a trail-only ledger row (qty=0)

async function reverseConsumableLineStock(
  line: any,
  issueNumber: string,
  issueId: string,
  stockAction: ConsumableIssueDeleteStockAction,
  reason: string | null | undefined,
  today: string,
  companyId: string
): Promise<void> {
  if (!line.item_id) return;

  const qtyIssued = Number(line.qty_issued ?? 0);
  const qtyReturned = Number(line.qty_returned ?? 0);

  let qtyToCredit = 0;
  let notes = "";
  let transaction_type: "consumable_return" | "manual_adjustment" =
    "consumable_return";
  let from_state: string | null = "consumed";
  let to_state: string | null = "free";

  if (stockAction === "recall_unused") {
    qtyToCredit = qtyIssued;
    notes = `Consumable issue deleted — recalled unused${reason ? `: ${reason}` : ""}`;
  } else if (stockAction === "partial_return") {
    qtyToCredit = qtyReturned;
    if (qtyToCredit <= 0) return;
    notes = `Consumable issue deleted — partial return${reason ? `: ${reason}` : ""}`;
  } else {
    qtyToCredit = 0;
    notes = `Consumable issue deleted — already consumed, no stock reversal${reason ? `: ${reason}` : ""}`;
    transaction_type = "manual_adjustment";
    from_state = null;
    to_state = null;
  }

  if (qtyToCredit > 0) {
    await updateStockBucket(line.item_id, "free", qtyToCredit).catch(
      console.error
    );
  }

  try {
    await addStockLedgerEntry({
      item_id: line.item_id,
      item_code: line.item_code ?? null,
      item_description: line.item_description ?? null,
      transaction_date: today,
      transaction_type,
      qty_in: qtyToCredit,
      qty_out: 0,
      balance_qty: 0,
      unit_cost: 0,
      total_value: 0,
      reference_type: "consumable_issue",
      reference_id: issueId,
      reference_number: issueNumber,
      notes,
      created_by: null,
      from_state,
      to_state,
    });
  } catch {
    /* ledger failures are non-fatal */
  }

  // recall_unused on a scrap-disposition line: also remove the scrap_register
  // row that was written by createConsumableIssue. Scrap rows are linked only
  // by the remarks string "From consumable issue {issue_number}" plus item_id,
  // so this match is best-effort — if two lines in the same issue share an
  // item, both scrap rows get deleted on the first reversal.
  if (
    stockAction === "recall_unused" &&
    line.disposition === "scrap" &&
    qtyReturned > 0
  ) {
    try {
      await (supabase as any)
        .from("scrap_register")
        .delete()
        .eq("company_id", companyId)
        .eq("item_id", line.item_id)
        .ilike("remarks", `%From consumable issue ${issueNumber}%`);
    } catch {
      /* non-fatal */
    }
  }
}

export async function softDeleteConsumableIssue(
  id: string,
  options: {
    deletion_reason?: string;
    stockAction: ConsumableIssueDeleteStockAction;
  }
): Promise<void> {
  const { deletion_reason, stockAction } = options;
  const companyId = await getCompanyId();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const today = new Date().toISOString().split("T")[0];

  const { data: issue, error: issueErr } = await (supabase as any)
    .from("consumable_issues")
    .select("*, lines:consumable_issue_lines(*)")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  if (issueErr) throw issueErr;
  if (!issue) throw new Error("Consumable issue not found");

  for (const line of (issue.lines ?? []) as any[]) {
    await reverseConsumableLineStock(
      line,
      issue.issue_number,
      issue.id,
      stockAction,
      deletion_reason,
      today,
      companyId
    );
  }

  const { error } = await (supabase as any)
    .from("consumable_issues")
    .update({
      status: "deleted",
      deletion_reason: deletion_reason ?? null,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
      stock_action: stockAction,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteConsumableIssueLine(
  lineId: string,
  options: {
    deletion_reason?: string;
    stockAction: ConsumableIssueDeleteStockAction;
  }
): Promise<void> {
  const { deletion_reason, stockAction } = options;
  const companyId = await getCompanyId();
  const today = new Date().toISOString().split("T")[0];

  const { data: line, error: lineErr } = await (supabase as any)
    .from("consumable_issue_lines")
    .select("*")
    .eq("id", lineId)
    .eq("company_id", companyId)
    .single();
  if (lineErr) throw lineErr;
  if (!line) throw new Error("Consumable issue line not found");

  const { data: issue } = await (supabase as any)
    .from("consumable_issues")
    .select("id, issue_number")
    .eq("id", line.consumable_issue_id)
    .single();

  await reverseConsumableLineStock(
    line,
    issue?.issue_number ?? "",
    line.consumable_issue_id,
    stockAction,
    deletion_reason,
    today,
    companyId
  );

  // Hard delete the line row. Parent issue is intentionally left as a
  // zero-line shell if this was the last line — matches GRN line-edit
  // behavior.
  const { error: delErr } = await (supabase as any)
    .from("consumable_issue_lines")
    .delete()
    .eq("id", lineId)
    .eq("company_id", companyId);
  if (delErr) throw delErr;
}
