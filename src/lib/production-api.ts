import { supabase } from "@/integrations/supabase/client";
import { updateStockBucket } from "@/lib/items-api";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";

async function getCompanyId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  return (data as any)?.company_id ?? null;
}

async function getCurrentUserName(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Unknown";
  const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  return (data as any)?.full_name ?? user.email ?? "Unknown";
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface AssemblyWorkOrder {
  id: string;
  company_id: string;
  awo_number: string;
  awo_type: 'sub_assembly' | 'finished_good';
  awo_date: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  quantity_to_build: number;
  bom_variant_id: string | null;
  status: 'draft' | 'pending_materials' | 'in_progress' | 'complete' | 'cancelled';
  serial_number: string | null;
  raised_by: string | null;
  raised_by_user_id: string | null;
  issued_by: string | null;
  issued_by_user_id: string | null;
  planned_date: string | null;
  work_order_ref: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  line_items?: AwoLineItem[];
}

export interface AwoLineItem {
  id: string;
  company_id: string;
  awo_id: string;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  drawing_number: string | null;
  required_qty: number;
  issued_qty: number;
  unit: string;
  is_critical: boolean;
  shortage_qty: number;
  notes: string | null;
  damage_qty?: number;
  damage_reason?: string | null;
  disposition?: 'scrap' | 'use_as_is' | 'return_to_vendor' | null;
  concession_note?: string | null;
  concession_by?: string | null;
  concession_at?: string | null;
  // enriched from items table
  stock_free?: number;
  created_at: string;
}

export interface MaterialIssueRequest {
  id: string;
  company_id: string;
  mir_number: string;
  awo_id: string;
  requested_by: string | null;
  requested_by_user_id: string | null;
  issued_by: string | null;
  issued_by_user_id: string | null;
  status: 'pending' | 'partially_issued' | 'issued' | 'cancelled';
  request_date: string;
  issue_date: string | null;
  notes: string | null;
  created_at: string;
  line_items?: MirLineItem[];
  awo?: AssemblyWorkOrder;
}

export interface MirLineItem {
  id: string;
  company_id: string;
  mir_id: string;
  awo_line_item_id: string | null;
  item_id: string | null;
  item_code: string | null;
  item_description: string | null;
  drawing_number: string | null;
  requested_qty: number;
  issued_qty: number;
  shortage_qty: number;
  shortage_notes: string | null;
  unit: string;
  // enriched
  stock_free?: number;
  created_at: string;
}

// ── fetchAssemblyWorkOrders ───────────────────────────────────────────────────

export async function fetchAssemblyWorkOrders(filters: {
  type?: string;
  status?: string;
  search?: string;
  month?: string;
} = {}): Promise<AssemblyWorkOrder[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  let query = (supabase as any)
    .from("assembly_work_orders")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (filters.type) {
    query = query.eq("awo_type", filters.type);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.search) {
    query = query.or(
      `awo_number.ilike.%${filters.search}%,item_description.ilike.%${filters.search}%`
    );
  }
  if (filters.month) {
    const start = `${filters.month}-01`;
    const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0).toISOString().split('T')[0];
    query = query.gte("awo_date", start).lte("awo_date", end);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AssemblyWorkOrder[];
}

// ── fetchAssemblyWorkOrder ────────────────────────────────────────────────────

export async function fetchAssemblyWorkOrder(id: string): Promise<AssemblyWorkOrder | null> {
  const companyId = await getCompanyId();
  if (!companyId) return null;

  const { data: awoData, error: awoError } = await (supabase as any)
    .from("assembly_work_orders")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (awoError) throw awoError;
  if (!awoData) return null;

  const awo = awoData as AssemblyWorkOrder;

  // Fetch line items
  const { data: lineData, error: lineError } = await (supabase as any)
    .from("awo_line_items")
    .select("*")
    .eq("awo_id", id)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (lineError) throw lineError;

  const lineItems = (lineData ?? []) as AwoLineItem[];

  // Enrich with stock_free from items table
  const itemIds = lineItems
    .map((li) => li.item_id)
    .filter((id): id is string => id !== null);

  const stockMap: Record<string, number> = {};
  const itemsInfoMap: Record<string, { item_code: string | null; description: string | null; unit: string | null }> = {};

  if (itemIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("items")
      .select("id, stock_free, item_code, description, unit")
      .in("id", itemIds);

    if (itemsData) {
      for (const item of itemsData as any[]) {
        stockMap[item.id] = item.stock_free ?? 0;
        itemsInfoMap[item.id] = {
          item_code: item.item_code ?? null,
          description: item.description ?? null,
          unit: item.unit ?? null,
        };
      }
    }
  }

  awo.line_items = lineItems.map((li) => ({
    ...li,
    stock_free: li.item_id ? (stockMap[li.item_id] ?? 0) : 0,
    drawing_number: li.item_id ? (itemsInfoMap[li.item_id]?.item_code ?? li.drawing_number ?? null) : li.drawing_number,
    item_description: li.item_description ?? (li.item_id ? (itemsInfoMap[li.item_id]?.description ?? null) : null),
    unit: li.unit || (li.item_id ? (itemsInfoMap[li.item_id]?.unit ?? 'NOS') : 'NOS'),
  }));

  return awo;
}

// ── createAssemblyWorkOrder ───────────────────────────────────────────────────

export async function createAssemblyWorkOrder(data: {
  awo_type: 'sub_assembly' | 'finished_good';
  item_id: string;
  item_code: string;
  item_description: string;
  quantity_to_build: number;
  bom_variant_id?: string;
  planned_date?: string;
  work_order_ref?: string;
  notes?: string;
  serial_number?: string;
}): Promise<string> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const userName = await getCurrentUserName();

  // Insert AWO — trigger will set awo_number
  const { data: awoData, error: awoError } = await (supabase as any)
    .from("assembly_work_orders")
    .insert({
      company_id: companyId,
      awo_number: '',
      awo_type: data.awo_type,
      item_id: data.item_id,
      item_code: data.item_code,
      item_description: data.item_description,
      quantity_to_build: data.quantity_to_build,
      bom_variant_id: data.bom_variant_id ?? null,
      planned_date: data.planned_date ?? null,
      work_order_ref: data.work_order_ref ?? null,
      notes: data.notes ?? null,
      serial_number: data.serial_number ?? null,
      raised_by: userName,
      raised_by_user_id: user.id,
      status: 'draft',
    })
    .select()
    .single();

  if (awoError) throw awoError;
  const awoId = (awoData as AssemblyWorkOrder).id;

  // Load BOM lines
  let bomQuery = (supabase as any)
    .from("bom_lines")
    .select("*")
    .eq("parent_item_id", data.item_id)
    .eq("company_id", companyId)
    .order("bom_level", { ascending: true });

  if (data.bom_variant_id) {
    bomQuery = bomQuery.eq("variant_id", data.bom_variant_id);
  }

  const { data: bomLines, error: bomError } = await bomQuery;
  if (bomError) throw bomError;

  // Insert awo_line_items from BOM lines
  if (bomLines && bomLines.length > 0) {
    const lineInserts = (bomLines as any[]).map((bl) => ({
      company_id: companyId,
      awo_id: awoId,
      item_id: bl.child_item_id ?? null,
      item_code: bl.child_item_code ?? null,
      item_description: bl.child_item_description ?? null,
      drawing_number: bl.drawing_number ?? null,
      required_qty: (bl.quantity ?? 1) * data.quantity_to_build,
      issued_qty: 0,
      unit: bl.unit ?? 'NOS',
      is_critical: bl.is_critical ?? false,
      shortage_qty: 0,
    }));

    const { error: lineError } = await (supabase as any)
      .from("awo_line_items")
      .insert(lineInserts);

    if (lineError) throw lineError;
  }

  return awoId;
}

