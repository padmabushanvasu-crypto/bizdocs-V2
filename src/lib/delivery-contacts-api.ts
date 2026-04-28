import { supabase } from "@/integrations/supabase/client";

export interface DeliveryContact {
  id: string;
  name: string;
  phone: string | null;
}

export async function fetchDeliveryContacts(companyId: string): Promise<DeliveryContact[]> {
  const { data, error } = await (supabase as any)
    .from("delivery_contacts")
    .select("id, name, phone")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function saveDeliveryContact(
  companyId: string,
  name: string,
  phone?: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from("delivery_contacts")
    .upsert(
      { company_id: companyId, name, phone: phone || null, updated_at: new Date().toISOString() },
      { onConflict: "company_id,name" }
    );
  if (error) throw error;
}
