-- Job card stage tracking: add current_stage + current_stage_name to job_cards,
-- actual_qty to job_card_steps, and fix material_returned constraint.

ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS current_stage integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_stage_name varchar;

ALTER TABLE public.job_card_steps
  ADD COLUMN IF NOT EXISTS actual_qty numeric;

-- Allow material_returned as a valid step status
ALTER TABLE public.job_card_steps DROP CONSTRAINT IF EXISTS job_card_steps_status_check;
ALTER TABLE public.job_card_steps ADD CONSTRAINT job_card_steps_status_check
  CHECK (status IN ('pending', 'in_progress', 'done', 'pre_bizdocs', 'material_returned'));

NOTIFY pgrst, 'reload schema';
