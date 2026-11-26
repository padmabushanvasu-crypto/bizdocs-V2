import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// v_stock_free → per item { item_id, free_qty, is_counted }. free_qty is
// ledger-truth for physically-counted items, bucket fallback otherwise. This is
// the single source for AVAILABILITY (free/on-shelf) reads — buckets are still
// written by postings, just no longer read for availability.

/**
 * Map of item_id → free_qty from v_stock_free, company-scoped. Items not present
 * in the view are simply absent from the map (callers fall back as needed).
 */
export async function fetchFreeStockMap(itemIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(itemIds.filter(Boolean))];
  if (ids.length === 0) return map;

  const companyId = await getCompanyId();
  if (!companyId) return map;

  // Chunk to keep the .in() list bounded.
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await (supabase as any)
      .from("v_stock_free")
      .select("item_id, free_qty")
      .eq("company_id", companyId)
      .in("item_id", slice);
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      map.set(r.item_id, Number(r.free_qty ?? 0));
    }
  }
  return map;
}

/** Convenience: free_qty for a single item (0 if absent). */
export async function fetchFreeStock(itemId: string): Promise<number> {
  const map = await fetchFreeStockMap([itemId]);
  return map.get(itemId) ?? 0;
}

// v_item_grn_held → material back in the factory on a GRN line (QC done, not
// posted to Store, not job-card linked). Not in any stock bucket except that a
// DC return is still counted in stock_in_process until it is posted or drawn.
// finished/unfinished comes from the item's processing route: unfinished parts
// still have an outside process left and are never used by a work order.
export interface ItemGrnHeld {
  item_id: string;
  held_qty: number;
  held_from_vendor_qty: number;
  held_finished_qty: number;
  held_unfinished_qty: number;
  unfinished_next_processes: string | null;
  grn_numbers: string | null;
}

/** Company-scoped map item_id → GRN-held position. Pass itemIds to limit, or omit for all. */
export async function fetchItemGrnHeldMap(itemIds?: string[]): Promise<Map<string, ItemGrnHeld>> {
  const map = new Map<string, ItemGrnHeld>();
  const companyId = await getCompanyId();
  if (!companyId) return map;
  const toRow = (r: any): ItemGrnHeld => ({
    item_id: r.item_id,
    held_qty: Number(r.held_qty ?? 0),
    held_from_vendor_qty: Number(r.held_from_vendor_qty ?? 0),
    held_finished_qty: Number(r.held_finished_qty ?? 0),
    held_unfinished_qty: Number(r.held_unfinished_qty ?? 0),
    unfinished_next_processes: r.unfinished_next_processes ?? null,
    grn_numbers: r.grn_numbers ?? null,
  });
  if (itemIds) {
    const ids = [...new Set(itemIds.filter(Boolean))];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await (supabase as any)
        .from("v_item_grn_held").select("*")
        .eq("company_id", companyId).in("item_id", ids.slice(i, i + 200));
      if (error) throw error;
      for (const r of (data ?? []) as any[]) map.set(r.item_id, toRow(r));
    }
    return map;
  }
  const PAGE = 1000;
  for (let page = 0; page < 20; page++) {
    const { data, error } = await (supabase as any)
      .from("v_item_grn_held").select("*")
      .eq("company_id", companyId).order("item_id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    for (const r of rows) map.set(r.item_id, toRow(r));
    if (rows.length < PAGE) break;
  }
  return map;
}