// ── updateAssemblyWorkOrder ───────────────────────────────────────────────────

export async function updateAssemblyWorkOrder(
  id: string,
  data: Partial<AssemblyWorkOrder>
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const { error } = await (supabase as any)
    .from("assembly_work_orders")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) throw error;
}

// ── cancelAssemblyWorkOrder ───────────────────────────────────────────────────

export async function cancelAssemblyWorkOrder(
  id: string,
  stockAction: 'none' | 'return_all' | 'partial' | 'scrap_all' = 'none',
  partialLines?: Array<{ item_id: string; return_qty: number; scrap_qty: number }>
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  if (stockAction !== 'none') {
    const awo = await fetchAssemblyWorkOrder(id);
    const awoNumber = awo?.awo_number ?? '';
    const issuedLines = (awo?.line_items ?? []).filter(
      (li) => li.item_id && li.issued_qty > 0
    );

    const cancelDate = new Date().toISOString().split('T')[0];

    if (stockAction === 'return_all') {
      for (const li of issuedLines) {
        await updateStockBucket(li.item_id!, 'in_subassembly_wip', -li.issued_qty);
        await updateStockBucket(li.item_id!, 'free', +li.issued_qty);
        try {
          await addStockLedgerEntry({
            item_id: li.item_id!,
            item_code: li.item_code ?? null,
            item_description: li.item_description ?? null,
            transaction_date: cancelDate,
            transaction_type: 'assembly_return',
            qty_in: li.issued_qty,
            qty_out: 0,
            balance_qty: 0,
            unit_cost: 0,
            total_value: 0,
            reference_type: 'assembly_work_order',
            reference_id: id,
            reference_number: awoNumber,
            notes: 'Materials returned — AWO cancelled',
            created_by: null,
          });
        } catch (e) { console.error('[production] return ledger failed:', e); }
      }
    } else if (stockAction === 'scrap_all') {
      for (const li of issuedLines) {
        await updateStockBucket(li.item_id!, 'in_subassembly_wip', -li.issued_qty);
        try {
          await addStockLedgerEntry({
            item_id: li.item_id!,
            item_code: li.item_code ?? null,
            item_description: li.item_description ?? null,
            transaction_date: cancelDate,
            transaction_type: 'scrap_write_off',
            qty_in: 0,
            qty_out: li.issued_qty,
            balance_qty: 0,
            unit_cost: 0,
            total_value: 0,
            reference_type: 'assembly_work_order',
            reference_id: id,
            reference_number: awoNumber,
            notes: 'Materials scrapped — AWO cancelled',
            created_by: null,
          });
        } catch (e) { console.error('[production] scrap ledger failed:', e); }
      }
    } else if (stockAction === 'partial' && partialLines) {
      for (const pl of partialLines) {
        if (pl.return_qty > 0) {
          await updateStockBucket(pl.item_id, 'in_subassembly_wip', -pl.return_qty);
          await updateStockBucket(pl.item_id, 'free', +pl.return_qty);
          try {
            await addStockLedgerEntry({
              item_id: pl.item_id,
              item_code: null,
              item_description: null,
              transaction_date: cancelDate,
              transaction_type: 'assembly_return',
              qty_in: pl.return_qty,
              qty_out: 0,
              balance_qty: 0,
              unit_cost: 0,
              total_value: 0,
              reference_type: 'assembly_work_order',
              reference_id: id,
              reference_number: awoNumber,
              notes: 'Materials returned — AWO cancelled',
              created_by: null,
            });
          } catch (e) { console.error('[production] return ledger failed:', e); }
        }
        if (pl.scrap_qty > 0) {
          await updateStockBucket(pl.item_id, 'in_subassembly_wip', -pl.scrap_qty);
          try {
            await addStockLedgerEntry({
              item_id: pl.item_id,
              item_code: null,
              item_description: null,
              transaction_date: cancelDate,
              transaction_type: 'scrap_write_off',
              qty_in: 0,
              qty_out: pl.scrap_qty,
              balance_qty: 0,
              unit_cost: 0,
              total_value: 0,
              reference_type: 'assembly_work_order',
              reference_id: id,
              reference_number: awoNumber,
              notes: 'Materials scrapped — AWO cancelled',
              created_by: null,
            });
          } catch (e) { console.error('[production] scrap ledger failed:', e); }
        }
      }
    }
  }

  const { error } = await (supabase as any)
    .from("assembly_work_orders")
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) throw error;
}

