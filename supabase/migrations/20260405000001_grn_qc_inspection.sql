-- GRN QC Inspection: add qc_* columns to grns and create grn_inspection_lines table

ALTER TABLE public.grns
  ADD COLUMN IF NOT EXISTS qc_remarks text,
  ADD COLUMN IF NOT EXISTS qc_prepared_by varchar(100),
  ADD COLUMN IF NOT EXISTS qc_inspected_by varchar(100),
  ADD COLUMN IF NOT EXISTS qc_approved_by varchar(100);

CREATE TABLE IF NOT EXISTS public.grn_inspection_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_id uuid NOT NULL REFERENCES public.grns(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id),
  sl_no integer NOT NULL,
  characteristic varchar(200) NOT NULL,
  specification varchar(200),
  qty_checked numeric,
  result varchar(20) CHECK (result IN ('pass', 'fail', 'conditional')),
  measuring_instrument varchar(200),
  non_conformance_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.grn_inspection_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.grn_inspection_lines;
CREATE POLICY "company_access" ON public.grn_inspection_lines
  FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
