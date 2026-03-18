
-- Items master table
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code varchar NOT NULL,
  description text NOT NULL,
  drawing_number varchar,
  item_type varchar NOT NULL DEFAULT 'finished_good',
  unit varchar DEFAULT 'NOS',
  hsn_sac_code varchar,
  sale_price numeric DEFAULT 0,
  purchase_price numeric DEFAULT 0,
  gst_rate numeric DEFAULT 18,
  min_stock numeric DEFAULT 0,
  current_stock numeric DEFAULT 0,
  notes text,
  status varchar DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_items_code ON public.items(item_code);
CREATE INDEX idx_items_status ON public.items(status);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all read access on items" ON public.items FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert access on items" ON public.items FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update access on items" ON public.items FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all delete access on items" ON public.items FOR DELETE TO public USING (true);

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Company settings (single row)
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name varchar,
  address_line1 varchar,
  address_line2 varchar,
  city varchar,
  state varchar,
  state_code varchar DEFAULT '33',
  pin_code varchar,
  phone varchar,
  email varchar,
  website varchar,
  gstin varchar,
  pan varchar,
  bank_name varchar,
  bank_account varchar,
  bank_ifsc varchar,
  bank_branch varchar,
  logo_url text,
  signature_url text,
  default_terms text,
  financial_year_start date DEFAULT '2025-04-01',
  financial_year_label varchar DEFAULT '2025-26',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all read access on company_settings" ON public.company_settings FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert access on company_settings" ON public.company_settings FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update access on company_settings" ON public.company_settings FOR UPDATE TO public USING (true);

CREATE TRIGGER update_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Document settings per document type
CREATE TABLE public.document_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type varchar NOT NULL,
  paper_size varchar DEFAULT 'A4 Portrait',
  copies_per_page integer DEFAULT 1,
  show_logo boolean DEFAULT true,
  show_signature boolean DEFAULT true,
  show_bank_details boolean DEFAULT true,
  show_gst_breakup boolean DEFAULT true,
  show_drawing_number boolean DEFAULT true,
  show_not_for_sale boolean DEFAULT true,
  column_label_overrides jsonb DEFAULT '{}',
  header_note text,
  footer_note text,
  terms_and_conditions text,
  numbering_prefix varchar,
  numbering_start integer DEFAULT 1,
  numbering_current integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_type)
);

ALTER TABLE public.document_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all read access on document_settings" ON public.document_settings FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert access on document_settings" ON public.document_settings FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update access on document_settings" ON public.document_settings FOR UPDATE TO public USING (true);

CREATE TRIGGER update_document_settings_updated_at BEFORE UPDATE ON public.document_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Custom fields
CREATE TABLE public.custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type varchar NOT NULL,
  field_label varchar NOT NULL,
  field_key varchar NOT NULL,
  field_type varchar NOT NULL DEFAULT 'text',
  dropdown_options jsonb DEFAULT '[]',
  location varchar NOT NULL DEFAULT 'header',
  is_required boolean DEFAULT false,
  print_on_document boolean DEFAULT true,
  default_value text,
  is_searchable boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  status varchar DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_fields_doctype ON public.custom_fields(document_type);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all read access on custom_fields" ON public.custom_fields FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert access on custom_fields" ON public.custom_fields FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update access on custom_fields" ON public.custom_fields FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all delete access on custom_fields" ON public.custom_fields FOR DELETE TO public USING (true);

CREATE TRIGGER update_custom_fields_updated_at BEFORE UPDATE ON public.custom_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default document settings
INSERT INTO public.document_settings (document_type, numbering_prefix, terms_and_conditions) VALUES
  ('purchase_order', '25-26/', 'Delivery as per schedule. Quality as per our specifications.'),
  ('delivery_challan', '25-26/', 'Goods sent on returnable basis. Not for sale.'),
  ('invoice', '25-26/', '1. Payment due as per agreed terms.\n2. Interest @ 18% p.a. on overdue payments.\n3. Goods once sold will not be taken back.'),
  ('grn', '25-26/', ''),
  ('payment_receipt', 'RCT-2526/', '');
