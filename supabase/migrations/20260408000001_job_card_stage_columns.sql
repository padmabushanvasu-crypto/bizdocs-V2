-- Job card stage tracking: add current_stage + current_stage_name to job_cards,
-- actual_qty to job_card_steps, and fix material_returned constraint.
--
-- NOTE (live DB has drifted from this file — intentionally, do not "fix"):
-- current_stage's live default is NULL, not the DEFAULT 1 written below. The
-- "create new JC" path (createJobWork) never populates this column, so it's
-- routinely NULL on otherwise-healthy job cards. PR #71 treats current_stage
-- as unreliable/NULL-able by design and derives stage progress from
-- job_card_steps instead (see fetchJobCardStepProgress in job-works-api.ts).
-- Re-adding DEFAULT 1 on the live column would undermine that fix by making
-- "not yet computed" indistinguishable from "genuinely at stage 1". Leave the
-- live column as-is.

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
