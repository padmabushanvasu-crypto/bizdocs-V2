-- Phase 6: Expand DC types and add Rule 45 computed column
-- Adds: job_work_out, job_work_return, supply, sample, loan_borrow DC types
-- Adds: rule45_due_date generated column for GST Rule 45 compliance tracking

ALTER TABLE delivery_challans
  DROP CONSTRAINT IF EXISTS delivery_challans_dc_type_check;

ALTER TABLE delivery_challans
  ADD CONSTRAINT delivery_challans_dc_type_check CHECK (
    dc_type IN (
      'returnable',
      'non_returnable',
      'job_work_143',
      'job_work_out',
      'job_work_return',
      'supply',
      'sample',
      'loan_borrow'
    )
  );

-- Rule 45: Goods sent for job work must be returned within 365 days
-- This column stores the compliance deadline for job_work_out DCs
ALTER TABLE delivery_challans
  ADD COLUMN IF NOT EXISTS rule45_due_date DATE
    GENERATED ALWAYS AS (
      CASE WHEN dc_type = 'job_work_out'
        THEN dc_date + INTERVAL '365 days'
        ELSE NULL
      END
    ) STORED;

COMMENT ON COLUMN delivery_challans.rule45_due_date IS 'GST Rule 45: job_work_out goods must return within 365 days of DC date. NULL for other DC types.';
