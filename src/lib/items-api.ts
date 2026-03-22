import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";

export interface Item {
  id: string;
  item_code: string;
  description: string;
  drawing_number: string | null;
  drawing_revision: string | null;
  item_type: string;
  unit: string;
  hsn_sac_code: string | null;
  sale_price: number;
  purchase_price: number;
  gst_rate: number;
  min_stock: number;
  current_stock: number;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  standard_cost: number;
  min_stock_override: number | null;
  parent_item_id: string | null;
}

export interface StockStatusRow {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  item_type: string;
  current_stock: number;
  min_stock: number;
  min_stock_override: number | null;
  standard_cost: number;
  parent_item_id: string | null;
  effective_min_stock: number;
  stock_status: "green" | "amber" | "red";
  company_id: string;
}

export interface ItemFilters {
  search?: string;
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchItems(filters: ItemFilters = {}) {
  const { search, type = "all", status = "active", page = 1, pageSize = 100 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("items")
    .select("*", { count: "exact" })
    .order("item_code", { ascending: true })
    .range(from, to);

  if (status !== "all") query = query.eq("status", status);
  if (type && type !== "all") {
    query = query.eq("item_type", type);
  }

  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`item_code.ilike.${term},description.ilike.${term},drawing_number.ilike.${term},drawing_revision.ilike.${term},hsn_sac_code.ilike.${term}`);
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as Item[], count: count ?? 0 };
}

export async function fetchItem(id: string) {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Item;
}

export async function createItem(item: Partial<Item>) {
  const companyId = await getCompanyId();
  const { data, error } = await supabase.from("items").insert({ ...item, company_id: companyId } as any).select().single();
  if (error) throw error;
  return data as Item;
}

export async function updateItem(id: string, item: Partial<Item>) {
  const { data, error } = await supabase.from("items").update(item as any).eq("id", id).select().single();
  if (error) throw error;
  return data as Item;
}

export async function deleteItem(id: string) {
  return updateItem(id, { status: "inactive" } as any);
}

export async function fetchStockStatus() {
  const { data, error } = await supabase
    .from("stock_status" as any)
    .select("*")
    .order("item_code", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StockStatusRow[];
}

export async function bulkUpdateItemStatus(ids: string[], status: string) {
  const { error } = await supabase.from("items").update({ status } as any).in("id", ids);
  if (error) throw error;
}

export async function bulkDeleteItems(ids: string[]): Promise<{ deleted: number; deactivated: number; errors: number }> {
  let deleted = 0, deactivated = 0, errors = 0;
  for (const id of ids) {
    try {
      const [
        { count: stockCount },
        { count: bomCount },
        { count: jobCardCount },
        { count: poLineCount },
        { count: dcLineCount },
        { count: invoiceLineCount },
        { count: grnLineCount },
      ] = await Promise.all([
        (supabase as any).from("stock_ledger").select("id", { count: "exact", head: true }).eq("item_id", id),
        (supabase as any).from("bom_lines").select("id", { count: "exact", head: true }).or(`parent_item_id.eq.${id},child_item_id.eq.${id}`),
        (supabase as any).from("job_cards").select("id", { count: "exact", head: true }).eq("item_id", id),
        (supabase as any).from("po_line_items").select("id", { count: "exact", head: true }).eq("item_id", id),
        (supabase as any).from("dc_line_items").select("id", { count: "exact", head: true }).eq("item_id", id),
        (supabase as any).from("invoice_line_items").select("id", { count: "exact", head: true }).eq("item_id", id),
        (supabase as any).from("grn_line_items").select("id", { count: "exact", head: true }).eq("item_id", id),
      ]);
      const hasRefs =
        (stockCount ?? 0) > 0 ||
        (bomCount ?? 0) > 0 ||
        (jobCardCount ?? 0) > 0 ||
        (poLineCount ?? 0) > 0 ||
        (dcLineCount ?? 0) > 0 ||
        (invoiceLineCount ?? 0) > 0 ||
        (grnLineCount ?? 0) > 0;
      if (hasRefs) {
        await updateItem(id, { status: "inactive" } as any);
        deactivated++;
      } else {
        const { error } = await supabase.from("items").delete().eq("id", id);
        if (error) throw error;
        deleted++;
      }
    } catch {
      errors++;
    }
  }
  return { deleted, deactivated, errors };
}

export async function updateMinStockOverride(id: string, value: number | null) {
  const { data, error } = await supabase
    .from("items")
    .update({ min_stock_override: value } as any)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Item;
}
