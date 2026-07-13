import { supabase } from "@/integrations/supabase/client";
import { updateStockBucket } from "@/lib/items-api";
import { addStockLedgerEntry } from "@/lib/assembly-orders-api";
import { STOCK_STATE } from "@/lib/stock-states";
import { fetchFreeStockMap } from "@/lib/stock-free-api";
import { createNotification } from "@/lib/notifications-api";

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
  status: 'draft' | 'pending_materials' | 'in_progress' | 'awaiting_store' | 'complete' | 'cancelled';
  serial_number: string | null;
  raised_by: string | null;
  raised_by_user_id: string | null;
  issued_by: string | null;
  issued_by_user_id: string | null;
  planned_date: string | null;
  work_order_ref: string | null;
  notes: string | null;
  completed_at: string | null;
  // Store acceptance (A4) — set when the storekeeper accepts the output into stock.
  store_location: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
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
  returned_qty?: number;
  unit: string;
  is_critical: boolean;
  shortage_qty: number;
  notes: string | null;
  // Damage handling (A3): SCRAP leaves WIP (scrapped_qty); USE-AS-IS stays in WIP
  // and is consumed normally (concession_qty). damage_qty is kept in sync as the
  // legacy total-damaged input still read by the completion guard.
  damage_qty?: number;
  damage_reason?: string | null;
  disposition?: 'scrap' | 'use_as_is' | null;
  scrapped_qty?: number;
  // Set at acceptAssemblyWorkOrder when the real WIP is consumed. NULL on
  // historical rows (pre-migration) — always read as `consumed_qty ?? 0`.
  consumed_qty?: number | null;
  concession_qty?: number;
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

  // Enrich item identity from items; AVAILABILITY (stock_free) comes from
  // v_stock_free (ledger-truth for counted items, bucket fallback otherwise).
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
  const freeMap = await fetchFreeStockMap(itemIds);

  awo.line_items = lineItems.map((li) => ({
    ...li,
    stock_free: li.item_id ? (freeMap.get(li.item_id) ?? stockMap[li.item_id] ?? 0) : 0,
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

export interface ReturnComponentLine {
  awo_line_item_id: string;
  // CONTRACT: the NEW CUMULATIVE returned total for the line (target), NOT a
  // per-call delta. The server derives delta = target − current returned.
  returned_qty: number;
}

/**
 * Standalone Material Return for an AWO — return unused components from WIP back
 * to free store stock. Same ledger-first, idempotent discipline as
 * confirmMaterialIssue (A1).
 *
 * Per line:
 *  - CAP: available-in-WIP = issued_qty − returned_qty − scrapped_qty (consumed
 *    is 0 until completion; concession units stay in WIP and don't reduce it).
 *    The cumulative target is clamped to [current_returned, issued − scrapped] so
 *    a line can never be over-returned.
 *  - IDEMPOTENT: re-read current returned_qty fresh, delta = max(0, target −
 *    current); a re-submit (same target) yields delta 0 → no-op.
 *  - LEDGER-FIRST: post assembly_return (qty_in = delta, wip → free) with item
 *    identity; only on ledger success move buckets (wip_bucket −delta,
 *    free +delta). A ledger failure aborts that line — no bucket change, returned
 *    left untouched (retryable).
 *  - WIP bucket chosen by awo_type (in_fg_wip vs in_subassembly_wip) — fixes the
 *    legacy hardcoded in_subassembly_wip drift.
 *
 * Returns any per-line warnings (ledger failures, item-less lines) for surfacing.
 */
export async function returnAssemblyComponents(
  awoId: string,
  lines: ReturnComponentLine[]
): Promise<{ returnWarnings: string[] }> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const awo = await fetchAssemblyWorkOrder(awoId);
  if (!awo) throw new Error("Work order not found");

  const wip_bucket = awo.awo_type === 'finished_good' ? 'in_fg_wip' : 'in_subassembly_wip';
  const awoNumber = awo.awo_number ?? '';
  const today = new Date().toISOString().split('T')[0];
  const returnWarnings: string[] = [];

  await Promise.all(lines.map(async (input) => {
    const snapshot = (awo.line_items ?? []).find((l) => l.id === input.awo_line_item_id);
    if (!snapshot) return;

    // Fresh authoritative read for idempotency + an accurate cap.
    const { data: fresh } = await (supabase as any)
      .from("awo_line_items")
      .select("issued_qty, returned_qty, scrapped_qty, consumed_qty, item_id, item_code, item_description")
      .eq("id", input.awo_line_item_id)
      .eq("company_id", companyId)
      .maybeSingle();
    const issued = Number((fresh as any)?.issued_qty ?? snapshot.issued_qty ?? 0);
    const currentReturned = Number((fresh as any)?.returned_qty ?? snapshot.returned_qty ?? 0);
    const scrapped = Number((fresh as any)?.scrapped_qty ?? snapshot.scrapped_qty ?? 0);
    const consumed = Number((fresh as any)?.consumed_qty ?? snapshot.consumed_qty ?? 0);
    const itemId = (fresh as any)?.item_id ?? snapshot.item_id ?? null;
    const itemCode = (fresh as any)?.item_code ?? snapshot.item_code ?? null;
    const itemDesc = (fresh as any)?.item_description ?? snapshot.item_description ?? null;

    // CAP: never return beyond what's still in WIP for this line. Consumed units
    // (posted at accept) have already left WIP — excluding them prevents
    // over-return that would double-credit stock_free.
    const availableInWip = Math.max(0, issued - currentReturned - scrapped - consumed);
    const maxTarget = currentReturned + availableInWip; // == issued − scrapped − consumed
    // Cumulative target clamped so we never go below current or beyond the cap.
    const target = Math.min(Math.max(Number(input.returned_qty ?? 0), currentReturned), maxTarget);
    const delta = Math.max(0, target - currentReturned);

    if (delta <= 0) return; // no-op: idempotent re-submit, or nothing available

    if (itemId) {
      // LEDGER-FIRST: post the return, move buckets only on success.
      try {
        await addStockLedgerEntry({
          item_id: itemId,
          item_code: itemCode,
          item_description: itemDesc,
          transaction_date: today,
          transaction_type: 'assembly_return',
          qty_in: delta,
          qty_out: 0,
          balance_qty: 0,
          unit_cost: 0,
          total_value: 0,
          reference_type: 'assembly_work_order',
          reference_id: awoId,
          reference_number: awoNumber,
          notes: `Components returned to store — AWO #${awoNumber}`,
          created_by: null,
          from_state: wip_bucket,
          to_state: STOCK_STATE.FREE,
        });
      } catch (e) {
        console.error('[production] assembly_return ledger failed — line not returned, no bucket change:', e);
        returnWarnings.push(`${itemCode ?? itemDesc ?? input.awo_line_item_id} — return not posted (ledger error)`);
        return;
      }
      await updateStockBucket(itemId, wip_bucket, -delta);
      await updateStockBucket(itemId, 'free', +delta);
    } else {
      // No linked item to move stock for — record the returned qty for tracking only.
      returnWarnings.push(`${itemDesc ?? input.awo_line_item_id} — no item linked; recorded return without stock move`);
    }

    await (supabase as any)
      .from("awo_line_items")
      .update({ returned_qty: currentReturned + delta })
      .eq("id", input.awo_line_item_id)
      .eq("company_id", companyId);
  }));

  return { returnWarnings };
}

export interface ScrapComponentLine {
  awo_line_item_id: string;
  // CONTRACT: the NEW CUMULATIVE scrapped total for the line (target), NOT a
  // per-call delta. The server derives delta = target − current scrapped.
  scrapped_qty: number;
}

/**
 * Scrap (write-off) damaged components from an AWO's WIP. Same ledger-first,
 * idempotent discipline as the return path (A2). Scrap leaves WIP entirely.
 *
 * Per line:
 *  - CAP: available-in-WIP = issued_qty − returned_qty − scrapped_qty (concession
 *    units stay in WIP and don't reduce it). Cumulative target clamped to
 *    [current_scrapped, issued − returned]; never over-scrap.
 *  - IDEMPOTENT: re-read current scrapped_qty fresh, delta = max(0, target −
 *    current); a re-submit is a no-op.
 *  - LEDGER-FIRST: post scrap_write_off (qty_out = delta, from_state = wip bucket
 *    by awo_type, to_state = 'scrap', item identity, reason in notes); only on
 *    ledger success reduce the wip bucket by delta. Ledger failure aborts the
 *    line — no bucket change, scrapped_qty untouched (retryable).
 *
 * Returns per-line warnings (ledger failures, item-less lines) for surfacing.
 */
export async function scrapAssemblyComponents(
  awoId: string,
  lines: ScrapComponentLine[],
  reason?: string | null,
  opts?: { autoReissue?: boolean }
): Promise<{ scrapWarnings: string[] }> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const awo = await fetchAssemblyWorkOrder(awoId);
  if (!awo) throw new Error("Work order not found");

  const wip_bucket = awo.awo_type === 'finished_good' ? 'in_fg_wip' : 'in_subassembly_wip';
  const awoNumber = awo.awo_number ?? '';
  const today = new Date().toISOString().split('T')[0];
  const scrapWarnings: string[] = [];
  // Mid-build scrap (autoReissue) collects the actually-scrapped lines so ONE
  // replacement MIR can be raised after the loop. Cancel-path scrap leaves this
  // empty (no reissue — the AWO is being cancelled).
  const replacements: Array<{
    awo_line_item_id: string;
    item_id: string;
    item_code: string | null;
    item_description: string | null;
    drawing_number: string | null;
    unit: string;
    qty: number;
  }> = [];

  await Promise.all(lines.map(async (input) => {
    const snapshot = (awo.line_items ?? []).find((l) => l.id === input.awo_line_item_id);
    if (!snapshot) return;

    // Fresh authoritative read for idempotency + an accurate cap.
    const { data: fresh } = await (supabase as any)
      .from("awo_line_items")
      .select("issued_qty, returned_qty, scrapped_qty, consumed_qty, item_id, item_code, item_description")
      .eq("id", input.awo_line_item_id)
      .eq("company_id", companyId)
      .maybeSingle();
    const issued = Number((fresh as any)?.issued_qty ?? snapshot.issued_qty ?? 0);
    const currentReturned = Number((fresh as any)?.returned_qty ?? snapshot.returned_qty ?? 0);
    const currentScrapped = Number((fresh as any)?.scrapped_qty ?? snapshot.scrapped_qty ?? 0);
    const consumed = Number((fresh as any)?.consumed_qty ?? snapshot.consumed_qty ?? 0);
    const itemId = (fresh as any)?.item_id ?? snapshot.item_id ?? null;
    const itemCode = (fresh as any)?.item_code ?? snapshot.item_code ?? null;
    const itemDesc = (fresh as any)?.item_description ?? snapshot.item_description ?? null;

    // CAP: never scrap beyond what's still in WIP for this line. Consumed units
    // (posted at accept) have already left WIP.
    const availableInWip = Math.max(0, issued - currentReturned - currentScrapped - consumed);
    const maxTarget = currentScrapped + availableInWip; // == issued − returned − consumed
    const target = Math.min(Math.max(Number(input.scrapped_qty ?? 0), currentScrapped), maxTarget);
    const delta = Math.max(0, target - currentScrapped);

    if (delta <= 0) return; // no-op: idempotent re-submit, or nothing available

    if (itemId) {
      // LEDGER-FIRST: post the write-off, reduce the wip bucket only on success.
      try {
        await addStockLedgerEntry({
          item_id: itemId,
          item_code: itemCode,
          item_description: itemDesc,
          transaction_date: today,
          transaction_type: 'scrap_write_off',
          qty_in: 0,
          qty_out: delta,
          balance_qty: 0,
          unit_cost: 0,
          total_value: 0,
          reference_type: 'assembly_work_order',
          reference_id: awoId,
          reference_number: awoNumber,
          notes: reason ? `Component scrapped — AWO #${awoNumber}: ${reason}` : `Component scrapped — AWO #${awoNumber}`,
          created_by: null,
          from_state: wip_bucket,
          to_state: STOCK_STATE.SCRAPPED,
        });
      } catch (e) {
        console.error('[production] scrap_write_off ledger failed — line not scrapped, no bucket change:', e);
        scrapWarnings.push(`${itemCode ?? itemDesc ?? input.awo_line_item_id} — scrap not posted (ledger error)`);
        return;
      }
      await updateStockBucket(itemId, wip_bucket, -delta);
      // Queue a replacement for this scrapped quantity (mid-build scrap only).
      replacements.push({
        awo_line_item_id: input.awo_line_item_id,
        item_id: itemId,
        item_code: itemCode,
        item_description: itemDesc,
        drawing_number: snapshot.drawing_number ?? null,
        unit: snapshot.unit ?? 'NOS',
        qty: delta,
      });
    } else {
      // No linked item to move stock for — record the scrapped qty for tracking only.
      scrapWarnings.push(`${itemDesc ?? input.awo_line_item_id} — no item linked; recorded scrap without stock move`);
    }

    await (supabase as any)
      .from("awo_line_items")
      .update({ scrapped_qty: currentScrapped + delta })
      .eq("id", input.awo_line_item_id)
      .eq("company_id", companyId);
  }));

  // ── Auto-reissue: one replacement MIR for everything scrapped this call ──
  // Reuses the same material_issue_requests + mir_line_items shapes as
  // createMaterialIssueRequest, but scoped to the scrapped lines (requested_qty =
  // scrapped delta) and WITHOUT flipping the AWO status (it stays in_progress).
  if (opts?.autoReissue && replacements.length > 0) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = await getCurrentUserName();
      const mirNumber = 'MIR-' + Date.now().toString().slice(-6);
      const { data: mirData, error: mirErr } = await (supabase as any)
        .from("material_issue_requests")
        .insert({
          company_id: companyId,
          mir_number: mirNumber,
          awo_id: awoId,
          requested_by: userName,
          requested_by_user_id: user?.id ?? null,
          status: 'pending',
          request_date: today,
          notes: `Replacement for scrapped components — AWO #${awoNumber}`,
        })
        .select()
        .single();
      if (mirErr) throw mirErr;
      const mirId = (mirData as MaterialIssueRequest).id;

      const mirLines = replacements.map((r) => ({
        company_id: companyId,
        mir_id: mirId,
        awo_line_item_id: r.awo_line_item_id,
        item_id: r.item_id,
        item_code: r.item_code,
        item_description: r.item_description,
        drawing_number: r.drawing_number,
        requested_qty: r.qty,
        issued_qty: 0,
        shortage_qty: 0,
        unit: r.unit,
      }));
      const { error: mirLineErr } = await (supabase as any).from("mir_line_items").insert(mirLines);
      if (mirLineErr) throw mirLineErr;

      // One notification per replacement MIR (not per line) → store/assembly issue role.
      try {
        const totalQty = replacements.reduce((s, r) => s + r.qty, 0);
        await createNotification({
          company_id: companyId,
          type: 'assembly_replacement_mir',
          title: 'Replacement materials requested',
          message: `${mirNumber}: ${replacements.length} component(s) (${totalQty} unit(s)) scrapped on AWO #${awoNumber} — issue replacements from the Assembly Issue Queue.`,
          category: 'action_required',
          link: '/storekeeper',
          target_role: 'storekeeper',
          reference_type: 'material_issue_request',
          reference_id: mirId,
        });
      } catch (e) { console.error('[production] replacement MIR notification failed (non-fatal):', e); }
    } catch (e) {
      console.error('[production] auto-reissue MIR creation failed (non-fatal):', e);
      scrapWarnings.push('Replacement material request could not be created — raise it manually from the work order.');
    }
  }

  return { scrapWarnings };
}

