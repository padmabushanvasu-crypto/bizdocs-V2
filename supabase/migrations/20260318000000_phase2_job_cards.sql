-- Phase 2: Job Cards Module
-- Tables: stage_templates, job_cards, job_card_steps
-- View: job_card_summary

-- ============================================================
-- 1. stage_templates
-- ============================================================
CREATE TABLE public.stage_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  name varchar NOT NULL,
  category varchar DEFAULT 'Other' CHECK (category IN ('Manufacturing', 'Logistics', 'Quality', 'Packaging', 'Other')),
  description text,
  default_cost numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  status varchar DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stage_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON public.stage_templates
  FOR ALL TO authenticated
  USING (company_id = public.get_company_id())
  WITH CHECK (company_id = public.get_company_id());

CREATE INDEX idx_stage_templates_company ON public.stage_templates(company_id);
CREATE INDEX idx_stage_templates_status ON public.stage_templates(status);

CREATE TRIGGER update_stage_templates_updated_at
  BEFORE UPDATE ON public.stage_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. job_cards
-- ============================================================
CREATE TABLE public.job_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  jc_number varchar NOT NULL,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  tracking_mode varchar DEFAULT 'batch' CHECK (tracking_mode IN ('batch', 'single')),
  batch_ref varchar,
  quantity_original numeric NOT NULL DEFAULT 1,
  quantity_accepted numeric NOT NULL DEFAULT 1,
  quantity_rejected numeric NOT NULL DEFAULT 0,
  initial_cost numeric DEFAULT 0,
  standard_cost numeric DEFAULT 0,
  current_location varchar DEFAULT 'in_house' CHECK (current_location IN ('in_house', 'at_vendor')),
  current_vendor_name varchar,
  current_vendor_since timestamptz,
  status varchar DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'on_hold')),
  notes text,
  completed_at timestamptz,
  linked_grn_id uuid REFERENCES public.grns(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON public.job_cards
  FOR ALL TO authenticated
  USING (company_id = public.get_company_id())
  WITH CHECK (company_id = public.get_company_id());

CREATE INDEX idx_job_cards_company ON public.job_cards(company_id);
CREATE INDEX idx_job_cards_status ON public.job_cards(status);
CREATE INDEX idx_job_cards_item ON public.job_cards(item_id);
CREATE INDEX idx_job_cards_jc_number ON public.job_cards(jc_number);

CREATE TRIGGER update_job_cards_updated_at
  BEFORE UPDATE ON public.job_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. job_card_steps
-- ============================================================
CREATE TABLE public.job_card_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  job_card_id uuid NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  step_type varchar NOT NULL CHECK (step_type IN ('internal', 'external')),
  name varchar NOT NULL,
  stage_template_id uuid REFERENCES public.stage_templates(id),
  status varchar DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),

  -- Internal step fields
  labour_cost numeric DEFAULT 0,
  material_cost numeric DEFAULT 0,
  additional_cost numeric DEFAULT 0,

  -- External step fields
  vendor_id uuid REFERENCES public.parties(id),
  vendor_name varchar,
  outward_dc_id uuid REFERENCES public.delivery_challans(id),
  expected_return_date date,
  return_dc_id uuid REFERENCES public.delivery_challans(id),
  return_grn_id uuid REFERENCES public.grns(id),
  qty_sent numeric,
  qty_returned numeric,
  job_work_charges numeric DEFAULT 0,
  transport_cost_out numeric DEFAULT 0,
  transport_cost_in numeric DEFAULT 0,
  material_consumed numeric DEFAULT 0,

  -- Inspection fields (for external steps on return)
  inspection_result varchar CHECK (inspection_result IN ('accepted', 'partially_accepted', 'rejected')),
  qty_accepted numeric,
  qty_rejected numeric,
  rejection_reason text,
  inspected_by varchar,
  inspected_at timestamptz,

  -- Rework
  is_rework boolean DEFAULT false,
  rework_reason text,

  -- General
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_card_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON public.job_card_steps
  FOR ALL TO authenticated
  USING (company_id = public.get_company_id())
  WITH CHECK (company_id = public.get_company_id());

