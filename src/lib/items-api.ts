import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { normalizeItemType, normalizeUnit, type SkipReason } from "@/lib/import-utils";

export interface ItemClassification {
  id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  affects_stock: boolean;
  affects_reorder: boolean;
  affects_bom: boolean;
  is_system: boolean;
  color: string;
  created_at: string;
  updated_at: string;
}

export async function fetchItemClassifications(): Promise<ItemClassification[]> {
  const companyId = await getCompanyId();
  const { data, error } = await (supabase as any)
    .from("item_classifications")
    .select("*")
    .or(`is_system.eq.true,company_id.eq.${companyId}`)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ItemClassification[];
}

export async function createItemClassification(
  payload: Pick<ItemClassification, "name" | "description" | "affects_stock" | "affects_reorder" | "affects_bom">
): Promise<ItemClassification> {
  const companyId = await getCompanyId();
  const { data, error } = await (supabase as any)
    .from("item_classifications")
    .insert({ ...payload, company_id: companyId, is_system: false, color: "64748B" })
    .select()
    .single();
  if (error) throw error;
  return data as ItemClassification;
}

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
  stock_raw_material: number;
  stock_wip: number;
  stock_finished_goods: number;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  standard_cost: number;
  min_stock_override: number | null;
  aimed_stock: number;
  parent_item_id: string | null;
  min_finished_stock: number;
  production_batch_size: number;
  // Phase 13: Stock Buckets
  stock_free: number;
  stock_in_process: number;
  stock_in_subassembly_wip: number;
  stock_in_fg_wip: number;
  stock_in_fg_ready: number;
  stock_alert_level: 'critical' | 'warning' | 'watch' | 'locked' | 'healthy';
  custom_classification_id: string | null;
}

export type StockBucket = 'free' | 'in_process' | 'in_subassembly_wip' | 'in_fg_wip' | 'in_fg_ready';

export interface StockStatusRow {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  item_type: string;
  hsn_sac_code?: string | null;
  current_stock: number;
  stock_raw_material: number;
  stock_wip: number;
  stock_finished_goods: number;
  min_stock: number;
  min_stock_override: number | null;
  aimed_stock: number;
  standard_cost: number;
  parent_item_id: string | null;
  effective_min_stock: number;
  stock_status: "green" | "amber" | "red";
  company_id: string;
  stock_alert_level: 'critical' | 'warning' | 'watch' | 'locked' | 'healthy';
  // Phase 13 stock buckets (fetched from items table)
  stock_free: number;
  stock_in_process: number;
  stock_in_subassembly_wip: number;
  stock_in_fg_wip: number;
  stock_in_fg_ready: number;
  // Per-bucket stock value = bucket qty × standard_cost. Computed in
  // fetchStockStatus so the page and any export read from one source.
  // awo_qty is intentionally excluded — costs reflect the 5 physical buckets.
  cost_free: number;
  cost_in_process: number;
  cost_in_subassembly_wip: number;
  cost_in_fg_wip: number;
  cost_in_fg_ready: number;
  cost_total: number;
  // Calculated from active AWOs — not stored in DB, computed in fetchStockStatus
  awo_qty: number;
}

export interface ItemFilters {
  search?: string;
  type?: string;
  types?: string[];
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchItems(filters: ItemFilters = {}) {
  const companyId = await getCompanyId();
  if (!companyId) return { data: [], count: 0 };
  const { search, type = "all", types, status = "active" } = filters;

  let query = supabase
    .from("items")
    .select("*")
    .order("item_code", { ascending: true });

  if (status !== "all") query = query.eq("status", status);
  if (types && types.length > 0) {
    query = query.in("item_type", types);
  } else if (type && type !== "all") {
    query = query.eq("item_type", type);
  }

  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`item_code.ilike.${term},description.ilike.${term},drawing_number.ilike.${term},drawing_revision.ilike.${term},hsn_sac_code.ilike.${term}`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return { data: (data ?? []) as Item[], count: (data ?? []).length };
}

export async function fetchItem(id: string) {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Item;
}

async function generateItemCode(companyId: string, drawingNumber: string | null | undefined): Promise<string> {
  if (drawingNumber?.trim()) {
    const base = drawingNumber
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9\-\.]/g, "")
      .slice(0, 30);
    if (base) {
      // Check if base code is free
      const { count } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("item_code", base);
      if ((count ?? 0) === 0) return base;
      // Try suffixes -01 through -99
      for (let i = 1; i <= 99; i++) {
        const candidate = `${base.slice(0, 27)}-${String(i).padStart(2, "0")}`;
        const { count: c2 } = await supabase
          .from("items")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("item_code", candidate);
        if ((c2 ?? 0) === 0) return candidate;
      }
    }
  }
  // Fallback: ITEM-NNNN sequence
  const { count } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .ilike("item_code", "ITEM-%");
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  return `ITEM-${seq}`;
}

