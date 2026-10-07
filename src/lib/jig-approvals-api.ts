import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { labelJigEvents, type JigCustodyRow, type JigEventRow } from "@/lib/jig-custody-api";

// Finance/Admin review side of jig custody. Every list is company_id-scoped;
// every write goes through an RPC and its error message is thrown verbatim.

export interface WriteOffRequest {
  event: JigEventRow;
  custody: JigCustodyRow | null;
}

/** write_off_requested events with no review (approved/rejected) and no reversal. */
export async function fetchPendingWriteOffs(): Promise<WriteOffRequest[]> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company context");
  const { data: requested, error } = await (supabase as any)
    .from("jig_events")
    .select("*")
    .eq("company_id", companyId)
    .eq("event_type", "write_off_requested")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!requested?.length) return [];

  const ids: string[] = requested.map((e: any) => e.id);
  const { data: followUps, error: fErr } = await (supabase as any)
    .from("jig_events")
    .select("ref_event_id")
    .eq("company_id", companyId)
    .in("ref_event_id", ids);
  if (fErr) throw new Error(fErr.message);
  const handled = new Set<string>((followUps ?? []).map((f: any) => f.ref_event_id));
  const pending = requested.filter((e: any) => !handled.has(e.id));
  if (pending.length === 0) return [];

  const dcJigIds = [...new Set<string>(pending.map((e: any) => e.dc_jig_id))];
  const { data: custody, error: cErr } = await (supabase as any)
    .from("v_jig_custody")
    .select("*")
    .eq("company_id", companyId)
    .in("dc_jig_id", dcJigIds);
  if (cErr) throw new Error(cErr.message);
  const byDcJig = new Map<string, JigCustodyRow>((custody ?? []).map((c: JigCustodyRow) => [c.dc_jig_id, c]));

  const labelled = await labelJigEvents(pending, companyId);
  return labelled.map((event) => ({ event, custody: byDcJig.get(event.dc_jig_id) ?? null }));
}

export async function reviewJigWriteOff(eventId: string, approve: boolean, notes: string | null): Promise<void> {
  const { error } = await (supabase as any).rpc("rpc_review_jig_write_off", {
    p_event_id: eventId,
    p_approve: approve,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
}

/** Shape written by trg_processor_invoice_jig_hold. */
export interface JigHoldSnapshotItem {
  dc_jig_id: string;
  jig: string;
  item: string | null;
  dc: string | null;
  outstanding: number;
  days_out: number | null;
  status: string;
}

export interface JigHoldRow {
  id: string;
  invoice_id: string;
  party_id: string;
  status: "pending" | "approved" | "rejected";
  jigs_snapshot: JigHoldSnapshotItem[] | null;
  review_notes: string | null;
  created_at: string;
  invoice_number: string | null;
  invoice_date: string | null;
  party_name: string | null;
}

export async function fetchPendingJigHolds(): Promise<JigHoldRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company context");
  const { data, error } = await (supabase as any)
    .from("processor_invoice_jig_holds")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const holds = (data ?? []) as any[];
  if (holds.length === 0) return [];

  const invIds = [...new Set<string>(holds.map((h) => h.invoice_id))];
  const partyIds = [...new Set<string>(holds.map((h) => h.party_id))];
  const [inv, parties] = await Promise.all([
    (supabase as any).from("processor_invoices").select("id, invoice_number, invoice_date").eq("company_id", companyId).in("id", invIds),
    (supabase as any).from("parties").select("id, name").eq("company_id", companyId).in("id", partyIds),
  ]);
  if (inv.error) throw new Error(inv.error.message);
  if (parties.error) throw new Error(parties.error.message);
  const invById = new Map<string, any>((inv.data ?? []).map((i: any) => [i.id, i]));
  const partyById = new Map<string, string>((parties.data ?? []).map((p: any) => [p.id, p.name]));
  return holds.map((h) => ({
    ...h,
    invoice_number: invById.get(h.invoice_id)?.invoice_number ?? null,
    invoice_date: invById.get(h.invoice_id)?.invoice_date ?? null,
    party_name: partyById.get(h.party_id) ?? null,
  }));
}

export async function reviewJigHold(holdId: string, approve: boolean, notes: string | null): Promise<void> {
  const { error } = await (supabase as any).rpc("rpc_review_processor_invoice_jig_hold", {
    p_hold_id: holdId,
    p_approve: approve,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
}

/** invoice_id → hold status, for the Processor Invoices list badge. */
export async function fetchJigHoldStatusByInvoice(invoiceIds: string[]): Promise<Map<string, "pending" | "approved" | "rejected">> {
  if (invoiceIds.length === 0) return new Map();
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company context");
  const { data, error } = await (supabase as any)
    .from("processor_invoice_jig_holds")
    .select("invoice_id, status")
    .eq("company_id", companyId)
    .in("invoice_id", invoiceIds);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((h: any) => [h.invoice_id, h.status]));
}
