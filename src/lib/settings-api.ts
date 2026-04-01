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

// Notification Settings (stored in company_settings as JSON-compatible fields via localStorage)
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
  // Phase 19: Weekly PO email
  po_email_enabled: boolean;
  po_email_recipients: string[];
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
  po_email_recipients: [],
};

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  try {
    const stored = localStorage.getItem(NS_KEY);
    if (stored) return { ...NS_DEFAULTS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...NS_DEFAULTS };
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  localStorage.setItem(NS_KEY, JSON.stringify(settings));
}

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