export async function createItem(item: Partial<Item>) {
  const companyId = await getCompanyId();
  const itemCode = item.item_code?.trim()
    ? item.item_code.trim()
    : await generateItemCode(companyId, item.drawing_revision ?? item.drawing_number);
  try {
    const { data, error } = await (supabase as any)
      .from("items")
      .insert({ ...item, item_code: itemCode, company_id: companyId })
      .select()
      .single();
    if (error) {
      console.error("[createItem] error:", error);
      throw new Error(error.message ?? JSON.stringify(error));
    }
    return data as Item;
  } catch (err: any) {
    console.error("[createItem] caught:", err);
    throw err;
  }
}

export async function updateItem(id: string, item: Partial<Item>) {
  try {
    const { data, error } = await (supabase as any)
      .from("items")
      .update(item)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      console.error("[updateItem] error:", error);
      throw new Error(error.message ?? JSON.stringify(error));
    }
    return data as Item;
  } catch (err: any) {
    console.error("[updateItem] caught:", err);
    throw err;
  }
}

export async function deleteItem(id: string) {
  return updateItem(id, { status: "inactive" } as any);
}

export async function fetchStockStatus() {
  // Query items table directly so stock_alert_level is always available.
  // The stock_status view may not expose this column.
  const companyId = await getCompanyId();
  if (!companyId) return [] as StockStatusRow[];
  const { data, error } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, unit, item_type, hsn_sac_code, current_stock, stock_raw_material, stock_wip, stock_finished_goods, min_stock, min_stock_override, aimed_stock, standard_cost, parent_item_id, company_id, stock_free, stock_in_process, stock_in_subassembly_wip, stock_in_fg_wip, stock_in_fg_ready, stock_alert_level, min_finished_stock")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("item_code", { ascending: true });
  if (error) throw error;

  // ── Active AWO overlay ────────────────────────────────────────────────────
  // Two separate queries because assembly_work_orders → bom_lines have no
  // direct FK (both reference items.id independently), so nested select fails.
  // Column is quantity_to_build (not qty_to_build).
  // Valid statuses: draft | pending_materials | in_progress | complete | cancelled
  const { data: awoData, error: awoError } = await (supabase as any)
    .from("assembly_work_orders")
    .select("id, item_id, quantity_to_build")
    .eq("company_id", companyId)
    .in("status", ["pending_materials", "in_progress"]);

  if (awoError) console.error("[fetchStockStatus] AWO query error:", awoError);

  const activeAwos = (awoData ?? []) as Array<{ id: string; item_id: string; quantity_to_build: number }>;

  // For each active AWO, fetch its BOM lines (parent_item_id = item being built, child_item_id = component)
  let bomLines: Array<{ parent_item_id: string; child_item_id: string; quantity: number }> = [];
  if (activeAwos.length > 0) {
    const awoItemIds = [...new Set(activeAwos.map((a) => a.item_id))];
    const { data: bomData, error: bomError } = await (supabase as any)
      .from("bom_lines")
      .select("parent_item_id, child_item_id, quantity")
      .eq("company_id", companyId)
      .in("parent_item_id", awoItemIds);
    if (bomError) console.error("[fetchStockStatus] bom_lines query error:", bomError);
    bomLines = (bomData ?? []) as typeof bomLines;
  }

  // Build a per-item awo_qty map:
  //   - For the sub-assembly itself: add quantity_to_build
  //   - For each BOM component: add (bom_qty × quantity_to_build)
  const awoQtyMap = new Map<string, number>();
  for (const awo of activeAwos) {
    const qtyToBuild = awo.quantity_to_build ?? 0;
    // Sub-assembly being built
    awoQtyMap.set(awo.item_id, (awoQtyMap.get(awo.item_id) ?? 0) + qtyToBuild);
    // Components consumed by the AWO
    for (const line of bomLines.filter((l) => l.parent_item_id === awo.item_id)) {
      const componentQty = (line.quantity ?? 0) * qtyToBuild;
      awoQtyMap.set(line.child_item_id, (awoQtyMap.get(line.child_item_id) ?? 0) + componentQty);
    }
  }
  // Compute stock_status and effective_min_stock client-side (same logic as the view)
  const rows = (data ?? []).map((item: any) => {
    // Use || not ?? so that a stored value of 0 is treated as "not set"
    // and falls through to min_stock (??  would short-circuit on 0)
    const effectiveMin = item.min_stock_override || item.min_stock || 0;
    let stock_status: "green" | "amber" | "red" = "green";
    if (item.current_stock <= 0) stock_status = "red";
    else if (effectiveMin > 0 && item.current_stock <= effectiveMin) stock_status = "amber";
    // Per-bucket stock value (qty × standard_cost) — physical buckets only.
    const cost = Number(item.standard_cost ?? 0);
    const cost_free                = Number(item.stock_free ?? 0)                * cost;
    const cost_in_process          = Number(item.stock_in_process ?? 0)          * cost;
    const cost_in_subassembly_wip  = Number(item.stock_in_subassembly_wip ?? 0)  * cost;
    const cost_in_fg_wip           = Number(item.stock_in_fg_wip ?? 0)           * cost;
    const cost_in_fg_ready         = Number(item.stock_in_fg_ready ?? 0)         * cost;
    const cost_total =
      cost_free + cost_in_process + cost_in_subassembly_wip + cost_in_fg_wip + cost_in_fg_ready;
    return {
      ...item,
      effective_min_stock: effectiveMin,
      stock_status,
      stock_alert_level: item.stock_alert_level ?? 'healthy',
      cost_free,
      cost_in_process,
      cost_in_subassembly_wip,
      cost_in_fg_wip,
      cost_in_fg_ready,
      cost_total,
      awo_qty: awoQtyMap.get(item.id) ?? 0,
    } as StockStatusRow;
  });
  return rows;
}

