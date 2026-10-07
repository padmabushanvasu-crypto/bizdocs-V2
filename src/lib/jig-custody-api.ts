import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import type { CustodyStatus } from "@/lib/grn-jigs-api";

// Jig custody read side. v_jig_custody has one row per dc_jig; jig_events is
// read-only to the client (RPCs write it). Every read is company_id-scoped.

export interface JigCustodyRow {
  dc_jig_id: string;
  jig_id: string;
  jig_number: string;
  item_code: string | null;
  item_description: string | null;
  dc_id: string;
  dc_number: string | null;
  sent_at: string | null;
  party_id: string | null;
  party_name: string | null;
  qty_sent: number;
  returned_qty: number;
  written_off_qty: number;
  wo_pending_qty: number;
  outstanding_qty: number;
  dc_pending_qty: number | null;
  linked_dc_id: string | null;
  linked_dc_number: string | null;
  linked_dc_pending_qty: number | null;
  job_order_numbers: string | null;
  job_card_status: string | null;
  days_out: number | null;
  custody_status: CustodyStatus;
}

export type JigEventType =
  | "returned"
  | "held_pending"
  | "write_off_requested"
  | "write_off_approved"
  | "write_off_rejected"
  | "reversal";

export interface JigEventRow {
  id: string;
  dc_jig_id: string;
  event_type: JigEventType;
  qty: number | null;
  grn_id: string | null;
  linked_dc_id: string | null;
  ref_event_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  // resolved labels
  grn_number: string | null;
  linked_dc_number: string | null;
  created_by_name: string | null;
  /** true when a later `reversal` event points at this one */
  reversed: boolean;
}

export async function fetchJigCustody(): Promise<JigCustodyRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company context");
  const { data, error } = await (supabase as any)
    .from("v_jig_custody")
    .select("*")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return (data ?? []) as JigCustodyRow[];
}

const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter(Boolean) as string[])];

/** Resolve display labels for a set of raw jig_events rows. */
export async function labelJigEvents(rows: any[], companyId: string): Promise<JigEventRow[]> {
  const grnIds = uniq(rows.map((e) => e.grn_id));
  const dcIds = uniq(rows.map((e) => e.linked_dc_id));
  const userIds = uniq(rows.map((e) => e.created_by));
  const [grns, dcs, users] = await Promise.all([
    grnIds.length
      ? (supabase as any).from("grns").select("id, grn_number").eq("company_id", companyId).in("id", grnIds)
      : Promise.resolve({ data: [], error: null }),
    dcIds.length
      ? (supabase as any).from("delivery_challans").select("id, dc_number").eq("company_id", companyId).in("id", dcIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? (supabase as any).from("profiles").select("id, full_name, display_name, email").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [grns, dcs, users]) if (r.error) throw new Error(r.error.message);
  const grnNo = new Map<string, string>((grns.data ?? []).map((g: any) => [g.id, g.grn_number]));
  const dcNo = new Map<string, string>((dcs.data ?? []).map((d: any) => [d.id, d.dc_number]));
  const who = new Map<string, string>(
    (users.data ?? []).map((u: any) => [u.id, u.display_name || u.full_name || u.email || "—"]),
  );
  const reversedIds = new Set(rows.filter((e) => e.event_type === "reversal" && e.ref_event_id).map((e) => e.ref_event_id));
  return rows.map((e) => ({
    ...e,
    grn_number: e.grn_id ? grnNo.get(e.grn_id) ?? null : null,
    linked_dc_number: e.linked_dc_id ? dcNo.get(e.linked_dc_id) ?? null : null,
    created_by_name: e.created_by ? who.get(e.created_by) ?? null : null,
    reversed: reversedIds.has(e.id),
  })) as JigEventRow[];
}

export async function fetchJigEventsForDcJig(dcJigId: string): Promise<JigEventRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company context");
  const { data, error } = await (supabase as any)
    .from("jig_events")
    .select("*")
    .eq("company_id", companyId)
    .eq("dc_jig_id", dcJigId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return labelJigEvents(data ?? [], companyId);
}

// ── Display helpers (shared by Tracker + Approvals) ──────────────────────────

export const CUSTODY_BADGE: Record<CustodyStatus, { label: string; cls: string; rank: number }> = {
  with_vendor_job_closed: { label: "Job closed – jig not returned", cls: "bg-red-100 text-red-700 border-red-200", rank: 0 },
  write_off_pending_finance: { label: "Awaiting Finance", cls: "bg-amber-100 text-amber-800 border-amber-200", rank: 1 },
  with_vendor_work_pending: { label: "With vendor – work pending", cls: "bg-blue-100 text-blue-700 border-blue-200", rank: 2 },
  written_off: { label: "Written off – charge vendor", cls: "bg-slate-200 text-slate-700 border-slate-300", rank: 3 },
  returned: { label: "Returned", cls: "bg-green-100 text-green-700 border-green-200", rank: 4 },
};

export const EVENT_LABEL: Record<JigEventType, string> = {
  returned: "Returned",
  held_pending: "Held – items pending with vendor",
  write_off_requested: "Write-off requested",
  write_off_approved: "Write-off approved",
  write_off_rejected: "Write-off rejected",
  reversal: "Reversal (undo)",
};

/** Red rows first, then by custody rank, then longest out. */
export function compareCustody(a: JigCustodyRow, b: JigCustodyRow): number {
  const ra = CUSTODY_BADGE[a.custody_status]?.rank ?? 9;
  const rb = CUSTODY_BADGE[b.custody_status]?.rank ?? 9;
  if (ra !== rb) return ra - rb;
  return (b.days_out ?? 0) - (a.days_out ?? 0);
}
