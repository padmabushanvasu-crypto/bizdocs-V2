import { supabase } from "@/integrations/supabase/client";

let _companyId: string | null = null;
let _companyIdSetAt: number = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function getCompanyId(): Promise<string | null> {
  const now = Date.now();
  if (_companyId && (now - _companyIdSetAt) < CACHE_TTL) {
    return _companyId;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await (supabase as any).from("profiles").select("company_id").eq("id", user.id).single();
  if (error || !data?.company_id) return null;
  _companyId = data.company_id;
  _companyIdSetAt = now;
  return _companyId;
}

export function setCompanyId(id: string) { _companyId = id; _companyIdSetAt = Date.now(); }
export function clearCompanyId() {
  _companyId = null;
  _companyIdSetAt = 0;
  try { localStorage.removeItem("bizdocs_company_setup_done"); } catch {}
}

export function clearCompanyIdCache() {
  _companyId = null;
  _companyIdSetAt = 0;
}

/**
 * Sanitize a search term for use in PostgREST .or() filter strings.
 * Strips characters that could inject additional filter conditions.
 */
export function sanitizeSearchTerm(raw: string): string {
  // Remove PostgREST-significant characters: parentheses, commas, backticks, dots followed by keywords
  return raw.replace(/[(),`\\]/g, '').trim();
}
