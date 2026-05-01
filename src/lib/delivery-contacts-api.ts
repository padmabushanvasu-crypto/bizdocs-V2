import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface DeliveryContact {
  id: string;
  name: string;
  phone: string | null;
}

export async function fetchDeliveryContacts(companyId: string): Promise<DeliveryContact[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/delivery_contacts?company_id=eq.${encodeURIComponent(companyId)}&order=name`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    console.error('fetchDeliveryContacts:', await res.text());
    return [];
  }

  return res.json();
}

export async function saveDeliveryContact(
  companyId: string,
  name: string,
  phone?: string
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/delivery_contacts`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        company_id: companyId,
        name,
        phone: phone || null,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('saveDeliveryContact:', err);
    throw new Error(err);
  }
}
