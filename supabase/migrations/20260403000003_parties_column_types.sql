-- Widen party columns that overflow with real-world data.
-- The vendor_scorecard view references parties.name and parties.gstin,
-- so it must be dropped and recreated around the ALTER.

-- Step 1: Drop the view
DROP VIEW IF EXISTS public.vendor_scorecard;

-- Step 2: Alter the columns
ALTER TABLE public.parties
  ALTER COLUMN gstin         TYPE VARCHAR(50),
  ALTER COLUMN state_code    TYPE VARCHAR(20),
  ALTER COLUMN address_line1 TYPE TEXT,
  ALTER COLUMN address_line2 TYPE TEXT,
  ALTER COLUMN address_line3 TYPE TEXT,
  ALTER COLUMN name          TYPE TEXT;

-- Step 3: Recreate vendor_scorecard (v2 — identical to 20260327000001_vendor_scorecard_v2.sql)
CREATE OR REPLACE VIEW public.vendor_scorecard
WITH (security_invoker = true)
AS
WITH
-- GRN quality stats per vendor (raw material suppliers)
grn_stats AS (
  SELECT
    g.company_id,
    g.vendor_id,
    COUNT(DISTINCT g.id)                          AS grn_count,
    COALESCE(SUM(gli.receiving_now), 0)           AS grn_qty_received,
    COALESCE(SUM(gli.accepted_quantity), 0)       AS grn_qty_accepted,
    COALESCE(SUM(gli.rejected_quantity), 0)       AS grn_qty_rejected,
    MAX(g.grn_date)                               AS grn_last_date
  FROM public.grns g
  JOIN public.grn_line_items gli ON gli.grn_id = g.id
  WHERE g.vendor_id IS NOT NULL
    AND g.status != 'cancelled'
  GROUP BY g.company_id, g.vendor_id
),

-- DC quality stats per party (processors — job_work_out / job_work_143 challans)
dc_stats AS (
  SELECT
    dc.company_id,
    dc.party_id                                              AS vendor_id,
    COUNT(DISTINCT dc.id)                                    AS dc_count,
    COALESCE(SUM(dli.quantity), 0)                          AS dc_qty_sent,
    COALESCE(SUM(COALESCE(dli.qty_accepted, 0)), 0)         AS dc_qty_accepted,
    COALESCE(SUM(COALESCE(dli.qty_rejected, 0)), 0)         AS dc_qty_rejected,
    MAX(dc.dc_date)                                          AS dc_last_date
  FROM public.delivery_challans dc
  JOIN public.dc_line_items dli ON dli.dc_id = dc.id
  WHERE dc.party_id IS NOT NULL
    AND dc.dc_type IN ('job_work_143', 'job_work_out')
    AND dc.status != 'cancelled'
  GROUP BY dc.company_id, dc.party_id
),

-- Job card steps stats per vendor (legacy external processing steps)
jcs_stats AS (
  SELECT
    jcs.company_id,
    jcs.vendor_id,
    COUNT(DISTINCT jcs.id)                                   AS total_steps,
    COALESCE(SUM(jcs.qty_sent), 0)                          AS total_qty_sent,
    COALESCE(SUM(jcs.qty_accepted), 0)                      AS total_qty_accepted,
    COALESCE(SUM(jcs.qty_rejected), 0)                      AS total_qty_rejected,
    COALESCE(SUM(jcs.job_work_charges), 0)                  AS total_charges,
    ROUND(AVG(
      CASE
        WHEN jcs.completed_at IS NOT NULL AND jcs.started_at IS NOT NULL
        THEN EXTRACT(DAY FROM jcs.completed_at - jcs.started_at)
        ELSE NULL
      END
    ), 1)                                                    AS avg_turnaround_days,
    COUNT(CASE
      WHEN jcs.status = 'done'
       AND (jcs.expected_return_date IS NULL OR jcs.completed_at::date <= jcs.expected_return_date)
      THEN 1 END)                                           AS on_time_steps,
    COUNT(CASE WHEN jcs.status = 'done' THEN 1 END)         AS done_steps,
    COUNT(CASE
      WHEN jcs.status != 'done'
       AND jcs.expected_return_date IS NOT NULL
       AND jcs.expected_return_date < CURRENT_DATE
      THEN 1 END)                                           AS overdue_steps,
    MAX(jcs.created_at)                                      AS jcs_last_date
  FROM public.job_card_steps jcs
  WHERE jcs.vendor_id IS NOT NULL
    AND jcs.step_type = 'external'
  GROUP BY jcs.company_id, jcs.vendor_id
)

