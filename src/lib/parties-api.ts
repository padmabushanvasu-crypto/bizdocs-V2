import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type VendorType = "raw_material_supplier" | "processor" | "both";

// Extend generated type with vendor_type column added via migration
export type Party = Tables<"parties"> & { vendor_type?: VendorType | null };
export type PartyInsert = TablesInsert<"parties">;
export type PartyUpdate = TablesUpdate<"parties">;

export interface PartiesFilters {
  search?: string;
  type?: "vendor" | "customer" | "both" | "all";
  vendor_type?: VendorType | "all";
  status?: "active" | "inactive" | "all";
  page?: number;
  pageSize?: number;
}

export async function fetchParties(filters: PartiesFilters = {}) {
  const { search, type = "all", vendor_type = "all", status = "active", page = 1, pageSize = 100 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("parties")
    .select("*", { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);

  if (type !== "all") {
    if (type === "vendor") {
      query = query.in("party_type", ["vendor", "both"]);
    } else if (type === "customer") {
      query = query.in("party_type", ["customer", "both"]);
    } else {
      query = query.eq("party_type", type);
    }
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (vendor_type !== "all") {
    query = (query as any).eq("vendor_type", vendor_type);
  }

  if (search && search.trim()) {
    const sanitized = sanitizeSearchTerm(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      query = query.or(`name.ilike.${term},gstin.ilike.${term},phone1.ilike.${term},city.ilike.${term}`);
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function fetchParty(id: string) {
  const { data, error } = await supabase
    .from("parties")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createParty(party: PartyInsert) {
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from("parties")
    .insert({ ...party, company_id: companyId } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateParty(id: string, party: PartyUpdate) {
  const { data, error } = await supabase
    .from("parties")
    .update(party)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deactivateParty(id: string) {
  return updateParty(id, { status: "inactive" });
}

export async function deleteParty(id: string) {
  return deactivateParty(id);
}

export async function bulkUpdatePartyStatus(ids: string[], status: string) {
  const { error } = await supabase.from("parties").update({ status } as any).in("id", ids);
  if (error) throw error;
}

export async function bulkDeleteParties(ids: string[]): Promise<{ deleted: number; deactivated: number; errors: number }> {
  let deleted = 0, deactivated = 0, errors = 0;
  for (const id of ids) {
    try {
      const [
        { count: poCount },
        { count: dcCount },
        { count: soCount },
        { count: invoiceCount },
        { count: receiptCount },
      ] = await Promise.all([
        (supabase as any).from("purchase_orders").select("id", { count: "exact", head: true }).eq("vendor_id", id),
        (supabase as any).from("delivery_challans").select("id", { count: "exact", head: true }).eq("party_id", id),
        (supabase as any).from("sales_orders").select("id", { count: "exact", head: true }).eq("customer_id", id),
        (supabase as any).from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", id),
        (supabase as any).from("receipts").select("id", { count: "exact", head: true }).eq("party_id", id),
      ]);
      const hasRefs =
        (poCount ?? 0) > 0 ||
        (dcCount ?? 0) > 0 ||
        (soCount ?? 0) > 0 ||
        (invoiceCount ?? 0) > 0 ||
        (receiptCount ?? 0) > 0;
      if (hasRefs) {
        await updateParty(id, { status: "inactive" });
        deactivated++;
      } else {
        const { error } = await supabase.from("parties").delete().eq("id", id);
        if (error) throw error;
        deleted++;
      }
    } catch {
      errors++;
    }
  }
  return { deleted, deactivated, errors };
}
