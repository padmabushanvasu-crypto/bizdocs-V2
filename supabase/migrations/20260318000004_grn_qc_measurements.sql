-- GRN QC Measurements table for per-characteristic inspection data

CREATE TABLE IF NOT EXISTS public.grn_qc_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  grn_id uuid NOT NULL REFERENCES public.grns(id) ON DELETE CASCADE,
  grn_line_item_id uuid NOT NULL REFERENCES public.grn_line_items(id) ON DELETE CASCADE,
  sl_no integer NOT NULL,
  characteristic varchar(200) NOT NULL,
  specification varchar(200),
  qty_checked integer,
  sample_1 varchar(100),
  sample_2 varchar(100),
  sample_3 varchar(100),
  sample_4 varchar(100),
  sample_5 varchar(100),
  result varchar(20) CHECK (result IN ('conforming', 'non_conforming')),
  measuring_instrument varchar(200),
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.grn_qc_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.grn_qc_measurements;
CREATE POLICY "company_access" ON public.grn_qc_measurements
  FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_grn_qc_measurements_grn_id ON public.grn_qc_measurements(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_qc_measurements_line_item_id ON public.grn_qc_measurements(grn_line_item_id);

NOTIFY pgrst, 'reload schema';
