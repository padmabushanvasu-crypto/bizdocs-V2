import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

export type FollowUpType = "phone" | "email" | "whatsapp";

export interface FollowUpLog {
  id?: string;
  company_id?: string;
  document_type: "po" | "dc";
  document_id: string;
  document_number?: string | null;
  follow_up_1_at: string | null;
  follow_up_1_type: FollowUpType | null;
  follow_up_1_note: string | null;
  follow_up_2_at: string | null;
  follow_up_2_type: FollowUpType | null;
  follow_up_2_note: string | null;
  follow_up_3_at: string | null;
  follow_up_3_type: FollowUpType | null;
  follow_up_3_note: string | null;
  follow_up_4_at: string | null;
  follow_up_4_type: FollowUpType | null;
  follow_up_4_note: string | null;
  manual_received: boolean;
  manual_received_at: string | null;
  manual_received_by: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FollowUpPO {
  id: string;
  po_number: string;
  vendor_name: string | null;
  vendor_phone: string | null;
  vendor_email: string | null;
  due_date: string | null;
  status: string;
  log: FollowUpLog | null;
}

export interface FollowUpDC {
  id: string;
  dc_number: string;
  party_name: string | null;
  party_phone: string | null;
  party_email: string | null;
  due_date: string | null;
  status: string;
  log: FollowUpLog | null;
}

export function emptyLog(documentId: string, documentType: "po" | "dc"): FollowUpLog {
  return {
    document_id: documentId,
    document_type: documentType,
    follow_up_1_at: null, follow_up_1_type: null, follow_up_1_note: null,
    follow_up_2_at: null, follow_up_2_type: null, follow_up_2_note: null,
    follow_up_3_at: null, follow_up_3_type: null, follow_up_3_note: null,
    follow_up_4_at: null, follow_up_4_type: null, follow_up_4_note: null,
    manual_received: false,
    manual_received_at: null,
    manual_received_by: null,
  };
}

export async function fetchFollowUpPOs(): Promise<FollowUpPO[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data: pos, error } = await (supabase as any)
    .from("purchase_orders")
    .select("id, po_number, vendor_name, vendor_phone, vendor_email, status")
    .eq("company_id", companyId)
    .in("status", ["issued", "partially_received"])
    .order("created_at", { ascending: false });

  if (error || !pos?.length) return [];

  const poIds: string[] = pos.map((p: any) => p.id);

  // Earliest delivery_date per PO from line items
  const { data: lineItems } = await (supabase as any)
    .from("po_line_items")
    .select("po_id, delivery_date")
    .in("po_id", poIds)
    .not("delivery_date", "is", null);

  const dueDateByPo = new Map<string, string>();
  for (const li of lineItems ?? []) {
    if (!li.delivery_date) continue;
    const cur = dueDateByPo.get(li.po_id);
    if (!cur || li.delivery_date < cur) dueDateByPo.set(li.po_id, li.delivery_date);
  }

  // GRNs that are closed for these POs (auto-close trigger)
  const { data: closedGrns } = await (supabase as any)
    .from("grns")
    .select("po_id")
    .in("po_id", poIds)
    .eq("grn_stage", "closed")
    .neq("status", "deleted");

  const closedPoIds = new Set<string>((closedGrns ?? []).map((g: any) => g.po_id).filter(Boolean));

  // Follow-up logs for these POs
  const { data: logs } = await (supabase as any)
    .from("follow_up_logs")
    .select("*")
    .eq("company_id", companyId)
    .eq("document_type", "po")
    .in("document_id", poIds);

  const logByDocId = new Map<string, FollowUpLog>((logs ?? []).map((l: any) => [l.document_id, l as FollowUpLog]));

  const result: FollowUpPO[] = [];
  for (const po of pos) {
    const log = logByDocId.get(po.id) ?? null;
    if (log?.manual_received) continue;
    if (closedPoIds.has(po.id)) continue;
    result.push({
      id: po.id,
      po_number: po.po_number,
      vendor_name: po.vendor_name,
      vendor_phone: po.vendor_phone,
      vendor_email: po.vendor_email,
      due_date: dueDateByPo.get(po.id) ?? null,
      status: po.status,
      log,
    });
  }
  return result;
}

