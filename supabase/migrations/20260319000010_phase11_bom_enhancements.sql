-- ============================================================
-- Phase 11: Full Operative BOM
-- ============================================================

-- BOM Variants table
CREATE TABLE IF NOT EXISTS public.bom_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  variant_name varchar NOT NULL,
  variant_code varchar,
  description text,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, item_id, variant_name)
);

-- Add new columns to bom_lines
ALTER TABLE public.bom_lines
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.bom_variants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_critical boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS scrap_factor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_designator varchar,
  ADD COLUMN IF NOT EXISTS drawing_number varchar;

-- RLS
ALTER TABLE public.bom_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_isolation" ON public.bom_variants;
CREATE POLICY "company_isolation" ON public.bom_variants
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bom_variants_company ON public.bom_variants(company_id);
CREATE INDEX IF NOT EXISTS idx_bom_variants_item    ON public.bom_variants(item_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_variant    ON public.bom_lines(variant_id);