export async function cancelAssemblyWorkOrder(
  id: string,
  stockAction: 'none' | 'return_all' | 'partial' | 'scrap_all' = 'none',
  partialLines?: Array<{ item_id: string; return_qty: number; scrap_qty: number }>
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  if (stockAction !== 'none') {
    const awo = await fetchAssemblyWorkOrder(id);
    // Status guard: a 'complete' AWO already consumed its WIP at accept, and a
    // 'cancelled' one already ran its reversal. Reversing again would double-credit
    // stock (issued − returned − scrapped − consumed no longer reflects WIP on hand).
    if (awo && (awo.status === 'complete' || awo.status === 'cancelled')) {
      throw new Error(
        `Cannot reverse WIP stock: work order is '${awo.status}'. Its components were already consumed or reversed.`
      );
    }
    const issuedLines = (awo?.line_items ?? []).filter(
      (li) => li.item_id && li.issued_qty > 0
    );

    if (stockAction === 'return_all') {
      // Return everything still in WIP → shared return logic (capped, ledger-first,
      // bucket-by-type). Cumulative target = issued − scrapped per line.
      const returnLines = issuedLines.map((li) => ({
        awo_line_item_id: li.id,
        returned_qty: Math.max(0, li.issued_qty - (li.scrapped_qty ?? 0)),
      }));
      await returnAssemblyComponents(id, returnLines);
    } else if (stockAction === 'scrap_all') {
      // Scrap everything still in WIP → shared scrap logic (capped, ledger-first,
      // bucket-by-type). Cumulative target = issued − returned per line.
      const scrapLines = issuedLines.map((li) => ({
        awo_line_item_id: li.id,
        scrapped_qty: Math.max(0, li.issued_qty - (li.returned_qty ?? 0)),
      }));
      await scrapAssemblyComponents(id, scrapLines, 'AWO cancelled');
    } else if (stockAction === 'partial' && partialLines) {
      // Returns → shared return logic; scrap → shared scrap logic. Cumulative
      // target = this line's current returned/scrapped + the requested qty.
      const returnLines = partialLines
        .filter((pl) => pl.return_qty > 0)
        .map((pl) => {
          const line = (awo?.line_items ?? []).find((l) => l.item_id === pl.item_id);
          if (!line) return null;
          return { awo_line_item_id: line.id, returned_qty: Number(line.returned_qty ?? 0) + pl.return_qty };
        })
        .filter((x): x is ReturnComponentLine => x !== null);
      if (returnLines.length > 0) await returnAssemblyComponents(id, returnLines);

      const scrapLines = partialLines
        .filter((pl) => pl.scrap_qty > 0)
        .map((pl) => {
          const line = (awo?.line_items ?? []).find((l) => l.item_id === pl.item_id);
          if (!line) return null;
          return { awo_line_item_id: line.id, scrapped_qty: Number(line.scrapped_qty ?? 0) + pl.scrap_qty };
        })
        .filter((x): x is ScrapComponentLine => x !== null);
      if (scrapLines.length > 0) await scrapAssemblyComponents(id, scrapLines, 'AWO cancelled');
    }
  }

  // Cascade: cancel any still-open MIRs for this AWO. Left open, a pending /
  // partially_issued MIR could later be confirmed (confirmMaterialIssue) and both
  // move stock into WIP and resurrect the cancelled AWO to in_progress.
  const { error: mirErr } = await (supabase as any)
    .from("material_issue_requests")
    .update({ status: 'cancelled' })
    .eq("awo_id", id)
    .eq("company_id", companyId)
    .in("status", ['pending', 'partially_issued']);
  if (mirErr) throw mirErr;

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

  // Enrich AVAILABILITY (stock_free) from v_stock_free (ledger-truth for counted
  // items, bucket fallback otherwise).
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
  const freeMap = await fetchFreeStockMap(itemIds);

  mir.line_items = lineItems.map((li) => ({
    ...li,
    stock_free: li.item_id ? (freeMap.get(li.item_id) ?? stockMap[li.item_id] ?? 0) : 0,
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

/**
 * Confirm a material issue against a MIR.
 *
 * CONTRACT (made explicit): `lineIssues[].issued_qty` is the NEW CUMULATIVE
 * issued total for that MIR line (the target), NOT a per-call delta. The server
 * re-reads the authoritative current issued_qty and derives `delta = target −
 * current`, then moves only `delta`. This makes a retry / double-click that
 * carries the same target a no-op (idempotent) — see point 2 below.
 *
 * Discipline (matches the GRN hardening):
 *  1. Ledger-FIRST: post the assembly_issue stock_ledger row first; buckets
 *     (free −, wip +) move only if the ledger insert succeeds. A ledger failure
 *     aborts THAT line with no bucket change (the line stays issuable/retryable).
 *  2. Idempotency: delta is computed from a fresh DB read of issued_qty, so once
 *     a target is reached a re-submit yields delta 0 → no ledger, no bucket, no
 *     accrual. (Residual caveat: two *simultaneous* calls that both read the old
 *     value before either commits can still both post — same concurrency window
 *     acknowledged for addStockLedgerEntry; covers double-click/retry, the real
 *     case here.)
 *  3. Item identity: item_code/description are carried onto the ledger row.
 *
 * Partial-issue behaviour (accumulate toward required, shortage_qty), the WIP
 * bucket choice by awo_type, and MIR/AWO status transitions are unchanged.
 */
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

  // Status guard: only a work order still awaiting/consuming materials may receive
  // an issue. Blocks issuing against a completed or cancelled AWO — which would move
  // stock into WIP and (for cancelled) resurrect it to in_progress. Rejects when the
  // AWO is missing or in any other state.
  const awoStatus = mir.awo?.status;
  if (awoStatus !== 'pending_materials' && awoStatus !== 'in_progress') {
    throw new Error(
      `Cannot issue materials: work order is '${awoStatus ?? 'unknown'}'. ` +
      `Only 'pending_materials' or 'in_progress' work orders can receive an issue.`
    );
  }

  // The WIP bucket is derived from awo_type inside rpc_confirm_material_issue.
  const awoNumber = mir.awo?.awo_number ?? '';

  let hasShortages = false;

  // Process all line items in parallel to avoid sequential-await timeouts
  await Promise.all(lineIssues.map(async (issue) => {
    const mirLine = mir.line_items?.find((li) => li.id === issue.mir_line_item_id);
    if (!mirLine) return;

    // Idempotency: re-read the authoritative current issued_qty, then derive the
    // delta to actually move. A re-submit carrying the same cumulative target
    // resolves to delta 0 once the first call has committed.
    const { data: freshLine } = await (supabase as any)
      .from("mir_line_items")
      .select("issued_qty")
      .eq("id", issue.mir_line_item_id)
      .eq("company_id", companyId)
      .maybeSingle();
    const currentIssued = Number((freshLine as any)?.issued_qty ?? mirLine.issued_qty ?? 0);

    const targetIssued = Math.max(0, Number(issue.issued_qty ?? 0));
    const delta = Math.max(0, targetIssued - currentIssued);

    // Atomic stock move via the guarded RPC: it writes the assembly_issue ledger
    // row and moves stock_free -> WIP (bucket by awo_type) in one server-side
    // transaction, throwing with the exact shortfall if free stock is insufficient.
    // It does NOT check AWO status — that guard stays above. Re-throw so the
    // caller's toast shows the RPC message; on failure the mir/awo line writes
    // below are skipped for this line (issued/shortage stay retryable).
    if (delta > 0 && mirLine.item_id) {
      const { error: rpcErr } = await (supabase as any).rpc('rpc_confirm_material_issue', {
        p_company_id: companyId,
        p_item_id: mirLine.item_id,
        p_qty: delta,
        p_awo_id: mir.awo_id,
        p_notes: `Material issued for AWO #${awoNumber}`,
      });
      if (rpcErr) throw new Error(rpcErr.message);
    }

    // Persist the cumulative issued total (no-op write when delta === 0).
    const newIssued = currentIssued + delta;
    const shortage_qty = Math.max(0, mirLine.requested_qty - newIssued);
    if (shortage_qty > 0) hasShortages = true;

    await (supabase as any)
      .from("mir_line_items")
      .update({
        issued_qty: newIssued,
        shortage_qty,
        shortage_notes: issue.shortage_notes ?? null,
      })
      .eq("id", issue.mir_line_item_id)
      .eq("company_id", companyId);

    // Accrue the AWO line by the actual delta (skip on a no-op re-submit).
    if (mirLine.awo_line_item_id && delta > 0) {
      const { data: awoLine } = await (supabase as any)
        .from("awo_line_items")
        .select("issued_qty")
        .eq("id", mirLine.awo_line_item_id)
        .single();
      const currentAwoIssued = Number((awoLine as any)?.issued_qty ?? 0);
      await (supabase as any)
        .from("awo_line_items")
        .update({ issued_qty: currentAwoIssued + delta })
        .eq("id", mirLine.awo_line_item_id)
        .eq("company_id", companyId);
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

/**
 * Mark the build done (production side). NO stock posting happens here anymore —
 * stock is posted when the storekeeper accepts the output (acceptAssemblyWorkOrder),
 * mirroring the GRN store-confirm gate.
 *
 * Keeps the fulfilment guard (reject if a line is short and not covered by
 * use_as_is / scrap). Idempotent: only acts on an in_progress build; on success
 * moves the AWO to 'awaiting_store'.
 */
export async function completeAssemblyWorkOrder(id: string): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const awo = await fetchAssemblyWorkOrder(id);
  if (!awo) throw new Error("Work order not found");

  // Idempotent: only a build in progress can be marked done.
  if (awo.status !== 'in_progress') return;

  // Fulfilment guard — block while any line's available-in-WIP is below required.
  // available-in-WIP = issued − returned − scrapped (concession/use-as-is units
  // stay in WIP and count; only scrapped/returned reduce it). Scrapped material
  // must be re-issued (auto-reissue MIR) before the build can complete.
  const unfulfilledLines = (awo.line_items ?? []).filter((li) => {
    const availableInWip = (li.issued_qty ?? 0) - (li.returned_qty ?? 0) - (li.scrapped_qty ?? 0) - (li.consumed_qty ?? 0);
    return availableInWip < li.required_qty;
  });
  if (unfulfilledLines.length > 0) {
    throw new Error(
      `Cannot complete: ${unfulfilledLines.length} component(s) are short in WIP. ` +
      `Issue the replacement stock (incl. any scrapped components) before marking the build complete.`
    );
  }

  // Build is done — hand off to store. No stock movement here.
  await (supabase as any)
    .from("assembly_work_orders")
    .update({ status: 'awaiting_store', updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId);
}

/**
 * Store acceptance of a finished build — the gate that actually posts stock.
 * Mirrors GRN store-confirm: consume the real WIP, post the built item to stock,
 * record the rack/location, mark complete.
 *
 * Idempotent: proceeds only when status = 'awaiting_store'; an already-'complete'
 * AWO is a no-op (the status flip is the commit point — re-calls can't double-post).
 *
 * Per line CONSUME = issued_qty − returned_qty − scrapped_qty (the real WIP on
 * hand; concession units are consumed, returned/scrapped already left WIP). This
 * fixes the old full-issued_qty over-consume. Ledger-first throughout; failures
 * are collected as warnings for manual recovery.
 */
export async function acceptAssemblyWorkOrder(
  awoId: string,
  storeLocation: string | null,
  acceptedBy: string,
): Promise<{ warnings: string[] }> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const awo = await fetchAssemblyWorkOrder(awoId);
  if (!awo) throw new Error("Work order not found");

  // Idempotency guard: only an awaiting_store build can be accepted.
  if (awo.status === 'complete') return { warnings: [] };
  if (awo.status !== 'awaiting_store') {
    throw new Error(`Cannot accept: work order is '${awo.status}', expected 'awaiting_store'.`);
  }

  const today = new Date().toISOString().split('T')[0];
  const wip_bucket = awo.awo_type === 'finished_good' ? 'in_fg_wip' : 'in_subassembly_wip';
  const warnings: string[] = [];

  // ── CONSUME the real WIP per line (issued − returned − scrapped). Ledger-first. ──
  for (const li of awo.line_items ?? []) {
    if (!li.item_id) continue;
    const consumeQty = Math.max(
      0,
      (li.issued_qty ?? 0) - (li.returned_qty ?? 0) - (li.scrapped_qty ?? 0)
    );
    if (consumeQty <= 0) continue;
    try {
      await addStockLedgerEntry({
        item_id: li.item_id,
        item_code: li.item_code ?? null,
        item_description: li.item_description ?? null,
        transaction_date: today,
        transaction_type: 'assembly_consumption',
        qty_in: 0,
        qty_out: consumeQty,
        balance_qty: 0,
        unit_cost: 0,
        total_value: 0,
        reference_type: 'assembly_work_order',
        reference_id: awoId,
        reference_number: awo.awo_number,
        notes: `Component consumed — AWO #${awo.awo_number} accepted to store`,
        created_by: null,
        from_state: wip_bucket,
        to_state: STOCK_STATE.CONSUMED,
      });
    } catch (e) {
      console.error('[production] assembly_consumption ledger failed — line not consumed, no bucket change:', e);
      warnings.push(`${li.item_code ?? li.item_description ?? li.id} — consumption not posted (ledger error)`);
      continue;
    }
    await updateStockBucket(li.item_id, wip_bucket, -consumeQty);
    // Record what left WIP so the return/scrap caps stop counting it as on-hand.
    // Accept is one-shot (status guard prevents re-run), so a plain set is correct.
    await (supabase as any)
      .from("awo_line_items")
      .update({ consumed_qty: consumeQty })
      .eq("id", li.id)
      .eq("company_id", companyId);
  }

  // ── OUTPUT the built item: ledger-first, then credit by awo_type. ──
  if (awo.item_id) {
    const outBucket = awo.awo_type === 'finished_good' ? 'in_fg_ready' : 'free';
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
        reference_id: awoId,
        reference_number: awo.awo_number,
        notes: `Assembly accepted to store — AWO #${awo.awo_number}`,
        created_by: null,
        from_state: null,
        to_state: outBucket,
      });
      await updateStockBucket(awo.item_id, outBucket, +awo.quantity_to_build);
    } catch (e) {
      console.error('[production] assembly_output ledger failed:', e);
      warnings.push(`${awo.item_code ?? awo.item_description ?? awoId} — output not posted (ledger error)`);
    }

    // Finished good: create/upsert the serial_numbers row (as the old completion did).
    if (awo.awo_type === 'finished_good' && awo.serial_number) {
      try {
        const { data: existingSn } = await (supabase as any)
          .from("serial_numbers")
          .select("id")
          .eq("serial_number", awo.serial_number)
          .eq("company_id", companyId)
          .maybeSingle();
        if (existingSn?.id) {
          await (supabase as any).from("serial_numbers").update({ status: 'in_stock' }).eq("id", existingSn.id);
        } else {
          const { error: snErr } = await (supabase as any).from("serial_numbers").insert({
            serial_number: awo.serial_number,
            company_id: companyId,
            item_id: awo.item_id ?? null,
            item_code: awo.item_code ?? null,
            item_description: awo.item_description ?? null,
            status: 'in_stock',
          });
          if (snErr) console.error('[production] serial_numbers insert failed:', snErr);
        }
      } catch (e) { console.error('[production] serial_numbers upsert failed:', e); }
    }
  }

  // Record acceptance + mark complete. Status guard at the top prevents double-post.
  await (supabase as any)
    .from("assembly_work_orders")
    .update({
      status: 'complete',
      store_location: storeLocation ?? null,
      accepted_at: new Date().toISOString(),
      accepted_by: acceptedBy,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", awoId)
    .eq("company_id", companyId);

  return { warnings };
}

// ── reportComponentIssue ─────────────────────────────────────────────────────

/**
 * Report damaged components on an AWO line. Two dispositions only:
 *  - 'scrap'     → write-off, leaves WIP (tracked cumulatively in scrapped_qty).
 *  - 'use_as_is' → concession: damaged but kept, stays in WIP and is consumed
 *                  normally (tracked in concession_qty). NO stock movement.
 *
 * CONTRACT: `target_qty` is the NEW CUMULATIVE total for the chosen disposition
 * (total scrapped, or total concession) for this line — NOT a per-call delta.
 *
 * SCRAP routes through scrapAssemblyComponents (capped, idempotent, ledger-first,
 * bucket-by-type). USE-AS-IS just records the cumulative concession + reason.
 *
 * damage_qty / disposition are kept in sync as the legacy inputs still read by
 * the completion guard (completeAssemblyWorkOrder), which is out of A3's scope.
 */
export async function reportComponentIssue(
  awo_line_item_id: string,
  target_qty: number,
  disposition: 'scrap' | 'use_as_is',
  reason: string,
  reported_by_user_id: string
): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("Not authenticated");

  const { data: awoLine, error: lineError } = await (supabase as any)
    .from("awo_line_items")
    .select("awo_id, issued_qty, returned_qty, scrapped_qty, consumed_qty, concession_qty")
    .eq("id", awo_line_item_id)
    .eq("company_id", companyId)
    .single();
  if (lineError || !awoLine) throw new Error("AWO line item not found");

  if (disposition === 'scrap') {
    // Capped, idempotent, ledger-first scrap (updates scrapped_qty + wip bucket).
    // autoReissue → raise a replacement MIR for the scrapped qty so the store
    // re-issues it and the build can reach required again.
    await scrapAssemblyComponents(
      (awoLine as any).awo_id,
      [{ awo_line_item_id, scrapped_qty: Math.max(0, target_qty) }],
      reason,
      { autoReissue: true },
    );
    // Mirror disposition + reason, and keep the legacy damage_qty input in sync
    // with the now-authoritative cumulative scrapped_qty for the completion guard.
    const { data: after } = await (supabase as any)
      .from("awo_line_items")
      .select("scrapped_qty")
      .eq("id", awo_line_item_id)
      .eq("company_id", companyId)
      .maybeSingle();
    const newScrapped = Number((after as any)?.scrapped_qty ?? 0);
    const { error: updErr } = await (supabase as any)
      .from("awo_line_items")
      .update({ disposition: 'scrap', damage_reason: reason, damage_qty: newScrapped })
      .eq("id", awo_line_item_id)
      .eq("company_id", companyId);
    if (updErr) throw updErr;
  } else {
    // USE-AS-IS (concession): no ledger, no bucket move. Units stay in WIP and are
    // consumed at completion. Cap the cumulative concession to WIP on hand.
    const issued = Number((awoLine as any).issued_qty ?? 0);
    const returned = Number((awoLine as any).returned_qty ?? 0);
    const scrapped = Number((awoLine as any).scrapped_qty ?? 0);
    const consumed = Number((awoLine as any).consumed_qty ?? 0);
    const currentConcession = Number((awoLine as any).concession_qty ?? 0);
    const availableInWip = Math.max(0, issued - returned - scrapped - consumed);
    const target = Math.min(Math.max(Number(target_qty), currentConcession), currentConcession + availableInWip);
    const { error: updErr } = await (supabase as any)
      .from("awo_line_items")
      .update({
        disposition: 'use_as_is',
        concession_qty: target,
        concession_note: reason,
        concession_by: reported_by_user_id,
        concession_at: new Date().toISOString(),
        damage_reason: reason,
        damage_qty: target, // keep legacy completion-guard input in sync
      })
      .eq("id", awo_line_item_id)
      .eq("company_id", companyId);
    if (updErr) throw updErr;
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