export interface StockMovement {
  id: string;
  movement_date: string;
  movement_type: 'in' | 'out';
  document_type: 'grn' | 'dc' | 'assembly_order' | 'adjustment' | 'opening_stock';
  document_number: string;
  document_id: string | null;
  quantity: number;
  running_balance: number;
  party_name: string | null;
  performed_by: string | null;
  notes: string | null;
}

function mapTransactionType(type: string): StockMovement['document_type'] {
  if (type === 'grn_receipt') return 'grn';
  if (type === 'opening_stock') return 'opening_stock';
  if (type === 'assembly_consumption' || type === 'assembly_output') return 'assembly_order';
  if (type === 'manual_adjustment' || type === 'rejection_writeoff') return 'adjustment';
  return 'dc';
}

export async function fetchStockMovements(itemId: string): Promise<StockMovement[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data, error } = await (supabase as any)
    .from('stock_ledger')
    .select('id, transaction_date, transaction_type, qty_in, qty_out, balance_qty, reference_id, reference_number, notes, created_by')
    .eq('company_id', companyId)
    .eq('item_id', itemId)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => {
    const isIn = (row.qty_in ?? 0) > 0;
    return {
      id: row.id,
      movement_date: row.transaction_date,
      movement_type: isIn ? 'in' as const : 'out' as const,
      document_type: mapTransactionType(row.transaction_type),
      document_number: row.reference_number ?? '—',
      document_id: row.reference_id ?? null,
      quantity: isIn ? (row.qty_in ?? 0) : (row.qty_out ?? 0),
      running_balance: row.balance_qty ?? 0,
      party_name: null,
      performed_by: row.created_by ?? null,
      notes: row.notes ?? null,
    };
  });
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
        { count: poLineCount },
        { count: dcLineCount },
        { count: invoiceLineCount },
        { count: grnLineCount },
      ] = await Promise.all([
        (supabase as any).from("stock_ledger").select("id", { count: "exact", head: true }).eq("item_id", id),
        (supabase as any).from("bom_lines").select("id", { count: "exact", head: true }).or(`parent_item_id.eq.${id},child_item_id.eq.${id}`),
        (supabase as any).from("po_line_items").select("id", { count: "exact", head: true }).eq("item_id", id),
        (supabase as any).from("dc_line_items").select("id", { count: "exact", head: true }).eq("item_id", id),
        (supabase as any).from("invoice_line_items").select("id", { count: "exact", head: true }).eq("item_id", id),
        (supabase as any).from("grn_line_items").select("id", { count: "exact", head: true }).eq("item_id", id),
      ]);
      const hasRefs =
        (stockCount ?? 0) > 0 ||
        (bomCount ?? 0) > 0 ||
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

