import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// One current storage location per item (UNIQUE per company_id, item_id).
// This module is the Store Locator data layer; per-item movement history is
// reused from inventory-ledger-api (do not rebuild ledger logic).

export interface ItemLocation {
  rack: string | null;
  shelf: string | null;
  updated_at: string | null;
}

export interface ItemWithLocation {
  id: string;
  item_code: string;
  description: string;
  rack: string | null;
  shelf: string | null;
  located_updated_at: string | null;
}

/**
 * Items (active) with their current location, company-scoped. Left-joins
 * item_locations so unplaced items still appear. `unplacedOnly` filters to
 * items that have no location row yet (how existing stock gets placed).
 */
export async function fetchItemsWithLocations(
  opts: { unplacedOnly?: boolean } = {}
): Promise<ItemWithLocation[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  // Embed the location row via the FK. `!left` keeps items with no location.
  const { data, error } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_locations!left(rack, shelf, updated_at)")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("item_code", { ascending: true });
  if (error) throw error;

  const rows = ((data ?? []) as any[]).map((it) => {
    // Embedded relation may come back as an array or a single object.
    const loc = Array.isArray(it.item_locations) ? it.item_locations[0] : it.item_locations;
    return {
      id: it.id as string,
      item_code: (it.item_code ?? "") as string,
      description: (it.description ?? "") as string,
      rack: (loc?.rack ?? null) as string | null,
      shelf: (loc?.shelf ?? null) as string | null,
      located_updated_at: (loc?.updated_at ?? null) as string | null,
    };
  });

  return opts.unplacedOnly
    ? rows.filter((r) => !r.rack && !r.shelf)
    : rows;
}

/** Current location for one item, or null if unplaced. Company-scoped. */
export async function fetchItemLocation(itemId: string): Promise<ItemLocation | null> {
  const companyId = await getCompanyId();
  if (!companyId) return null;
  const { data, error } = await (supabase as any)
    .from("item_locations")
    .select("rack, shelf, updated_at")
    .eq("company_id", companyId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    rack: (data as any).rack ?? null,
    shelf: (data as any).shelf ?? null,
    updated_at: (data as any).updated_at ?? null,
  };
}

/**
 * Set / relocate an item's location. Upserts on (company_id, item_id) so each
 * item has exactly one current location. Stamps updated_at + updated_by.
 */
export async function setItemLocation(
  itemId: string,
  rack: string,
  shelf: string
): Promise<ItemLocation> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await (supabase as any)
    .from("item_locations")
    .upsert(
      {
        company_id: companyId,
        item_id: itemId,
        rack: rack.trim(),
        shelf: shelf.trim(),
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      { onConflict: "company_id,item_id" }
    )
    .select("rack, shelf, updated_at")
    .single();
  if (error) throw error;
  return {
    rack: (data as any).rack ?? null,
    shelf: (data as any).shelf ?? null,
    updated_at: (data as any).updated_at ?? null,
  };
}

// Per-item movement history is reused wholesale from the inventory ledger.
export { fetchItemLedger, type InventoryLedgerRow } from "@/lib/inventory-ledger-api";
