import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit-api";
import { getNextDocNumber } from "@/lib/doc-number-utils";

// ============================================================
// Interfaces
// ============================================================

export interface AssemblyOrder {
  id: string;
  company_id: string;
  ao_number: string;
  ao_date: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  quantity_to_build: number;
  quantity_built: number;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  bom_snapshot: any | null;
  notes: string | null;
  planned_date: string | null;
  work_order_ref: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  production_trigger?: "manual" | "stock_alert" | "reorder" | null;
  serial_numbers_generated?: boolean;
  fat_drafts_created?: boolean;
  backflushed?: boolean;
}

export interface AssemblyOrderLine {
  id: string;
  company_id: string;
  assembly_order_id: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  required_qty: number;
  available_qty: number;
  consumed_qty: number;
  unit: string | null;
  unit_cost: number;
  total_cost: number;
  is_available: boolean;
  notes: string | null;
  created_at: string;
}

export interface BomLine {
  id: string;
  company_id: string;
  parent_item_id: string;
  child_item_id: string;
  quantity: number;
  unit: string | null;
  bom_level: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined child item fields
  child_item_code?: string | null;
  child_item_description?: string | null;
  child_item_type?: string | null;
  child_current_stock?: number;
  child_standard_cost?: number;
  child_unit?: string | null;
}

