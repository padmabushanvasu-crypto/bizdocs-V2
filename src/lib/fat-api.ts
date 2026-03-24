import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { getNextDocNumber } from "@/lib/doc-number-utils";

// ============================================================
// Constants
// ============================================================

export const OLTC_DEFAULT_TESTS = [
  { test_name: "Visual Inspection", test_standard: "IEC 60214", sort_order: 1 },
  { test_name: "Winding Resistance Measurement", test_standard: "IEC 60214", unit: "Ω", sort_order: 2 },
  { test_name: "Turns Ratio Test", test_standard: "IEC 60214", sort_order: 3 },
  { test_name: "Insulation Resistance Test", test_standard: "IEC 60214", unit: "MΩ", sort_order: 4 },
  { test_name: "Dielectric Test (Oil)", test_standard: "IEC 60156", unit: "kV", sort_order: 5 },
  { test_name: "Contact Resistance Test", test_standard: "IEC 60214", unit: "mΩ", sort_order: 6 },
  { test_name: "Operating Mechanism Test", test_standard: "IEC 60214", sort_order: 7 },
  { test_name: "Motor Drive Unit Test", test_standard: "IEC 60214", sort_order: 8 },
  { test_name: "Tap Position Indicator Test", test_standard: "IEC 60214", sort_order: 9 },
  { test_name: "Oil Leakage Test", test_standard: "IEC 60214", sort_order: 10 },
  { test_name: "Final Dimensional Check", test_standard: "Drawing", sort_order: 11 },
  { test_name: "Nameplate Verification", test_standard: "IEC 60214", sort_order: 12 },
] as const;

// ============================================================
// Interfaces
// ============================================================