SELECT
  p.id                    AS vendor_id,
  p.company_id,
  p.name                  AS vendor_name,
  p.city,
  p.phone1,
  p.gstin,
  p.vendor_type,

  -- ── GRN (raw material receipt) quality ─────────────────────────────────
  COALESCE(gs.grn_count, 0)             AS grn_count,
  COALESCE(gs.grn_qty_received, 0)      AS grn_qty_received,
  COALESCE(gs.grn_qty_accepted, 0)      AS grn_qty_accepted,
  COALESCE(gs.grn_qty_rejected, 0)      AS grn_qty_rejected,
  CASE
    WHEN COALESCE(gs.grn_qty_received, 0) > 0
    THEN ROUND((COALESCE(gs.grn_qty_rejected, 0) / COALESCE(gs.grn_qty_received, 0)) * 100, 1)
    ELSE NULL
  END                                   AS grn_rejection_rate_pct,

  -- ── DC (job work out) quality ───────────────────────────────────────────
  COALESCE(ds.dc_count, 0)              AS dc_count,
  COALESCE(ds.dc_qty_sent, 0)           AS dc_qty_sent,
  COALESCE(ds.dc_qty_accepted, 0)       AS dc_qty_accepted,
  COALESCE(ds.dc_qty_rejected, 0)       AS dc_qty_rejected,
  CASE
    WHEN (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0)) > 0
    THEN ROUND(
      (COALESCE(ds.dc_qty_rejected, 0) / (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0))) * 100,
    1)
    ELSE NULL
  END                                   AS dc_rejection_rate_pct,

  -- ── Job card steps (legacy) ─────────────────────────────────────────────
  COALESCE(jss.total_steps, 0)          AS total_steps,
  COALESCE(jss.total_qty_sent, 0)       AS total_qty_sent,
  COALESCE(jss.total_qty_accepted, 0)   AS total_qty_accepted,
  COALESCE(jss.total_qty_rejected, 0)   AS total_qty_rejected,
  CASE
    WHEN COALESCE(jss.total_qty_sent, 0) > 0
    THEN ROUND((COALESCE(jss.total_qty_rejected, 0) / COALESCE(jss.total_qty_sent, 0)) * 100, 1)
    ELSE NULL
  END                                   AS rejection_rate_pct,
  jss.avg_turnaround_days,
  CASE
    WHEN COALESCE(jss.done_steps, 0) > 0
    THEN ROUND(COALESCE(jss.on_time_steps, 0)::numeric / jss.done_steps * 100, 1)
    ELSE NULL
  END                                   AS on_time_rate_pct,
  COALESCE(jss.overdue_steps, 0)        AS overdue_steps,
  COALESCE(jss.total_charges, 0)        AS total_charges,

  -- ── Overall performance rating (worst-case across all sources) ──────────
  CASE
    WHEN COALESCE(gs.grn_count, 0) = 0
     AND COALESCE(ds.dc_count, 0) = 0
     AND COALESCE(jss.total_steps, 0) = 0
    THEN 'new'
    WHEN
      GREATEST(
        COALESCE(CASE WHEN COALESCE(gs.grn_qty_received, 0) > 0
          THEN (COALESCE(gs.grn_qty_rejected, 0) / COALESCE(gs.grn_qty_received, 0)) * 100
          ELSE NULL END, 0),
        COALESCE(CASE WHEN (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0)) > 0
          THEN (COALESCE(ds.dc_qty_rejected, 0) / (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0))) * 100
          ELSE NULL END, 0),
        COALESCE(CASE WHEN COALESCE(jss.total_qty_sent, 0) > 0
          THEN (COALESCE(jss.total_qty_rejected, 0) / COALESCE(jss.total_qty_sent, 0)) * 100
          ELSE NULL END, 0)
      ) > 5
      OR COALESCE(
        CASE WHEN COALESCE(jss.done_steps, 0) > 0
          THEN COALESCE(jss.on_time_steps, 0)::numeric / jss.done_steps * 100
          ELSE NULL END, 100) < 70
    THEN 'review'
    WHEN
      GREATEST(
        COALESCE(CASE WHEN COALESCE(gs.grn_qty_received, 0) > 0
          THEN (COALESCE(gs.grn_qty_rejected, 0) / COALESCE(gs.grn_qty_received, 0)) * 100
          ELSE NULL END, 0),
        COALESCE(CASE WHEN (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0)) > 0
          THEN (COALESCE(ds.dc_qty_rejected, 0) / (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0))) * 100
          ELSE NULL END, 0),
        COALESCE(CASE WHEN COALESCE(jss.total_qty_sent, 0) > 0
          THEN (COALESCE(jss.total_qty_rejected, 0) / COALESCE(jss.total_qty_sent, 0)) * 100
          ELSE NULL END, 0)
      ) > 3
      OR COALESCE(
        CASE WHEN COALESCE(jss.done_steps, 0) > 0
          THEN COALESCE(jss.on_time_steps, 0)::numeric / jss.done_steps * 100
          ELSE NULL END, 100) < 85
    THEN 'watch'
    ELSE 'reliable'
  END AS performance_rating,

  -- ── Last activity across any data source ────────────────────────────────
  GREATEST(
    gs.grn_last_date::timestamptz,
    ds.dc_last_date::timestamptz,
    jss.jcs_last_date
  ) AS last_used_at

