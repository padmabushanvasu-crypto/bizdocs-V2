-- Phase 3: WIP Register view
-- Shows all active job cards (in_progress or on_hold) with current step info,
-- days at vendor, overdue flags.

CREATE OR REPLACE VIEW public.wip_register
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
  jc.current_location,
  jc.current_vendor_name,
  jc.current_vendor_since,
  jc.status,
  jc.notes,
  jc.created_at,
  -- Days since the job card was opened
  EXTRACT(DAY FROM (now() - jc.created_at))::int AS days_active,
  -- Days at current vendor (null if in_house)
  CASE
    WHEN jc.current_location = 'at_vendor' AND jc.current_vendor_since IS NOT NULL
    THEN EXTRACT(DAY FROM (now() - jc.current_vendor_since))::int
    ELSE NULL
  END AS days_at_vendor,
  -- Current step info via LATERAL join on latest non-done external step (if at vendor)
  -- or latest non-done step overall
  cur.step_id AS current_step_id,
  cur.step_name AS current_step_name,
  cur.step_type AS current_step_type,
  cur.step_number AS current_step_number,
  cur.vendor_name AS current_step_vendor,
  cur.expected_return_date,
  -- Overdue: at_vendor and expected_return_date is in the past
  CASE
    WHEN jc.current_location = 'at_vendor'
      AND cur.expected_return_date IS NOT NULL
      AND cur.expected_return_date < CURRENT_DATE
    THEN true
    ELSE false
  END AS is_overdue,
  CASE
    WHEN jc.current_location = 'at_vendor'
      AND cur.expected_return_date IS NOT NULL
      AND cur.expected_return_date < CURRENT_DATE
    THEN (CURRENT_DATE - cur.expected_return_date)::int
    ELSE NULL
  END AS days_overdue,
  -- Running cost from job_card_summary (computed in a sub-select)
  COALESCE(jcs.total_cost, jc.initial_cost) AS total_cost,
  COALESCE(jcs.total_step_cost, 0) AS total_step_cost,
  COALESCE(jcs.step_count, 0) AS step_count,
  COALESCE(jcs.completed_steps, 0) AS completed_steps
FROM public.job_cards jc
LEFT JOIN LATERAL (
  SELECT
    s.id AS step_id,
    s.name AS step_name,
    s.step_type,
    s.step_number,
    s.vendor_name,
    s.expected_return_date
  FROM public.job_card_steps s
  WHERE s.job_card_id = jc.id
    AND s.status != 'done'
  ORDER BY s.step_number DESC
  LIMIT 1
) cur ON true
LEFT JOIN public.job_card_summary jcs ON jcs.id = jc.id
WHERE jc.status IN ('in_progress', 'on_hold')
ORDER BY
  -- At-vendor overdue first
  (jc.current_location = 'at_vendor' AND cur.expected_return_date IS NOT NULL AND cur.expected_return_date < CURRENT_DATE) DESC,
  -- Then most days overdue
  days_overdue DESC NULLS LAST,
  -- Then most days at vendor
  days_at_vendor DESC NULLS LAST,
  jc.created_at DESC;
