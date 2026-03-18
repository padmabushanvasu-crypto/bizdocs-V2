
-- 1. Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name varchar,
  avatar_url text,
  email varchar,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Triggers for updated_at
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Security definer function to get company_id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 5. Add company_id to ALL business tables
ALTER TABLE public.parties ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.purchase_orders ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.po_line_items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.delivery_challans ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.dc_line_items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.dc_returns ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.dc_return_items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.grns ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.grn_line_items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.invoices ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.invoice_line_items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.payments ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.company_settings ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.document_settings ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.custom_fields ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- 6. Drop ALL existing permissive policies
DROP POLICY IF EXISTS "Allow all insert access on company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Allow all read access on company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Allow all update access on company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Allow all delete access on custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Allow all insert access on custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Allow all read access on custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Allow all update access on custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Allow all delete access on dc_line_items" ON public.dc_line_items;
DROP POLICY IF EXISTS "Allow all insert access on dc_line_items" ON public.dc_line_items;
DROP POLICY IF EXISTS "Allow all read access on dc_line_items" ON public.dc_line_items;
DROP POLICY IF EXISTS "Allow all update access on dc_line_items" ON public.dc_line_items;
DROP POLICY IF EXISTS "Allow all delete access on dc_return_items" ON public.dc_return_items;
DROP POLICY IF EXISTS "Allow all insert access on dc_return_items" ON public.dc_return_items;
DROP POLICY IF EXISTS "Allow all read access on dc_return_items" ON public.dc_return_items;
DROP POLICY IF EXISTS "Allow all update access on dc_return_items" ON public.dc_return_items;
DROP POLICY IF EXISTS "Allow all delete access on dc_returns" ON public.dc_returns;
DROP POLICY IF EXISTS "Allow all insert access on dc_returns" ON public.dc_returns;
DROP POLICY IF EXISTS "Allow all read access on dc_returns" ON public.dc_returns;
DROP POLICY IF EXISTS "Allow all update access on dc_returns" ON public.dc_returns;
DROP POLICY IF EXISTS "Allow all delete access on delivery_challans" ON public.delivery_challans;
DROP POLICY IF EXISTS "Allow all insert access on delivery_challans" ON public.delivery_challans;
DROP POLICY IF EXISTS "Allow all read access on delivery_challans" ON public.delivery_challans;
DROP POLICY IF EXISTS "Allow all update access on delivery_challans" ON public.delivery_challans;
DROP POLICY IF EXISTS "Allow all insert access on document_settings" ON public.document_settings;
DROP POLICY IF EXISTS "Allow all read access on document_settings" ON public.document_settings;
DROP POLICY IF EXISTS "Allow all update access on document_settings" ON public.document_settings;
DROP POLICY IF EXISTS "Allow all delete access on grn_line_items" ON public.grn_line_items;
DROP POLICY IF EXISTS "Allow all insert access on grn_line_items" ON public.grn_line_items;
DROP POLICY IF EXISTS "Allow all read access on grn_line_items" ON public.grn_line_items;
DROP POLICY IF EXISTS "Allow all update access on grn_line_items" ON public.grn_line_items;
DROP POLICY IF EXISTS "Allow all delete access on grns" ON public.grns;
DROP POLICY IF EXISTS "Allow all insert access on grns" ON public.grns;
DROP POLICY IF EXISTS "Allow all read access on grns" ON public.grns;
DROP POLICY IF EXISTS "Allow all update access on grns" ON public.grns;
DROP POLICY IF EXISTS "Allow all delete access on invoice_line_items" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Allow all insert access on invoice_line_items" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Allow all read access on invoice_line_items" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Allow all update access on invoice_line_items" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Allow all delete access on invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow all insert access on invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow all read access on invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow all update access on invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow all delete access on items" ON public.items;
DROP POLICY IF EXISTS "Allow all insert access on items" ON public.items;
DROP POLICY IF EXISTS "Allow all read access on items" ON public.items;
DROP POLICY IF EXISTS "Allow all update access on items" ON public.items;
DROP POLICY IF EXISTS "Allow all delete access on parties" ON public.parties;
DROP POLICY IF EXISTS "Allow all insert access on parties" ON public.parties;
DROP POLICY IF EXISTS "Allow all read access on parties" ON public.parties;
DROP POLICY IF EXISTS "Allow all update access on parties" ON public.parties;
DROP POLICY IF EXISTS "Allow all delete access on payments" ON public.payments;
DROP POLICY IF EXISTS "Allow all insert access on payments" ON public.payments;
DROP POLICY IF EXISTS "Allow all read access on payments" ON public.payments;
DROP POLICY IF EXISTS "Allow all update access on payments" ON public.payments;
DROP POLICY IF EXISTS "Allow all delete access on po_line_items" ON public.po_line_items;
DROP POLICY IF EXISTS "Allow all insert access on po_line_items" ON public.po_line_items;
DROP POLICY IF EXISTS "Allow all read access on po_line_items" ON public.po_line_items;
DROP POLICY IF EXISTS "Allow all update access on po_line_items" ON public.po_line_items;
DROP POLICY IF EXISTS "Allow all delete access on purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Allow all insert access on purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Allow all read access on purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Allow all update access on purchase_orders" ON public.purchase_orders;

-- 7. Create new RLS policies
-- Profiles: users see/edit only their own
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Companies: view/update own company; anyone authenticated can create
CREATE POLICY "Users can view own company" ON public.companies FOR SELECT TO authenticated USING (id = public.get_company_id());
CREATE POLICY "Users can update own company" ON public.companies FOR UPDATE TO authenticated USING (id = public.get_company_id());
CREATE POLICY "Authenticated can create company" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);

-- All business tables: company isolation
CREATE POLICY "company_isolation" ON public.parties FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.items FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.purchase_orders FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.po_line_items FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.delivery_challans FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.dc_line_items FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.dc_returns FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.dc_return_items FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.grns FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.grn_line_items FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.invoices FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.invoice_line_items FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.payments FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.company_settings FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.document_settings FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
CREATE POLICY "company_isolation" ON public.custom_fields FOR ALL TO authenticated USING (company_id = public.get_company_id()) WITH CHECK (company_id = public.get_company_id());
