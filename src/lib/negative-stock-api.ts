import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Negative assembly-issue stock (dashboard read model).
//
// Assembly issues are now allowed to push an item's free stock below zero (the
// issue-ahead-of-PO flow). This surfaces every item currently negative, how long
// it has been negative, and how much is already on order to cover it.
//
// Read-only and fully client-side over existing RLS-scoped tables/views — no new
// DB object. `v_stock_ledger` is the authoritative ledger read-model (precomputed
// running_balance); we never trust stock_ledger.balance_qty directly.
// ─────────────────────────────────────────────────────────────────────────────

export interface NegativeAssemblyStockRow {
  item_id: string;
  item_code: string;
  description: string;
  negative_qty: number;            // stock_free, always < 0 here
  first_negative_at: string | null; // first assembly_issue entry that crossed < 0
  open_po_qty: number;             // Σ(quantity − received_quantity) over open POs
}

const PAGE = 1000;

// Terminal PO statuses excluded from "open PO qty" (mirrors purchase-orders-api).
const TERMINAL_PO_STATUS = new Set(["completed", "cancelled"]);

export async function fetchNegativeAssemblyStock(
  companyId: string
): Promise<NegativeAssemblyStockRow[]> {
  if (!companyId) return [];

  // 1) Negative-free items for this company (paginated via .range()).
  const items: { id: string; item_code: string; description: string; stock_free: number }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("items")
      .select("id, item_code, description, stock_free")
      .eq("company_id", companyId)
      .lt("stock_free", 0)
      .order("stock_free", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as typeof items;
    items.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  if (items.length === 0) return [];

  const ids = items.map((i) => i.id);

  // 2) Earliest assembly_issue ledger entry that drove running_balance < 0 per
  //    item. Ordered ascending, so the first row seen for an item is its earliest.
  const firstNegAt = new Map<string, string>();
  {
    let off = 0;
    while (true) {
      const { data, error } = await (supabase as any)
        .from("v_stock_ledger")
        .select("item_id, created_at")
        .eq("company_id", companyId)
        .eq("transaction_type", "assembly_issue")
        .lt("running_balance", 0)
        .in("item_id", ids)
        .order("created_at", { ascending: true })
        .range(off, off + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as { item_id: string; created_at: string }[];
      for (const r of rows) {
        if (!firstNegAt.has(r.item_id)) firstNegAt.set(r.item_id, r.created_at);
      }
      if (rows.length < PAGE) break;
      off += PAGE;
    }
  }

  // 3) Open PO qty per item. Two RLS-scoped reads (no PostgREST embedding):
  //    the PO lines, then which of their POs are still open.
  const poLines: { item_id: string; quantity: number; received_quantity: number | null; po_id: string }[] = [];
  {
    let off = 0;
    while (true) {
      const { data, error } = await (supabase as any)
        .from("po_line_items")
        .select("item_id, quantity, received_quantity, po_id")
        .in("item_id", ids)
        .range(off, off + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as typeof poLines;
      poLines.push(...rows);
      if (rows.length < PAGE) break;
      off += PAGE;
    }
  }

  const openPo = new Map<string, number>();
  if (poLines.length > 0) {
    const poIds = [...new Set(poLines.map((l) => l.po_id).filter(Boolean))];
    const openPoIds = new Set<string>();
    let off = 0;
    while (off < poIds.length) {
      const chunk = poIds.slice(off, off + PAGE);
      const { data, error } = await (supabase as any)
        .from("purchase_orders")
        .select("id, status")
        .eq("company_id", companyId)
        .in("id", chunk);
      if (error) throw error;
      for (const po of (data ?? []) as { id: string; status: string }[]) {
        if (!TERMINAL_PO_STATUS.has(po.status)) openPoIds.add(po.id);
      }
      off += PAGE;
    }
    for (const l of poLines) {
      if (!openPoIds.has(l.po_id)) continue;
      const pending = Number(l.quantity ?? 0) - Number(l.received_quantity ?? 0);
      if (pending > 0) openPo.set(l.item_id, (openPo.get(l.item_id) ?? 0) + pending);
    }
  }

  return items.map((i) => ({
    item_id: i.id,
    item_code: i.item_code,
    description: i.description,
    negative_qty: Number(i.stock_free ?? 0),
    first_negative_at: firstNegAt.get(i.id) ?? null,
    open_po_qty: openPo.get(i.id) ?? 0,
  }));
}
