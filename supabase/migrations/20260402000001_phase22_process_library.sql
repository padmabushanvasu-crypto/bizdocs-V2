-- Phase 22: Process Library
-- Master list of standard process codes + approved vendors per process

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS process_library_enabled boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS public.process_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  process_code varchar,
  process_name varchar NOT NULL,
  stage_type varchar NOT NULL DEFAULT 'external' CHECK (stage_type IN ('internal','external')),
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.process_code_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  process_code_id uuid REFERENCES public.process_codes(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  vendor_name varchar,
  is_preferred boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.process_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_code_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation" ON public.process_codes
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "company_isolation" ON public.process_code_vendors
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_process_codes_company ON public.process_codes(company_id);
CREATE INDEX IF NOT EXISTS idx_process_code_vendors_code ON public.process_code_vendors(process_code_id);

NOTIFY pgrst, 'reload schema';
