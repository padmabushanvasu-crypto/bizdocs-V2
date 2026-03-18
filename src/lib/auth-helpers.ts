import { supabase } from "@/integrations/supabase/client";

let _companyId: string | null = null;

export async function getCompanyId(): Promise<string> {
  if (_companyId) return _companyId;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await (supabase as any).from("profiles").select("company_id").eq("id", user.id).single();
  if (error || !data?.company_id) throw new Error("No company configured");
  _companyId = data.company_id;
  return _companyId;
}

export function setCompanyId(id: string) { _companyId = id; }
export function clearCompanyId() { _companyId = null; }

/**
 * Sanitize a search term for use in PostgREST .or() filter strings.
 * Strips characters that could inject additional filter conditions.
 */
export function sanitizeSearchTerm(raw: string): string {
  // Remove PostgREST-significant characters: parentheses, commas, backticks, dots followed by keywords
  return raw.replace(/[(),`\\]/g, '').trim();
}