// ── Bulk import batch function (shared by DataImport and BackgroundImportDialog) ──

export async function importItemsBatch(
  rows: Record<string, string>[],
  rowNums: number[],
  onProgress?: (pct: number) => void
): Promise<{ imported: number; skipped: number; errors: string[]; skipReasons: SkipReason[]; updated?: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Import failed: session expired. Please sign out and sign in again.");
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Import failed: company ID is missing. Please complete company setup.");

  const { data: existingItems } = await supabase
    .from("items").select("id, item_code, drawing_revision").eq("company_id", companyId);

  const normalizeItemCode = (s: string) => s.toUpperCase().replace(/[\s.]/g, "");

  const byCode = new Map<string, string>(
    (existingItems ?? []).filter((i: any) => i.item_code)
      .map((i: any) => [(i.item_code as string).toLowerCase(), i.id as string])
  );
  const byNormCode = new Map<string, string>(
    (existingItems ?? []).filter((i: any) => i.item_code)
      .map((i: any) => [normalizeItemCode(i.item_code as string), i.id as string])
  );
  const byDrawing = new Map<string, { id: string; item_code: string }>(
    (existingItems ?? []).filter((i: any) => i.drawing_revision)
      .map((i: any) => [(i.drawing_revision as string).toLowerCase(), { id: i.id as string, item_code: i.item_code as string }])
  );

  let imported = 0;
  let newCount = 0;
  let updatedCount = 0;
  let skipped = 0;
  let autoCodeIndex = 1;
  const errors: string[] = [];
  const skipReasons: SkipReason[] = [];
  const toInsert: any[] = [];
  const toUpdate: any[] = [];
  const codeToRow = new Map<string, number>();
  const insertErrors = new Map<string, string>(); // item_code.toLowerCase() → DB error reason
  const insertingNormCodes = new Map<string, number>(); // normCode → index in toInsert

  const VALID_TYPES = ["raw_material", "component", "sub_assembly", "bought_out", "finished_good", "product", "consumable", "service"];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = rowNums[i] ?? (i + 2);
    const code = row["item_code"]?.trim() || "";
    const drawingNum = row["drawing_revision"]?.trim() || "";
    const desc = row["description"]?.trim() || "";
    const displayKey = code || drawingNum || "";

    if (!desc) {
      skipped++;
      errors.push(`Row ${excelRow}${displayKey ? ` (${displayKey})` : ""}: Description was blank`);
      skipReasons.push({ row: excelRow, value: displayKey, reason: "Description was blank" });
      continue;
    }

    let existingId: string | null = null;
    let resolvedCode = code;

    if (code) {
      existingId = byCode.get(code.toLowerCase()) ?? byNormCode.get(normalizeItemCode(code)) ?? null;
    } else if (drawingNum) {
      const match = byDrawing.get(drawingNum.toLowerCase());
      if (match) { existingId = match.id; resolvedCode = match.item_code || drawingNum; }
      else resolvedCode = drawingNum;
    } else {
      const words = desc.trim().split(/\s+/).slice(0, 3)
        .map((w) => w.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
      resolvedCode = `${words.join("-")}-${String(autoCodeIndex).padStart(4, "0")}`;
      autoCodeIndex++;
      existingId = byCode.get(resolvedCode.toLowerCase()) ?? null;
    }

    const itemData: any = {
      company_id: companyId,
      item_code: resolvedCode || null,
      description: desc,
      item_type: normalizeItemType(row["item_type"] || ""),
      unit: normalizeUnit(row["unit"] || "NOS"),
      hsn_sac_code: row["hsn_sac_code"] || null,
      sale_price: parseFloat(row["sale_price"] || "0") || 0,
      purchase_price: parseFloat(row["purchase_price"] || "0") || 0,
      gst_rate: parseFloat(row["gst_rate"] || "18") || 18,
      min_stock: parseFloat(row["min_stock"] || "0") || 0,
      is_critical: ["true", "yes", "1", "y"].includes((row["is_critical"] || "").toLowerCase().trim()),
      notes: row["notes"] || null,
      drawing_number: drawingNum || null,
      drawing_revision: drawingNum || null,
      standard_cost: parseFloat(row["standard_cost"] || "0") || 0,
    };

    if (resolvedCode) codeToRow.set(resolvedCode.toLowerCase(), excelRow);

    if (existingId) {
      toUpdate.push({ id: existingId, ...itemData });
    } else {
      // Check for within-batch duplicate by normalized code
      const normCode = resolvedCode ? normalizeItemCode(resolvedCode) : "";
      if (normCode && insertingNormCodes.has(normCode)) {
        skipped++;
        const reason = `Duplicate of a row already queued for insert (normalized code "${normCode}")`;
        errors.push(`Row ${excelRow}${displayKey ? ` (${displayKey})` : ""}: ${reason}`);
        skipReasons.push({ row: excelRow, value: displayKey, reason });
      } else {
        if (normCode) insertingNormCodes.set(normCode, toInsert.length);
        toInsert.push(itemData);
      }
    }
  }

  const totalOps = toInsert.length + toUpdate.length;

  // Bulk insert new items — parallel chunks of 500
  if (toInsert.length > 0) {
    const CHUNK = 500;
    const bulkInsert = async (items: any[]) => {
      const chunks = Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) =>
        items.slice(i * CHUNK, (i + 1) * CHUNK)
      );
      await Promise.all(chunks.map(async (chunk) => {
        const { error } = await supabase.from("items").insert(chunk);
        if (error) throw error;
        imported += chunk.length;
        newCount += chunk.length;
      }));
      if (totalOps > 0) onProgress?.(Math.round((imported / totalOps) * 100));
    };
    try {
      await bulkInsert(toInsert);
    } catch {
      const validInsert = toInsert.filter((item) => VALID_TYPES.includes(item.item_type));
      const invalidInsert = toInsert.filter((item) => !VALID_TYPES.includes(item.item_type));
      for (const item of invalidInsert) {
        skipped++;
        const rowNum = codeToRow.get((item.item_code || "").toLowerCase()) ?? 0;
        const reason = `Item Type not recognised: "${item.item_type}"`;
        errors.push(`Row ${rowNum} (${item.item_code || item.description}): ${reason}`);
        skipReasons.push({ row: rowNum, value: item.item_code || "", reason });
      }
      if (validInsert.length > 0) {
        try {
          imported = 0; newCount = 0;
          await bulkInsert(validInsert);
        } catch {
          imported = 0; newCount = 0;
          for (const itemData of validInsert) {
            try {
              const { error } = await supabase.from("items").insert(itemData);
              if (error) throw error;
              imported++; newCount++;
            } catch (err: any) {
              skipped++;
              const isDup = err?.code === "23505" || String(err?.message ?? "").toLowerCase().includes("duplicate");
              const reason = isDup ? "Duplicate already exists" : `DB error: ${err?.message ?? "unknown"}`;
              const rowNum = codeToRow.get((itemData.item_code || "").toLowerCase()) ?? 0;
              errors.push(`Row ${rowNum} (${itemData.item_code || itemData.description}): ${reason}`);
              skipReasons.push({ row: rowNum, value: itemData.item_code || "", reason });
              if (itemData.item_code) insertErrors.set((itemData.item_code as string).toLowerCase(), reason);
            }
          }
        }
      }
    }
  }

  // Bulk upsert updates — parallel chunks of 500
  if (toUpdate.length > 0) {
    const UPDATE_CHUNK = 500;
    const updateChunks = Array.from({ length: Math.ceil(toUpdate.length / UPDATE_CHUNK) }, (_, i) =>
      toUpdate.slice(i * UPDATE_CHUNK, (i + 1) * UPDATE_CHUNK)
    );
    await Promise.all(updateChunks.map(async (chunk) => {
      try {
        const { error } = await supabase.from("items").upsert(chunk, { onConflict: "id" });
        if (error) throw error;
        imported += chunk.length;
        updatedCount += chunk.length;
      } catch {
        for (const itemData of chunk) {
          const { id, ...rest } = itemData;
          try {
            const { error } = await supabase.from("items").update(rest).eq("id", id);
            if (error) throw error;
            imported++; updatedCount++;
          } catch (err: any) {
            skipped++;
            const rowNum = codeToRow.get((rest.item_code || "").toLowerCase()) ?? 0;
            const reason = `DB error: ${err?.message ?? "unknown"}`;
            errors.push(`Row ${rowNum} (${rest.item_code || rest.description}): ${reason}`);
            skipReasons.push({ row: rowNum, value: rest.item_code || "", reason });
          }
        }
      }
    }));
    if (totalOps > 0) onProgress?.(Math.round((imported / totalOps) * 100));
  }

  // Post-import verification: ask the DB which of the inserted codes actually
  // landed.  Uses an RPC so the code list is passed as a JSON array — no
  // PostgREST URL encoding issues with special characters (/, (, ), :, &).
  if (toInsert.length > 0) {
    try {
      const codesToCheck = toInsert.map((i: any) => i.item_code).filter(Boolean) as string[];
      const { data: foundCodes } = await (supabase as any).rpc("verify_item_codes_exist", {
        p_company_id: companyId,
        p_codes: codesToCheck,
      });
      const inDBCodes = new Set<string>(foundCodes ?? []);
      for (const item of toInsert) {
        if (item.item_code && !inDBCodes.has(item.item_code)) {
          const rowNum = codeToRow.get((item.item_code as string).toLowerCase()) ?? 0;
          const storedError = insertErrors.get((item.item_code as string).toLowerCase());
          const reason = storedError ?? "Not persisted — insert appeared to succeed but item is absent from DB";
          // Only surface if not already logged by the row-by-row error path
          if (!storedError) {
            errors.push(`Row ${rowNum} (${item.item_code}): ${reason}`);
            skipReasons.push({ row: rowNum, value: item.item_code as string, reason });
            skipped++;
            if (imported > 0) { imported--; newCount--; }
          }
        }
      }
    } catch {
      // Verification query failed — don't block the import result
    }
  }

  return { imported, skipped, errors, skipReasons, updated: updatedCount };
}