// ── createMaterialIssueRequest ────────────────────────────────────────────────

export async function createMaterialIssueRequest(awo_id: string): Promise<string> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const userName = await getCurrentUserName();

  // Fetch AWO and its line items
  const awo = await fetchAssemblyWorkOrder(awo_id);
  if (!awo) throw new Error("Work order not found");

  const mirNumber = 'MIR-' + Date.now().toString().slice(-6);

  // Insert MIR
  const { data: mirData, error: mirError } = await (supabase as any)
    .from("material_issue_requests")
    .insert({
      company_id: companyId,
      mir_number: mirNumber,
      awo_id,
      requested_by: userName,
      requested_by_user_id: user.id,
      status: 'pending',
      request_date: new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (mirError) throw mirError;
  const mirId = (mirData as MaterialIssueRequest).id;

  // Insert MIR line items from AWO line items
  if (awo.line_items && awo.line_items.length > 0) {
    const mirLines = awo.line_items.map((li) => ({
      company_id: companyId,
      mir_id: mirId,
      awo_line_item_id: li.id,
      item_id: li.item_id,
      item_code: li.item_code,
      item_description: li.item_description,
      drawing_number: li.drawing_number,
      requested_qty: li.required_qty,
      issued_qty: 0,
      shortage_qty: 0,
      unit: li.unit,
    }));

    const { error: mirLineError } = await (supabase as any)
      .from("mir_line_items")
      .insert(mirLines);

    if (mirLineError) throw mirLineError;
  }

  // Update AWO status to pending_materials
  const { error: updateError } = await (supabase as any)
    .from("assembly_work_orders")
    .update({ status: 'pending_materials', updated_at: new Date().toISOString() })
    .eq("id", awo_id)
    .eq("company_id", companyId);

  if (updateError) throw updateError;

  return mirId;
}

// ── fetchMaterialIssueRequests ────────────────────────────────────────────────

export async function fetchMaterialIssueRequests(filters: {
  status?: string;
  awo_id?: string;
  month?: string;
} = {}): Promise<MaterialIssueRequest[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  let query = (supabase as any)
    .from("material_issue_requests")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.awo_id) {
    query = query.eq("awo_id", filters.awo_id);
  }
  if (filters.month) {
    const start = `${filters.month}-01`;
    const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0).toISOString().split('T')[0];
    query = query.gte("request_date", start).lte("request_date", end);
  }

  const { data, error } = await query;
  if (error) throw error;

  const mirs = (data ?? []) as MaterialIssueRequest[];

  // Enrich with AWO info
  const awoIds = [...new Set(mirs.map((m) => m.awo_id).filter(Boolean))];
  const awoMap: Record<string, AssemblyWorkOrder> = {};

  if (awoIds.length > 0) {
    const { data: awos } = await (supabase as any)
      .from("assembly_work_orders")
      .select("id, awo_number, item_description, quantity_to_build")
      .in("id", awoIds);

    if (awos) {
      for (const awo of awos as AssemblyWorkOrder[]) {
        awoMap[awo.id] = awo;
      }
    }
  }

  return mirs.map((mir) => ({
    ...mir,
    awo: mir.awo_id ? awoMap[mir.awo_id] : undefined,
  }));
}

