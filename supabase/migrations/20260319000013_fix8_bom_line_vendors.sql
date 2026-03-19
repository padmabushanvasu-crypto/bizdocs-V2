-- Fix 8: BOM line vendors — multiple vendors per BOM component
CREATE TABLE IF NOT EXISTS public.bom_line_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bom_line_id uuid NOT NULL REFERENCES public.bom_lines(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  vendor_name varchar NOT NULL,
  vendor_code varchar,
  unit_price numeric(12,4),
  lead_time_days integer,
  min_order_qty numeric(12,4),
  currency varchar DEFAULT 'INR',
  is_preferred boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.bom_line_vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_isolation" ON public.bom_line_vendors;
CREATE POLICY "company_isolation" ON public.bom_line_vendors
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_bom_line_vendors_bom_line ON public.bom_line_vendors(bom_line_id);
CREATE INDEX IF NOT EXISTS idx_bom_line_vendors_company ON public.bom_line_vendors(company_id);