FROM public.parties p
LEFT JOIN grn_stats gs  ON gs.vendor_id  = p.id AND gs.company_id  = p.company_id
LEFT JOIN dc_stats  ds  ON ds.vendor_id  = p.id AND ds.company_id  = p.company_id
LEFT JOIN jcs_stats jss ON jss.vendor_id = p.id AND jss.company_id = p.company_id
WHERE p.party_type IN ('vendor', 'both')
  AND p.status = 'active'
  AND (
    COALESCE(gs.grn_count, 0)      > 0
    OR COALESCE(ds.dc_count, 0)    > 0
    OR COALESCE(jss.total_steps, 0) > 0
  )
ORDER BY
  CASE
    WHEN
      GREATEST(
        COALESCE(CASE WHEN COALESCE(gs.grn_qty_received, 0) > 0
          THEN (COALESCE(gs.grn_qty_rejected, 0) / COALESCE(gs.grn_qty_received, 0)) * 100
          ELSE NULL END, 0),
        COALESCE(CASE WHEN (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0)) > 0
          THEN (COALESCE(ds.dc_qty_rejected, 0) / (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0))) * 100
          ELSE NULL END, 0),
        COALESCE(CASE WHEN COALESCE(jss.total_qty_sent, 0) > 0
          THEN (COALESCE(jss.total_qty_rejected, 0) / COALESCE(jss.total_qty_sent, 0)) * 100
          ELSE NULL END, 0)
      ) > 5
      OR COALESCE(
        CASE WHEN COALESCE(jss.done_steps, 0) > 0
          THEN COALESCE(jss.on_time_steps, 0)::numeric / jss.done_steps * 100
          ELSE NULL END, 100) < 70
    THEN 0
    WHEN
      GREATEST(
        COALESCE(CASE WHEN COALESCE(gs.grn_qty_received, 0) > 0
          THEN (COALESCE(gs.grn_qty_rejected, 0) / COALESCE(gs.grn_qty_received, 0)) * 100
          ELSE NULL END, 0),
        COALESCE(CASE WHEN (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0)) > 0
          THEN (COALESCE(ds.dc_qty_rejected, 0) / (COALESCE(ds.dc_qty_accepted, 0) + COALESCE(ds.dc_qty_rejected, 0))) * 100
          ELSE NULL END, 0),
        COALESCE(CASE WHEN COALESCE(jss.total_qty_sent, 0) > 0
          THEN (COALESCE(jss.total_qty_rejected, 0) / COALESCE(jss.total_qty_sent, 0)) * 100
          ELSE NULL END, 0)
      ) > 3
      OR COALESCE(
        CASE WHEN COALESCE(jss.done_steps, 0) > 0
          THEN COALESCE(jss.on_time_steps, 0)::numeric / jss.done_steps * 100
          ELSE NULL END, 100) < 85
    THEN 1
    ELSE 2
  END,
  p.name;

NOTIFY pgrst, 'reload schema';
