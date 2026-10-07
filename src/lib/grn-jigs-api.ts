import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// Jig custody (GRN side). Jig questions come from v_grn_jig_questions; answers
// are written by rpc_record_grn_jig_answer (never inserted into jig_events by
// the client). A DB trigger (trg_grn_jig_gate) blocks a dc_grn from leaving
// draft/quantitative_pending while any row has needs_answer = true — its
// message is shown verbatim, never rewritten.

export type CustodyStatus =
  | "returned"
  | "written_off"
  | "write_off_pending_finance"
  | "with_vendor_work_pending"
  | "with_vendor_job_closed";

export interface GrnJigQuestion {
  dc_jig_id: string;
  grn_id: string;
  jig_number: string;
  item_code: string | null;
  item_description: string | null;
  dc_number: string | null;
  sent_at: string | null;
  party_name: string | null;
  qty_sent: number;
  returned_qty: number;
  written_off_qty: number;
  wo_pending_qty: number;
  outstanding_qty: number;
  linked_dc_number: string | null;
  linked_dc_pending_qty: number | null;
  custody_status: CustodyStatus;
  open_qty: number;
  answered: boolean;
  answer_event_id: string | null;
  answer_type: string | null;
  answer_qty: number | null;
  needs_answer: boolean;
}

export interface JigLinkCandidate {
  dc_id: string;
  dc_number: string;
  dc_date: string | null;
  pending_qty: number;
  job_order_numbers: string | null;
  is_same_dc: boolean;
}

export async function fetchGrnJigQuestions(grnId: string): Promise<GrnJigQuestion[]> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company context");
  const { data, error } = await (supabase as any)
    .from("v_grn_jig_questions")
    .select("*")
    .eq("company_id", companyId)
    .eq("grn_id", grnId);
  if (error) throw new Error(error.message);
  return (data ?? []) as GrnJigQuestion[];
}

export async function fetchJigLinkCandidates(grnId: string, dcJigId: string): Promise<JigLinkCandidate[]> {
  const { data, error } = await (supabase as any).rpc("rpc_jig_link_candidates", {
    p_grn_id: grnId,
    p_dc_jig_id: dcJigId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as JigLinkCandidate[];
}

export interface RecordJigAnswerArgs {
  p_qty_returned: number;
  p_remainder: "held_pending" | "write_off" | null;
  p_linked_dc_id: string | null;
  p_reason: string | null;
}

export async function recordGrnJigAnswer(grnId: string, dcJigId: string, a: RecordJigAnswerArgs): Promise<void> {
  const { error } = await (supabase as any).rpc("rpc_record_grn_jig_answer", {
    p_grn_id: grnId,
    p_dc_jig_id: dcJigId,
    p_qty_returned: a.p_qty_returned,
    p_remainder: a.p_remainder,
    p_linked_dc_id: a.p_linked_dc_id,
    p_reason: a.p_reason,
  });
  if (error) throw new Error(error.message);
}

export async function reverseJigEvent(eventId: string, reason: string): Promise<void> {
  const { error } = await (supabase as any).rpc("rpc_reverse_jig_event", {
    p_event_id: eventId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

// ── Answer draft (client-side form state) ────────────────────────────────────

export const WRITE_OFF_REASONS = ["Lost", "Damaged", "Vendor retaining", "Other"] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

export interface JigAnswerDraft {
  returned: "yes" | "no" | null;
  /** Text so the input can be cleared while typing; parsed on build. */
  returnedQty: string;
  hasPending: "yes" | "no" | null;
  linkedDcId: string | null;
  reasonType: WriteOffReason | "";
  reasonText: string;
}

export const emptyJigDraft = (row: Pick<GrnJigQuestion, "open_qty">): JigAnswerDraft => ({
  returned: null,
  returnedQty: String(row.open_qty),
  hasPending: null,
  linkedDcId: null,
  reasonType: "",
  reasonText: "",
});

/** Qty the user says came back (0 for "No"), or null while unanswered/invalid. */
export function draftReturnedQty(row: Pick<GrnJigQuestion, "open_qty">, d: JigAnswerDraft): number | null {
  if (d.returned === "no") return 0;
  if (d.returned !== "yes") return null;
  if (row.open_qty <= 1) return row.open_qty;
  const n = Number(d.returnedQty);
  if (!Number.isInteger(n) || n < 1 || n > row.open_qty) return null;
  return n;
}

/** Everything is back — Q2 not needed. */
export function draftAllReturned(row: Pick<GrnJigQuestion, "open_qty">, d: JigAnswerDraft): boolean {
  return draftReturnedQty(row, d) === row.open_qty;
}

/**
 * Validate a draft and produce the RPC arguments. Returns `{ error }` with a
 * user-facing reason while the draft is incomplete.
 */
export function buildJigAnswer(
  row: Pick<GrnJigQuestion, "open_qty">,
  d: JigAnswerDraft,
): RecordJigAnswerArgs | { error: string } {
  const qty = draftReturnedQty(row, d);
  if (qty === null) {
    return { error: d.returned === "yes" ? `Returned qty must be 1 to ${row.open_qty}` : "Answer: was the jig returned?" };
  }
  if (qty === row.open_qty) {
    return { p_qty_returned: qty, p_remainder: null, p_linked_dc_id: null, p_reason: null };
  }
  if (d.hasPending === null) return { error: "Answer: items still pending with the vendor?" };
  if (d.hasPending === "yes") {
    if (!d.linkedDcId) return { error: "Choose the DC with items still pending" };
    return { p_qty_returned: qty, p_remainder: "held_pending", p_linked_dc_id: d.linkedDcId, p_reason: null };
  }
  const text = d.reasonText.trim();
  if (!d.reasonType) return { error: "Choose a reason" };
  if (!text) return { error: "Reason text is required" };
  return {
    p_qty_returned: qty,
    p_remainder: "write_off",
    p_linked_dc_id: null,
    p_reason: `${d.reasonType}: ${text}`,
  };
}

/**
 * Submit answers for every row that currently needs one. Rows are re-read
 * from the DB first so an already-answered row (e.g. a retry after the stage
 * save failed) is skipped rather than rejected as a duplicate. Stops at the
 * first error, thrown verbatim; answers saved before it stand.
 */
export async function submitPendingJigAnswers(
  grnId: string,
  drafts: Map<string, JigAnswerDraft>,
): Promise<number> {
  const rows = (await fetchGrnJigQuestions(grnId)).filter((r) => r.needs_answer);
  const prepared = rows.map((r) => {
    const draft = drafts.get(r.dc_jig_id);
    const built = draft ? buildJigAnswer(r, draft) : { error: "Not answered" };
    if ("error" in built) throw new Error(`Jig ${r.jig_number}: ${built.error}`);
    return { row: r, args: built };
  });
  for (const { row, args } of prepared) {
    await recordGrnJigAnswer(grnId, row.dc_jig_id, args);
  }
  return prepared.length;
}
