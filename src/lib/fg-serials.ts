// Finished-good serial numbers — one serial_numbers row per unit, linked to its
// work order (serial_numbers.awo_id). The DB owns the rules:
//   rpc_set_awo_serials  — set/replace a work order's serials (unique per company,
//                          count ≤ quantity_to_build, releases removed ones)
//   rpc_accept_awo_and_produce — serial count must equal the quantity accepted;
//                          moves them in_production → in_stock in the same transaction
//   rpc_verify_serial    — team confirms a backfilled (unverified) serial
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// serial_numbers.awo_id / needs_verification and the rpc_*_serial(s) functions are
// newer than the generated Supabase types, so this module talks to an untyped client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface FgSerial {
  id: string;
  serial_number: string;
  status: string;
  needs_verification: boolean;
  awo_id: string | null;
  item_id: string | null;
}

/**
 * Turn what the team types into one serial per unit.
 * Separators: comma, &, /, semicolon, new line ("5966,5967&5968").
 * Ranges with the same length are expanded ("5936-5937" → 5936, 5937).
 * A short tail borrows the previous serial's prefix ("5923 & 24" → 5923, 5924).
 * Anything else is kept as typed (trimmed), so non-numeric serials still work.
 */
export function parseSerialList(text: string): string[] {
  const tokens = text
    .split(/\s*(?:,|&|\/|;|\n|\r)\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    const range = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const [, a, b] = range;
      const from = Number(a);
      const to = Number(b);
      if (a.length === b.length && to > from && to - from < 100) {
        for (let i = from; i <= to; i++) out.push(String(i).padStart(a.length, "0"));
        continue;
      }
    }
    const prev = out[out.length - 1];
    if (prev && /^\d+$/.test(t) && /^\d+$/.test(prev) && t.length < prev.length) {
      out.push(prev.slice(0, prev.length - t.length) + t);
      continue;
    }
    out.push(t);
  }
  return out;
}

/** Serials typed more than once (case-insensitive), for inline errors before saving. */
export function findDuplicateSerials(serials: string[]): string[] {
  const seen = new Map<string, number>();
  for (const s of serials.map((x) => x.trim()).filter(Boolean)) {
    const k = s.toUpperCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

/** Save a work order's serials (replaces its open list). Throws the DB message as-is. */
export async function setAwoSerials(awoId: string, serials: string[]): Promise<FgSerial[]> {
  const { data, error } = await db.rpc("rpc_set_awo_serials", {
    p_awo_id: awoId,
    p_serials: serials.map((s) => s.trim()).filter(Boolean),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as FgSerial[];
}

/** Live (not cancelled) serials for a set of work orders, grouped by work order id. */
export async function fetchSerialsForAwos(awoIds: string[]): Promise<Record<string, FgSerial[]>> {
  if (awoIds.length === 0) return {};
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");
  const out: Record<string, FgSerial[]> = {};
  const CHUNK = 200;
  for (let i = 0; i < awoIds.length; i += CHUNK) {
    const { data, error } = await db
      .from("serial_numbers")
      .select("id, serial_number, status, needs_verification, awo_id, item_id")
      .eq("company_id", companyId)
      .in("awo_id", awoIds.slice(i, i + CHUNK))
      .neq("status", "cancelled")
      .order("serial_number", { ascending: true });
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as FgSerial[]) {
      if (!row.awo_id) continue;
      (out[row.awo_id] ??= []).push(row);
    }
  }
  return out;
}

/**
 * Serials from the list that are already live on another unit — checked before
 * a new work order is raised so the team sees the clash before anything is saved.
 * (The DB still enforces uniqueness; this is only an early, friendlier check.)
 */
export async function findSerialsInUse(
  serials: string[],
  excludeAwoId?: string,
): Promise<Array<{ serial_number: string; status: string; awo_number: string | null }>> {
  const list = serials.map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return [];
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");
  const { data, error } = await db
    .from("serial_numbers")
    .select("serial_number, status, awo_id, assembly_work_orders(awo_number)")
    .eq("company_id", companyId)
    .neq("status", "cancelled")
    .in("serial_number", list);
  if (error) throw new Error(error.message);
  type InUseRow = { serial_number: string; status: string; awo_id: string | null; assembly_work_orders: { awo_number: string } | null };
  return ((data ?? []) as InUseRow[])
    .filter((r) => !excludeAwoId || r.awo_id !== excludeAwoId)
    .map((r) => ({
      serial_number: r.serial_number,
      status: r.status,
      awo_number: r.assembly_work_orders?.awo_number ?? null,
    }));
}

/** Team confirms a backfilled serial: still in the factory, or already gone. */
export async function verifySerial(serialId: string, stillInFactory: boolean): Promise<void> {
  const { error } = await db.rpc("rpc_verify_serial", {
    p_serial_id: serialId,
    p_still_in_factory: stillInFactory,
  });
  if (error) throw new Error(error.message);
}

export const SERIAL_STATUS_LABEL: Record<string, string> = {
  in_production: "Being built",
  in_stock: "In stock",
  dispatched: "Dispatched",
  under_warranty: "Under warranty",
  scrapped: "Scrapped",
  cancelled: "Released",
};