// ── fetchMaterialIssueRequest ─────────────────────────────────────────────────

export async function fetchMaterialIssueRequest(id: string): Promise<MaterialIssueRequest | null> {
  const companyId = await getCompanyId();
  if (!companyId) return null;

  const { data: mirData, error: mirError } = await (supabase as any)
    .from("material_issue_requests")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (mirError) throw mirError;
  if (!mirData) return null;

  const mir = mirData as MaterialIssueRequest;

  // Fetch line items
  const { data: lineData, error: lineError } = await (supabase as any)
    .from("mir_line_items")
    .select("*")
    .eq("mir_id", id)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (lineError) throw lineError;

  const lineItems = (lineData ?? []) as MirLineItem[];

  // Enrich with stock_free
  const itemIds = lineItems
    .map((li) => li.item_id)
    .filter((iid): iid is string => iid !== null);

  const stockMap: Record<string, number> = {};
  if (itemIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("items")
      .select("id, stock_free")
      .in("id", itemIds);

    if (itemsData) {
      for (const item of itemsData) {
        stockMap[(item as any).id] = (item as any).stock_free ?? 0;
      }
    }
  }

  mir.line_items = lineItems.map((li) => ({
    ...li,
    stock_free: li.item_id ? (stockMap[li.item_id] ?? 0) : 0,
  }));

  // Fetch AWO
  const { data: awoData } = await (supabase as any)
    .from("assembly_work_orders")
    .select("*")
    .eq("id", mir.awo_id)
    .eq("company_id", companyId)
    .single();

  if (awoData) {
    mir.awo = awoData as AssemblyWorkOrder;
  }

  return mir;
}

