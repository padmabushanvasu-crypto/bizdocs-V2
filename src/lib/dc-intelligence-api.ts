import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

export interface ProcessingRoute {
  id: string;
  company_id: string;
  item_id: string;
  stage_number: number;
  process_code: string | null;
  process_name: string;
  stage_type: 'internal' | 'external';
  lead_time_days: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BprVendor {
  id: string;
  company_id: string;
  route_id: string;
  vendor_id: string | null;
  vendor_name: string | null;
  is_preferred: boolean;
  unit_cost: number;
}

export interface JigMasterRecord {
  id: string;
  company_id: string;
  drawing_number: string;
  jig_number: string;
  status: 'ok' | 'to_be_made' | 'in_progress' | 'damaged';
  associated_process: string | null;
  notes: string | null;
  created_at: string;
}

export async function fetchProcessingRoute(itemId: string): Promise<ProcessingRoute[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data, error } = await (supabase as any)
    .from("bom_processing_routes")
    .select("*")
    .eq("company_id", companyId)
    .eq("item_id", itemId)
    .eq("is_active", true)
    .eq("stage_type", "external")
    .order("stage_number", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchProcessingRouteAll(itemId: string): Promise<ProcessingRoute[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data, error } = await (supabase as any)
    .from("bom_processing_routes")
    .select("*")
    .eq("company_id", companyId)
    .eq("item_id", itemId)
    .eq("is_active", true)
    .order("stage_number", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchJigsForDrawing(drawingNumber: string): Promise<JigMasterRecord[]> {
  const companyId = await getCompanyId();
  if (!companyId || !drawingNumber.trim()) return [];
  const { data, error } = await (supabase as any)
    .from("jig_master")
    .select("*")
    .eq("company_id", companyId)
    .ilike("drawing_number", drawingNumber.trim());
  if (error) throw error;
  return data ?? [];
}

export async function fetchStageVendors(routeId: string): Promise<BprVendor[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data, error } = await (supabase as any)
    .from("bpr_vendors")
    .select("*")
    .eq("company_id", companyId)
    .eq("route_id", routeId);
  if (error) throw error;
  return data ?? [];
}

export async function createProcessingRoute(
  data: Omit<ProcessingRoute, 'id' | 'company_id' | 'created_at' | 'updated_at'>
): Promise<ProcessingRoute> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company");
  const { data: result, error } = await (supabase as any)
    .from("bom_processing_routes")
    .insert({ ...data, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateProcessingRoute(id: string, data: Partial<ProcessingRoute>): Promise<ProcessingRoute> {
  const { data: result, error } = await (supabase as any)
    .from("bom_processing_routes")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function deleteProcessingRoute(id: string): Promise<void> {
  // Check if referenced by dc_line_items
  const { data: refs } = await (supabase as any)
    .from("dc_line_items")
    .select("id")
    .eq("route_id", id)
    .limit(1);
  if (refs && refs.length > 0) {
    throw new Error("Cannot delete: this stage is referenced by one or more DC line items.");
  }
  const { error } = await (supabase as any)
    .from("bom_processing_routes")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function reorderStages(itemId: string, newOrder: string[]): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company");
  const updates = newOrder.map((routeId, idx) =>
    (supabase as any)
      .from("bom_processing_routes")
      .update({ stage_number: idx + 1, updated_at: new Date().toISOString() })
      .eq("id", routeId)
      .eq("company_id", companyId)
  );
  await Promise.all(updates);
}

export async function suggestNextStage(
  itemId: string,
  completedStageNumber: number
): Promise<ProcessingRoute | null> {
  const companyId = await getCompanyId();
  if (!companyId) return null;
  const { data, error } = await (supabase as any)
    .from("bom_processing_routes")
    .select("*")
    .eq("company_id", companyId)
    .eq("item_id", itemId)
    .eq("stage_number", completedStageNumber + 1)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ── Jig Master CRUD ────────────────────────────────────────────────────────────

export async function fetchJigMaster(filters?: { search?: string }): Promise<JigMasterRecord[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  let query = (supabase as any)
    .from("jig_master")
    .select("*")
    .eq("company_id", companyId)
    .order("drawing_number", { ascending: true });
  if (filters?.search) {
    const s = filters.search.trim();
    query = query.or(`drawing_number.ilike.%${s}%,jig_number.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createJigRecord(
  data: Omit<JigMasterRecord, 'id' | 'company_id' | 'created_at'>
): Promise<JigMasterRecord> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company");
  const { data: result, error } = await (supabase as any)
    .from("jig_master")
    .insert({ ...data, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateJigRecord(id: string, data: Partial<JigMasterRecord>): Promise<JigMasterRecord> {
  const { data: result, error } = await (supabase as any)
    .from("jig_master")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function deleteJigRecord(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("jig_master")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── BPR Vendor CRUD ────────────────────────────────────────────────────────────

export async function addBprVendor(data: Omit<BprVendor, 'id' | 'company_id'>): Promise<BprVendor> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company");
  const { data: result, error } = await (supabase as any)
    .from("bpr_vendors")
    .insert({ ...data, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function removeBprVendor(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("bpr_vendors")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── Mould Items ───────────────────────────────────────────────────────────────

export interface MouldItem {
  id: string;
  company_id: string;
  drawing_number: string;
  drawing_revision: string | null;
  description: string;
  vendor_name: string;
  vendor_id: string | null;
  notes: string | null;
  alert_message: string | null;
  created_at: string;
}

export async function fetchMouldItemsForDrawing(drawingNumber: string): Promise<MouldItem[]> {
  const companyId = await getCompanyId();
  if (!companyId || !drawingNumber.trim()) return [];
  const { data, error } = await (supabase as any)
    .from("mould_items")
    .select("*")
    .eq("company_id", companyId)
    .ilike("drawing_number", drawingNumber.trim());
  if (error) { console.warn("mould_items query error:", error.message); return []; }
  return data ?? [];
}

export async function fetchMouldItems(filters?: { search?: string }): Promise<MouldItem[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  let query = (supabase as any)
    .from("mould_items")
    .select("*")
    .eq("company_id", companyId)
    .order("drawing_number", { ascending: true });
  if (filters?.search) {
    const s = filters.search.trim();
    query = query.or(`drawing_number.ilike.%${s}%,description.ilike.%${s}%,vendor_name.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createMouldItem(data: Omit<MouldItem, 'id' | 'company_id' | 'created_at'>): Promise<MouldItem> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company");
  const { data: result, error } = await (supabase as any)
    .from("mould_items")
    .insert({ ...data, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateMouldItem(id: string, data: Partial<MouldItem>): Promise<MouldItem> {
  const { data: result, error } = await (supabase as any)
    .from("mould_items")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function deleteMouldItem(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("mould_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