CREATE INDEX idx_job_card_steps_job_card ON public.job_card_steps(job_card_id);
CREATE INDEX idx_job_card_steps_company ON public.job_card_steps(company_id);
CREATE INDEX idx_job_card_steps_status ON public.job_card_steps(status);

CREATE TRIGGER update_job_card_steps_updated_at
  BEFORE UPDATE ON public.job_card_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. job_card_summary view
-- Uses security_invoker = true so Supabase RLS on job_cards applies
-- ============================================================
CREATE OR REPLACE VIEW public.job_card_summary
WITH (security_invoker = true)
AS
SELECT
  jc.id,
  jc.company_id,
  jc.jc_number,
  jc.item_id,
  jc.item_code,
  jc.item_description,
  jc.tracking_mode,
  jc.batch_ref,
  jc.quantity_original,
  jc.quantity_accepted,
  jc.quantity_rejected,
  jc.initial_cost,
  jc.standard_cost,
  jc.current_location,
  jc.current_vendor_name,
  jc.current_vendor_since,
  jc.status,
  jc.notes,
  jc.completed_at,
  jc.linked_grn_id,
  jc.created_at,
  jc.updated_at,
  COALESCE(SUM(
    COALESCE(jcs.labour_cost, 0) +
    COALESCE(jcs.material_cost, 0) +
    COALESCE(jcs.additional_cost, 0) +
    COALESCE(jcs.job_work_charges, 0) +
    COALESCE(jcs.transport_cost_out, 0) +
    COALESCE(jcs.transport_cost_in, 0) +
    COALESCE(jcs.material_consumed, 0)
  ), 0) AS total_step_cost,
  COALESCE(jc.initial_cost, 0) + COALESCE(SUM(
    COALESCE(jcs.labour_cost, 0) +
    COALESCE(jcs.material_cost, 0) +
    COALESCE(jcs.additional_cost, 0) +
    COALESCE(jcs.job_work_charges, 0) +
    COALESCE(jcs.transport_cost_out, 0) +
    COALESCE(jcs.transport_cost_in, 0) +
    COALESCE(jcs.material_consumed, 0)
  ), 0) AS total_cost,
  CASE
    WHEN jc.quantity_accepted = 0 THEN NULL
    ELSE (COALESCE(jc.initial_cost, 0) + COALESCE(SUM(
      COALESCE(jcs.labour_cost, 0) +
      COALESCE(jcs.material_cost, 0) +
      COALESCE(jcs.additional_cost, 0) +
      COALESCE(jcs.job_work_charges, 0) +
      COALESCE(jcs.transport_cost_out, 0) +
      COALESCE(jcs.transport_cost_in, 0) +
      COALESCE(jcs.material_consumed, 0)
    ), 0)) / NULLIF(jc.quantity_accepted, 0)
  END AS cost_per_unit,
  (COALESCE(jc.initial_cost, 0) + COALESCE(SUM(
    COALESCE(jcs.labour_cost, 0) +
    COALESCE(jcs.material_cost, 0) +
    COALESCE(jcs.additional_cost, 0) +
    COALESCE(jcs.job_work_charges, 0) +
    COALESCE(jcs.transport_cost_out, 0) +
    COALESCE(jcs.transport_cost_in, 0) +
    COALESCE(jcs.material_consumed, 0)
  ), 0)) - COALESCE(jc.standard_cost, 0) AS variance,
  COUNT(jcs.id) AS step_count,
  COUNT(jcs.id) FILTER (WHERE jcs.status = 'done') AS completed_steps
FROM public.job_cards jc
LEFT JOIN public.job_card_steps jcs ON jcs.job_card_id = jc.id
GROUP BY jc.id;
