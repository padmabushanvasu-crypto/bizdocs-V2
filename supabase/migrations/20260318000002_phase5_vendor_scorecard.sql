-- Phase 5: Vendor Scorecard view
CREATE OR REPLACE VIEW public.vendor_scorecard
WITH (security_invoker = true)
AS
SELECT
  p.id AS vendor_id,
  p.company_id,
  p.name AS vendor_name,
  p.city,
  p.phone1,
  p.gstin,

  -- Job work volume
  COUNT(DISTINCT jcs.id) AS total_steps,
  COALESCE(SUM(jcs.qty_sent), 0) AS total_qty_sent,
  COALESCE(SUM(jcs.qty_accepted), 0) AS total_qty_accepted,
  COALESCE(SUM(jcs.qty_rejected), 0) AS total_qty_rejected,

  -- Rejection rate
  CASE
    WHEN COALESCE(SUM(jcs.qty_sent), 0) > 0
    THEN ROUND((COALESCE(SUM(jcs.qty_rejected), 0) / COALESCE(SUM(jcs.qty_sent), 0)) * 100, 1)
    ELSE 0
  END AS rejection_rate_pct,

  -- Turnaround
  ROUND(AVG(
    CASE
      WHEN jcs.completed_at IS NOT NULL AND jcs.started_at IS NOT NULL
      THEN EXTRACT(DAY FROM jcs.completed_at - jcs.started_at)
      ELSE NULL
    END
  ), 1) AS avg_turnaround_days,

  -- On-time rate
  CASE
    WHEN COUNT(CASE WHEN jcs.status = 'done' THEN 1 END) > 0
    THEN ROUND(
      COUNT(CASE WHEN jcs.status = 'done' AND (jcs.expected_return_date IS NULL OR jcs.completed_at::date <= jcs.expected_return_date) THEN 1 END)::numeric /
      COUNT(CASE WHEN jcs.status = 'done' THEN 1 END)::numeric * 100, 1
    )
    ELSE NULL
  END AS on_time_rate_pct,

  -- Currently overdue
  COUNT(CASE WHEN jcs.status != 'done' AND jcs.expected_return_date IS NOT NULL AND jcs.expected_return_date < CURRENT_DATE THEN 1 END) AS overdue_steps,

  -- Total charges paid
  COALESCE(SUM(jcs.job_work_charges), 0) AS total_charges,

  -- Performance rating
  CASE
    WHEN COUNT(DISTINCT jcs.id) = 0 THEN 'new'
    WHEN
      COALESCE(ROUND((COALESCE(SUM(jcs.qty_rejected), 0) / NULLIF(COALESCE(SUM(jcs.qty_sent), 0), 0)) * 100, 1), 0) > 5
      OR COALESCE(ROUND(
        COUNT(CASE WHEN jcs.status = 'done' AND (jcs.expected_return_date IS NULL OR jcs.completed_at::date <= jcs.expected_return_date) THEN 1 END)::numeric /
        NULLIF(COUNT(CASE WHEN jcs.status = 'done' THEN 1 END)::numeric, 0) * 100, 1
      ), 100) < 70
    THEN 'review'
    WHEN
      COALESCE(ROUND((COALESCE(SUM(jcs.qty_rejected), 0) / NULLIF(COALESCE(SUM(jcs.qty_sent), 0), 0)) * 100, 1), 0) > 3
      OR COALESCE(ROUND(
        COUNT(CASE WHEN jcs.status = 'done' AND (jcs.expected_return_date IS NULL OR jcs.completed_at::date <= jcs.expected_return_date) THEN 1 END)::numeric /
        NULLIF(COUNT(CASE WHEN jcs.status = 'done' THEN 1 END)::numeric, 0) * 100, 1
      ), 100) < 85
    THEN 'watch'
    ELSE 'reliable'
  END AS performance_rating,

  -- Last used
  MAX(jcs.created_at) AS last_used_at

FROM public.parties p
LEFT JOIN public.job_card_steps jcs
  ON jcs.vendor_id = p.id
  AND jcs.step_type = 'external'
  AND jcs.company_id = p.company_id
WHERE p.party_type IN ('vendor', 'both')
  AND p.status = 'active'
GROUP BY p.id, p.company_id, p.name, p.city, p.phone1, p.gstin
ORDER BY
  CASE
    WHEN COUNT(DISTINCT jcs.id) = 0 THEN 3
    WHEN CASE
      WHEN COALESCE(ROUND((COALESCE(SUM(jcs.qty_rejected), 0) / NULLIF(COALESCE(SUM(jcs.qty_sent), 0), 0)) * 100, 1), 0) > 5
        OR COALESCE(ROUND(COUNT(CASE WHEN jcs.status = 'done' AND (jcs.expected_return_date IS NULL OR jcs.completed_at::date <= jcs.expected_return_date) THEN 1 END)::numeric / NULLIF(COUNT(CASE WHEN jcs.status = 'done' THEN 1 END)::numeric, 0) * 100, 1), 100) < 70
      THEN 'review' ELSE 'ok' END = 'review' THEN 0
    WHEN CASE
      WHEN COALESCE(ROUND((COALESCE(SUM(jcs.qty_rejected), 0) / NULLIF(COALESCE(SUM(jcs.qty_sent), 0), 0)) * 100, 1), 0) > 3
        OR COALESCE(ROUND(COUNT(CASE WHEN jcs.status = 'done' AND (jcs.expected_return_date IS NULL OR jcs.completed_at::date <= jcs.expected_return_date) THEN 1 END)::numeric / NULLIF(COUNT(CASE WHEN jcs.status = 'done' THEN 1 END)::numeric, 0) * 100, 1), 100) < 85
      THEN 'watch' ELSE 'ok' END = 'watch' THEN 1
    ELSE 2
  END,
  p.name;
