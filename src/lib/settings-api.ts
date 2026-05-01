import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

export interface CompanySettings {
  id: string;
  company_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  pin_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  gstin: string | null;
  pan: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  logo_url: string | null;
  signature_url: string | null;
  default_terms: string | null;
  financial_year_start: string | null;
  financial_year_label: string | null;
  // Document settings columns (added via migration)
  fy_year: string | null;
  invoice_prefix: string | null;
  po_prefix: string | null;
  dc_prefix: string | null;
  grn_prefix: string | null;
  jc_prefix: string | null;
  ao_prefix: string | null;
  so_prefix: string | null;
  dn_prefix: string | null;
  fat_prefix: string | null;
  rcp_prefix: string | null;
  default_payment_terms: string | null;
  default_terms_conditions: string | null;
  default_bank_name: string | null;
  default_bank_account: string | null;
  default_bank_ifsc: string | null;
  default_bank_branch: string | null;
  show_logo: boolean | null;
  show_signature: boolean | null;
  show_not_for_sale: boolean | null;
  show_original_duplicate: boolean | null;
  default_footer_text: string | null;
  // Registered office address (separate from physical/factory address)
  registered_address_line1: string | null;
  registered_address_line2: string | null;
  registered_address_line3: string | null;
  registered_city: string | null;
  registered_state: string | null;
  registered_state_code: string | null;
  registered_pin_code: string | null;
}

export interface DocumentSettings {
  id: string;
  document_type: string;
  paper_size: string;
  copies_per_page: number;
  show_logo: boolean;
  show_signature: boolean;
  show_bank_details: boolean;
  show_gst_breakup: boolean;
  show_drawing_number: boolean;
  show_not_for_sale: boolean;
  column_label_overrides: Record<string, string>;
  header_note: string | null;
  footer_note: string | null;
  terms_and_conditions: string | null;
  numbering_prefix: string | null;
  numbering_start: number;
  numbering_current: number;
  show_hsn: boolean | null;
  show_rate_amount: boolean | null;
  show_nature_of_process: boolean | null;
  show_vehicle_details: boolean | null;
}

export interface CustomField {
  id: string;
  document_type: string;
  field_label: string;
  field_key: string;
  field_type: string;
  dropdown_options: string[];
  location: string;
  is_required: boolean;
  print_on_document: boolean;
  default_value: string | null;
  is_searchable: boolean;
  sort_order: number;
  status: string;
}

// Company Settings
export async function fetchCompanySettings(): Promise<CompanySettings | null> {
  const { data } = await supabase.from("company_settings").select("*").limit(1).single();
  return data as CompanySettings | null;
}

export async function saveCompanySettings(settings: Partial<CompanySettings>) {
  const existing = await fetchCompanySettings();
  if (existing) {
    const { data, error } = await supabase.from("company_settings").update(settings as any).eq("id", existing.id).select().single();
    if (error) throw error;
    return data;
  } else {
    const companyId = await getCompanyId();
    if (!companyId) throw new Error("No company configured");
    const { data, error } = await supabase.from("company_settings").insert({ ...settings, company_id: companyId } as any).select().single();
    if (error) throw error;
    return data;
  }
}

// Document Settings
export async function fetchDocumentSettings(docType: string): Promise<DocumentSettings | null> {
  const { data } = await supabase.from("document_settings").select("*").eq("document_type", docType).single();
  return data as DocumentSettings | null;
}

export async function fetchAllDocumentSettings(): Promise<DocumentSettings[]> {
  const { data } = await supabase.from("document_settings").select("*").order("document_type");
  return (data ?? []) as DocumentSettings[];
}

export async function saveDocumentSettings(docType: string, settings: Partial<DocumentSettings>) {
  const { data, error } = await supabase.from("document_settings").update(settings as any).eq("document_type", docType).select().single();
  if (error) throw error;
  return data;
}

export async function upsertDocumentSettings(docType: string, settings: Partial<DocumentSettings>) {
  // Update existing row; silently no-ops for doc types not yet in document_settings
  await supabase.from("document_settings").update(settings as any).eq("document_type", docType);
}

// Custom Fields
export async function fetchCustomFields(docType?: string): Promise<CustomField[]> {
  let query = supabase.from("custom_fields").select("*").eq("status", "active").order("sort_order");
  if (docType) query = query.eq("document_type", docType);
  const { data } = await query;
  return (data ?? []) as CustomField[];
}

export async function createCustomField(field: Partial<CustomField>) {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No company configured");
  const { data, error } = await supabase.from("custom_fields").insert({ ...field, company_id: companyId } as any).select().single();
  if (error) throw error;
  return data;
}

