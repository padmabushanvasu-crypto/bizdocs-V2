import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// ============================================================
// Interfaces
// ============================================================

export interface BomVariant {
  id: string;
  company_id: string;
  item_id: string;
  variant_name: string;
  variant_code: string | null;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  variant_id: string | null;
  is_critical: boolean;
  scrap_factor: number;
  reference_designator: string | null;
  drawing_number: string | null;
  make_or_buy: "make" | "buy";
  lead_time_days: number;
  created_at: string;
  updated_at: string;
  // Joined child item fields
  child_item_code?: string | null;
  child_item_description?: string | null;
  child_item_type?: string | null;
  child_current_stock?: number;
  child_standard_cost?: number;
  child_unit?: string | null;
  child_drawing_revision?: string | null;
}

export interface BomProcessStep {
  id: string;
  company_id: string;
  bom_line_id: string;
  step_order: number;
  step_type: "internal" | "external";
  process_name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  lead_time_days: number;
  notes: string | null;
  created_at: string;
}

export interface BomNode {
  id: string;
  item_id: string;
  item_code: string;
  item_description: string;
  item_type: string;
  unit: string;
  level: number;
  bom_line_id: string;
  qty_per_parent: number;
  total_qty: number;
  scrap_factor: number;
  effective_qty: number;
  unit_cost: number;
  extended_cost: number;
  total_cost: number;
  current_stock: number;
  is_sufficient: boolean;
  is_critical: boolean;
  drawing_number: string | null;
  children: BomNode[];
  has_children: boolean;
}

export interface BomExplosion {
  item_id: string;
  item_code: string;
  item_description: string;
  quantity: number;
  children: BomNode[];
  total_cost: number;
  raw_material_cost: number;
  bought_out_cost: number;
  job_work_cost: number;
}

export interface BomCostItem {
  item_id: string;
  item_code: string;
  description: string;
  item_type: string;
  level: number;
  qty_required: number;
  unit: string;
  unit_cost: number;
  extended_cost: number;
}

export interface BomCostRollup {
  raw_material_cost: number;
  job_work_cost: number;
  bought_out_cost: number;
  consumable_cost: number;
  total_material_cost: number;
  cost_per_unit: number;
  quantity: number;
  line_items: BomCostItem[];
}

export interface WhereUsedResult {
  parent_item_id: string;
  parent_item_code: string;
  parent_item_description: string;
  parent_item_type: string;
  quantity_used: number;
  unit: string;
  variant_id: string | null;
  variant_name: string | null;
  bom_level: number;
  path: string[];
  bom_line_id: string;
  parent_current_stock: number;
}

export interface BomVariantCompare {
  variant_1: { id: string; name: string; lines: BomLine[] };
  variant_2: { id: string; name: string; lines: BomLine[] };
  only_in_v1: BomLine[];
  only_in_v2: BomLine[];
  different_qty: { line_v1: BomLine; line_v2: BomLine }[];
  same_in_both: BomLine[];
}

// ============================================================
// BOM Variants
// ============================================================

