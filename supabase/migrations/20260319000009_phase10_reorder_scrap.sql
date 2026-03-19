-- ============================================================
-- Phase 10: Reorder Intelligence + Scrap Register
-- ============================================================

-- Reorder Rules table (manual overrides per item)
CREATE TABLE IF NOT EXISTS public.reorder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  reorder_point numeric DEFAULT 0,
  reorder_qty numeric DEFAULT 0,
  preferred_vendor_id uuid REFERENCES public.parties(id),
  lead_time_days integer DEFAULT 7,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, item_id)
);

-- Scrap Register table
CREATE TABLE IF NOT EXISTS public.scrap_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  scrap_number varchar NOT NULL,
  scrap_date date NOT NULL DEFAULT CURRENT_DATE,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  drawing_number varchar,
  job_card_id uuid REFERENCES public.job_cards(id),
  job_card_number varchar,
  assembly_order_id uuid REFERENCES public.assembly_orders(id),
  assembly_order_number varchar,
  qty_scrapped numeric NOT NULL DEFAULT 0,
  unit varchar DEFAULT 'NOS',
  scrap_reason varchar NOT NULL,
  scrap_category varchar DEFAULT 'process_rejection' CHECK (scrap_category IN (
    'process_rejection',
    'incoming_rejection',
    'assembly_rejection',
    'rework_failure',
    'damage',
    'obsolescence',
    'other'
  )),
  cost_per_unit numeric DEFAULT 0,
  total_scrap_value numeric DEFAULT 0,
  disposal_method varchar DEFAULT 'write_off' CHECK (disposal_method IN (
    'write_off',
    'scrap_sale',
    'rework',
    'return_to_vendor'
  )),
  scrap_sale_value numeric DEFAULT 0,
  vendor_id uuid REFERENCES public.parties(id),
  vendor_name varchar,
  remarks text,
  recorded_by varchar,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Auto-generate scrap number (SCR-YYYY-NNN)
CREATE OR REPLACE FUNCTION public.generate_scrap_number()
RETURNS TRIGGER AS $func$
DECLARE
  fy_prefix text;
  next_seq integer;
BEGIN
  SELECT CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
    THEN TO_CHAR(CURRENT_DATE, 'YY') || TO_CHAR(CURRENT_DATE + INTERVAL '1 year', 'YY')
    ELSE TO_CHAR(CURRENT_DATE - INTERVAL '1 year', 'YY') || TO_CHAR(CURRENT_DATE, 'YY')
  END INTO fy_prefix;

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(scrap_number, '-', 3) AS integer)
  ), 0) + 1
  INTO next_seq
  FROM public.scrap_register
  WHERE company_id = NEW.company_id
    AND scrap_number LIKE 'SCR-' || fy_prefix || '-%';

  NEW.scrap_number := 'SCR-' || fy_prefix || '-' || LPAD(next_seq::text, 3, '0');
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_scrap_number ON public.scrap_register;
CREATE TRIGGER set_scrap_number
  BEFORE INSERT ON public.scrap_register
  FOR EACH ROW
  WHEN (NEW.scrap_number IS NULL OR NEW.scrap_number = '')
  EXECUTE FUNCTION public.generate_scrap_number();

-- RLS
ALTER TABLE public.reorder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrap_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation" ON public.reorder_rules
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "company_isolation" ON public.scrap_register
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reorder_rules_company ON public.reorder_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_reorder_rules_item    ON public.reorder_rules(item_id);
CREATE INDEX IF NOT EXISTS idx_scrap_register_company ON public.scrap_register(company_id);
CREATE INDEX IF NOT EXISTS idx_scrap_register_item    ON public.scrap_register(item_id);
CREATE INDEX IF NOT EXISTS idx_scrap_register_date    ON public.scrap_register(scrap_date);