export interface FatCertificate {
  id: string;
  company_id: string;
  fat_number: string;
  fat_date: string;
  serial_number_id: string | null;
  serial_number: string | null;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  drawing_number: string | null;
  drawing_revision: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_po_ref: string | null;
  assembly_order_id: string | null;
  assembly_order_number: string | null;
  status: "pending" | "passed" | "failed" | "conditional";
  overall_result: "pass" | "fail" | "conditional" | null;
  tested_by: string | null;
  witnessed_by: string | null;
  test_date: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FatTestResult {
  id: string;
  company_id: string;
  fat_certificate_id: string;
  test_name: string;
  test_standard: string | null;
  required_value: string | null;
  actual_value: string | null;
  unit: string | null;
  result: "pass" | "fail" | "na" | "pending";
  remarks: string | null;
  sort_order: number;
  created_at: string;
}

export interface FatFilters {
  search?: string;
  status?: string;
  item_id?: string;
  page?: number;
  pageSize?: number;
}

export interface SerialNumberRecord {
  id: string;
  company_id: string;
  serial_number: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  assembly_order_id: string | null;
  status: "in_stock" | "dispatched" | "under_warranty" | "scrapped";
  invoice_id: string | null;
  invoice_number: string | null;
  customer_name: string | null;
  dispatch_date: string | null;
  warranty_months: number;
  warranty_expiry: string | null;
  fat_completed: boolean;
  fat_completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SerialFilters {
  item_id?: string;
  status?: string;
  search?: string;
  fat_completed?: boolean;
  fatCompleted?: boolean;
  assemblyOrderId?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================
// FAT Certificates
// ============================================================

export async function fetchFatCertificates(filters: FatFilters = {}) {
  const { search, status = "all", item_id, page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("fat_certificates")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status !== "all") query = query.eq("status", status);
  if (item_id) query = query.eq("item_id", item_id);

  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(
        `fat_number.ilike.${term},item_code.ilike.${term},serial_number.ilike.${term},customer_name.ilike.${term}`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as FatCertificate[], count: count ?? 0 };
}

export async function fetchFatCertificate(
  id: string
): Promise<FatCertificate & { test_results: FatTestResult[] }> {
  const [certRes, resultsRes] = await Promise.all([
    (supabase as any).from("fat_certificates").select("*").eq("id", id).single(),
    (supabase as any)
      .from("fat_test_results")
      .select("*")
      .eq("fat_certificate_id", id)
      .order("sort_order", { ascending: true }),
  ]);
  if (certRes.error) throw certRes.error;
  if (resultsRes.error) throw resultsRes.error;
  return {
    ...(certRes.data as FatCertificate),
    test_results: (resultsRes.data ?? []) as FatTestResult[],
  };
}

export async function createFatCertificate(data: {
  serial_number_id?: string | null;
  serial_number?: string | null;
  item_id?: string | null;
  item_code?: string | null;
  item_description?: string | null;
  drawing_number?: string | null;
  drawing_revision?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_po_ref?: string | null;
  assembly_order_id?: string | null;
  assembly_order_number?: string | null;
  tested_by?: string | null;
  witnessed_by?: string | null;
  test_date?: string | null;
  notes?: string | null;
}): Promise<FatCertificate> {
  const companyId = await getCompanyId();
  const { data: cert, error } = await (supabase as any)
    .from("fat_certificates")
    .insert({
      company_id: companyId,
      fat_number: "",
      fat_date: new Date().toISOString().split("T")[0],
      serial_number_id: data.serial_number_id ?? null,
      serial_number: data.serial_number ?? null,
      item_id: data.item_id ?? null,
      item_code: data.item_code ?? null,
      item_description: data.item_description ?? null,
      drawing_number: data.drawing_number ?? null,
      drawing_revision: data.drawing_revision ?? null,
      customer_id: data.customer_id ?? null,
      customer_name: data.customer_name ?? null,
      customer_po_ref: data.customer_po_ref ?? null,
      assembly_order_id: data.assembly_order_id ?? null,
      assembly_order_number: data.assembly_order_number ?? null,
      status: "pending",
      tested_by: data.tested_by ?? null,
      witnessed_by: data.witnessed_by ?? null,
      test_date: data.test_date ?? null,
      notes: data.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  let created = cert as FatCertificate;

  // Fallback: if DB trigger didn't set fat_number, generate it
  if (!created.fat_number) {
    const fatNumber = await getNextDocNumber("fat_certificates", "fat_number", companyId, "fat_prefix");
    await (supabase as any).from("fat_certificates").update({ fat_number: fatNumber }).eq("id", created.id);
    created = { ...created, fat_number: fatNumber };
  }

  // Insert default test results
  const testsToInsert = OLTC_DEFAULT_TESTS.map((t) => ({
    company_id: companyId,
    fat_certificate_id: created.id,
    test_name: t.test_name,
    test_standard: t.test_standard ?? null,
    unit: "unit" in t ? (t as any).unit : null,
    sort_order: t.sort_order,
    result: "pending",
  }));
  await (supabase as any).from("fat_test_results").insert(testsToInsert);

  return created;
}

export async function updateFatCertificate(
  id: string,
  data: Partial<FatCertificate>
): Promise<FatCertificate> {
  const { data: cert, error } = await (supabase as any)
    .from("fat_certificates")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return cert as FatCertificate;
}

export async function completeFatCertificate(
  id: string,
  overall_result: "pass" | "fail" | "conditional"
): Promise<void> {
  const newStatus =
    overall_result === "pass" ? "passed" : overall_result === "fail" ? "failed" : "conditional";
  const completedAt = new Date().toISOString();

  const { data: cert, error } = await (supabase as any)
    .from("fat_certificates")
    .update({
      overall_result,
      status: newStatus,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  // If passed and linked to a serial number, mark fat_completed
  if (overall_result === "pass" && (cert as FatCertificate).serial_number_id) {
    await (supabase as any)
      .from("serial_numbers")
      .update({
        fat_completed: true,
        fat_completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", (cert as FatCertificate).serial_number_id);
  }
}

export async function deleteFatCertificate(id: string): Promise<void> {
  const { data: cert } = await (supabase as any)
    .from("fat_certificates")
    .select("status")
    .eq("id", id)
    .single();

  if (!cert || cert.status !== "pending") {
    throw new Error("Only pending FAT certificates can be deleted.");
  }
  await (supabase as any).from("fat_test_results").delete().eq("fat_certificate_id", id);
  const { error } = await (supabase as any).from("fat_certificates").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// FAT Test Results
// ============================================================

export async function fetchFatTestResults(fatCertificateId: string): Promise<FatTestResult[]> {
  const { data, error } = await (supabase as any)
    .from("fat_test_results")
    .select("*")
    .eq("fat_certificate_id", fatCertificateId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FatTestResult[];
}

export async function updateFatTestResult(
  id: string,
  data: Partial<FatTestResult>
): Promise<FatTestResult> {
  const { data: result, error } = await (supabase as any)
    .from("fat_test_results")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return result as FatTestResult;
}

export async function bulkUpdateFatTestResults(
  results: Array<{ id: string } & Partial<FatTestResult>>
): Promise<void> {
  await Promise.all(
    results.map(({ id, ...rest }) =>
      (supabase as any).from("fat_test_results").update(rest).eq("id", id)
    )
  );
}

// ============================================================
// Serial Numbers
// ============================================================

export async function fetchSerialNumbers(filters: SerialFilters = {}) {
  const { item_id, status, search, fat_completed, fatCompleted, assemblyOrderId, page = 1, pageSize = 50 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("serial_numbers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (item_id) query = query.eq("item_id", item_id);
  if (status && status !== "all") query = query.eq("status", status);
  if (fat_completed !== undefined) query = query.eq("fat_completed", fat_completed);
  if (fatCompleted !== undefined) query = query.eq("fat_completed", fatCompleted);
  if (assemblyOrderId) query = query.eq("assembly_order_id", assemblyOrderId);
  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(
        `serial_number.ilike.${term},item_code.ilike.${term},customer_name.ilike.${term}`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as SerialNumberRecord[], count: count ?? 0 };
}

export async function fetchSerialNumber(id: string): Promise<SerialNumberRecord> {
  const { data, error } = await (supabase as any)
    .from("serial_numbers")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as SerialNumberRecord;
}

export async function updateSerialNumber(
  id: string,
  data: Partial<SerialNumberRecord>
): Promise<SerialNumberRecord> {
  const { data: sn, error } = await (supabase as any)
    .from("serial_numbers")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return sn as SerialNumberRecord;
}

export async function assignSerialToInvoice(
  serialId: string,
  invoiceId: string,
  invoiceNumber: string,
  customerName: string,
  dispatchDate: string
): Promise<void> {
  const { data: sn } = await (supabase as any)
    .from("serial_numbers")
    .select("warranty_months")
    .eq("id", serialId)
    .single();

  const warrantyMonths = (sn as any)?.warranty_months ?? 12;
  const expiry = new Date(dispatchDate);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);
  const warrantyExpiry = expiry.toISOString().split("T")[0];

  await (supabase as any)
    .from("serial_numbers")
    .update({
      status: "dispatched",
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      customer_name: customerName,
      dispatch_date: dispatchDate,
      warranty_expiry: warrantyExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", serialId);
}

// ============================================================
// Stats (for dashboard and sidebar badges)
// ============================================================

export async function fetchFatStats() {
  const { data, error } = await (supabase as any)
    .from("fat_certificates")
    .select("id, status");
  if (error) return { pending: 0, passed: 0, failed: 0, conditional: 0 };
  const all = (data ?? []) as any[];
  return {
    pending: all.filter((f) => f.status === "pending").length,
    passed: all.filter((f) => f.status === "passed").length,
    failed: all.filter((f) => f.status === "failed").length,
    conditional: all.filter((f) => f.status === "conditional").length,
  };
}

export async function fetchSerialStats() {
  const today = new Date().toISOString().split("T")[0];
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().split("T")[0];

  const { data, error } = await (supabase as any)
    .from("serial_numbers")
    .select("id, status, fat_completed, warranty_expiry");
  if (error) return { inStock: 0, dispatched: 0, underWarranty: 0, expiringSoon: 0, fatPending: 0 };
  const all = (data ?? []) as any[];
  return {
    inStock: all.filter((s) => s.status === "in_stock").length,
    dispatched: all.filter((s) => s.status === "dispatched").length,
    underWarranty: all.filter(
      (s) =>
        s.status === "under_warranty" ||
        (s.status === "dispatched" && s.warranty_expiry && s.warranty_expiry > today)
    ).length,
    expiringSoon: all.filter(
      (s) => s.warranty_expiry && s.warranty_expiry >= today && s.warranty_expiry <= in30Str
    ).length,
    fatPending: all.filter((s) => s.status === "in_stock" && !s.fat_completed).length,
  };
}

export async function fetchFatForSerial(serialNumberId: string): Promise<FatCertificate | null> {
  const { data } = await (supabase as any)
    .from("fat_certificates")
    .select("*")
    .eq("serial_number_id", serialNumberId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as FatCertificate | null;
}
