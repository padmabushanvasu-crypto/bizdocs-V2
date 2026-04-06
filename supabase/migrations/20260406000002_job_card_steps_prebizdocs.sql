-- Allow pre_bizdocs as a valid status for job_card_steps
-- Used for placeholder steps representing stages completed before this system was introduced

ALTER TABLE public.job_card_steps DROP CONSTRAINT IF EXISTS job_card_steps_status_check;
ALTER TABLE public.job_card_steps ADD CONSTRAINT job_card_steps_status_check
  CHECK (status IN ('pending', 'in_progress', 'done', 'pre_bizdocs'));

NOTIFY pgrst, 'reload schema';