// ── importItemsPatchBatch ──────────────────────────────────────────────────────
// Patch mode: match rows by item_code, only fill fields that are NULL/empty/0
// in the database. Never overwrites existing data. New item_codes are inserted.
export async function importItemsPatchBatch(
  rows: Record<string, string>[],
  rowNums: number[],
  onProgress?: (pct: number) => void
): Promise<{ imported: number; skipped: number; errors: string[]; skipReasons: SkipReason[]; updated?: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Import failed: session expired. Please sign out and sign in again.");
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Import failed: company ID is missing. Please complete company setup.");

  // Fetch existing items with all patchable fields
  const { data: existingItems } = await supabase
    .from("items")
    .select("id, item_code, drawing_revision, description, drawing_number, unit, item_type, min_stock, aimed_stock, standard_cost")
    .eq("company_id", companyId) as { data: Array<{
      id: string;
      item_code: string | null;
      drawing_revision: string | null;
      description: string | null;
      drawing_number: string | null;
      unit: string | null;
      item_type: string | null;
      min_stock: number | null;
      aimed_stock: number | null;
      standard_cost: number | null;
    }> | null };

  const normalizeItemCode = (s: string) => s.toUpperCase().replace(/[\s.]/g, "");

  type ExistingItem = NonNullable<typeof existingItems>[number];

  // Deduplicate by item_code — DB may contain duplicate rows if items is a view or re-imports occurred
  const seen = new Set<string>();
  const uniqueItems = (existingItems ?? []).filter(item => {
    if (!item.item_code) return true; // keep items without item_code (matched by drawing)
    const key = item.item_code.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Two separate maps so size = actual unique item count
  const byCode = new Map<string, ExistingItem>();       // key: item_code.toLowerCase()
  const byCodeNorm = new Map<string, ExistingItem>();   // key: normalizeItemCode(item_code)
  const byDrawing = new Map<string, ExistingItem>();    // key: drawing_revision.toLowerCase()

  for (const item of uniqueItems) {
    if (item.item_code) {
      byCode.set(item.item_code.toLowerCase(), item);
      byCodeNorm.set(normalizeItemCode(item.item_code), item);
    }
    if (item.drawing_revision) byDrawing.set(item.drawing_revision.toLowerCase(), item);
  }

  let imported = 0;
  let updatedCount = 0;
  let skipped = 0;
  let autoCodeIndex = 1;
  const errors: string[] = [];
  const skipReasons: SkipReason[] = [];
  const toInsert: any[] = [];
  const patchOps: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const codeToRow = new Map<string, number>();
  const VALID_TYPES = ["raw_material", "component", "sub_assembly", "bought_out", "finished_good", "product", "consumable", "service"];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = rowNums[i] ?? (i + 2);
    const code = row["item_code"]?.trim() || "";
    const drawingNum = row["drawing_revision"]?.trim() || "";
    const desc = row["description"]?.trim() || "";
    const displayKey = code || drawingNum || desc.slice(0, 30);

    if (!code && !drawingNum && !desc) {
      skipped++;
      skipReasons.push({ row: excelRow, value: "", reason: "Row entirely blank — skipped" });
      continue;
    }

    // Resolve existing item
    let existing: NonNullable<typeof existingItems>[number] | undefined;
    let resolvedCode = code;

    if (code) {
      existing = byCode.get(code.toLowerCase()) ?? byCodeNorm.get(normalizeItemCode(code));
    } else if (drawingNum) {
      existing = byDrawing.get(drawingNum.toLowerCase());
      if (existing) resolvedCode = existing.item_code ?? drawingNum;
      else resolvedCode = drawingNum;
    } else {
      const words = desc.trim().split(/\s+/).slice(0, 3)
        .map((w) => w.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
      resolvedCode = `${words.join("-")}-${String(autoCodeIndex).padStart(4, "0")}`;
      autoCodeIndex++;
    }

    if (resolvedCode) codeToRow.set(resolvedCode.toLowerCase(), excelRow);

    if (!existing) {
      // New item — insert normally (description required for new items)
      if (!desc) {
        skipped++;
        errors.push(`Row ${excelRow} (${displayKey}): Description is required for new items`);
        skipReasons.push({ row: excelRow, value: displayKey, reason: "Description required for new items" });
        continue;
      }
      toInsert.push({
        company_id: companyId,
        item_code: resolvedCode || null,
        description: desc,
        item_type: normalizeItemType(row["item_type"] || ""),
        unit: normalizeUnit(row["unit"] || "NOS"),
        drawing_number: drawingNum || null,
        drawing_revision: drawingNum || null,
        min_stock: parseFloat(row["min_stock"] || "0") || 0,
        aimed_stock: parseFloat(row["aimed_stock"] || "0") || 0,
        standard_cost: parseFloat(row["standard_cost"] || "0") || 0,
        hsn_sac_code: row["hsn_sac_code"] || null,
        notes: row["notes"] || null,
      });
    } else {
      // Existing item — only patch NULL/empty/zero fields
      const patch: Record<string, unknown> = {};

      if (desc && (!existing.description || existing.description.trim() === "")) {
        patch.description = desc;
      }
      if (drawingNum && (!existing.drawing_number || existing.drawing_number.trim() === "")) {
        patch.drawing_number = drawingNum;
        patch.drawing_revision = drawingNum;
      }
      const newUnit = normalizeUnit(row["unit"] || "");
      if (newUnit && newUnit !== "NOS" && (!existing.unit || existing.unit.trim() === "")) {
        patch.unit = newUnit;
      } else if (newUnit && !existing.unit) {
        patch.unit = newUnit;
      }
      const newType = normalizeItemType(row["item_type"] || "");
      if (newType && (!existing.item_type || existing.item_type.trim() === "")) {
        patch.item_type = newType;
      }
      // min_stock: try all possible keys — ITEM_FIELD_MAP may not have mapped the column
      const rawMinStock =
        row["min_stock"] ??
        row["Minimum Quantity"] ??
        row["minimum quantity"] ??
        row["Min Stock"] ??
        row["min stock"] ??
        row["MinStock"] ??
        row["minimum_quantity"] ??
        undefined;
      const newMinStock = parseFloat(String(rawMinStock ?? "")) || 0;
      if (newMinStock > 0 && (!existing.min_stock && existing.min_stock !== undefined)) {
        patch.min_stock = newMinStock;
      }
      const rawAimed =
        row["aimed_stock"] ??
        row["Aimed Stock"] ??
        row["aimed_qty"] ??
        row["Aimed Qty"] ??
        row["max_stock"] ??
        row["Max Stock"] ??
        undefined;
      const newAimed = parseFloat(String(rawAimed ?? "")) || 0;
      if (newAimed > 0 && (!existing.aimed_stock || existing.aimed_stock === 0)) {
        patch.aimed_stock = newAimed;
      }
      const newCost = parseFloat(row["standard_cost"] as string) || 0;
      if (newCost > 0 && (!existing.standard_cost && existing.standard_cost !== undefined)) {
        patch.standard_cost = newCost;
      }

      if (Object.keys(patch).length > 0) {
        patchOps.push({ id: existing.id, patch });
      } else {
        skipped++;
        const missingFields = [];
        if (!row["min_stock"]) missingFields.push("min_stock not in file");
        if (existing.min_stock && existing.min_stock > 0) missingFields.push(`min_stock already ${existing.min_stock}`);
        skipReasons.push({ row: excelRow, value: displayKey, reason: `All fields already populated — nothing to patch${missingFields.length ? ` (${missingFields.join(", ")})` : ""}` });
      }
    }
  }

  const totalOps = toInsert.length + patchOps.length;

  // Insert new items
  for (const itemData of toInsert) {
    try {
      const { error } = await supabase.from("items").insert(itemData);
      if (error) throw error;
      imported++;
    } catch (err: any) {
      skipped++;
      const isDup = err?.code === "23505" || String(err?.message ?? "").toLowerCase().includes("duplicate");
      const reason = isDup ? "Duplicate already exists" : `DB error: ${err?.message ?? "unknown"}`;
      const rowNum = codeToRow.get((itemData.item_code || "").toLowerCase()) ?? 0;
      errors.push(`Row ${rowNum} (${itemData.item_code || itemData.description}): ${reason}`);
      skipReasons.push({ row: rowNum, value: itemData.item_code || "", reason });
    }
    if (totalOps > 0) onProgress?.(Math.round((imported / totalOps) * 100));
  }

  // Patch existing items (one by one — each patch set is different)
  for (const { id, patch } of patchOps) {
    try {
      const { error } = await supabase.from("items").update(patch).eq("id", id);
      if (error) throw error;
      imported++;
      updatedCount++;
    } catch (err: any) {
      skipped++;
      const reason = `DB error: ${err?.message ?? "unknown"}`;
      errors.push(`Patch failed for item id ${id}: ${reason}`);
      skipReasons.push({ row: 0, value: id, reason });
    }
    if (totalOps > 0) onProgress?.(Math.round((imported / totalOps) * 100));
  }

  return { imported, skipped, errors, skipReasons, updated: updatedCount };
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

// ── Phase 13: Stock Buckets ───────────────────────────────────────────────────

const BUCKET_COLUMN_MAP: Record<StockBucket, string> = {
  free: 'stock_free',
  in_process: 'stock_in_process',
  in_subassembly_wip: 'stock_in_subassembly_wip',
  in_fg_wip: 'stock_in_fg_wip',
  in_fg_ready: 'stock_in_fg_ready',
};

function computeAlertLevel(
  stock_free: number,
  stock_in_process: number,
  stock_in_subassembly_wip: number,
  stock_in_fg_wip: number,
  stock_in_fg_ready: number,
  min_stock: number,
  item_type?: string
): Item['stock_alert_level'] {
  if (!min_stock || min_stock <= 0) return 'healthy';
  if (item_type === 'service') return 'healthy';
  const effective = stock_free + stock_in_process + stock_in_subassembly_wip + stock_in_fg_wip + stock_in_fg_ready;
  if (effective < min_stock) return 'critical';
  return 'healthy';
}

export async function updateStockBucket(
  itemId: string,
  bucket: StockBucket,
  delta: number,
  options?: { skipAlertUpdate?: boolean }
): Promise<void> {
  const col = BUCKET_COLUMN_MAP[bucket];

  // Fetch current item to get all bucket values
  const { data: itemData, error: fetchErr } = await (supabase as any)
    .from('items')
    .select('stock_free, stock_in_process, stock_in_subassembly_wip, stock_in_fg_wip, stock_in_fg_ready, min_stock')
    .eq('id', itemId)
    .single();
  if (fetchErr) throw fetchErr;

  const item = itemData as any;
  const current: number = item[col] ?? 0;
  const newValue = Math.max(0, current + delta);

  const updatedBuckets = {
    stock_free: item.stock_free ?? 0,
    stock_in_process: item.stock_in_process ?? 0,
    stock_in_subassembly_wip: item.stock_in_subassembly_wip ?? 0,
    stock_in_fg_wip: item.stock_in_fg_wip ?? 0,
    stock_in_fg_ready: item.stock_in_fg_ready ?? 0,
  };
  updatedBuckets[col as keyof typeof updatedBuckets] = newValue;

  const minStock: number = item.min_stock ?? 0;
  const alertLevel = options?.skipAlertUpdate
    ? undefined
    : computeAlertLevel(
        updatedBuckets.stock_free,
        updatedBuckets.stock_in_process,
        updatedBuckets.stock_in_subassembly_wip,
        updatedBuckets.stock_in_fg_wip,
        updatedBuckets.stock_in_fg_ready,
        minStock
      );

  const updatePayload: Record<string, any> = {
    ...updatedBuckets,
    // Keep current_stock in sync with stock_free for backward compat
    current_stock: updatedBuckets.stock_free,
    last_stock_check: new Date().toISOString(),
  };
  if (alertLevel !== undefined) updatePayload.stock_alert_level = alertLevel;

  const { error: updateErr } = await (supabase as any)
    .from('items')
    .update(updatePayload)
    .eq('id', itemId);
  if (updateErr) throw updateErr;
}

