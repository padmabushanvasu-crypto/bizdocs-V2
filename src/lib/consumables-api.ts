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

// 'partial_return' was removed when consumable_returns went event-sourced
// (migration 20260513000030). Returns recorded via recordConsumableReturn
// already credit stock as they happen, so a partial_return action on
// delete became incoherent. recall_unused now credits only the
// outstanding qty (qty_issued − sum of return events).
export type ConsumableIssueDeleteStockAction =
  | "recall_unused"
  | "already_consumed";

export interface ConsumableReturn {
  id: string;
  company_id: string;
  consumable_issue_line_id: string;
  qty_returned: number;
  disposition: "returned_to_stock" | "scrap" | "lost";
  returned_at: string;
  returned_by_user_id: string | null;
  returned_by_name: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

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

  const empty: ConsumableStats = {
    issues_this_month: 0,
    qty_issued_this_month: 0,
    qty_returned_this_month: 0,
    pending_returns: 0,
  };

  // 1. This-month active issues (status != 'deleted')
  //    PostgREST `.neq` translates to SQL `column != value`, which excludes
  //    NULLs as well — fine here because consumable_issues.status is NOT NULL.
  const { data: monthIssuesData, error: monthIssuesErr } = await (supabase as any)
    .from("consumable_issues")
    .select("id")
    .eq("company_id", companyId)
    .neq("status", "deleted")
    .gte("issue_date", monthFrom)
    .lte("issue_date", monthTo);
  if (monthIssuesErr) return empty;

  const monthIssueIds = (monthIssuesData ?? []).map((i: any) => i.id) as string[];

  let qty_issued_this_month = 0;
  let qty_returned_this_month = 0;

  if (monthIssueIds.length > 0) {
    const { data: linesData } = await (supabase as any)
      .from("consumable_issue_lines")
      .select("qty_issued, qty_returned")
      .eq("company_id", companyId)
      .in("consumable_issue_id", monthIssueIds);

    for (const line of (linesData ?? []) as any[]) {
      qty_issued_this_month += Number(line.qty_issued) || 0;
      qty_returned_this_month += Number(line.qty_returned) || 0;
    }
  }

  // 2. Pending returns — outstanding sum across all-time ACTIVE issues.
  //    Definition changed from "count of lines with return_status='not_returned'"
  //    to "sum of (qty_issued − qty_returned) on lines belonging to non-deleted
  //    issues". The new semantic matches the event-sourced model where
  //    qty_returned is a denormalized aggregate of consumable_returns events,
  //    so outstanding == real outstanding qty rather than a row count.
  let pending_returns = 0;
  const { data: activeIssuesData } = await (supabase as any)
    .from("consumable_issues")
    .select("id")
    .eq("company_id", companyId)
    .neq("status", "deleted");
  const activeIssueIds = (activeIssuesData ?? []).map((i: any) => i.id) as string[];

  if (activeIssueIds.length > 0) {
    const { data: pendingLines } = await (supabase as any)
      .from("consumable_issue_lines")
      .select("qty_issued, qty_returned")
      .eq("company_id", companyId)
      .in("consumable_issue_id", activeIssueIds);

    for (const line of (pendingLines ?? []) as any[]) {
      const outstanding =
        (Number(line.qty_issued) || 0) - (Number(line.qty_returned) || 0);
      if (outstanding > 0) pending_returns += outstanding;
    }
  }

