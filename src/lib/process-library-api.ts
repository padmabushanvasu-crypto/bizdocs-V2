import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

export interface ProcessCodeVendor {
  id: string;
  process_code_id: string;
  vendor_id?: string | null;
  vendor_name: string;
  is_preferred: boolean;
}

export interface ProcessCode {
  id: string;
  company_id: string;
  process_code: string | null;
  process_name: string;
  stage_type: "internal" | "external";
  notes?: string | null;
  is_active: boolean;
  vendors?: ProcessCodeVendor[];
  created_at: string;
  updated_at: string;
}

export async function fetchProcessCodes(activeOnly = true): Promise<ProcessCode[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  let query = (supabase as any)
    .from("process_codes")
    .select("*, vendors:process_code_vendors(*)")
    .eq("company_id", companyId)
    .order("process_name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProcessCode[];
}

export async function fetchProcessCode(id: string): Promise<ProcessCode | null> {
  const { data, error } = await (supabase as any)
    .from("process_codes")
    .select("*, vendors:process_code_vendors(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as ProcessCode;
}

export async function createProcessCode(input: {
  process_code?: string;
  process_name: string;
  stage_type: "internal" | "external";
  notes?: string;
}): Promise<ProcessCode> {
  const companyId = await getCompanyId();
  const { data, error } = await (supabase as any)
    .from("process_codes")
    .insert({
      company_id: companyId,
      process_code: input.process_code || null,
      process_name: input.process_name,
      stage_type: input.stage_type,
      notes: input.notes || null,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message ?? JSON.stringify(error));
  return data as ProcessCode;
}

export async function updateProcessCode(
  id: string,
  input: Partial<{
    process_code: string | null;
    process_name: string;
    stage_type: "internal" | "external";
    notes: string | null;
    is_active: boolean;
  }>
): Promise<void> {
  const { error } = await (supabase as any)
    .from("process_codes")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message ?? JSON.stringify(error));
}

export async function deleteProcessCode(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("process_codes")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message ?? JSON.stringify(error));
}

export async function addProcessCodeVendor(
  process_code_id: string,
  vendor_id: string | undefined,
  vendor_name: string,
  is_preferred: boolean
): Promise<ProcessCodeVendor> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Company not found. Please refresh and try again.");
  const { data, error } = await (supabase as any)
    .from("process_code_vendors")
    .insert({
      company_id: companyId,
      process_code_id,
      vendor_id: vendor_id || null,
      vendor_name,
      is_preferred,
    })
    .select()
    .single();
  if (error) throw new Error(error.message ?? JSON.stringify(error));
  return data as ProcessCodeVendor;
}

export async function removeProcessCodeVendor(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("process_code_vendors")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message ?? JSON.stringify(error));
}

export async function fetchProcessCodesCount(): Promise<number> {
  const companyId = await getCompanyId();
  if (!companyId) return 0;
  const { count } = await (supabase as any)
    .from("process_codes")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_active", true);
  return count ?? 0;
}

export async function importProcessCodes(
  rows: Record<string, string>[],
  companyId: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {

  // Fetch vendors for name → id lookup
  const { data: vendorsData } = await (supabase as any)
    .from("parties")
    .select("id, name")
    .eq("company_id", companyId)
    .in("party_type", ["vendor", "both"]);
  const vendorsByName = new Map<string, string>(
    (vendorsData ?? []).map((v: any) => [v.name.toLowerCase().trim(), v.id as string])
  );

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Parse and deduplicate rows in memory — last occurrence of each process_name wins
  const VENDOR_KEYS = ["Vendor 1", "Vendor 2", "Vendor 3", "Vendor 4", "Vendor 5", "Vendor 6", "Vendor 7"];
  type ParsedRow = {
    process_code: string | null;
    process_name: string;
    stage_type: "internal" | "external";
    excelRow: number;
    vendors: Array<{ name: string; isPreferred: boolean }>;
  };
  const dedupMap = new Map<string, ParsedRow>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = i + 2;
    const processName = (
      row["process_name"] || row["Process Name"] || row["process name"] || ""
    ).trim();
    if (!processName) {
      skipped++;
      errors.push(`Row ${excelRow}: Process Name is required`);
      continue;
    }
    const processCode = (
      row["process_code"] || row["Process Code"] || row["process code"] || ""
    ).trim() || null;
    const rawType = (
      row["stage_type"] || row["Stage Type"] || row["stage type"] || "external"
    ).toLowerCase().trim();
    const stage_type: "internal" | "external" = rawType === "internal" ? "internal" : "external";

    const vendors: Array<{ name: string; isPreferred: boolean }> = [];
    for (let vi = 0; vi < VENDOR_KEYS.length; vi++) {
      const vName = (row[VENDOR_KEYS[vi]] || "").trim();
      if (vName) vendors.push({ name: vName, isPreferred: vi === 0 });
    }

    dedupMap.set(processName.toLowerCase(), { process_code: processCode, process_name: processName, stage_type, excelRow, vendors });
  }

  const validRows = Array.from(dedupMap.values());

  // Batch upsert process codes in chunks of 500; fall back to row-by-row on conflict error
  const CHUNK = 500;
  const nameToId = new Map<string, string>();

  for (let i = 0; i < validRows.length; i += CHUNK) {
    const chunk = validRows.slice(i, i + CHUNK);
    const chunkPayloads = chunk.map((r) => ({
      company_id: companyId,
      process_code: r.process_code,
      process_name: r.process_name,
      stage_type: r.stage_type,
      is_active: true,
    }));
    let batchOk = false;
    try {
      const { data: upserted, error: upsertErr } = await (supabase as any)
        .from("process_codes")
        .upsert(chunkPayloads, { onConflict: "company_id,process_name", ignoreDuplicates: false })
        .select("id, process_name");
      if (upsertErr) throw upsertErr;
      for (const c of (upserted ?? [])) nameToId.set((c.process_name as string).toLowerCase(), c.id as string);
      imported += chunk.length;
      batchOk = true;
    } catch { /* fall through to row-by-row */ }

    if (!batchOk) {
      for (const r of chunk) {
        try {
          const { data: upserted, error: upsertErr } = await (supabase as any)
            .from("process_codes")
            .upsert(
              [{ company_id: companyId, process_code: r.process_code, process_name: r.process_name, stage_type: r.stage_type, is_active: true }],
              { onConflict: "company_id,process_name", ignoreDuplicates: false }
            )
            .select("id, process_name");
          if (upsertErr) throw upsertErr;
          for (const c of (upserted ?? [])) nameToId.set((c.process_name as string).toLowerCase(), c.id as string);
          imported++;
        } catch (err: any) {
          skipped++;
          errors.push(`Row ${r.excelRow} (${r.process_name}): ${err?.message ?? "DB error"}`);
        }
      }
    }
  }

  // Collect all vendor records and batch insert in chunks of 500
  const vendorRecords: any[] = [];
  for (const r of validRows) {
    const codeId = nameToId.get(r.process_name.toLowerCase());
    if (!codeId || r.vendors.length === 0) continue;
    for (const v of r.vendors) {
      vendorRecords.push({
        company_id: companyId,
        process_code_id: codeId,
        vendor_id: vendorsByName.get(v.name.toLowerCase()) ?? null,
        vendor_name: v.name,
        is_preferred: v.isPreferred,
      });
    }
  }
  for (let i = 0; i < vendorRecords.length; i += CHUNK) {
    try {
      await (supabase as any).from("process_code_vendors").insert(vendorRecords.slice(i, i + CHUNK));
    } catch { /* non-fatal */ }
  }

  return { imported, skipped, errors };
}
