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