  return {
    issues_this_month: monthIssueIds.length,
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

  // Insert with .select() so we get the inserted line ids back; we need
  // them to write consumable_returns events linked to each line. Supabase
  // preserves input order in the returned rows, so we zip by index.
  const { data: insertedLines, error: linesError } = await (supabase as any)
    .from("consumable_issue_lines")
    .insert(lineRows)
    .select();
  if (linesError) throw linesError;
  const lineRowsOut = (insertedLines ?? []) as Array<{ id: string }>;

  // 3. Stock movements + ledger entries + at-create return events
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const insertedLine = lineRowsOut[i];
    if (!line.item_id || line.qty_issued <= 0) continue;

    // Decrement free stock
    await updateStockBucket(line.item_id, "free", -line.qty_issued);

    // Stock ledger entry for the issue itself
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

    // At-create-time return: route through the event table so
    // line.qty_returned and consumable_returns stay in sync from day one.
    // This fixes the prior data-loss bug where a later recordConsumableReturn
    // call would overwrite line.qty_returned with the new (incomplete)
    // aggregate, losing the at-create-time value.
    if (line.qty_returned > 0 && insertedLine?.id) {
      let eventDisposition:
        | "returned_to_stock"
        | "scrap"
        | "lost"
        | null = null;
      if (line.disposition === "scrap") {
        eventDisposition = "scrap";
      } else if (line.return_status === "returned") {
        eventDisposition = "returned_to_stock";
      }
      // return_status='not_returned' with qty_returned > 0 is an invalid
      // combination; skip silently to match prior behaviour (no event,
      // no stock side effects).

      if (eventDisposition) {
        try {
          await (supabase as any).from("consumable_returns").insert({
            company_id: companyId,
            consumable_issue_line_id: insertedLine.id,
            qty_returned: line.qty_returned,
            disposition: eventDisposition,
            returned_at: new Date(input.issue_date).toISOString(),
            returned_by_user_id: null,
            returned_by_name: input.issued_by ?? null,
            notes: "Recorded at issue creation",
          });
        } catch (err) {
          console.error("[consumables] at-create return event insert failed", err);
        }

        // Stock credit + ledger for 'returned_to_stock' — fixes the bug
        // where create flow previously never credited stock_free for the
        // returned-to-stock case (qty_returned was just metadata).
        if (eventDisposition === "returned_to_stock") {
          await updateStockBucket(line.item_id, "free", line.qty_returned).catch(
            console.error
          );
          try {
            await addStockLedgerEntry({
              item_id: line.item_id,
              item_code: line.item_code,
              item_description: line.item_description,
              transaction_date: input.issue_date,
              transaction_type: "consumable_return",
              qty_in: line.qty_returned,
              qty_out: 0,
              balance_qty: 0,
              unit_cost: 0,
              total_value: 0,
              reference_type: "consumable_issue",
              reference_id: issue.id,
              reference_number: issue.issue_number,
              notes: "Consumable return — recorded at issue creation",
              created_by: null,
              from_state: "consumed",
              to_state: "free",
            });
          } catch {
            /* ledger failures non-fatal */
          }
        }
        // 'lost' has no stock effect beyond the event row.
        // 'scrap' has no stock effect here either; the scrap_register row
        // below is the legacy audit trail that is intentionally retained.
      }
    }

    // Legacy scrap_register write — kept as-is for the at-create-time
    // scrap path. The new flow's recordConsumableReturn writes its own
    // scrap_register row with a different remarks suffix, so a later
    // event-sourced scrap doesn't conflict with this legacy entry.
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
  // The line's qty_returned aggregate represents qty already credited
  // (or scrapped/lost) via active consumable_returns events. Reading
  // off the line is cheap and sufficient because the recompute keeps
  // the field in lockstep with the events.
  const alreadyReturned = Number(line.qty_returned ?? 0);
  const outstanding = Math.max(0, qtyIssued - alreadyReturned);

  let qtyToCredit = 0;
  let notes = "";
  let transaction_type: "consumable_return" | "manual_adjustment" =
    "consumable_return";
  let from_state: string | null = "consumed";
  let to_state: string | null = "free";

  if (stockAction === "recall_unused") {
    qtyToCredit = outstanding;
    if (qtyToCredit <= 0) {
      // Nothing outstanding (everything was already returned/scrapped/
      // lost via events). Still write a trail-only ledger row so the
      // deletion is traceable.
      qtyToCredit = 0;
      transaction_type = "manual_adjustment";
      from_state = null;
      to_state = null;
    }
    notes =
      `Consumable issue deleted — recalled unused (${qtyToCredit} of ${qtyIssued} ` +
      `outstanding, ${alreadyReturned} already returned via events)` +
      (reason ? `: ${reason}` : "");
  } else {
    // already_consumed — no stock writes, trail only.
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

  // recall_unused: remove any scrap_register rows that were written by this
  // issue (legacy at-create scrap or event-sourced scrap returns — both
  // share the "From consumable issue {N}" remarks prefix). Best-effort
  // ilike-match plus item_id filter; if two lines share an item, the
  // cleanup may overshoot on a single-line delete, but a full-issue
  // delete iterates every line so the net effect is correct.
  if (stockAction === "recall_unused") {
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

// ============================================================
// Event-sourced returns (introduced in 20260513000030)
// ============================================================
// A consumable_returns row is a single return event. The
// line.qty_returned field is a denormalized aggregate of the
// active (non-soft-deleted) rows here, recomputed by the API
// after every mutation.

async function sumActiveReturnsForLine(
  lineId: string,
  companyId: string
): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("consumable_returns")
    .select("qty_returned")
    .eq("consumable_issue_line_id", lineId)
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (error) throw error;
  return ((data ?? []) as { qty_returned: number }[]).reduce(
    (s, r) => s + Number(r.qty_returned ?? 0),
    0
  );
}

async function recomputeLineQtyReturned(
  lineId: string,
  companyId: string
): Promise<number> {
  const total = await sumActiveReturnsForLine(lineId, companyId);
  await (supabase as any)
    .from("consumable_issue_lines")
    .update({ qty_returned: total })
    .eq("id", lineId)
    .eq("company_id", companyId);
  return total;
}

async function fetchLineForReturn(
  lineId: string,
  companyId: string
): Promise<{
  id: string;
  company_id: string;
  consumable_issue_id: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  drawing_number: string | null;
  unit: string;
  qty_issued: number;
} & Record<string, any>> {
  const { data, error } = await (supabase as any)
    .from("consumable_issue_lines")
    .select(
      "id, company_id, consumable_issue_id, item_id, item_code, item_description, drawing_number, unit, qty_issued"
    )
    .eq("id", lineId)
    .eq("company_id", companyId)
    .single();
  if (error) throw error;
  if (!data) throw new Error("Consumable issue line not found");
  return data;
}

async function fetchIssueNumberForLine(lineId: string): Promise<string> {
  const { data: line } = await (supabase as any)
    .from("consumable_issue_lines")
    .select("consumable_issue_id")
    .eq("id", lineId)
    .single();
  if (!line) return "";
  const { data: issue } = await (supabase as any)
    .from("consumable_issues")
    .select("issue_number")
    .eq("id", line.consumable_issue_id)
    .single();
  return (issue?.issue_number as string) ?? "";
}

export interface RecordConsumableReturnInput {
  qty: number;
  disposition: "returned_to_stock" | "scrap" | "lost";
  returned_at?: string | null;
  returned_by_name?: string | null;
  notes?: string | null;
}

export async function recordConsumableReturn(
  lineId: string,
  input: RecordConsumableReturnInput
): Promise<ConsumableReturn> {
  const { qty, disposition } = input;
  if (!(qty > 0)) throw new Error("Return qty must be greater than zero");

  const companyId = await getCompanyId();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const line = await fetchLineForReturn(lineId, companyId);

  // Server-side gate: cumulative returns must not exceed qty_issued.
  const existingSum = await sumActiveReturnsForLine(lineId, companyId);
  const outstanding = Number(line.qty_issued) - existingSum;
  if (qty > outstanding + 1e-9) {
    throw new Error(
      `Return qty (${qty}) exceeds outstanding (${outstanding}). ` +
        `${existingSum} of ${line.qty_issued} already returned.`
    );
  }

  const issueNumber = await fetchIssueNumberForLine(lineId);
  const transactionDate = (input.returned_at ?? new Date().toISOString()).slice(
    0,
    10
  );

  // 1. Insert the event row
  const { data: inserted, error: insertErr } = await (supabase as any)
    .from("consumable_returns")
    .insert({
      company_id: companyId,
      consumable_issue_line_id: lineId,
      qty_returned: qty,
      disposition,
      returned_at: input.returned_at ?? new Date().toISOString(),
      returned_by_user_id: user?.id ?? null,
      returned_by_name: input.returned_by_name ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (insertErr) throw insertErr;
  const eventRow = inserted as ConsumableReturn;

  // 2. Stock effects per disposition
  if (line.item_id) {
    if (disposition === "returned_to_stock") {
      await updateStockBucket(line.item_id, "free", qty).catch(console.error);
      try {
        await addStockLedgerEntry({
          item_id: line.item_id,
          item_code: line.item_code,
          item_description: line.item_description,
          transaction_date: transactionDate,
          transaction_type: "consumable_return",
          qty_in: qty,
          qty_out: 0,
          balance_qty: 0,
          unit_cost: 0,
          total_value: 0,
          reference_type: "consumable_issue",
          reference_id: line.consumable_issue_id,
          reference_number: issueNumber,
          notes:
            `Consumable return — returned to stock` +
            (input.notes ? `: ${input.notes}` : ""),
          created_by: null,
          from_state: "consumed",
          to_state: "free",
        });
      } catch {
        /* ledger failures non-fatal */
      }
    } else if (disposition === "scrap") {
      // Audit-only scrap_register row; stock_free is NOT credited
      // because the issue already decremented it and the qty isn't
      // coming back.
      try {
        await (supabase as any).from("scrap_register").insert({
          company_id: companyId,
          scrap_number: "",
          scrap_date: transactionDate,
          item_id: line.item_id,
          item_code: line.item_code,
          item_description: line.item_description,
          drawing_number: line.drawing_number ?? null,
          qty_scrapped: qty,
          unit: line.unit,
          scrap_reason: input.notes ?? "Consumable returned as scrap",
          scrap_category: "other",
          cost_per_unit: 0,
          total_scrap_value: 0,
          disposal_method: "write_off",
          scrap_sale_value: 0,
          remarks: `From consumable issue ${issueNumber} (return event ${eventRow.id})`,
          recorded_by: input.returned_by_name ?? null,
        });
      } catch {
        /* non-fatal */
      }
    }
    // disposition='lost': pure audit; no stock effect.
  }

  // 3. Refresh denormalized aggregate on the parent line.
  await recomputeLineQtyReturned(lineId, companyId);

  // 4. Audit trail
  try {
    const auditModule = await import("@/lib/audit-api");
    await auditModule.logAudit(
      "consumable_return",
      eventRow.id,
      "recorded",
      {
        line_id: lineId,
        issue_id: line.consumable_issue_id,
        qty,
        disposition,
      }
    );
  } catch {
    /* audit failures non-fatal */
  }

  return eventRow;
}

export async function listConsumableReturnsForLine(
  lineId: string,
  options: { includeDeleted?: boolean } = {}
): Promise<ConsumableReturn[]> {
  const companyId = await getCompanyId();
  let query = (supabase as any)
    .from("consumable_returns")
    .select("*")
    .eq("consumable_issue_line_id", lineId)
    .eq("company_id", companyId)
    .order("returned_at", { ascending: false });
  if (!options.includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ConsumableReturn[];
}

export async function deleteConsumableReturn(
  returnId: string,
  options: { reason?: string } = {}
): Promise<void> {
  const companyId = await getCompanyId();

  // Load the row so we can reverse stock effects.
  const { data: row, error } = await (supabase as any)
    .from("consumable_returns")
    .select("*")
    .eq("id", returnId)
    .eq("company_id", companyId)
    .single();
  if (error) throw error;
  if (!row) throw new Error("Consumable return not found");
  if (row.deleted_at) return; // idempotent

  const event = row as ConsumableReturn;
  const line = await fetchLineForReturn(
    event.consumable_issue_line_id,
    companyId
  );
  const issueNumber = await fetchIssueNumberForLine(event.consumable_issue_line_id);
  const today = new Date().toISOString().slice(0, 10);

  // 1. Reverse stock if the original event credited stock
  if (line.item_id && event.disposition === "returned_to_stock") {
    await updateStockBucket(line.item_id, "free", -Number(event.qty_returned)).catch(
      console.error
    );
    try {
      await addStockLedgerEntry({
        item_id: line.item_id,
        item_code: line.item_code,
        item_description: line.item_description,
        transaction_date: today,
        transaction_type: "manual_adjustment",
        qty_in: 0,
        qty_out: Number(event.qty_returned),
        balance_qty: 0,
        unit_cost: 0,
        total_value: 0,
        reference_type: "consumable_issue",
        reference_id: line.consumable_issue_id,
        reference_number: issueNumber,
        notes:
          `Consumable return event deleted` +
          (options.reason ? `: ${options.reason}` : ""),
        created_by: null,
        from_state: "free",
        to_state: "consumed",
      });
    } catch {
      /* non-fatal */
    }
  }
  // disposition='scrap' or 'lost' leave their scrap_register / no-op
  // trails untouched. Scrap audit rows are linked only by free-text
  // remarks, so a precise reversal would be unsafe.

  // 2. Soft delete the event row
  const { error: updErr } = await (supabase as any)
    .from("consumable_returns")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", returnId)
    .eq("company_id", companyId);
  if (updErr) throw updErr;

  // 3. Refresh aggregate
  await recomputeLineQtyReturned(event.consumable_issue_line_id, companyId);

  // 4. Audit
  try {
    const auditModule = await import("@/lib/audit-api");
    await auditModule.logAudit("consumable_return", returnId, "deleted", {
      line_id: event.consumable_issue_line_id,
      issue_id: line.consumable_issue_id,
      qty: event.qty_returned,
      disposition: event.disposition,
      reason: options.reason ?? null,
    });
  } catch {
    /* non-fatal */
  }
}

// ============================================================
// Edit issue (header + line edits with returns gating)
// ============================================================

export interface EditConsumableIssueHeaderInput {
  issued_to?: string;
  issued_by?: string | null;
  issue_date?: string;
  notes?: string | null;
}

export interface EditConsumableIssueLineInput {
  id: string;
  qty_issued?: number;
  item_id?: string | null;
  item_code?: string | null;
  item_description?: string | null;
  drawing_number?: string | null;
  unit?: string;
  return_reason?: string | null;
  disposition?: "scrap" | null;
}

export interface EditConsumableIssueInput {
  header?: EditConsumableIssueHeaderInput;
  lines?: EditConsumableIssueLineInput[];
}

export async function editConsumableIssue(
  issueId: string,
  input: EditConsumableIssueInput
): Promise<ConsumableIssue> {
  const companyId = await getCompanyId();

  // Load before snapshot for audit
  const { data: before, error: beforeErr } = await (supabase as any)
    .from("consumable_issues")
    .select("*, lines:consumable_issue_lines(*)")
    .eq("id", issueId)
    .eq("company_id", companyId)
    .single();
  if (beforeErr) throw beforeErr;
  if (!before) throw new Error("Consumable issue not found");
  if (before.status === "deleted")
    throw new Error("Cannot edit a deleted consumable issue");

  const linesById = new Map<string, any>(
    ((before.lines ?? []) as any[]).map((l) => [l.id as string, l])
  );

  // 1. Header update
  if (input.header && Object.keys(input.header).length > 0) {
    const headerPatch: Record<string, any> = {};
    if (input.header.issued_to !== undefined) headerPatch.issued_to = input.header.issued_to;
    if (input.header.issued_by !== undefined) headerPatch.issued_by = input.header.issued_by;
    if (input.header.issue_date !== undefined) headerPatch.issue_date = input.header.issue_date;
    if (input.header.notes !== undefined) headerPatch.notes = input.header.notes;
    if (Object.keys(headerPatch).length > 0) {
      headerPatch.updated_at = new Date().toISOString();
      const { error: hErr } = await (supabase as any)
        .from("consumable_issues")
        .update(headerPatch)
        .eq("id", issueId)
        .eq("company_id", companyId);
      if (hErr) throw hErr;
    }
  }

  // 2. Line updates with gating + stock deltas
  for (const update of input.lines ?? []) {
    const orig = linesById.get(update.id);
    if (!orig) throw new Error(`Line ${update.id} not found on this issue`);

    const newQtyIssued =
      update.qty_issued !== undefined ? Number(update.qty_issued) : Number(orig.qty_issued);
    const newItemId =
      update.item_id !== undefined ? update.item_id : orig.item_id;

    // Gate: qty_issued cannot drop below sum of active returns
    const returnedSum = await sumActiveReturnsForLine(update.id, companyId);
    if (newQtyIssued < returnedSum) {
      throw new Error(
        `Cannot reduce qty_issued of line ${orig.item_code ?? update.id} below total returned (${returnedSum}). ` +
          `Delete return events first.`
      );
    }

    // Stock delta — only re-credit/decrement the FREE bucket if the
    // item or qty changed. Item-swap is treated as full reversal on
    // the old item + fresh issue on the new item.
    const itemChanged = newItemId !== orig.item_id;
    const qtyChanged = newQtyIssued !== Number(orig.qty_issued);

    if (itemChanged) {
      // Reverse old item by original qty_issued (already had its
      // partial returns credited via events, so the outstanding is
      // qty_issued − returnedSum).
      const outstandingOld = Number(orig.qty_issued) - returnedSum;
      if (orig.item_id && outstandingOld > 0) {
        await updateStockBucket(orig.item_id, "free", outstandingOld).catch(
          console.error
        );
      }
      // Decrement new item by full new qty.
      if (newItemId && newQtyIssued > 0) {
        await updateStockBucket(newItemId, "free", -newQtyIssued).catch(
          console.error
        );
      }
    } else if (qtyChanged) {
      // Same item, just qty delta on outstanding portion.
      const delta = newQtyIssued - Number(orig.qty_issued);
      if (orig.item_id && delta !== 0) {
        await updateStockBucket(orig.item_id, "free", -delta).catch(
          console.error
        );
      }
    }

    const linePatch: Record<string, any> = {};
    if (update.qty_issued !== undefined) linePatch.qty_issued = newQtyIssued;
    if (update.item_id !== undefined) linePatch.item_id = newItemId;
    if (update.item_code !== undefined) linePatch.item_code = update.item_code;
    if (update.item_description !== undefined)
      linePatch.item_description = update.item_description;
    if (update.drawing_number !== undefined) linePatch.drawing_number = update.drawing_number;
    if (update.unit !== undefined) linePatch.unit = update.unit;
    if (update.return_reason !== undefined) linePatch.return_reason = update.return_reason;
    if (update.disposition !== undefined) linePatch.disposition = update.disposition;

    if (Object.keys(linePatch).length > 0) {
      const { error: lErr } = await (supabase as any)
        .from("consumable_issue_lines")
        .update(linePatch)
        .eq("id", update.id)
        .eq("company_id", companyId);
      if (lErr) throw lErr;
    }
  }

  // 3. Reload after snapshot
  const { data: after, error: afterErr } = await (supabase as any)
    .from("consumable_issues")
    .select("*, lines:consumable_issue_lines(*)")
    .eq("id", issueId)
    .eq("company_id", companyId)
    .single();
  if (afterErr) throw afterErr;

  // 4. Audit with before/after snapshot
  try {
    const auditModule = await import("@/lib/audit-api");
    await auditModule.logAudit("consumable_issue", issueId, "edited", {
      before: {
        issued_to: before.issued_to,
        issued_by: before.issued_by,
        issue_date: before.issue_date,
        notes: before.notes,
        lines: (before.lines ?? []).map((l: any) => ({
          id: l.id,
          qty_issued: l.qty_issued,
          item_id: l.item_id,
        })),
      },
      after: {
        issued_to: after.issued_to,
        issued_by: after.issued_by,
        issue_date: after.issue_date,
        notes: after.notes,
        lines: (after.lines ?? []).map((l: any) => ({
          id: l.id,
          qty_issued: l.qty_issued,
          item_id: l.item_id,
        })),
      },
    });
  } catch {
    /* non-fatal */
  }

  return after as ConsumableIssue;
}
