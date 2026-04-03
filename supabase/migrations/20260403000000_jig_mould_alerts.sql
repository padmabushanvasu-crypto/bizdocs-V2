-- Jig master table (may already exist)
CREATE TABLE IF NOT EXISTS public.jig_master (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id),
  drawing_number varchar NOT NULL,
  jig_number varchar,
  status varchar DEFAULT 'ok' CHECK (status IN ('ok', 'to_be_made')),
  priority varchar,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.jig_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_access" ON public.jig_master;
CREATE POLICY "company_access" ON public.jig_master FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Mould items table
CREATE TABLE IF NOT EXISTS public.mould_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id),
  drawing_number varchar NOT NULL,
  drawing_revision varchar,
  description varchar NOT NULL,
  vendor_name varchar NOT NULL,
  vendor_id uuid REFERENCES public.parties(id),
  notes text,
  alert_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.mould_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_access" ON public.mould_items;
CREATE POLICY "company_access" ON public.mould_items FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
