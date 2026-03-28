import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { normalizePartyType, type SkipReason } from "@/lib/import-utils";

export type VendorType = "raw_material_supplier" | "processor" | "both";

// Extend generated type with vendor_type column added via migration
export type Party = Tables<"parties"> & { vendor_type?: VendorType | null };
export type PartyInsert = TablesInsert<"parties">;
export type PartyUpdate = TablesUpdate<"parties">;

export interface PartiesFilters {
  search?: string;
  type?: "vendor" | "customer" | "both" | "all";
  vendor_type?: VendorType | "all";
  status?: "active" | "inactive" | "all";
  page?: number;
  pageSize?: number;
}

export async function fetchParties(filters: PartiesFilters = {}) {
  const { search, type = "all", vendor_type = "all", status = "active", page = 1, pageSize = 100 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("parties")
    .select("*", { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);

  if (type !== "all") {
    if (type === "vendor") {
      query = query.in("party_type", ["vendor", "both"]);
    } else if (type === "customer") {
      query = query.in("party_type", ["customer", "both"]);
    } else {
      query = query.eq("party_type", type);
    }
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (vendor_type !== "all") {
    query = (query as any).eq("vendor_type", vendor_type);
  }

  if (search && search.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`name.ilike.${term},gstin.ilike.${term},phone1.ilike.${term},city.ilike.${term}`);
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function fetchParty(id: string) {
  const { data, error } = await supabase
    .from("parties")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createParty(party: PartyInsert) {
  const companyId = await getCompanyId();
  try {
    const { data, error } = await (supabase as any)
      .from("parties")
      .insert({ ...party, company_id: companyId })
      .select()
      .single();
    if (error) {
      console.error("[createParty] error:", error);
      throw new Error(error.message ?? JSON.stringify(error));
    }
    return data;
  } catch (err: any) {
    console.error("[createParty] caught:", err);
    throw err;
  }
}

export async function updateParty(id: string, party: PartyUpdate) {
  try {
    const { data, error } = await (supabase as any)
      .from("parties")
      .update(party)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      console.error("[updateParty] error:", error);
      throw new Error(error.message ?? JSON.stringify(error));
    }
    return data;
  } catch (err: any) {
    console.error("[updateParty] caught:", err);
    throw err;
  }
}

export async function deactivateParty(id: string) {
  return updateParty(id, { status: "inactive" });
}

export async function deleteParty(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
  const [
    { count: poCount },
    { count: dcCount },
    { count: soCount },
    { count: invoiceCount },
    { count: receiptCount },
  ] = await Promise.all([
    (supabase as any).from("purchase_orders").select("id", { count: "exact", head: true }).eq("vendor_id", id),
    (supabase as any).from("delivery_challans").select("id", { count: "exact", head: true }).eq("party_id", id),
    (supabase as any).from("sales_orders").select("id", { count: "exact", head: true }).eq("customer_id", id),
    (supabase as any).from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", id),
    (supabase as any).from("receipts").select("id", { count: "exact", head: true }).eq("party_id", id),
  ]);
  const hasRefs =
    (poCount ?? 0) > 0 ||
    (dcCount ?? 0) > 0 ||
    (soCount ?? 0) > 0 ||
    (invoiceCount ?? 0) > 0 ||
    (receiptCount ?? 0) > 0;
  if (hasRefs) {
    await updateParty(id, { status: "inactive" });
    return { deleted: false, deactivated: true };
  }
  const { error } = await (supabase as any).from("parties").delete().eq("id", id);
  if (error) {
    console.error("[deleteParty] error:", error);
    throw new Error(error.message ?? JSON.stringify(error));
  }
  return { deleted: true, deactivated: false };
}

export async function deleteAllParties(): Promise<{ deleted: number; deactivated: number; errors: number }> {
  const companyId = await getCompanyId();
  const { data: allParties } = await (supabase as any)
    .from("parties")
    .select("id")
    .eq("company_id", companyId);
  const ids = (allParties ?? []).map((p: any) => p.id as string);
  if (ids.length === 0) return { deleted: 0, deactivated: 0, errors: 0 };
  return bulkDeleteParties(ids);
}

export async function bulkUpdatePartyStatus(ids: string[], status: string) {
  const { error } = await supabase.from("parties").update({ status } as any).in("id", ids);
  if (error) throw error;
}

export async function bulkDeleteParties(ids: string[]): Promise<{ deleted: number; deactivated: number; errors: number }> {
  let deleted = 0, deactivated = 0, errors = 0;
  for (const id of ids) {
    try {
      const [
        { count: poCount },
        { count: dcCount },
        { count: soCount },
        { count: invoiceCount },
        { count: receiptCount },
      ] = await Promise.all([
        (supabase as any).from("purchase_orders").select("id", { count: "exact", head: true }).eq("vendor_id", id),
        (supabase as any).from("delivery_challans").select("id", { count: "exact", head: true }).eq("party_id", id),
        (supabase as any).from("sales_orders").select("id", { count: "exact", head: true }).eq("customer_id", id),
        (supabase as any).from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", id),
        (supabase as any).from("receipts").select("id", { count: "exact", head: true }).eq("party_id", id),
      ]);
      const hasRefs =
        (poCount ?? 0) > 0 ||
        (dcCount ?? 0) > 0 ||
        (soCount ?? 0) > 0 ||
        (invoiceCount ?? 0) > 0 ||
        (receiptCount ?? 0) > 0;
      if (hasRefs) {
        await updateParty(id, { status: "inactive" });
        deactivated++;
      } else {
        const { error } = await supabase.from("parties").delete().eq("id", id);
        if (error) throw error;
        deleted++;
      }
    } catch {
      errors++;
    }
  }
  return { deleted, deactivated, errors };
}

// ── Bulk import batch function (shared by DataImport and BackgroundImportDialog) ──

export async function importPartiesBatch(
  rows: Record<string, string>[],
  rowNums: number[],
  onProgress?: (pct: number) => void
): Promise<{ imported: number; skipped: number; errors: string[]; skipReasons: SkipReason[]; updated?: number }> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Company ID is missing — cannot import without company context");
  console.log("[importPartiesBatch] start:", { companyId, rowCount: rows.length, firstRow: rows[0] });

  const { data: existingParties } = await (supabase as any)
    .from("parties").select("id, name, gstin").eq("company_id", companyId);
  const byName = new Map<string, string>(
    (existingParties ?? []).map((p: any) => [p.name?.toLowerCase().trim(), p.id as string])
  );
  const byGstin = new Map<string, string>(
    (existingParties ?? []).filter((p: any) => p.gstin?.trim())
      .map((p: any) => [p.gstin.trim().toLowerCase(), p.id as string])
  );

  let imported = 0;
  let newCount = 0;
  let updatedCount = 0;
  let skipped = 0;
  const errors: string[] = [];
  const skipReasons: SkipReason[] = [];
  const toInsert: any[] = [];
  const toUpdate: any[] = [];
  const nameToRow = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = rowNums[i] ?? (i + 2);
    const name = row["name"]?.trim();
    if (!name) {
      skipped++;
      errors.push(`Row ${excelRow}: Party Name was blank`);
      skipReasons.push({ row: excelRow, value: "", reason: "Party Name was blank" });
      continue;
    }
    nameToRow.set(name.toLowerCase(), excelRow);
    const gstin = row["gstin"] || null;
    const state_code = row["state_code"] || (gstin && gstin.length >= 2 ? gstin.substring(0, 2) : null);
    const partyData: any = {
      company_id: companyId, name,
      party_type: normalizePartyType(row["party_type"] || ""),
      contact_person: row["contact_person"] || null,
      address_line1: row["address_line1"] || null,
      city: row["city"] || null,
      state: row["state"] || null,
      pin_code: row["pin_code"] || null,
      phone1: row["phone1"] || null,
      email1: row["email1"] || null,
      gstin, pan: row["pan"] || null,
      payment_terms: row["payment_terms"] || null,
      notes: row["notes"] || null,
      state_code,
    };
    const existingId = byName.get(name.toLowerCase()) ??
      (gstin ? byGstin.get(gstin.toLowerCase()) ?? null : null);
    if (existingId) toUpdate.push({ id: existingId, ...partyData });
    else toInsert.push(partyData);
  }

  const totalOps = toInsert.length + toUpdate.length;

  if (toInsert.length > 0) {
    try {
      for (let i = 0; i < toInsert.length; i += 200) {
        const chunk = toInsert.slice(i, i + 200);
        const { error } = await (supabase as any).from("parties").insert(chunk);
        if (error) throw error;
        imported += chunk.length; newCount += chunk.length;
        if (totalOps > 0) onProgress?.(Math.round((imported / totalOps) * 100));
      }
    } catch {
      for (const party of toInsert) {
        try {
          const { error } = await (supabase as any).from("parties").insert(party);
          if (error) throw error;
          imported++; newCount++;
          if (totalOps > 0) onProgress?.(Math.round((imported / totalOps) * 100));
        } catch (err: any) {
          skipped++;
          const isDup = err?.code === "23505" || String(err?.message ?? "").toLowerCase().includes("duplicate");
          const reason = isDup ? "Duplicate already exists" : `DB error: ${err?.message ?? "unknown"}`;
          const rowNum = nameToRow.get(party.name?.toLowerCase()) ?? 0;
          errors.push(`Row ${rowNum} (${party.name}): ${reason}`);
          skipReasons.push({ row: rowNum, value: party.name, reason });
        }
      }
    }
  }

  for (let i = 0; i < toUpdate.length; i += 100) {
    const chunk = toUpdate.slice(i, i + 100);
    try {
      const { error } = await (supabase as any).from("parties").upsert(chunk, { onConflict: "id" });
      if (error) throw error;
      imported += chunk.length; updatedCount += chunk.length;
    } catch {
      for (const party of chunk) {
        const { id, ...rest } = party;
        try {
          const { error } = await (supabase as any).from("parties").update(rest).eq("id", id);
          if (error) throw error;
          imported++; updatedCount++;
        } catch (err: any) {
          skipped++;
          const rowNum = nameToRow.get(rest.name?.toLowerCase()) ?? 0;
          const reason = `DB error: ${err?.message ?? "unknown"}`;
          errors.push(`Row ${rowNum} (${rest.name}): ${reason}`);
          skipReasons.push({ row: rowNum, value: rest.name, reason });
        }
      }
    }
    if (totalOps > 0) onProgress?.(Math.round((imported / totalOps) * 100));
  }

  return { imported, skipped, errors, skipReasons, updated: updatedCount };
}
