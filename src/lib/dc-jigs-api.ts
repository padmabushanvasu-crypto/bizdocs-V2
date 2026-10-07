import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// Jig custody (DC side). dc_jigs is keyed on DC + item + jig — NOT on
// dc_line_items — so the DC line delete/re-insert on edit never touches it.
// jig_number is set by a DB trigger; never sent from the client.

export interface DcJigRow {
  id: string;
  dc_id: string;
  item_id: string;
  jig_id: string;
  jig_number: string;
  qty: number;
}

/** A jig picked in the DC form (no row id yet when newly picked). */
export interface PickedJig {
  jig_id: string;
  jig_number: string;
  qty: number;
}

export interface JigSuggestion {
  jig_id: string;
  jig_number: string;
  drawing_number: string | null;
  associated_process: string | null;
}

export interface JigMasterOption {
  id: string;
  jig_number: string;
  drawing_number: string | null;
  status: string | null;
}

export async function fetchDcJigs(dcId: string): Promise<DcJigRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company context");
  const { data, error } = await (supabase as any)
    .from("dc_jigs")
    .select("id, dc_id, item_id, jig_id, jig_number, qty")
    .eq("company_id", companyId)
    .eq("dc_id", dcId);
  if (error) throw new Error(error.message);
  return (data ?? []) as DcJigRow[];
}

export async function fetchItemJigSuggestions(itemId: string): Promise<JigSuggestion[]> {
  const { data, error } = await (supabase as any).rpc("rpc_item_jig_suggestions", { p_item_id: itemId });
  if (error) throw new Error(error.message);
  return (data ?? []) as JigSuggestion[];
}

export async function fetchJigMasterOptions(): Promise<JigMasterOption[]> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company context");
  const { data, error } = await (supabase as any)
    .from("jig_master")
    .select("id, jig_number, drawing_number, status")
    .eq("company_id", companyId)
    .order("jig_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as JigMasterOption[];
}

export interface DcJigDiff {
  toDelete: DcJigRow[];
  toUpdate: { row: DcJigRow; qty: number }[];
  toInsert: { item_id: string; jig_id: string; qty: number }[];
}

/**
 * Pure diff between the DC's persisted dc_jigs and the desired picks.
 * `desired` is keyed by item_id; an item that is not in `desired` at all
 * (its last line was removed) has all its persisted jigs deleted.
 */
export function diffDcJigs(original: DcJigRow[], desired: Map<string, PickedJig[]>): DcJigDiff {
  const desiredKey = new Map<string, { item_id: string; jig: PickedJig }>();
  for (const [itemId, jigs] of desired) {
    for (const j of jigs) desiredKey.set(`${itemId}|${j.jig_id}`, { item_id: itemId, jig: j });
  }
  const originalKey = new Map(original.map((r) => [`${r.item_id}|${r.jig_id}`, r]));

  const toDelete: DcJigRow[] = [];
  const toUpdate: { row: DcJigRow; qty: number }[] = [];
  for (const [key, row] of originalKey) {
    const want = desiredKey.get(key);
    if (!want) toDelete.push(row);
    else if (want.jig.qty !== row.qty) toUpdate.push({ row, qty: want.jig.qty });
  }
  const toInsert: DcJigDiff["toInsert"] = [];
  for (const [key, want] of desiredKey) {
    if (!originalKey.has(key)) toInsert.push({ item_id: want.item_id, jig_id: want.jig.jig_id, qty: want.jig.qty });
  }
  return { toDelete, toUpdate, toInsert };
}

/**
 * Persist the diff. Call AFTER the DC lines are saved (a trigger rejects a
 * jig for an item that is not on any line of the DC). Order: delete, update,
 * insert. The first DB error is thrown verbatim and stops the sync.
 */
export async function syncDcJigs(dcId: string, original: DcJigRow[], desired: Map<string, PickedJig[]>): Promise<void> {
  const diff = diffDcJigs(original, desired);
  if (diff.toDelete.length + diff.toUpdate.length + diff.toInsert.length === 0) return;
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company context");

  for (const row of diff.toDelete) {
    const { error } = await (supabase as any).from("dc_jigs").delete().eq("id", row.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }
  for (const { row, qty } of diff.toUpdate) {
    const { error } = await (supabase as any).from("dc_jigs").update({ qty }).eq("id", row.id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }
  if (diff.toInsert.length > 0) {
    const { error } = await (supabase as any)
      .from("dc_jigs")
      .insert(diff.toInsert.map((r) => ({ company_id: companyId, dc_id: dcId, item_id: r.item_id, jig_id: r.jig_id, qty: r.qty })));
    if (error) throw new Error(error.message);
  }
}

/** "DJ 17 × 2, G25 × 1" */
export function formatJigList(jigs: { jig_number: string; qty: number }[]): string {
  return jigs.map((j) => `${j.jig_number} × ${j.qty}`).join(", ");
}