export async function fetchFollowUpDCs(): Promise<FollowUpDC[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data: dcs, error } = await (supabase as any)
    .from("delivery_challans")
    .select("id, dc_number, party_id, party_name, party_phone, return_due_date, status")
    .eq("company_id", companyId)
    .eq("status", "issued")
    .order("created_at", { ascending: false });

  if (error || !dcs?.length) return [];

  const dcIds: string[] = dcs.map((d: any) => d.id);

  // Fetch party emails (not stored on DC directly)
  const partyIds = [...new Set<string>(dcs.map((d: any) => d.party_id).filter(Boolean))];
  const emailByPartyId = new Map<string, string>();
  if (partyIds.length) {
    const { data: parties } = await (supabase as any)
      .from("parties")
      .select("id, email1")
      .in("id", partyIds);
    for (const p of parties ?? []) {
      if (p.email1) emailByPartyId.set(p.id, p.email1);
    }
  }

  // GRNs that are closed for these DCs
  const { data: closedGrns } = await (supabase as any)
    .from("grns")
    .select("linked_dc_id")
    .in("linked_dc_id", dcIds)
    .eq("grn_stage", "closed")
    .neq("status", "deleted");

  const closedDcIds = new Set<string>((closedGrns ?? []).map((g: any) => g.linked_dc_id).filter(Boolean));

  // Follow-up logs for these DCs
  const { data: logs } = await (supabase as any)
    .from("follow_up_logs")
    .select("*")
    .eq("company_id", companyId)
    .eq("document_type", "dc")
    .in("document_id", dcIds);

  const logByDocId = new Map<string, FollowUpLog>((logs ?? []).map((l: any) => [l.document_id, l as FollowUpLog]));

  const result: FollowUpDC[] = [];
  for (const dc of dcs) {
    const log = logByDocId.get(dc.id) ?? null;
    if (log?.manual_received) continue;
    if (closedDcIds.has(dc.id)) continue;
    result.push({
      id: dc.id,
      dc_number: dc.dc_number,
      party_name: dc.party_name,
      party_phone: dc.party_phone,
      party_email: dc.party_id ? (emailByPartyId.get(dc.party_id) ?? null) : null,
      due_date: dc.return_due_date ?? null,
      status: dc.status,
      log,
    });
  }
  return result;
}

export async function fetchPartiallyReturnedDCs(): Promise<FollowUpDC[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data: dcs, error } = await (supabase as any)
    .from("delivery_challans")
    .select("id, dc_number, party_id, party_name, party_phone, return_due_date, status")
    .eq("company_id", companyId)
    .eq("status", "partially_returned")
    .order("created_at", { ascending: false });

  if (error || !dcs?.length) return [];

  const dcIds: string[] = dcs.map((d: any) => d.id);

  // Fetch party emails
  const partyIds = [...new Set<string>(dcs.map((d: any) => d.party_id).filter(Boolean))];
  const emailByPartyId = new Map<string, string>();
  if (partyIds.length) {
    const { data: parties } = await (supabase as any)
      .from("parties")
      .select("id, email1")
      .in("id", partyIds);
    for (const p of parties ?? []) {
      if (p.email1) emailByPartyId.set(p.id, p.email1);
    }
  }

  // Follow-up logs for these DCs
  const { data: logs } = await (supabase as any)
    .from("follow_up_logs")
    .select("*")
    .eq("company_id", companyId)
    .eq("document_type", "dc")
    .in("document_id", dcIds);

  const logByDocId = new Map<string, FollowUpLog>((logs ?? []).map((l: any) => [l.document_id, l as FollowUpLog]));

  return dcs.map((dc: any) => ({
    id: dc.id,
    dc_number: dc.dc_number,
    party_name: dc.party_name,
    party_phone: dc.party_phone,
    party_email: dc.party_id ? (emailByPartyId.get(dc.party_id) ?? null) : null,
    due_date: dc.return_due_date ?? null,
    status: dc.status,
    log: logByDocId.get(dc.id) ?? null,
  }));
}

export async function upsertFollowUpLog(
  documentId: string,
  documentType: "po" | "dc",
  documentNumber: string,
  data: Partial<Omit<FollowUpLog, "id" | "company_id" | "created_at" | "updated_at">>
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) return;

  await (supabase as any)
    .from("follow_up_logs")
    .upsert(
      {
        company_id: companyId,
        document_id: documentId,
        document_type: documentType,
        document_number: documentNumber,
        ...data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,document_id" }
    );
}

export async function markManualReceived(
  documentId: string,
  documentType: "po" | "dc",
  documentNumber: string,
  userName: string
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) return;

  await (supabase as any)
    .from("follow_up_logs")
    .upsert(
      {
        company_id: companyId,
        document_id: documentId,
        document_type: documentType,
        document_number: documentNumber,
        manual_received: true,
        manual_received_at: new Date().toISOString(),
        manual_received_by: userName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,document_id" }
    );
}

export async function fetchCompletedTodayCount(documentType: "po" | "dc"): Promise<number> {
  const companyId = await getCompanyId();
  if (!companyId) return 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await (supabase as any)
    .from("follow_up_logs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("manual_received", true)
    .gte("manual_received_at", todayStart.toISOString());

  return count ?? 0;
}
