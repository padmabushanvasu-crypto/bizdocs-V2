-- Add unit column to job_cards for tracking the unit of measure of the quantity
ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS unit varchar DEFAULT 'NOS';
