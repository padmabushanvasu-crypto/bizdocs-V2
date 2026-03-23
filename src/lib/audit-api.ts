import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

export interface AuditEntry {
  id: string;
  document_type: string;
  document_id: string;
  action: string;
  details: Record<string, any> | null;
  user_email: string | null;
  user_name: string | null;
  created_at: string;
}

export async function logAudit(
  documentType: string,
  documentId: string,
  action: string,
  details?: Record<string, any>
) {
  const companyId = await getCompanyId();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await (supabase as any).from("audit_log").insert({
    company_id: companyId,
    document_type: documentType,
    document_id: documentId,
    action,
    details: details || null,
    user_id: user?.id || null,
    user_email: user?.email || null,
    user_name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || null,
  });
  if (error) console.error("Audit log error:", error);
}

export async function fetchAuditLog(documentId: string): Promise<AuditEntry[]> {
  const { data, error } = await (supabase as any)
    .from("audit_log")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

export interface AuditLogFilters {
  dateFrom?: string;
  dateTo?: string;
  action?: string;
  documentType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchAllAuditLog(filters: AuditLogFilters = {}): Promise<{ data: AuditEntry[]; count: number }> {
  const { dateFrom, dateTo, action, documentType, search, page = 1, pageSize = 50 } = filters;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");
  if (action) query = query.eq("action", action);
  if (documentType) query = query.eq("document_type", documentType);
  if (search?.trim()) query = query.ilike("details::text", `%${search.trim()}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as AuditEntry[], count: count ?? 0 };
}
