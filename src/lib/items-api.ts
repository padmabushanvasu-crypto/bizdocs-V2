import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { normalizeItemType, normalizeUnit, type SkipReason } from "@/lib/import-utils";

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
}

export type StockBucket = 'free' | 'in_process' | 'in_subassembly_wip' | 'in_fg_wip' | 'in_fg_ready';

export interface StockStatusRow {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  item_type: string;
  current_stock: number;
  stock_raw_material: number;
  stock_wip: number;
  stock_finished_goods: number;
  min_stock: number;
  min_stock_override: number | null;
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
  const { search, type = "all", types, status = "active", page = 1, pageSize = 100 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("items")
    .select("*", { count: "exact" })
    .order("item_code", { ascending: true })
    .range(from, to);

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

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as Item[], count: count ?? 0 };
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
    .select("id, item_code, description, unit, item_type, current_stock, stock_raw_material, stock_wip, stock_finished_goods, min_stock, min_stock_override, standard_cost, parent_item_id, company_id, stock_free, stock_in_process, stock_in_subassembly_wip, stock_in_fg_wip, stock_in_fg_ready, stock_alert_level, min_finished_stock, stock_finished_goods")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("item_code", { ascending: true });
  if (error) throw error;
  // Compute stock_status and effective_min_stock client-side (same logic as the view)
  const rows = (data ?? []).map((item: any) => {
    const effectiveMin = item.min_stock_override ?? item.min_stock ?? 0;
    let stock_status: "green" | "amber" | "red" = "green";
    if (item.current_stock <= 0) stock_status = "red";
    else if (effectiveMin > 0 && item.current_stock <= effectiveMin) stock_status = "amber";
    return {
      ...item,
      effective_min_stock: effectiveMin,
      stock_status,
      stock_alert_level: item.stock_alert_level ?? 'healthy',
    } as StockStatusRow;
  });
  return rows;
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
  console.log("[importItemsBatch] start:", { companyId, userId: session.user.id, rowCount: rows.length, firstRow: rows[0] });

  const { data: existingItems } = await supabase
    .from("items").select("id, item_code, drawing_revision").eq("company_id", companyId);

  const byCode = new Map<string, string>(
    (existingItems ?? []).filter((i: any) => i.item_code)
      .map((i: any) => [(i.item_code as string).toLowerCase(), i.id as string])
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

  const VALID_TYPES = ["raw_material", "component", "sub_assembly", "bought_out", "finished_good", "consumable", "service"];

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
      existingId = byCode.get(code.toLowerCase()) ?? null;
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

    if (existingId) toUpdate.push({ id: existingId, ...itemData });
    else toInsert.push(itemData);
  }

  const totalOps = toInsert.length + toUpdate.length;

  // Bulk insert new items in chunks of 200
  if (toInsert.length > 0) {
    const bulkInsert = async (items: any[]) => {
      for (let i = 0; i < items.length; i += 200) {
        const chunk = items.slice(i, i + 200);
        const { error } = await supabase.from("items").insert(chunk);
        if (error) throw error;
        imported += chunk.length;
        newCount += chunk.length;
        if (totalOps > 0) onProgress?.(Math.round((imported / totalOps) * 100));
      }
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
            }
          }
        }
      }
    }
  }

  // Bulk upsert updates in chunks of 100
  for (let i = 0; i < toUpdate.length; i += 100) {
    const chunk = toUpdate.slice(i, i + 100);
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
  min_stock: number
): Item['stock_alert_level'] {
  const effective_available = stock_free + stock_in_process;
  if (min_stock > 0 && stock_free <= min_stock) return 'critical';
  if (min_stock > 0 && effective_available <= min_stock) return 'warning';
  if (min_stock > 0 && effective_available <= min_stock * 1.2) return 'watch';
  if (
    stock_free === 0 &&
    (stock_in_process + stock_in_subassembly_wip + stock_in_fg_wip + stock_in_fg_ready) > 0
  ) return 'locked';
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

export async function recalcStockAlertLevel(itemId: string): Promise<void> {
  const { data: itemData, error: fetchErr } = await (supabase as any)
    .from('items')
    .select('stock_free, stock_in_process, stock_in_subassembly_wip, stock_in_fg_wip, stock_in_fg_ready, min_stock')
    .eq('id', itemId)
    .single();
  if (fetchErr) throw fetchErr;

  const item = itemData as any;
  const alertLevel = computeAlertLevel(
    item.stock_free ?? 0,
    item.stock_in_process ?? 0,
    item.stock_in_subassembly_wip ?? 0,
    item.stock_in_fg_wip ?? 0,
    item.stock_in_fg_ready ?? 0,
    item.min_stock ?? 0
  );

  const { error: updateErr } = await (supabase as any)
    .from('items')
    .update({ stock_alert_level: alertLevel, last_stock_check: new Date().toISOString() })
    .eq('id', itemId);
  if (updateErr) throw updateErr;
}