// ── confirmMaterialIssue ──────────────────────────────────────────────────────

export async function confirmMaterialIssue(
  mir_id: string,
  lineIssues: Array<{ mir_line_item_id: string; issued_qty: number; shortage_notes?: string }>,
  issued_by: string
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fetch MIR with line items
  const mir = await fetchMaterialIssueRequest(mir_id);
  if (!mir) throw new Error("MIR not found");

  // FIX 3A: determine correct WIP bucket from AWO type
  const awoType = mir.awo?.awo_type;
  const wip_bucket = awoType === 'finished_good' ? 'in_fg_wip' : 'in_subassembly_wip';

  let hasShortages = false;

  // Process all line items in parallel to avoid sequential-await timeouts
  await Promise.all(lineIssues.map(async (issue) => {
    const mirLine = mir.line_items?.find((li) => li.id === issue.mir_line_item_id);
    if (!mirLine) return;

    // FIX 3B: accumulate issued_qty instead of overwriting
    const existingMirIssued = mirLine.issued_qty ?? 0;
    const totalMirIssued = existingMirIssued + issue.issued_qty;
    const shortage_qty = Math.max(0, mirLine.requested_qty - totalMirIssued);
    if (shortage_qty > 0) hasShortages = true;

    // Update mir_line_items — accumulated total
    await (supabase as any)
      .from("mir_line_items")
      .update({
        issued_qty: totalMirIssued,
        shortage_qty,
        shortage_notes: issue.shortage_notes ?? null,
      })
      .eq("id", issue.mir_line_item_id)
      .eq("company_id", companyId);

    // Update awo_line_items issued_qty
    if (mirLine.awo_line_item_id) {
      const { data: awoLine } = await (supabase as any)
        .from("awo_line_items")
        .select("issued_qty")
        .eq("id", mirLine.awo_line_item_id)
        .single();

      const currentIssuedQty = (awoLine as any)?.issued_qty ?? 0;

      await (supabase as any)
        .from("awo_line_items")
        .update({ issued_qty: currentIssuedQty + issue.issued_qty })
        .eq("id", mirLine.awo_line_item_id)
        .eq("company_id", companyId);
    }

    // Update stock buckets if item exists and issued_qty > 0
    if (mirLine.item_id && issue.issued_qty > 0) {
      await updateStockBucket(mirLine.item_id, 'free', -issue.issued_qty);
      await updateStockBucket(mirLine.item_id, wip_bucket, +issue.issued_qty);

      try {
        const awoNumber = mir.awo?.awo_number ?? '';
        await addStockLedgerEntry({
          item_id: mirLine.item_id!,
          item_code: mirLine.item_code ?? null,
          item_description: mirLine.item_description ?? null,
          transaction_date: new Date().toISOString().split('T')[0],
          transaction_type: 'assembly_issue',
          qty_in: 0,
          qty_out: issue.issued_qty,
          balance_qty: 0,
          unit_cost: 0,
          total_value: 0,
          reference_type: 'assembly_work_order',
          reference_id: mir.awo_id,
          reference_number: awoNumber,
          notes: `Material issued for AWO #${awoNumber}`,
          created_by: null,
        });
      } catch (e) {
        console.error('[production] ledger write failed for MIR issue:', e);
      }
    }
  }));

  // Update MIR status (partially_issued when shortages exist)
  const mirStatus = hasShortages ? 'partially_issued' : 'issued';
  await (supabase as any)
    .from("material_issue_requests")
    .update({
      status: mirStatus,
      issue_date: new Date().toISOString().split('T')[0],
      issued_by,
      issued_by_user_id: user.id,
    })
    .eq("id", mir_id)
    .eq("company_id", companyId);

  // Update AWO status to in_progress
  const awoUpdate: Record<string, unknown> = {
    status: 'in_progress',
    issued_by,
    issued_by_user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  if (hasShortages) {
    awoUpdate.notes = `Material shortages noted on MIR ${mir.mir_number}. Some items issued partially.`;
  }

  await (supabase as any)
    .from("assembly_work_orders")
    .update(awoUpdate)
    .eq("id", mir.awo_id)
    .eq("company_id", companyId);
}

// ── completeAssemblyWorkOrder ─────────────────────────────────────────────────

export async function completeAssemblyWorkOrder(id: string): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const awo = await fetchAssemblyWorkOrder(id);
  if (!awo) throw new Error("Work order not found");

  // FIX 4: Completion guard — reject if any line is unfulfilled
  const unfulfilledLines = (awo.line_items ?? []).filter((li) => {
    if ((li.issued_qty ?? 0) >= li.required_qty) return false;
    if (li.disposition === 'use_as_is') return false;
    const damageCovered =
      (li.damage_qty ?? 0) > 0 &&
      ((li.issued_qty ?? 0) + (li.damage_qty ?? 0)) >= li.required_qty;
    return !damageCovered;
  });
  if (unfulfilledLines.length > 0) {
    throw new Error(
      `Cannot complete: ${unfulfilledLines.length} component(s) are still short. ` +
      `Issue remaining stock or record a disposition for each short item.`
    );
  }

  const today = new Date().toISOString().split('T')[0];

  if (awo.awo_type === 'sub_assembly') {
    // Consume components from in_subassembly_wip + write consumption ledger entries
    for (const li of awo.line_items ?? []) {
      if (li.item_id && li.issued_qty > 0) {
        const err = await updateStockBucket(li.item_id, 'in_subassembly_wip', -li.issued_qty).catch((e: Error) => e);
        if (err instanceof Error) throw new Error(`Stock update failed for ${li.item_code ?? li.item_id}: ${err.message}`);
        try {
          await addStockLedgerEntry({
            item_id: li.item_id,
            item_code: li.item_code ?? null,
            item_description: li.item_description ?? null,
            transaction_date: today,
            transaction_type: 'assembly_consumption',
            qty_in: 0,
            qty_out: li.issued_qty,
            balance_qty: 0,
            unit_cost: 0,
            total_value: 0,
            reference_type: 'assembly_work_order',
            reference_id: id,
            reference_number: awo.awo_number,
            notes: `Component consumed — AWO #${awo.awo_number} complete`,
            created_by: null,
          });
        } catch (e) { console.error('[production] consumption ledger failed:', e); }
      }
    }

    // Add finished item to free stock + write output ledger entry
    if (awo.item_id) {
      await updateStockBucket(awo.item_id, 'free', +awo.quantity_to_build);
      try {
        await addStockLedgerEntry({
          item_id: awo.item_id,
          item_code: awo.item_code ?? null,
          item_description: awo.item_description ?? null,
          transaction_date: today,
          transaction_type: 'assembly_output',
          qty_in: awo.quantity_to_build,
          qty_out: 0,
          balance_qty: 0,
          unit_cost: 0,
          total_value: 0,
          reference_type: 'assembly_work_order',
          reference_id: id,
          reference_number: awo.awo_number,
          notes: `Assembly complete — AWO #${awo.awo_number}`,
          created_by: null,
        });
      } catch (e) { console.error('[production] output ledger failed:', e); }
    }
  } else if (awo.awo_type === 'finished_good') {
    // Consume components from in_fg_wip + write consumption ledger entries
    for (const li of awo.line_items ?? []) {
      if (li.item_id && li.issued_qty > 0) {
        const err = await updateStockBucket(li.item_id, 'in_fg_wip', -li.issued_qty).catch((e: Error) => e);
        if (err instanceof Error) throw new Error(`Stock update failed for ${li.item_code ?? li.item_id}: ${err.message}`);
        try {
          await addStockLedgerEntry({
            item_id: li.item_id,
            item_code: li.item_code ?? null,
            item_description: li.item_description ?? null,
            transaction_date: today,
            transaction_type: 'assembly_consumption',
            qty_in: 0,
            qty_out: li.issued_qty,
            balance_qty: 0,
            unit_cost: 0,
            total_value: 0,
            reference_type: 'assembly_work_order',
            reference_id: id,
            reference_number: awo.awo_number,
            notes: `Component consumed — AWO #${awo.awo_number} complete`,
            created_by: null,
          });
        } catch (e) { console.error('[production] consumption ledger failed:', e); }
      }
    }

    // Add to in_fg_ready + write output ledger entry
    if (awo.item_id) {
      await updateStockBucket(awo.item_id, 'in_fg_ready', +awo.quantity_to_build);
      try {
        await addStockLedgerEntry({
          item_id: awo.item_id,
          item_code: awo.item_code ?? null,
          item_description: awo.item_description ?? null,
          transaction_date: today,
          transaction_type: 'assembly_output',
          qty_in: awo.quantity_to_build,
          qty_out: 0,
          balance_qty: 0,
          unit_cost: 0,
          total_value: 0,
          reference_type: 'assembly_work_order',
          reference_id: id,
          reference_number: awo.awo_number,
          notes: `Assembly complete — AWO #${awo.awo_number}`,
          created_by: null,
        });
      } catch (e) { console.error('[production] output ledger failed:', e); }
    }

    // Create or update serial_numbers row
    // awo.item_code and awo.item_description come from the SELECT * on assembly_work_orders
    if (awo.serial_number) {
      try {
        const { data: existingSn } = await (supabase as any)
          .from("serial_numbers")
          .select("id")
          .eq("serial_number", awo.serial_number)
          .eq("company_id", companyId)
          .maybeSingle();

        if (existingSn?.id) {
          // Row exists — update its status
          await (supabase as any)
            .from("serial_numbers")
            .update({ status: 'in_stock' })
            .eq("id", existingSn.id);
        } else {
          // Row missing — insert it now
          const { error: snErr } = await (supabase as any)
            .from("serial_numbers")
            .insert({
              serial_number: awo.serial_number,
              company_id: companyId,
              item_id: awo.item_id ?? null,
              item_code: awo.item_code ?? null,
              item_description: awo.item_description ?? null,
              status: 'in_stock',
            });
          if (snErr) console.error('[production] serial_numbers insert failed:', snErr);
        }
      } catch (e) {
        console.error('[production] serial_numbers upsert failed:', e);
      }
    }
  }

  // Mark AWO complete
  await (supabase as any)
    .from("assembly_work_orders")
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId);
}