export async function fetchBomVariants(itemId: string): Promise<BomVariant[]> {
  const { data, error } = await (supabase as any)
    .from("bom_variants")
    .select("*")
    .eq("item_id", itemId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BomVariant[];
}

export async function createBomVariant(data: {
  item_id: string;
  variant_name: string;
  variant_code?: string;
  description?: string;
  is_default?: boolean;
  notes?: string;
  // undefined = start fresh, null = copy from base BOM, uuid string = copy from that variant
  copy_from_variant_id?: string | null;
}): Promise<BomVariant> {
  const companyId = await getCompanyId();

  const { data: variant, error } = await (supabase as any)
    .from("bom_variants")
    .insert({
      company_id: companyId,
      item_id: data.item_id,
      variant_name: data.variant_name,
      variant_code: data.variant_code ?? null,
      description: data.description ?? null,
      is_default: data.is_default ?? false,
      notes: data.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const created = variant as BomVariant;

  // If copy_from_variant_id is provided, duplicate bom_lines from the source
  if ("copy_from_variant_id" in data) {
    let sourceQuery = (supabase as any)
      .from("bom_lines")
      .select("*")
      .eq("parent_item_id", data.item_id);

    if (data.copy_from_variant_id === null) {
      sourceQuery = sourceQuery.is("variant_id", null);
    } else {
      sourceQuery = sourceQuery.eq("variant_id", data.copy_from_variant_id);
    }

    const { data: sourceLines } = await sourceQuery;

    if (sourceLines && sourceLines.length > 0) {
      const newLines = (sourceLines as any[]).map((l: any) => ({
        company_id: companyId,
        parent_item_id: l.parent_item_id,
        child_item_id: l.child_item_id,
        quantity: l.quantity,
        unit: l.unit,
        bom_level: l.bom_level ?? 1,
        notes: l.notes,
        variant_id: created.id,
        is_critical: l.is_critical ?? false,
        scrap_factor: l.scrap_factor ?? 0,
        reference_designator: l.reference_designator,
        drawing_number: l.drawing_number,
      }));
      await (supabase as any).from("bom_lines").insert(newLines);
    }
  }

  // If is_default, clear others
  if (data.is_default) {
    await (supabase as any)
      .from("bom_variants")
      .update({ is_default: false })
      .eq("item_id", data.item_id)
      .neq("id", created.id);
  }

  return created;
}

export async function updateBomVariant(id: string, data: Partial<BomVariant>): Promise<BomVariant> {
  const { data: variant, error } = await (supabase as any)
    .from("bom_variants")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return variant as BomVariant;
}

export async function deleteBomVariant(id: string): Promise<void> {
  const { data: lines } = await (supabase as any)
    .from("bom_lines")
    .select("id")
    .eq("variant_id", id)
    .limit(1);
  if (lines && lines.length > 0) {
    throw new Error("Cannot delete variant with BOM lines. Remove all lines first.");
  }
  const { error } = await (supabase as any).from("bom_variants").delete().eq("id", id);
  if (error) throw error;
}

export async function setDefaultVariant(itemId: string, variantId: string): Promise<void> {
  await (supabase as any)
    .from("bom_variants")
    .update({ is_default: false })
    .eq("item_id", itemId);
  const { error } = await (supabase as any)
    .from("bom_variants")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", variantId);
  if (error) throw error;
}

// ============================================================
// BOM Lines (enhanced — replaces assembly-orders-api versions)
// ============================================================

export async function fetchBomLines(
  parentItemId: string,
  variantId?: string | null
): Promise<BomLine[]> {
  const companyId = await getCompanyId();
  let query = (supabase as any)
    .from("bom_lines")
    .select("*")
    .eq("company_id", companyId)
    .eq("parent_item_id", parentItemId)
    .order("created_at", { ascending: true });

  // variantId undefined → default BOM (IS NULL); null → also default; string → specific variant
  if (typeof variantId === "string" && variantId !== "") {
    query = query.eq("variant_id", variantId);
  } else {
    query = query.is("variant_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const childIds = (data as any[]).map((l: any) => l.child_item_id);
  const { data: childItems } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type, unit, current_stock, standard_cost, drawing_number, drawing_revision")
    .in("id", childIds);

  const itemMap = new Map(((childItems ?? []) as any[]).map((i: any) => [i.id, i]));

  return (data as any[]).map((bl: any) => {
    const child = itemMap.get(bl.child_item_id) as any;
    return {
      ...bl,
      child_item_code: child?.item_code ?? null,
      child_item_description: child?.description ?? null,
      child_item_type: child?.item_type ?? null,
      child_current_stock: child?.current_stock ?? 0,
      child_standard_cost: child?.standard_cost ?? 0,
      child_unit: child?.unit ?? bl.unit ?? null,
      child_drawing_revision: child?.drawing_revision ?? null,
      is_critical: bl.is_critical ?? false,
      scrap_factor: bl.scrap_factor ?? 0,
      reference_designator: bl.reference_designator ?? null,
      drawing_number: bl.drawing_number ?? child?.drawing_number ?? null,
      make_or_buy: (bl.make_or_buy ?? "make") as "make" | "buy",
      lead_time_days: bl.lead_time_days ?? 0,
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
  variant_id?: string | null;
  is_critical?: boolean;
  scrap_factor?: number;
  reference_designator?: string;
  drawing_number?: string;
  make_or_buy?: "make" | "buy";
  lead_time_days?: number;
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
      variant_id: data.variant_id ?? null,
      is_critical: data.is_critical ?? false,
      scrap_factor: data.scrap_factor ?? 0,
      reference_designator: data.reference_designator ?? null,
      drawing_number: data.drawing_number ?? null,
      make_or_buy: data.make_or_buy ?? "make",
      lead_time_days: data.lead_time_days ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return bl as BomLine;
}

export async function updateBomLine(id: string, data: Partial<BomLine>): Promise<BomLine> {
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

export async function bulkDeleteBomLines(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await (supabase as any).from("bom_lines").delete().in("id", ids);
  if (error) throw error;
}

// ============================================================
// BOM Line Vendors
// ============================================================

export interface BomLineVendor {
  id: string;
  company_id: string;
  bom_line_id: string;
  vendor_id: string | null;
  vendor_name: string;
  vendor_code: string | null;
  unit_price: number | null;
  lead_time_days: number | null;
  min_order_qty: number | null;
  currency: string;
  is_preferred: boolean;
  preference_order: number;
  notes: string | null;
  vendor_type?: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchBomLineVendors(bomLineId: string): Promise<BomLineVendor[]> {
  const { data, error } = await (supabase as any)
    .from("bom_line_vendors")
    .select("*")
    .eq("bom_line_id", bomLineId)
    .order("preference_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  const vendors = (data ?? []) as any[];
  const vendorIds = [...new Set(vendors.map((v: any) => v.vendor_id).filter(Boolean) as string[])];
  if (vendorIds.length > 0) {
    const { data: partyData } = await (supabase as any).from("parties").select("id, vendor_type").in("id", vendorIds);
    const typeMap = new Map(((partyData ?? []) as any[]).map((p: any) => [p.id as string, p.vendor_type as string | null]));
    return vendors.map((v: any) => ({ ...v, vendor_type: v.vendor_id ? (typeMap.get(v.vendor_id) ?? null) : null })) as BomLineVendor[];
  }
  return vendors as BomLineVendor[];
}

export async function fetchBomLineVendorsBatch(lineIds: string[]): Promise<BomLineVendor[]> {
  if (!lineIds.length) return [];
  const { data, error } = await (supabase as any)
    .from("bom_line_vendors")
    .select("*")
    .in("bom_line_id", lineIds)
    .order("preference_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  const vendors = (data ?? []) as any[];
  const vendorIds = [...new Set(vendors.map((v: any) => v.vendor_id).filter(Boolean) as string[])];
  if (vendorIds.length > 0) {
    const { data: partyData } = await (supabase as any).from("parties").select("id, vendor_type").in("id", vendorIds);
    const typeMap = new Map(((partyData ?? []) as any[]).map((p: any) => [p.id as string, p.vendor_type as string | null]));
    return vendors.map((v: any) => ({ ...v, vendor_type: v.vendor_id ? (typeMap.get(v.vendor_id) ?? null) : null })) as BomLineVendor[];
  }
  return vendors as BomLineVendor[];
}

export async function addBomLineVendor(data: {
  bom_line_id: string;
  vendor_id?: string | null;
  vendor_name: string;
  vendor_code?: string | null;
  unit_price?: number | null;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  is_preferred?: boolean;
  preference_order?: number;
  notes?: string | null;
}): Promise<BomLineVendor> {
  const companyId = await getCompanyId();

  // Count existing vendors to auto-assign preference_order
  const { data: existing } = await (supabase as any)
    .from("bom_line_vendors")
    .select("id, preference_order")
    .eq("bom_line_id", data.bom_line_id);
  const existingCount = (existing ?? []).length;
  const nextOrder = data.preference_order ?? existingCount + 1;

  // First vendor for this line auto-gets is_preferred
  const isFirst = existingCount === 0;
  const isPreferred = isFirst ? true : (data.is_preferred ?? false);

  if (isPreferred && !isFirst) {
    await (supabase as any)
      .from("bom_line_vendors")
      .update({ is_preferred: false })
      .eq("bom_line_id", data.bom_line_id);
  }

  const { data: v, error } = await (supabase as any)
    .from("bom_line_vendors")
    .insert({
      company_id: companyId,
      bom_line_id: data.bom_line_id,
      vendor_id: data.vendor_id ?? null,
      vendor_name: data.vendor_name,
      vendor_code: data.vendor_code ?? null,
      unit_price: data.unit_price ?? null,
      lead_time_days: data.lead_time_days ?? null,
      min_order_qty: data.min_order_qty ?? null,
      currency: "INR",
      is_preferred: isPreferred,
      preference_order: nextOrder,
      notes: data.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return v as BomLineVendor;
}

export async function updateBomLineVendor(id: string, data: Partial<BomLineVendor> & { bom_line_id?: string }): Promise<BomLineVendor> {
  if (data.is_preferred && data.bom_line_id) {
    await (supabase as any)
      .from("bom_line_vendors")
      .update({ is_preferred: false })
      .eq("bom_line_id", data.bom_line_id)
      .neq("id", id);
  }
  const { data: v, error } = await (supabase as any)
    .from("bom_line_vendors")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return v as BomLineVendor;
}

export async function removeBomLineVendor(id: string): Promise<void> {
  const { error } = await (supabase as any).from("bom_line_vendors").delete().eq("id", id);
  if (error) throw error;
}

/** Swap preference_order between two vendors — used for up/down reorder buttons. */
export async function swapBomLineVendorOrder(idA: string, orderA: number, idB: string, orderB: number): Promise<void> {
  await Promise.all([
    (supabase as any).from("bom_line_vendors").update({ preference_order: orderB }).eq("id", idA),
    (supabase as any).from("bom_line_vendors").update({ preference_order: orderA }).eq("id", idB),
  ]);
}

// ============================================================
// BOM Explosion (multi-level recursive)
// ============================================================

async function _explodeLevel(
  itemId: string,
  parentQty: number,
  level: number,
  maxDepth: number,
  visited: Set<string>
): Promise<BomNode[]> {
  if (level > maxDepth || visited.has(itemId)) return [];

  const newVisited = new Set(visited);
  newVisited.add(itemId);

  // Children always use the default BOM (no variant propagation down the tree)
  const { data: lines } = await (supabase as any)
    .from("bom_lines")
    .select("*")
    .eq("parent_item_id", itemId)
    .is("variant_id", null)
    .order("created_at", { ascending: true });

  if (!lines || lines.length === 0) return [];

  const childIds = (lines as any[]).map((l: any) => l.child_item_id);
  const { data: childItems } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type, unit, current_stock, standard_cost, drawing_number")
    .in("id", childIds);

  const itemMap = new Map(((childItems ?? []) as any[]).map((i: any) => [i.id, i]));
  const nodes: BomNode[] = [];

  for (const line of lines as any[]) {
    const child = itemMap.get(line.child_item_id) as any;
    const scrapFactor = line.scrap_factor ?? 0;
    const totalQty = (line.quantity ?? 1) * parentQty;
    const effectiveQty = totalQty * (1 + scrapFactor / 100);
    const unitCost = child?.standard_cost ?? 0;
    const childType = child?.item_type ?? "raw_material";

    let children: BomNode[] = [];
    if (
      ["component", "sub_assembly"].includes(childType) &&
      level < maxDepth &&
      !newVisited.has(line.child_item_id)
    ) {
      children = await _explodeLevel(
        line.child_item_id,
        effectiveQty,
        level + 1,
        maxDepth,
        newVisited
      );
    }

    const extendedCost = effectiveQty * unitCost;
    const childrenCost = children.reduce((s, c) => s + c.total_cost, 0);
    const totalCost = children.length > 0 ? childrenCost : extendedCost;

    nodes.push({
      id: `${line.id}_lvl${level}`,
      item_id: line.child_item_id,
      item_code: child?.item_code ?? "—",
      item_description: child?.description ?? "—",
      item_type: childType,
      unit: line.unit ?? child?.unit ?? "",
      level,
      bom_line_id: line.id,
      qty_per_parent: line.quantity ?? 1,
      total_qty: totalQty,
      scrap_factor: scrapFactor,
      effective_qty: effectiveQty,
      unit_cost: unitCost,
      extended_cost: extendedCost,
      total_cost: totalCost,
      current_stock: child?.current_stock ?? 0,
      is_sufficient: (child?.current_stock ?? 0) >= effectiveQty,
      is_critical: line.is_critical ?? false,
      drawing_number: line.drawing_number ?? child?.drawing_number ?? null,
      children,
      has_children: children.length > 0,
    });
  }

  return nodes;
}

export async function explodeBom(
  itemId: string,
  quantity: number = 1,
  variantId?: string | null
): Promise<BomExplosion> {
  const { data: rootItem } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type")
    .eq("id", itemId)
    .single();

  const root = rootItem as any;

  // Fetch top-level lines with variant filter
  let topQuery = (supabase as any)
    .from("bom_lines")
    .select("*")
    .eq("parent_item_id", itemId)
    .order("created_at", { ascending: true });

  if (typeof variantId === "string" && variantId !== "") {
    topQuery = topQuery.eq("variant_id", variantId);
  } else {
    topQuery = topQuery.is("variant_id", null);
  }

  const { data: topLines } = await topQuery;

  if (!topLines || topLines.length === 0) {
    return {
      item_id: itemId,
      item_code: root?.item_code ?? "—",
      item_description: root?.description ?? "—",
      quantity,
      children: [],
      total_cost: 0,
      raw_material_cost: 0,
      bought_out_cost: 0,
      job_work_cost: 0,
    };
  }

  const childIds = (topLines as any[]).map((l: any) => l.child_item_id);
  const { data: childItems } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type, unit, current_stock, standard_cost, drawing_number")
    .in("id", childIds);

  const itemMap = new Map(((childItems ?? []) as any[]).map((i: any) => [i.id, i]));
  const visited = new Set<string>([itemId]);
  const topChildren: BomNode[] = [];

  for (const line of topLines as any[]) {
    const child = itemMap.get(line.child_item_id) as any;
    const scrapFactor = line.scrap_factor ?? 0;
    const totalQty = (line.quantity ?? 1) * quantity;
    const effectiveQty = totalQty * (1 + scrapFactor / 100);
    const unitCost = child?.standard_cost ?? 0;
    const childType = child?.item_type ?? "raw_material";

    let children: BomNode[] = [];
    if (["component", "sub_assembly"].includes(childType) && !visited.has(line.child_item_id)) {
      children = await _explodeLevel(line.child_item_id, effectiveQty, 2, 5, visited);
    }

    const extendedCost = effectiveQty * unitCost;
    const childrenCost = children.reduce((s, c) => s + c.total_cost, 0);
    const totalCost = children.length > 0 ? childrenCost : extendedCost;

    topChildren.push({
      id: `${line.id}_lvl1`,
      item_id: line.child_item_id,
      item_code: child?.item_code ?? "—",
      item_description: child?.description ?? "—",
      item_type: childType,
      unit: line.unit ?? child?.unit ?? "",
      level: 1,
      bom_line_id: line.id,
      qty_per_parent: line.quantity ?? 1,
      total_qty: totalQty,
      scrap_factor: scrapFactor,
      effective_qty: effectiveQty,
      unit_cost: unitCost,
      extended_cost: extendedCost,
      total_cost: totalCost,
      current_stock: child?.current_stock ?? 0,
      is_sufficient: (child?.current_stock ?? 0) >= effectiveQty,
      is_critical: line.is_critical ?? false,
      drawing_number: line.drawing_number ?? child?.drawing_number ?? null,
      children,
      has_children: children.length > 0,
    });
  }

  function sumLeafsByType(nodes: BomNode[], type: string): number {
    let sum = 0;
    for (const n of nodes) {
      if (n.children.length === 0) {
        if (n.item_type === type) sum += n.extended_cost;
      } else {
        sum += sumLeafsByType(n.children, type);
      }
    }
    return sum;
  }

  const total_cost = topChildren.reduce((s, c) => s + c.total_cost, 0);

  return {
    item_id: itemId,
    item_code: root?.item_code ?? "—",
    item_description: root?.description ?? "—",
    quantity,
    children: topChildren,
    total_cost,
    raw_material_cost: sumLeafsByType(topChildren, "raw_material"),
    bought_out_cost: sumLeafsByType(topChildren, "bought_out"),
    job_work_cost: sumLeafsByType(topChildren, "service"),
  };
}

// ============================================================
// Cost Rollup
// ============================================================

function _collectLeaves(nodes: BomNode[]): BomCostItem[] {
  const leaves: BomCostItem[] = [];
  for (const node of nodes) {
    if (node.children.length === 0) {
      leaves.push({
        item_id: node.item_id,
        item_code: node.item_code,
        description: node.item_description,
        item_type: node.item_type,
        level: node.level,
        qty_required: node.effective_qty,
        unit: node.unit,
        unit_cost: node.unit_cost,
        extended_cost: node.extended_cost,
      });
    } else {
      leaves.push(..._collectLeaves(node.children));
    }
  }
  return leaves;
}

export async function calculateBomCost(
  itemId: string,
  quantity: number = 1,
  variantId?: string | null
): Promise<BomCostRollup> {
  const explosion = await explodeBom(itemId, quantity, variantId);
  const leaves = _collectLeaves(explosion.children);

  const raw_material_cost = leaves
    .filter((l) => l.item_type === "raw_material")
    .reduce((s, l) => s + l.extended_cost, 0);

  const bought_out_cost = leaves
    .filter((l) => l.item_type === "bought_out")
    .reduce((s, l) => s + l.extended_cost, 0);

  const job_work_cost = leaves
    .filter((l) => l.item_type === "service")
    .reduce((s, l) => s + l.extended_cost, 0);

  const consumable_cost = leaves
    .filter((l) => l.item_type === "consumable")
    .reduce((s, l) => s + l.extended_cost, 0);

  const total_material_cost = leaves.reduce((s, l) => s + l.extended_cost, 0);

  return {
    raw_material_cost,
    job_work_cost,
    bought_out_cost,
    consumable_cost,
    total_material_cost,
    cost_per_unit: quantity > 0 ? total_material_cost / quantity : 0,
    quantity,
    line_items: leaves,
  };
}

// ============================================================
// Where Used
// ============================================================

export async function fetchWhereUsed(itemId: string): Promise<WhereUsedResult[]> {
  const { data: directLines } = await (supabase as any)
    .from("bom_lines")
    .select("*")
    .eq("child_item_id", itemId);

  if (!directLines || directLines.length === 0) return [];

  const parentIds = [
    ...new Set((directLines as any[]).map((l: any) => l.parent_item_id)),
  ];
  const variantIds = [
    ...new Set(
      (directLines as any[])
        .map((l: any) => l.variant_id)
        .filter(Boolean) as string[]
    ),
  ];

  const { data: parentItems } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type, current_stock")
    .in("id", parentIds);

  const parentMap = new Map(((parentItems ?? []) as any[]).map((i: any) => [i.id, i]));

  let variantMap = new Map<string, string>();
  if (variantIds.length > 0) {
    const { data: variants } = await (supabase as any)
      .from("bom_variants")
      .select("id, variant_name")
      .in("id", variantIds);
    variantMap = new Map(((variants ?? []) as any[]).map((v: any) => [v.id, v.variant_name]));
  }

  return (directLines as any[]).map((line: any) => {
    const parent = parentMap.get(line.parent_item_id) as any;
    return {
      parent_item_id: line.parent_item_id,
      parent_item_code: parent?.item_code ?? "—",
      parent_item_description: parent?.description ?? "—",
      parent_item_type: parent?.item_type ?? "—",
      quantity_used: line.quantity ?? 0,
      unit: line.unit ?? "",
      variant_id: line.variant_id ?? null,
      variant_name: line.variant_id ? (variantMap.get(line.variant_id) ?? null) : null,
      bom_level: line.bom_level ?? 1,
      path: [parent?.description ?? "—"],
      bom_line_id: line.id as string,
      parent_current_stock: parent?.current_stock ?? 0,
    };
  });
}

// ============================================================
// Compare Variants
// ============================================================

export async function compareBomVariants(
  itemId: string,
  variantId1: string,
  variantId2: string
): Promise<BomVariantCompare> {
  const [v1Lines, v2Lines, variants] = await Promise.all([
    fetchBomLines(itemId, variantId1),
    fetchBomLines(itemId, variantId2),
    fetchBomVariants(itemId),
  ]);

  const variant1 = variants.find((v) => v.id === variantId1);
  const variant2 = variants.find((v) => v.id === variantId2);

  const v1Map = new Map(v1Lines.map((l) => [l.child_item_id, l]));
  const v2Map = new Map(v2Lines.map((l) => [l.child_item_id, l]));

  const only_in_v1: BomLine[] = [];
  const only_in_v2: BomLine[] = [];
  const different_qty: { line_v1: BomLine; line_v2: BomLine }[] = [];
  const same_in_both: BomLine[] = [];

  for (const [childId, line] of v1Map.entries()) {
    if (!v2Map.has(childId)) {
      only_in_v1.push(line);
    } else {
      const line2 = v2Map.get(childId)!;
      if (Math.abs(line.quantity - line2.quantity) > 0.0001) {
        different_qty.push({ line_v1: line, line_v2: line2 });
      } else {
        same_in_both.push(line);
      }
    }
  }
  for (const [childId, line] of v2Map.entries()) {
    if (!v1Map.has(childId)) {
      only_in_v2.push(line);
    }
  }

  return {
    variant_1: { id: variantId1, name: variant1?.variant_name ?? "Variant 1", lines: v1Lines },
    variant_2: { id: variantId2, name: variant2?.variant_name ?? "Variant 2", lines: v2Lines },
    only_in_v1,
    only_in_v2,
    different_qty,
    same_in_both,
  };
}

// ============================================================
// BOM Summary
// ============================================================

export async function fetchBomSummary(itemId: string): Promise<{
  total_components: number;
  total_levels: number;
  total_cost: number;
  has_variants: boolean;
  variant_count: number;
}> {
  try {
    const [explosion, variants] = await Promise.all([
      explodeBom(itemId, 1),
      fetchBomVariants(itemId),
    ]);

    function maxLevel(nodes: BomNode[]): number {
      if (nodes.length === 0) return 0;
      return Math.max(...nodes.map((n) => Math.max(n.level, maxLevel(n.children))));
    }
    function countAll(nodes: BomNode[]): number {
      return nodes.reduce((s, n) => s + 1 + countAll(n.children), 0);
    }

    return {
      total_components: countAll(explosion.children),
      total_levels: maxLevel(explosion.children),
      total_cost: explosion.total_cost,
      has_variants: variants.length > 0,
      variant_count: variants.length,
    };
  } catch {
    return {
      total_components: 0,
      total_levels: 0,
      total_cost: 0,
      has_variants: false,
      variant_count: 0,
    };
  }
}

// ============================================================
// BOM Process Steps
// ============================================================

export async function fetchBomProcessSteps(bom_line_id: string): Promise<BomProcessStep[]> {
  const { data, error } = await (supabase as any)
    .from("bom_process_steps")
    .select("*")
    .eq("bom_line_id", bom_line_id)
    .order("step_order", { ascending: true });
  if (error) return [];
  return (data ?? []) as BomProcessStep[];
}

export async function fetchBomProcessStepsBatch(lineIds: string[]): Promise<BomProcessStep[]> {
  if (!lineIds.length) return [];
  const { data, error } = await (supabase as any)
    .from("bom_process_steps")
    .select("*")
    .in("bom_line_id", lineIds)
    .order("step_order", { ascending: true });
  if (error) return [];
  return (data ?? []) as BomProcessStep[];
}

export async function addBomProcessStep(data: {
  bom_line_id: string;
  step_order?: number;
  step_type: "internal" | "external";
  process_name: string;
  vendor_id?: string | null;
  vendor_name?: string | null;
  lead_time_days?: number;
  notes?: string | null;
}): Promise<BomProcessStep> {
  const companyId = await getCompanyId();
  let stepOrder = data.step_order;
  if (stepOrder === undefined) {
    const { data: existing } = await (supabase as any)
      .from("bom_process_steps")
      .select("step_order")
      .eq("bom_line_id", data.bom_line_id)
      .order("step_order", { ascending: false })
      .limit(1);
    stepOrder = existing && existing.length > 0 ? existing[0].step_order + 1 : 1;
  }
  const { data: step, error } = await (supabase as any)
    .from("bom_process_steps")
    .insert({
      company_id: companyId,
      bom_line_id: data.bom_line_id,
      step_order: stepOrder,
      step_type: data.step_type,
      process_name: data.process_name,
      vendor_id: data.vendor_id ?? null,
      vendor_name: data.vendor_name ?? null,
      lead_time_days: data.lead_time_days ?? 1,
      notes: data.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return step as BomProcessStep;
}

export async function updateBomProcessStep(id: string, data: Partial<BomProcessStep>): Promise<BomProcessStep> {
  const { data: step, error } = await (supabase as any)
    .from("bom_process_steps")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return step as BomProcessStep;
}

export async function deleteBomProcessStep(id: string): Promise<void> {
  const { error } = await (supabase as any).from("bom_process_steps").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderBomProcessSteps(bom_line_id: string, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await (supabase as any)
      .from("bom_process_steps")
      .update({ step_order: i + 1 })
      .eq("id", orderedIds[i]);
  }
}

/**
 * Finds the process route for a given item (as parent in its BOM).
 * Returns the steps from the first BOM line that has any process steps, ordered by step_order.
 * Used by Work Order creation to auto-populate job_card_steps.
 */
export async function fetchProcessRouteForItem(
  item_id: string,
  variant_id?: string
): Promise<BomProcessStep[]> {
  let q = (supabase as any)
    .from("bom_lines")
    .select("id")
    .eq("parent_item_id", item_id);

  if (variant_id) {
    q = q.eq("variant_id", variant_id);
  } else {
    q = q.is("variant_id", null);
  }
  q = q.order("created_at", { ascending: true });

  const { data: lines } = await q;
  if (!lines || lines.length === 0) return [];

  const lineIds = (lines as any[]).map((l: any) => l.id);
  const { data: steps } = await (supabase as any)
    .from("bom_process_steps")
    .select("*")
    .in("bom_line_id", lineIds)
    .order("step_order", { ascending: true });

  if (!steps || steps.length === 0) return [];

  // Return steps from the first line that has steps
  for (const lineId of lineIds) {
    const lineSteps = (steps as BomProcessStep[]).filter((s) => s.bom_line_id === lineId);
    if (lineSteps.length > 0) return lineSteps;
  }
  return [];
}
