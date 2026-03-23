-- ============================================================
-- Job Cards: priority, planned_start_date, due_date, sales_order_ref
-- ============================================================

ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS planned_start_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS priority varchar DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS sales_order_ref varchar;

-- Recreate summary view to include new columns
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
  jc.drawing_number,
  jc.drawing_revision,
  jc.planned_start_date,
  jc.due_date,
  jc.priority,
  jc.sales_order_ref,
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
