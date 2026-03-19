import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Party = Tables<"parties">;
export type PartyInsert = TablesInsert<"parties">;
export type PartyUpdate = TablesUpdate<"parties">;

export interface PartiesFilters {
  search?: string;
  type?: "vendor" | "customer" | "both" | "all";
  status?: "active" | "inactive" | "all";
  page?: number;
  pageSize?: number;
}

export async function fetchParties(filters: PartiesFilters = {}) {
  const { search, type = "all", status = "active", page = 1, pageSize = 20 } = filters;
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

export async function bulkDeleteParties(ids: string[]) {
  return bulkUpdatePartyStatus(ids, "inactive");
}
