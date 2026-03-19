-- Fix 6: Add unit column to job_card_steps for external process steps
ALTER TABLE public.job_card_steps
  ADD COLUMN IF NOT EXISTS unit varchar DEFAULT 'NOS';