// ── reportComponentIssue ─────────────────────────────────────────────────────

export async function reportComponentIssue(
  awo_line_item_id: string,
  damage_qty: number,
  disposition: 'scrap' | 'use_as_is' | 'return_to_vendor',
  reason: string,
  reported_by: string
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const today = new Date().toISOString().split('T')[0];

  // Fetch line item with AWO info
  const { data: awoLine, error: lineError } = await (supabase as any)
    .from("awo_line_items")
    .select("*, assembly_work_orders(awo_number, awo_type)")
    .eq("id", awo_line_item_id)
    .single();

  if (lineError || !awoLine) throw new Error("AWO line item not found");

  const awoType = (awoLine as any).assembly_work_orders?.awo_type;
  const wip_bucket: string = awoType === 'finished_good' ? 'in_fg_wip' : 'in_subassembly_wip';
  const awoNumber: string = (awoLine as any).assembly_work_orders?.awo_number ?? '';

  // Build update payload for awo_line_items
  const updatePayload: Record<string, unknown> = {
    damage_qty,
    damage_reason: reason,
    disposition,
  };
  if (disposition === 'use_as_is') {
    updatePayload.concession_note = reason;
    updatePayload.concession_by = reported_by;
    updatePayload.concession_at = new Date().toISOString();
  }

  const { error: updateError } = await (supabase as any)
    .from("awo_line_items")
    .update(updatePayload)
    .eq("id", awo_line_item_id)
    .eq("company_id", companyId);

  if (updateError) throw updateError;

  if (disposition === 'scrap' && awoLine.item_id && damage_qty > 0) {
    await updateStockBucket(awoLine.item_id, wip_bucket, -damage_qty);
    try {
      await addStockLedgerEntry({
        item_id: awoLine.item_id,
        item_code: awoLine.item_code ?? null,
        item_description: awoLine.item_description ?? null,
        transaction_date: today,
        transaction_type: 'scrap_write_off',
        qty_in: 0,
        qty_out: damage_qty,
        balance_qty: 0,
        unit_cost: 0,
        total_value: 0,
        reference_type: 'assembly_work_order',
        reference_id: awoLine.awo_id,
        reference_number: awoNumber,
        notes: `Component scrapped — AWO #${awoNumber}: ${reason}`,
        created_by: null,
      });
    } catch (e) { console.error('[production] scrap ledger failed:', e); }
    try {
      await (supabase as any).from("notifications").insert({
        company_id: companyId,
        type: 'scrap_component',
        title: 'Component Scrapped',
        message: `${awoLine.item_description ?? awoLine.item_code ?? 'Item'} (${damage_qty} ${awoLine.unit ?? ''}) scrapped on AWO #${awoNumber}. Reason: ${reason}`,
        reference_type: 'assembly_work_order',
        reference_id: awoLine.awo_id,
        created_by: reported_by,
      });
    } catch (e) { console.error('[production] scrap notification failed:', e); }
  }

  if (disposition === 'return_to_vendor' && awoLine.item_id && damage_qty > 0) {
    await updateStockBucket(awoLine.item_id, wip_bucket, -damage_qty);
    await updateStockBucket(awoLine.item_id, 'free', +damage_qty);
    try {
      await addStockLedgerEntry({
        item_id: awoLine.item_id,
        item_code: awoLine.item_code ?? null,
        item_description: awoLine.item_description ?? null,
        transaction_date: today,
        transaction_type: 'assembly_return',
        qty_in: damage_qty,
        qty_out: 0,
        balance_qty: 0,
        unit_cost: 0,
        total_value: 0,
        reference_type: 'assembly_work_order',
        reference_id: awoLine.awo_id,
        reference_number: awoNumber,
        notes: `Component returned to vendor — AWO #${awoNumber}: ${reason}`,
        created_by: null,
      });
    } catch (e) { console.error('[production] return ledger failed:', e); }
    try {
      await (supabase as any).from("notifications").insert({
        company_id: companyId,
        type: 'return_to_vendor',
        title: 'Component Returned to Vendor',
        message: `${awoLine.item_description ?? awoLine.item_code ?? 'Item'} (${damage_qty} ${awoLine.unit ?? ''}) returned to vendor from AWO #${awoNumber}. Reason: ${reason}`,
        reference_type: 'assembly_work_order',
        reference_id: awoLine.awo_id,
        created_by: reported_by,
      });
    } catch (e) { console.error('[production] return notification failed:', e); }
  }
}

// ── fetchAwoStats ─────────────────────────────────────────────────────────────

export async function fetchAwoStats(type: 'sub_assembly' | 'finished_good'): Promise<{
  draft: number;
  pending_materials: number;
  in_progress: number;
  complete_this_month: number;
}> {
  const companyId = await getCompanyId();
  if (!companyId) return { draft: 0, pending_materials: 0, in_progress: 0, complete_this_month: 0 };

  const { data, error } = await (supabase as any)
    .from("assembly_work_orders")
    .select("status, completed_at")
    .eq("company_id", companyId)
    .eq("awo_type", type);

  if (error) throw error;

  const rows = (data ?? []) as Array<{ status: string; completed_at: string | null }>;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  return {
    draft: rows.filter((r) => r.status === 'draft').length,
    pending_materials: rows.filter((r) => r.status === 'pending_materials').length,
    in_progress: rows.filter((r) => r.status === 'in_progress').length,
    complete_this_month: rows.filter(
      (r) => r.status === 'complete' && r.completed_at != null && r.completed_at >= startOfMonth
    ).length,
  };
}
