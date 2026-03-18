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
