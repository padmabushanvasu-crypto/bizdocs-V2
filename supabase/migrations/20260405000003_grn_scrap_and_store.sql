-- GRN Scrap Items, Store Confirmation, Final GRN flag
-- Part of Batch 1: Stage 1/2 changes + Final GRN + Store confirmation

-- ── New columns on grns ────────────────────────────────────────────────────────
ALTER TABLE public.grns
  ADD COLUMN IF NOT EXISTS scrap_returned      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS scrap_notes         text,
  ADD COLUMN IF NOT EXISTS is_final_grn        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_grn_reason    text,
  ADD COLUMN IF NOT EXISTS store_confirmed     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_confirmed_by  text,
  ADD COLUMN IF NOT EXISTS store_confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS store_location      text,
  ADD COLUMN IF NOT EXISTS store_notes         text;

-- ── GRN Scrap Items (DC-GRN scrap return tracking) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.grn_scrap_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        REFERENCES public.companies(id),
  grn_id        uuid        NOT NULL REFERENCES public.grns(id) ON DELETE CASCADE,
  material_type varchar(200) NOT NULL,
  quantity      numeric,
  unit          varchar(50),
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.grn_scrap_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.grn_scrap_items;
CREATE POLICY "company_access" ON public.grn_scrap_items
  FOR ALL
  USING  (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_grn_scrap_items_grn_id ON public.grn_scrap_items(grn_id);

-- ── Allow awaiting_store as a valid grn_stage ──────────────────────────────────
ALTER TABLE public.grns DROP CONSTRAINT IF EXISTS grns_grn_stage_check;
ALTER TABLE public.grns ADD CONSTRAINT grns_grn_stage_check
  CHECK (grn_stage IN (
    'draft', 'quantitative_pending', 'quantitative_done',
    'quality_pending', 'quality_done', 'closed', 'awaiting_store'
  ));

-- ── Per-characteristic qty breakdown on QC measurements ───────────────────────
ALTER TABLE public.grn_qc_measurements
  ADD COLUMN IF NOT EXISTS conforming_qty     numeric,
  ADD COLUMN IF NOT EXISTS non_conforming_qty numeric;

NOTIFY pgrst, 'reload schema';
