-- ============================================================
-- BOM Process Route: Make/Buy flag, lead time, and process steps
-- ============================================================

-- Add Make/Buy flag and lead time to BOM lines
ALTER TABLE public.bom_lines
  ADD COLUMN IF NOT EXISTS make_or_buy varchar DEFAULT 'make'
    CHECK (make_or_buy IN ('make', 'buy')),
  ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT 0;

-- Process route steps per BOM line
CREATE TABLE IF NOT EXISTS public.bom_process_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  bom_line_id uuid REFERENCES public.bom_lines(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 1,
  step_type varchar DEFAULT 'internal' CHECK (step_type IN ('internal', 'external')),
  process_name varchar NOT NULL,
  vendor_id uuid REFERENCES public.parties(id),
  vendor_name varchar,
  lead_time_days integer DEFAULT 1,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.bom_process_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_isolation" ON public.bom_process_steps;
CREATE POLICY "company_isolation" ON public.bom_process_steps
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_bom_process_steps_line
  ON public.bom_process_steps(bom_line_id);
CREATE INDEX IF NOT EXISTS idx_bom_process_steps_company
  ON public.bom_process_steps(company_id);