export interface SerialNumber {
  id: string;
  company_id: string;
  serial_number: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  assembly_order_id: string | null;
  status: "in_production" | "in_stock" | "dispatched" | "under_warranty" | "scrapped" | "cancelled";
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

export interface StockLedgerEntry {
  id: string;
  company_id: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  transaction_date: string;
  transaction_type:
    | "grn_receipt"
    | "job_card_issue"
    | "job_card_return"
    | "job_work_return"
    | "assembly_consumption"
    | "assembly_output"
    | "invoice_dispatch"
    | "dc_issue"
    | "dc_return"
    | "opening_stock"
    | "manual_adjustment"
    | "rejection_writeoff";
  qty_in: number;
  qty_out: number;
  balance_qty: number;
  unit_cost: number;
  total_value: number;
  reference_type: string | null;
  reference_id: string | null;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  from_state?: string | null;
  to_state?: string | null;
}

export interface AssemblyOrderFilters {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface StockLedgerFilters {
  item_id?: string;
  transaction_type?: string;
  date_from?: string;
  date_to?: string;
  stock_state?: string;
  page?: number;
  pageSize?: number;
}

export interface SerialNumberFilters {
  item_id?: string;
  status?: string;
  search?: string;
}

// ============================================================
// Assembly Orders
// ============================================================

export async function fetchAssemblyOrders(filters: AssemblyOrderFilters = {}) {
  const { search, status = "all", page = 1, pageSize = 20 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("assembly_orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status !== "all") query = query.eq("status", status);

  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(
        `ao_number.ilike.${term},item_code.ilike.${term},item_description.ilike.${term}`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as AssemblyOrder[], count: count ?? 0 };
}

export async function fetchAssemblyOrder(
  id: string
): Promise<AssemblyOrder & { lines: AssemblyOrderLine[] }> {
  const [aoRes, linesRes] = await Promise.all([
    (supabase as any).from("assembly_orders").select("*").eq("id", id).single(),
    (supabase as any)
      .from("assembly_order_lines")
      .select("*")
      .eq("assembly_order_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (aoRes.error) throw aoRes.error;
  if (linesRes.error) throw linesRes.error;
  return {
    ...(aoRes.data as AssemblyOrder),
    lines: (linesRes.data ?? []) as AssemblyOrderLine[],
  };
}

export async function createAssemblyOrder(
  data: Partial<AssemblyOrder> & { item_id?: string; variant_id?: string | null }
): Promise<AssemblyOrder> {
  const companyId = await getCompanyId();

  // Insert with empty ao_number — DB trigger sets it
  const { data: ao, error } = await (supabase as any)
    .from("assembly_orders")
    .insert({
      company_id: companyId,
      ao_number: "",
      ao_date: data.ao_date ?? new Date().toISOString().split("T")[0],
      item_id: data.item_id ?? null,
      item_code: data.item_code ?? null,
      item_description: data.item_description ?? null,
      quantity_to_build: data.quantity_to_build ?? 1,
      quantity_built: 0,
      status: "draft",
      notes: data.notes ?? null,
      planned_date: data.planned_date ?? null,
      work_order_ref: data.work_order_ref ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  let created = ao as AssemblyOrder;

  // Fallback: if DB trigger didn't set ao_number, generate it
  if (!created.ao_number) {
    const aoNumber = await getNextDocNumber("assembly_orders", "ao_number", companyId, "ao_prefix");
    await (supabase as any).from("assembly_orders").update({ ao_number: aoNumber }).eq("id", created.id);
    created = { ...created, ao_number: aoNumber };
  }

  // Auto-load BOM lines if item is specified
  if (data.item_id) {
    await _populateAOLinesFromBom(
      created.id,
      companyId,
      data.item_id,
      created.quantity_to_build,
      data.variant_id ?? null
    );
  }

  logAudit("assembly_order", created.id, "Production Run Created", {
    summary: `${created.ao_number} — ${created.item_description ?? created.item_code ?? "No item"} × ${created.quantity_to_build}`,
    ao_number: created.ao_number,
    item_code: created.item_code,
    quantity_to_build: created.quantity_to_build,
  }).catch(console.error);

  return created;
}

/** Internal: copy BOM lines into AO lines with current stock/cost snapshot */
async function _populateAOLinesFromBom(
  aoId: string,
  companyId: string,
  parentItemId: string,
  quantityToBuild: number,
  variantId: string | null = null
) {
  let query = (supabase as any)
    .from("bom_lines")
    .select("*")
    .eq("parent_item_id", parentItemId);

  // Filter by variant: null = default BOM (variant_id IS NULL), uuid = specific variant
  if (variantId) {
    query = query.eq("variant_id", variantId);
  } else {
    query = query.is("variant_id", null);
  }

  const { data: bomLines } = await query;

  if (!bomLines || bomLines.length === 0) return;

  const childIds = bomLines.map((l: any) => l.child_item_id);
  const { data: childItems } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, unit, current_stock, standard_cost")
    .in("id", childIds);

  const itemMap = new Map(((childItems ?? []) as any[]).map((i) => [i.id, i]));

  const linesToInsert = bomLines.map((bl: any) => {
    const child = itemMap.get(bl.child_item_id) as any;
    const scrapFactor = bl.scrap_factor ?? 0;
    const requiredQty = (bl.quantity ?? 1) * quantityToBuild * (1 + scrapFactor / 100);
    const availableQty = child?.current_stock ?? 0;
    const unitCost = child?.standard_cost ?? 0;
    return {
      company_id: companyId,
      assembly_order_id: aoId,
      item_id: bl.child_item_id,
      item_code: child?.item_code ?? bl.child_item_id,
      item_description: child?.description ?? null,
      required_qty: requiredQty,
      available_qty: availableQty,
      consumed_qty: requiredQty, // default consumed = required
      unit: bl.unit ?? child?.unit ?? null,
      unit_cost: unitCost,
      total_cost: requiredQty * unitCost,
      is_available: availableQty >= requiredQty,
    };
  });

  if (linesToInsert.length > 0) {
    await (supabase as any).from("assembly_order_lines").insert(linesToInsert);
  }
}

export async function updateAssemblyOrder(
  id: string,
  data: Partial<AssemblyOrder>
): Promise<AssemblyOrder> {
  const { data: ao, error } = await (supabase as any)
    .from("assembly_orders")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return ao as AssemblyOrder;
}

/**
 * Load BOM for an item with real-time availability data.
 * Returns BOM lines enriched with child item's current_stock and standard_cost.
 */
export async function loadBomForItem(
  itemId: string,
  quantityToBuild: number = 1
): Promise<BomLine[]> {
  const { data: bomLines, error } = await (supabase as any)
    .from("bom_lines")
    .select("*")
    .eq("parent_item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!bomLines || bomLines.length === 0) return [];

  const childIds = bomLines.map((l: any) => l.child_item_id);
  const { data: childItems } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type, unit, current_stock, standard_cost")
    .in("id", childIds);

  const itemMap = new Map(((childItems ?? []) as any[]).map((i) => [i.id, i]));

  return (bomLines as any[]).map((bl) => {
    const child = itemMap.get(bl.child_item_id) as any;
    const requiredQty = bl.quantity * quantityToBuild;
    return {
      ...bl,
      child_item_code: child?.item_code ?? null,
      child_item_description: child?.description ?? null,
      child_item_type: child?.item_type ?? null,
      child_current_stock: child?.current_stock ?? 0,
      child_standard_cost: child?.standard_cost ?? 0,
      child_unit: child?.unit ?? bl.unit ?? null,
      // Override quantity to reflect quantity_to_build
      required_qty_total: requiredQty,
      is_available: (child?.current_stock ?? 0) >= requiredQty,
    };
  }) as BomLine[];
}

/**
 * confirmAssemblyOrder — the critical function.
 * 1. Deduct consumed_qty from each component's current_stock
 * 2. Add quantity_built to parent item current_stock
 * 3. Recalculate parent item standard_cost (weighted average)
 * 4. Write stock_ledger entries for every movement
 * 5. Create serial_number records if provided
 * 6. Mark AO completed
 * 7. Audit log
 */
export async function confirmAssemblyOrder(
  id: string,
  quantityBuilt: number,
  serialNumbers?: string[]
): Promise<void> {
  const companyId = await getCompanyId();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // 1. Fetch AO header + lines
  const ao = await fetchAssemblyOrder(id);
  if (!ao.item_id) throw new Error("Assembly Order has no item linked");

  const today = new Date().toISOString().split("T")[0];

  // 2. Process each component line: deduct stock, write ledger entry
  let totalCost = 0;
  for (const line of ao.lines) {
    if (!line.item_id || line.consumed_qty <= 0) continue;

    // Get current stock of component
    const { data: compItem } = await (supabase as any)
      .from("items")
      .select("current_stock, standard_cost")
      .eq("id", line.item_id)
      .single();

    const currentStock = (compItem as any)?.current_stock ?? 0;
    const unitCost = (compItem as any)?.standard_cost ?? line.unit_cost;
    const newStock = Math.max(0, currentStock - line.consumed_qty);
    const lineTotal = line.consumed_qty * unitCost;
    totalCost += lineTotal;

    // Deduct from item stock
    await (supabase as any)
      .from("items")
      .update({ current_stock: newStock })
      .eq("id", line.item_id);

    // Stock ledger: assembly_consumption
    await (supabase as any).from("stock_ledger").insert({
      company_id: companyId,
      item_id: line.item_id,
      item_code: line.item_code,
      item_description: line.item_description,
      transaction_date: today,
      transaction_type: "assembly_consumption",
      qty_in: 0,
      qty_out: line.consumed_qty,
      balance_qty: newStock,
      unit_cost: unitCost,
      total_value: lineTotal,
      reference_type: "assembly_order",
      reference_id: ao.id,
      reference_number: ao.ao_number,
      notes: `Consumed in ${ao.ao_number}`,
      created_by: userId,
    });
  }

  // 3. Add quantity_built to parent item stock
  const { data: parentItem } = await (supabase as any)
    .from("items")
    .select("current_stock, standard_cost")
    .eq("id", ao.item_id)
    .single();

  const parentCurrentStock = (parentItem as any)?.current_stock ?? 0;
  const parentCurrentCost = (parentItem as any)?.standard_cost ?? 0;
  const newParentStock = parentCurrentStock + quantityBuilt;

  // 4. Weighted average cost per unit
  const costPerUnit = quantityBuilt > 0 ? totalCost / quantityBuilt : 0;
  const newAvgCost =
    newParentStock > 0
      ? (parentCurrentStock * parentCurrentCost + quantityBuilt * costPerUnit) / newParentStock
      : costPerUnit;

  await (supabase as any)
    .from("items")
    .update({
      current_stock: newParentStock,
      standard_cost: Math.round(newAvgCost * 100) / 100,
    })
    .eq("id", ao.item_id);

  // Stock ledger: assembly_output for parent item
  await (supabase as any).from("stock_ledger").insert({
    company_id: companyId,
    item_id: ao.item_id,
    item_code: ao.item_code,
    item_description: ao.item_description,
    transaction_date: today,
    transaction_type: "assembly_output",
    qty_in: quantityBuilt,
    qty_out: 0,
    balance_qty: newParentStock,
    unit_cost: costPerUnit,
    total_value: totalCost,
    reference_type: "assembly_order",
    reference_id: ao.id,
    reference_number: ao.ao_number,
    notes: `Produced by ${ao.ao_number}`,
    created_by: userId,
  });

  // 5. Create serial number records if provided
  if (serialNumbers && serialNumbers.length > 0) {
    const snInserts = serialNumbers
      .filter((sn) => sn.trim())
      .map((sn) => ({
        company_id: companyId,
        serial_number: sn.trim(),
        item_id: ao.item_id,
        item_code: ao.item_code,
        item_description: ao.item_description,
        assembly_order_id: ao.id,
        status: "in_stock",
        warranty_months: 12,
      }));
    if (snInserts.length > 0) {
      await (supabase as any).from("serial_numbers").insert(snInserts);
    }
  }

  // 6. Update AO: completed
  await (supabase as any)
    .from("assembly_orders")
    .update({
      status: "completed",
      quantity_built: quantityBuilt,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // 7. Update AO lines with final consumed_qty and total_cost
  for (const line of ao.lines) {
    await (supabase as any)
      .from("assembly_order_lines")
      .update({
        total_cost: line.consumed_qty * line.unit_cost,
      })
      .eq("id", line.id);
  }

  // Audit
  const summary = `Production Run completed — built ${quantityBuilt} unit(s) of ${ao.item_description ?? ao.item_code} at ₹${Math.round(costPerUnit).toLocaleString("en-IN")}/unit · total cost ₹${Math.round(totalCost).toLocaleString("en-IN")}`;
  logAudit("assembly_order", id, "Production Run Completed", {
    summary,
    quantity_built: quantityBuilt,
    cost_per_unit: Math.round(costPerUnit * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    serial_numbers_created: serialNumbers?.length ?? 0,
  }).catch(console.error);
}

/**
 * startProductionRun — pull-based production entry point.
 * 1. Create AO immediately in 'in_progress' status
 * 2. Populate BOM lines
 * 3. Generate serial_numbers with status='in_production'
 * 4. Create draft FAT certificates for each serial
 * 5. Mark serial_numbers_generated=true, fat_drafts_created=true
 */
export async function startProductionRun(data: {
  item_id: string;
  item_code: string | null;
  item_description: string | null;
  quantity_to_build: number;
  variant_id?: string | null;
  notes?: string | null;
  work_order_ref?: string | null;
}): Promise<AssemblyOrder> {
  const companyId = await getCompanyId();

  // Insert AO directly as in_progress
  const { data: ao, error } = await (supabase as any)
    .from("assembly_orders")
    .insert({
      company_id: companyId,
      ao_number: "",
      ao_date: new Date().toISOString().split("T")[0],
      item_id: data.item_id,
      item_code: data.item_code ?? null,
      item_description: data.item_description ?? null,
      quantity_to_build: data.quantity_to_build,
      quantity_built: 0,
      status: "in_progress",
      notes: data.notes ?? null,
      work_order_ref: data.work_order_ref ?? null,
      production_trigger: "manual",
      serial_numbers_generated: false,
      fat_drafts_created: false,
      backflushed: false,
    })
    .select()
    .single();
  if (error) throw error;

  let created = ao as AssemblyOrder;

  // Fallback ao_number if trigger didn't set it
  if (!created.ao_number) {
    const aoNumber = await getNextDocNumber("assembly_orders", "ao_number", companyId, "ao_prefix");
    await (supabase as any).from("assembly_orders").update({ ao_number: aoNumber }).eq("id", created.id);
    created = { ...created, ao_number: aoNumber };
  }

  // Populate BOM lines
  await _populateAOLinesFromBom(
    created.id,
    companyId,
    data.item_id,
    data.quantity_to_build,
    data.variant_id ?? null
  );

  // Generate serial numbers (status='in_production')
  const today = new Date();
  const yymmdd = today.toISOString().slice(2, 10).replace(/-/g, "");
  const snInserts = Array.from({ length: data.quantity_to_build }, (_, i) => ({
    company_id: companyId,
    serial_number: `${created.ao_number}/${String(i + 1).padStart(2, "0")}`,
    item_id: data.item_id,
    item_code: data.item_code ?? null,
    item_description: data.item_description ?? null,
    assembly_order_id: created.id,
    status: "in_production",
    warranty_months: 12,
    fat_completed: false,
  }));

  const { data: insertedSNs, error: snError } = await (supabase as any)
    .from("serial_numbers")
    .insert(snInserts)
    .select();
  if (snError) throw snError;

  // Create draft FAT certificates for each serial
  const serialRows = (insertedSNs ?? []) as any[];
  for (const sn of serialRows) {
    // Generate FAT number
    const fatNumber = await getNextDocNumber("fat_certificates", "fat_number", companyId, "fat_prefix");
    const { error: fatError } = await (supabase as any)
      .from("fat_certificates")
      .insert({
        company_id: companyId,
        fat_number: fatNumber || "",
        fat_date: new Date().toISOString().split("T")[0],
        serial_number_id: sn.id,
        serial_number: sn.serial_number,
        item_id: data.item_id,
        item_code: data.item_code ?? null,
        item_description: data.item_description ?? null,
        assembly_order_id: created.id,
        assembly_order_number: created.ao_number,
        status: "draft",
      });
    if (fatError) console.error("FAT draft create error:", fatError);
  }

  // Mark serial_numbers_generated and fat_drafts_created
  await (supabase as any)
    .from("assembly_orders")
    .update({ serial_numbers_generated: true, fat_drafts_created: true, updated_at: new Date().toISOString() })
    .eq("id", created.id);
  created = { ...created, serial_numbers_generated: true, fat_drafts_created: true };

  logAudit("assembly_order", created.id, "Production Run Started", {
    summary: `${created.ao_number} — ${created.item_description ?? created.item_code} × ${created.quantity_to_build} | ${serialRows.length} serials generated`,
    ao_number: created.ao_number,
    quantity_to_build: created.quantity_to_build,
    serials_generated: serialRows.length,
  }).catch(console.error);

  return created;
}

/**
 * completeProductionRun — backflush components and finalize a pull-based production run.
 * 1. Deduct consumed_qty from each component's stock
 * 2. Add quantity_to_build to parent item stock
 * 3. Update serial_numbers from 'in_production' → 'in_stock'
 * 4. Update draft FAT certificates → 'pending'
 * 5. Mark AO completed with backflushed=true
 */
export async function completeProductionRun(id: string): Promise<void> {
  const companyId = await getCompanyId();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const ao = await fetchAssemblyOrder(id);
  if (!ao.item_id) throw new Error("Production run has no item linked");

  const today = new Date().toISOString().split("T")[0];
  const quantityBuilt = ao.quantity_to_build;

  // 1. Deduct component stock
  let totalCost = 0;
  for (const line of ao.lines) {
    if (!line.item_id || line.consumed_qty <= 0) continue;

    const { data: compItem } = await (supabase as any)
      .from("items")
      .select("current_stock, standard_cost")
      .eq("id", line.item_id)
      .single();

    const currentStock = (compItem as any)?.current_stock ?? 0;
    const unitCost = (compItem as any)?.standard_cost ?? line.unit_cost;
    const newStock = Math.max(0, currentStock - line.consumed_qty);
    const lineTotal = line.consumed_qty * unitCost;
    totalCost += lineTotal;

    await (supabase as any).from("items").update({ current_stock: newStock }).eq("id", line.item_id);

    await (supabase as any).from("stock_ledger").insert({
      company_id: companyId,
      item_id: line.item_id,
      item_code: line.item_code,
      item_description: line.item_description,
      transaction_date: today,
      transaction_type: "assembly_consumption",
      qty_in: 0,
      qty_out: line.consumed_qty,
      balance_qty: newStock,
      unit_cost: unitCost,
      total_value: lineTotal,
      reference_type: "assembly_order",
      reference_id: ao.id,
      reference_number: ao.ao_number,
      notes: `Consumed in ${ao.ao_number}`,
      created_by: userId,
    });
  }

  // 2. Add to parent item stock
  const { data: parentItem } = await (supabase as any)
    .from("items")
    .select("current_stock, standard_cost")
    .eq("id", ao.item_id)
    .single();

  const parentCurrentStock = (parentItem as any)?.current_stock ?? 0;
  const parentCurrentCost = (parentItem as any)?.standard_cost ?? 0;
  const newParentStock = parentCurrentStock + quantityBuilt;
  const costPerUnit = quantityBuilt > 0 ? totalCost / quantityBuilt : 0;
  const newAvgCost =
    newParentStock > 0
      ? (parentCurrentStock * parentCurrentCost + quantityBuilt * costPerUnit) / newParentStock
      : costPerUnit;

  await (supabase as any)
    .from("items")
    .update({ current_stock: newParentStock, standard_cost: Math.round(newAvgCost * 100) / 100 })
    .eq("id", ao.item_id);

  await (supabase as any).from("stock_ledger").insert({
    company_id: companyId,
    item_id: ao.item_id,
    item_code: ao.item_code,
    item_description: ao.item_description,
    transaction_date: today,
    transaction_type: "assembly_output",
    qty_in: quantityBuilt,
    qty_out: 0,
    balance_qty: newParentStock,
    unit_cost: costPerUnit,
    total_value: totalCost,
    reference_type: "assembly_order",
    reference_id: ao.id,
    reference_number: ao.ao_number,
    notes: `Produced by ${ao.ao_number}`,
    created_by: userId,
  });

  // 3. Move serial numbers from 'in_production' → 'in_stock'
  await (supabase as any)
    .from("serial_numbers")
    .update({ status: "in_stock", updated_at: new Date().toISOString() })
    .eq("assembly_order_id", id)
    .eq("status", "in_production");

  // 4. Move draft FAT certificates → 'pending'
  await (supabase as any)
    .from("fat_certificates")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("assembly_order_id", id)
    .eq("status", "draft");

  // 5. Mark AO completed
  await (supabase as any)
    .from("assembly_orders")
    .update({
      status: "completed",
      quantity_built: quantityBuilt,
      backflushed: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  const summary = `Production run completed — built ${quantityBuilt} unit(s) of ${ao.item_description ?? ao.item_code} at ₹${Math.round(costPerUnit).toLocaleString("en-IN")}/unit`;
  logAudit("assembly_order", id, "Production Run Completed", {
    summary,
    quantity_built: quantityBuilt,
    cost_per_unit: Math.round(costPerUnit * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
  }).catch(console.error);
}

export async function cancelAssemblyOrder(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("assembly_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  logAudit("assembly_order", id, "Production Run Cancelled", {
    summary: "Production Run cancelled",
  }).catch(console.error);
}

export async function fetchAssemblyOrderStats() {
  const { data, error } = await (supabase as any)
    .from("assembly_orders")
    .select("id, status, completed_at");
  if (error) throw error;
  const all = (data ?? []) as any[];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return {
    active: all.filter((a) => a.status === "in_progress").length,
    draft: all.filter((a) => a.status === "draft").length,
    completedThisMonth: all.filter(
      (a) => a.status === "completed" && a.completed_at >= monthStart
    ).length,
    total: all.length,
  };
}

// ============================================================
// BOM Lines
// ============================================================

export async function fetchBomLines(parentItemId: string): Promise<BomLine[]> {
  const { data, error } = await (supabase as any)
    .from("bom_lines")
    .select("*")
    .eq("parent_item_id", parentItemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const childIds = (data as any[]).map((l) => l.child_item_id);
  const { data: childItems } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type, unit, current_stock, standard_cost")
    .in("id", childIds);

  const itemMap = new Map(((childItems ?? []) as any[]).map((i) => [i.id, i]));

  return (data as any[]).map((bl) => {
    const child = itemMap.get(bl.child_item_id) as any;
    return {
      ...bl,
      child_item_code: child?.item_code ?? null,
      child_item_description: child?.description ?? null,
      child_item_type: child?.item_type ?? null,
      child_current_stock: child?.current_stock ?? 0,
      child_standard_cost: child?.standard_cost ?? 0,
      child_unit: child?.unit ?? bl.unit ?? null,
    };
  }) as BomLine[];
}

export async function createBomLine(data: {
  parent_item_id: string;
  child_item_id: string;
  quantity: number;
  unit?: string;
  bom_level?: number;
  notes?: string;
}): Promise<BomLine> {
  const companyId = await getCompanyId();
  const { data: bl, error } = await (supabase as any)
    .from("bom_lines")
    .insert({
      company_id: companyId,
      parent_item_id: data.parent_item_id,
      child_item_id: data.child_item_id,
      quantity: data.quantity,
      unit: data.unit ?? null,
      bom_level: data.bom_level ?? 1,
      notes: data.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return bl as BomLine;
}

export async function updateBomLine(
  id: string,
  data: Partial<BomLine>
): Promise<BomLine> {
  const { data: bl, error } = await (supabase as any)
    .from("bom_lines")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return bl as BomLine;
}

export async function deleteBomLine(id: string): Promise<void> {
  const { error } = await (supabase as any).from("bom_lines").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// Stock Ledger
// ============================================================

export async function fetchStockLedger(filters: StockLedgerFilters = {}) {
  const { item_id, transaction_type, date_from, date_to, stock_state, page = 1, pageSize = 50 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("stock_ledger")
    .select("*", { count: "exact" })
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (item_id) query = query.eq("item_id", item_id);
  if (transaction_type && transaction_type !== "all")
    query = query.eq("transaction_type", transaction_type);
  if (date_from) query = query.gte("transaction_date", date_from);
  if (date_to) query = query.lte("transaction_date", date_to);
  if (stock_state && stock_state !== "all") {
    if (stock_state === "in") query = query.not("to_state", "is", null);
    else if (stock_state === "out") query = query.not("from_state", "is", null);
    else query = query.or(`from_state.eq.${stock_state},to_state.eq.${stock_state}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as StockLedgerEntry[], count: count ?? 0 };
}

export async function addStockLedgerEntry(
  data: Omit<StockLedgerEntry, "id" | "company_id" | "created_at">
): Promise<void> {
  const companyId = await getCompanyId();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await (supabase as any).from("stock_ledger").insert({
    ...data,
    company_id: companyId,
    created_by: data.created_by ?? user?.id ?? null,
  });
  if (error) console.error("Stock ledger insert error:", error);
}

// ============================================================
// Serial Numbers
// ============================================================

export async function fetchSerialNumbers(filters: SerialNumberFilters = {}) {
  const { item_id, status, search } = filters;

  let query = (supabase as any)
    .from("serial_numbers")
    .select("*")
    .order("created_at", { ascending: false });

  if (item_id) query = query.eq("item_id", item_id);
  if (status && status !== "all") query = query.eq("status", status);

  if (search?.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(
        `serial_number.ilike.${term},item_code.ilike.${term},customer_name.ilike.${term}`
      );
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SerialNumber[];
}

export async function fetchSerialNumber(id: string): Promise<SerialNumber> {
  const { data, error } = await (supabase as any)
    .from("serial_numbers")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as SerialNumber;
}

export interface AssemblyOrderWithLines extends AssemblyOrder {
  lines: AssemblyOrderLine[];
}

/** Fetch all in-progress assembly orders with their component lines (2 queries, no N+1). */
export async function fetchInProgressAOsWithLines(): Promise<AssemblyOrderWithLines[]> {
  const companyId = await getCompanyId();

  const { data: aos, error: aoError } = await (supabase as any)
    .from("assembly_orders")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false });
  if (aoError) throw aoError;
  if (!aos || aos.length === 0) return [];

  const aoIds = (aos as AssemblyOrder[]).map((ao) => ao.id);

  const { data: lines, error: linesError } = await (supabase as any)
    .from("assembly_order_lines")
    .select("*")
    .eq("company_id", companyId)
    .in("assembly_order_id", aoIds);
  if (linesError) throw linesError;

  const linesByAo: Record<string, AssemblyOrderLine[]> = {};
  for (const line of (lines || []) as AssemblyOrderLine[]) {
    if (!linesByAo[line.assembly_order_id]) linesByAo[line.assembly_order_id] = [];
    linesByAo[line.assembly_order_id].push(line);
  }

  return (aos as AssemblyOrder[]).map((ao) => ({
    ...ao,
    lines: linesByAo[ao.id] || [],
  }));
}

export async function updateSerialNumber(
  id: string,
  data: Partial<SerialNumber>
): Promise<SerialNumber> {
  const { data: sn, error } = await (supabase as any)
    .from("serial_numbers")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return sn as SerialNumber;
}