export async function updateCustomField(id: string, field: Partial<CustomField>) {
  const { data, error } = await supabase.from("custom_fields").update(field as any).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCustomField(id: string) {
  const { error } = await supabase.from("custom_fields").update({ status: "inactive" } as any).eq("id", id);
  if (error) throw error;
}

// Notification Settings
//
// Email-schedule fields (po_email_*, dc_email_*) live on company_settings and
// are read by the weekly Edge Functions. The remaining fields (stock alert,
// business summary, stock editor names) are still localStorage-only — those
// features have no Edge Function yet, so persisting them server-side would
// have no effect.
export interface NotificationSettings {
  stock_alert_enabled: boolean;
  stock_alert_time: string;
  global_min_stock_default: number;
  warning_threshold_pct: number;
  stock_alert_recipients: string[];
  weekly_summary_enabled: boolean;
  weekly_summary_day: string;
  weekly_summary_time: string;
  weekly_summary_recipients: string[];
  // Phase 19+: Weekly PO email (server-side schedule)
  po_email_enabled: boolean;
  po_email_day: string;
  po_email_time: string;
  po_email_recipients: string[];
  // Weekly DC email (server-side schedule)
  dc_email_enabled: boolean;
  dc_email_day: string;
  dc_email_time: string;
  dc_email_recipients: string[];
  // Stock editor names for opening stock audit trail
  stock_editor_names: string[];
}

const NS_KEY = "bizdocs_notification_settings";

const NS_DEFAULTS: NotificationSettings = {
  stock_alert_enabled: false,
  stock_alert_time: "09:00",
  global_min_stock_default: 10,
  warning_threshold_pct: 10,
  stock_alert_recipients: [],
  weekly_summary_enabled: false,
  weekly_summary_day: "Monday",
  weekly_summary_time: "08:00",
  weekly_summary_recipients: [],
  po_email_enabled: true,
  po_email_day: "Monday",
  po_email_time: "08:00",
  po_email_recipients: [],
  dc_email_enabled: false,
  dc_email_day: "Monday",
  dc_email_time: "08:00",
  dc_email_recipients: [],
  stock_editor_names: [],
};

const toStringArray = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  return [];
};

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  // Start with localStorage values for fields without server backing
  let merged: NotificationSettings = { ...NS_DEFAULTS };
  try {
    const stored = localStorage.getItem(NS_KEY);
    if (stored) merged = { ...merged, ...JSON.parse(stored) };
  } catch { /* ignore */ }

  // Overlay server-backed schedule fields from company_settings (source of truth)
  try {
    const cs = await fetchCompanySettings();
    if (cs) {
      const c = cs as any;
      merged = {
        ...merged,
        po_email_enabled:    c.po_email_enabled ?? merged.po_email_enabled,
        po_email_day:        c.po_email_day     ?? merged.po_email_day,
        po_email_time:       c.po_email_time    ?? merged.po_email_time,
        po_email_recipients: toStringArray(c.po_email_recipients),
        dc_email_enabled:    c.dc_email_enabled ?? merged.dc_email_enabled,
        dc_email_day:        c.dc_email_day     ?? merged.dc_email_day,
        dc_email_time:       c.dc_email_time    ?? merged.dc_email_time,
        dc_email_recipients: toStringArray(c.dc_email_recipients),
      };
    }
  } catch { /* ignore — DB may be unavailable, fall back to localStorage/defaults */ }

  return merged;
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  // Persist non-schedule fields (still localStorage-only — no server feature yet)
  localStorage.setItem(NS_KEY, JSON.stringify(settings));

  // Persist schedule fields to company_settings (read by Edge Functions)
  await saveEmailScheduleSettingsToDB({
    po_email_enabled:    settings.po_email_enabled,
    po_email_day:        settings.po_email_day,
    po_email_time:       settings.po_email_time,
    po_email_recipients: settings.po_email_recipients,
    dc_email_enabled:    settings.dc_email_enabled,
    dc_email_day:        settings.dc_email_day,
    dc_email_time:       settings.dc_email_time,
    dc_email_recipients: settings.dc_email_recipients,
  });
}

export async function saveEmailScheduleSettingsToDB(fields: {
  po_email_enabled: boolean;
  po_email_day: string;
  po_email_time: string;
  po_email_recipients: string[];
  dc_email_enabled: boolean;
  dc_email_day: string;
  dc_email_time: string;
  dc_email_recipients: string[];
}): Promise<void> {
  const existing = await fetchCompanySettings();
  if (!existing) return;
  await supabase
    .from("company_settings")
    .update(fields as any)
    .eq("id", existing.id);
}

// Kept for backwards compatibility with any caller still passing only PO fields.
export async function savePOEmailSettingsToDB(
  po_email_enabled: boolean,
  po_email_recipients: string[]
): Promise<void> {
  const existing = await fetchCompanySettings();
  if (!existing) return;
  await supabase
    .from("company_settings")
    .update({ po_email_enabled, po_email_recipients } as any)
    .eq("id", existing.id);
}

// Financial Year
export async function startNewFinancialYear() {
  const now = new Date();
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const label = `${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
  const prefix = `${label}/`;

  await supabase.from("company_settings").update({
    financial_year_start: `${fy}-04-01`,
    financial_year_label: label,
  } as any).neq("id", "00000000-0000-0000-0000-000000000000");

  const docTypes = ["purchase_order", "delivery_challan", "invoice", "grn"];
  for (const dt of docTypes) {
    await supabase.from("document_settings").update({
      numbering_prefix: prefix,
      numbering_current: 0,
    } as any).eq("document_type", dt);
  }

  await supabase.from("document_settings").update({
    numbering_prefix: `RCT-${fy.toString().slice(2)}${(fy + 1).toString().slice(2)}/`,
    numbering_current: 0,
  } as any).eq("document_type", "payment_receipt");
}
