import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";

// ============================================================
// Interfaces
// ============================================================

export interface ReorderRule {
  id: string;
  company_id: string;
  item_id: string;
  reorder_point: number;
  reorder_qty: number;
  aimed_qty: number;
  preferred_vendor_id: string | null;
  lead_time_days: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined / computed
  item_code?: string | null;
  item_description?: string | null;
  item_type?: string | null;
  item_min_stock?: number;
  item_unit?: string | null;
  preferred_vendor_name?: string | null;
}

export interface ReorderAlert {
  item_id: string;
  item_code: string;
  item_description: string;
  item_type: string;
  item_unit: string;
  current_stock: number;
  raw_stock: number;
  min_stock: number;
  reorder_point: number;
  reorder_qty: number;
  preferred_vendor_id: string | null;
  preferred_vendor_name: string | null;
  lead_time_days: number;
  days_of_stock_remaining: number;
  consumption_rate_per_day: number;
  recommended_order_qty: number;
  alert_level: "critical" | "warning" | "watch";
  open_po_qty: number;
  open_ao_requirement: number;
  actioned: boolean;
  po_number?: string | null;
  po_expected_date?: string | null;
}

export interface ScrapEntry {
  id: string;
  company_id: string;
  scrap_number: string;
  scrap_date: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  drawing_number: string | null;
  linked_dc_id: string | null;
  linked_dc_number: string | null;
  assembly_order_id: string | null;
  assembly_order_number: string | null;
  qty_scrapped: number;
  unit: string;
  scrap_reason: string;
  scrap_category: string;
  cost_per_unit: number;
  total_scrap_value: number;
  disposal_method: string;
  scrap_sale_value: number;
  vendor_id: string | null;
  vendor_name: string | null;
  remarks: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScrapFilters {
  search?: string;
  date_from?: string;
  date_to?: string;
  category?: string;
  item_id?: string;
  page?: number;
  pageSize?: number;
}

export interface ScrapStats {
  total_entries: number;
  total_value: number;
  recovered: number;
  net_loss: number;
}

// ============================================================
// Reorder Intelligence
// ============================================================

/**
 * Returns all active items where stock_alert_level = 'critical'.
 * The DB column is the source of truth — updated on every stock movement via updateStockBucket.
 */
export async function fetchReorderAlerts(): Promise<ReorderAlert[]> {
  const companyId = await getCompanyId();

  // 1. Fetch all critical items from DB (single query, no JS threshold calc)
  const { data: itemsRaw, error: itemsError } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type, unit, current_stock, stock_raw_material, stock_free, stock_in_process, stock_in_subassembly_wip, stock_in_fg_wip, stock_in_fg_ready, min_stock, stock_alert_level")
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("stock_alert_level", "critical")
    .neq("item_type", "service");
  if (itemsError) throw itemsError;

  const items = (itemsRaw || []) as any[];
  if (items.length === 0) return [];

  // 2. Fetch active reorder rules for enrichment (vendor names, reorder qty)
  const { data: rulesRaw, error: rulesError } = await (supabase as any)
    .from("reorder_rules")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (rulesError) throw rulesError;

  const ruleMap: Record<string, ReorderRule> = {};
  for (const r of (rulesRaw || []) as ReorderRule[]) ruleMap[r.item_id] = r;

  // Resolve preferred vendor names
  const vendorIds = [...new Set((rulesRaw || []).map((r: any) => r.preferred_vendor_id).filter(Boolean) as string[])];
  const vendorMap: Record<string, string> = {};
  if (vendorIds.length > 0) {
    const { data: vendors } = await (supabase as any).from("parties").select("id, name").in("id", vendorIds);
    for (const v of vendors || []) vendorMap[v.id] = v.name;
  }

  // 3. Build alert objects
  const alerts: ReorderAlert[] = items.map((item: any) => {
    const rule = ruleMap[item.id];
    const minStock = Number(item.min_stock) || 0;
    const reorderPoint = rule ? Number(rule.reorder_point) : minStock;
    const reorderQty = rule ? Number(rule.reorder_qty) : minStock;
    const leadTimeDays = rule ? (rule.lead_time_days ?? 7) : 7;
    const preferredVendorId: string | null = rule?.preferred_vendor_id ?? null;
    const preferredVendorName: string | null = preferredVendorId ? (vendorMap[preferredVendorId] ?? null) : null;

    return {
      item_id: item.id,
      item_code: item.item_code,
      item_description: item.description,
      item_type: item.item_type,
      item_unit: item.unit || "NOS",
      current_stock: Number(item.current_stock) || 0,
      raw_stock: Number(item.stock_raw_material) || 0,
      min_stock: minStock,
      reorder_point: reorderPoint,
      reorder_qty: reorderQty,
      preferred_vendor_id: preferredVendorId,
      preferred_vendor_name: preferredVendorName,
      lead_time_days: leadTimeDays,
      days_of_stock_remaining: 0,
      consumption_rate_per_day: 0,
      recommended_order_qty: reorderQty,
      alert_level: "critical" as const,
      open_po_qty: 0,
      open_ao_requirement: 0,
      actioned: false,
      po_number: null,
      po_expected_date: null,
    };
  });

  // 4. Enrich with open PO data (for actioned flag)
  const alertItemCodes = alerts.map(a => a.item_code).filter(Boolean) as string[];
  if (alertItemCodes.length > 0) {
    const { data: openPOs } = await (supabase as any)
      .from("purchase_orders")
      .select("id, po_number, delivery_date")
      .eq("company_id", companyId)
      .in("status", ["draft", "issued", "partially_received"]);

    const openPOIds = (openPOs || []).map((p: any) => p.id);
    const openPOMap: Record<string, { po_number: string; delivery_date: string | null }> = {};
    for (const p of (openPOs || [])) openPOMap[p.id] = { po_number: p.po_number, delivery_date: p.delivery_date };

    if (openPOIds.length > 0) {
      const { data: poLines } = await (supabase as any)
        .from("purchase_order_items")
        .select("item_code, qty_ordered, purchase_order_id")
        .in("purchase_order_id", openPOIds)
        .in("item_code", alertItemCodes);

      const itemPoMap: Record<string, { qty: number; po_number: string; delivery_date: string | null }> = {};
      for (const line of (poLines || [])) {
        const code = line.item_code as string;
        if (!code) continue;
        const po = openPOMap[line.purchase_order_id];
        if (!po) continue;
        if (!itemPoMap[code]) itemPoMap[code] = { qty: 0, po_number: po.po_number, delivery_date: po.delivery_date };
        itemPoMap[code].qty += Number(line.qty_ordered) || 0;
      }

      for (const alert of alerts) {
        const poData = itemPoMap[alert.item_code];
        if (poData && poData.qty > 0) {
          alert.open_po_qty = poData.qty;
          alert.actioned = true;
          alert.po_number = poData.po_number;
          alert.po_expected_date = poData.delivery_date;
        }
      }
    }
  }

  // Sort: actioned last, then by item_code
  alerts.sort((a, b) => {
    if (a.actioned !== b.actioned) return a.actioned ? 1 : -1;
    return (a.item_code || "").localeCompare(b.item_code || "");
  });

  return alerts;
}

/** Fast summary for dashboard and sidebar badge — reads stock_alert_level from items table. */
export async function fetchReorderSummary(): Promise<{ critical: number; warning: number }> {
  const companyId = await getCompanyId();
  const { count, error } = await (supabase as any)
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("stock_alert_level", "critical")
    .neq("item_type", "service");

  if (error) return { critical: 0, warning: 0 };
  return { critical: count ?? 0, warning: 0 };
}

// ============================================================
// Reorder Rules CRUD
// ============================================================

export async function fetchReorderRules(): Promise<ReorderRule[]> {
  const companyId = await getCompanyId();
  const { data, error } = await (supabase as any)
    .from("reorder_rules")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rules = (data || []) as ReorderRule[];
  if (rules.length === 0) return [];

  // Batch-resolve item details
  const itemIds = [...new Set(rules.map((r) => r.item_id).filter(Boolean))] as string[];
  const vendorIdsForRules = [...new Set(rules.map((r) => r.preferred_vendor_id).filter(Boolean))] as string[];

  const itemMap: Record<string, any> = {};
  const vendorNameMap: Record<string, string> = {};

  if (itemIds.length > 0) {
    const { data: itemsData } = await (supabase as any)
      .from("items")
      .select("id, item_code, description, item_type, min_stock, unit")
      .in("id", itemIds);
    for (const it of itemsData || []) itemMap[it.id] = it;
  }

  if (vendorIdsForRules.length > 0) {
    const { data: vData } = await (supabase as any)
      .from("parties")
      .select("id, name")
      .in("id", vendorIdsForRules);
    for (const v of vData || []) vendorNameMap[v.id] = v.name;
  }

  return rules.map((r) => ({
    ...r,
    item_code: itemMap[r.item_id]?.item_code ?? null,
    item_description: itemMap[r.item_id]?.description ?? null,
    item_type: itemMap[r.item_id]?.item_type ?? null,
    item_min_stock: itemMap[r.item_id]?.min_stock ?? 0,
    item_unit: itemMap[r.item_id]?.unit ?? null,
    preferred_vendor_name: r.preferred_vendor_id ? (vendorNameMap[r.preferred_vendor_id] ?? null) : null,
  }));
}

export async function createReorderRule(data: Partial<ReorderRule>): Promise<ReorderRule> {
  const companyId = await getCompanyId();
  const aimedQty = data.aimed_qty ?? 0;
  const { data: rule, error } = await (supabase as any)
    .from("reorder_rules")
    .insert({
      company_id: companyId,
      item_id: data.item_id,
      reorder_point: data.reorder_point ?? 0,
      reorder_qty: data.reorder_qty ?? 0,
      aimed_qty: aimedQty,
      preferred_vendor_id: data.preferred_vendor_id ?? null,
      lead_time_days: data.lead_time_days ?? 7,
      is_active: data.is_active ?? true,
      notes: data.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  // Sync aimed_stock on the item
  if (data.item_id && aimedQty > 0) {
    await (supabase as any)
      .from("items")
      .update({ aimed_stock: aimedQty })
      .eq("id", data.item_id)
      .eq("company_id", companyId);
  }

  return rule as ReorderRule;
}

export async function updateReorderRule(id: string, data: Partial<ReorderRule>): Promise<ReorderRule> {
  const companyId = await getCompanyId();
  const { data: rule, error } = await (supabase as any)
    .from("reorder_rules")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .select()
    .single();
  if (error) throw error;

  // Sync aimed_stock on the item
  if (data.item_id && data.aimed_qty != null) {
    await (supabase as any)
      .from("items")
      .update({ aimed_stock: data.aimed_qty })
      .eq("id", data.item_id)
      .eq("company_id", companyId);
  }

  return rule as ReorderRule;
}

export async function deleteReorderRule(id: string): Promise<void> {
  const companyId = await getCompanyId();
  const { error } = await (supabase as any)
    .from("reorder_rules")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
}

// ============================================================
// Scrap Register
// ============================================================

export async function fetchScrapEntries(filters: ScrapFilters = {}) {
  const { search, date_from, date_to, category, item_id, page = 1, pageSize = 20 } = filters;
  const companyId = await getCompanyId();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("scrap_register")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .order("scrap_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search?.trim()) {
    const s = sanitizeSearchTerm(search);
    if (s) {
      const term = `%${s}%`;
      query = query.or(
        `scrap_number.ilike.${term},item_code.ilike.${term},item_description.ilike.${term},scrap_reason.ilike.${term}`
      );
    }
  }
  if (date_from) query = query.gte("scrap_date", date_from);
  if (date_to) query = query.lte("scrap_date", date_to);
  if (category && category !== "all") query = query.eq("scrap_category", category);
  if (item_id) query = query.eq("item_id", item_id);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as ScrapEntry[], count: count ?? 0 };
}

export async function createScrapEntry(data: Partial<ScrapEntry>): Promise<ScrapEntry> {
  const companyId = await getCompanyId();
  const { data: { user } } = await supabase.auth.getUser();
  const totalValue = Math.round((data.qty_scrapped || 0) * (data.cost_per_unit || 0) * 100) / 100;

  const { data: entry, error } = await (supabase as any)
    .from("scrap_register")
    .insert({
      company_id: companyId,
      scrap_number: "",
      scrap_date: data.scrap_date ?? new Date().toISOString().split("T")[0],
      item_id: data.item_id ?? null,
      item_code: data.item_code ?? null,
      item_description: data.item_description ?? null,
      drawing_number: data.drawing_number ?? null,
      linked_dc_id: data.linked_dc_id ?? null,
      linked_dc_number: data.linked_dc_number ?? null,
      assembly_order_id: data.assembly_order_id ?? null,
      assembly_order_number: data.assembly_order_number ?? null,
      qty_scrapped: data.qty_scrapped ?? 0,
      unit: data.unit ?? "NOS",
      scrap_reason: data.scrap_reason ?? "",
      scrap_category: data.scrap_category ?? "process_rejection",
      cost_per_unit: data.cost_per_unit ?? 0,
      total_scrap_value: totalValue,
      disposal_method: data.disposal_method ?? "write_off",
      scrap_sale_value: data.scrap_sale_value ?? 0,
      vendor_id: data.vendor_id ?? null,
      vendor_name: data.vendor_name ?? null,
      remarks: data.remarks ?? null,
      recorded_by: data.recorded_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const created = entry as ScrapEntry;

  // Decrement item stock and write ledger entry
  if (data.item_id && (data.qty_scrapped || 0) > 0) {
    const { data: itemData } = await (supabase as any)
      .from("items")
      .select("current_stock")
      .eq("id", data.item_id)
      .single();

    const currentStock: number = (itemData as any)?.current_stock ?? 0;
    const newStock: number = Math.max(0, currentStock - (data.qty_scrapped || 0));

    await (supabase as any)
      .from("items")
      .update({ current_stock: newStock })
      .eq("id", data.item_id);

    await (supabase as any).from("stock_ledger").insert({
      company_id: companyId,
      item_id: data.item_id,
      item_code: data.item_code ?? null,
      item_description: data.item_description ?? null,
      transaction_date: created.scrap_date,
      transaction_type: "rejection_writeoff",
      qty_in: 0,
      qty_out: data.qty_scrapped,
      balance_qty: newStock,
      unit_cost: data.cost_per_unit ?? 0,
      total_value: totalValue,
      reference_type: "scrap_register",
      reference_id: created.id,
      reference_number: created.scrap_number,
      notes: `Scrap: ${data.scrap_reason ?? ""}`,
      created_by: user?.id ?? null,
    });
  }

  return created;
}

export async function updateScrapEntry(id: string, data: Partial<ScrapEntry>): Promise<ScrapEntry> {
  const companyId = await getCompanyId();

  // Only allow edits on the same day
  const { data: existing } = await (supabase as any)
    .from("scrap_register")
    .select("scrap_date")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  const today = new Date().toISOString().split("T")[0];
  if (existing?.scrap_date !== today) {
    throw new Error("Scrap entries can only be edited on the day they were recorded.");
  }

  if (data.qty_scrapped != null && data.cost_per_unit != null) {
    data.total_scrap_value = Math.round(data.qty_scrapped * data.cost_per_unit * 100) / 100;
  }

  const { data: updated, error } = await (supabase as any)
    .from("scrap_register")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .select()
    .single();
  if (error) throw error;
  return updated as ScrapEntry;
}

export async function fetchScrapStats(): Promise<ScrapStats> {
  const companyId = await getCompanyId();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

  const { data, error } = await (supabase as any)
    .from("scrap_register")
    .select("total_scrap_value, scrap_sale_value, scrap_date")
    .eq("company_id", companyId)
    .gte("scrap_date", startOfMonth);

  if (error) return { total_entries: 0, total_value: 0, recovered: 0, net_loss: 0 };

  const entries = (data || []) as Array<{ total_scrap_value: number; scrap_sale_value: number }>;
  const total_value = entries.reduce((s, e) => s + (e.total_scrap_value || 0), 0);
  const recovered = entries.reduce((s, e) => s + (e.scrap_sale_value || 0), 0);

  return {
    total_entries: entries.length,
    total_value,
    recovered,
    net_loss: total_value - recovered,
  };
}

// ============================================================
// Production Alerts (finished goods below min_finished_stock)
// ============================================================

export interface ProductionAlert {
  item_id: string;
  item_code: string | null;
  item_description: string | null;
  item_unit: string | null;
  current_stock: number;
  min_finished_stock: number;
  production_batch_size: number;
  shortage: number;
}

export async function fetchProductionAlerts(): Promise<ProductionAlert[]> {
  const companyId = await getCompanyId();
  const { data, error } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, unit, current_stock, min_finished_stock, production_batch_size")
    .eq("company_id", companyId)
    .eq("item_type", "finished_good")
    .eq("status", "active")
    .gt("min_finished_stock", 0);

  if (error) return [];

  return ((data ?? []) as any[])
    .filter((item: any) => (item.current_stock ?? 0) < (item.min_finished_stock ?? 0))
    .map((item: any) => ({
      item_id: item.id,
      item_code: item.item_code ?? null,
      item_description: item.description ?? null,
      item_unit: item.unit ?? null,
      current_stock: item.current_stock ?? 0,
      min_finished_stock: item.min_finished_stock ?? 0,
      production_batch_size: item.production_batch_size ?? 1,
      shortage: (item.min_finished_stock ?? 0) - (item.current_stock ?? 0),
    }));
}

export async function fetchProductionAlertCount(): Promise<number> {
  const alerts = await fetchProductionAlerts();
  return alerts.length;
}
