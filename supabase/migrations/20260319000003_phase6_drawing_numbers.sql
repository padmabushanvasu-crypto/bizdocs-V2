-- Phase 6: Drawing number and revision tracking
-- Adds drawing_revision to items (drawing_number already exists)
-- Adds drawing_number + drawing_revision snapshot to job_cards
-- Adds drawing_number to dc_line_items for dispatch documentation

-- Items: drawing_revision column
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS drawing_revision varchar;

COMMENT ON COLUMN public.items.drawing_revision IS 'Drawing revision level e.g. Rev.A, Rev.B, 00, 01';

-- Job Cards: snapshot drawing details at time of creation (immutable reference)
ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS drawing_number varchar,
  ADD COLUMN IF NOT EXISTS drawing_revision varchar;

COMMENT ON COLUMN public.job_cards.drawing_number IS 'Drawing number snapshotted from item at time of JC creation';
COMMENT ON COLUMN public.job_cards.drawing_revision IS 'Drawing revision snapshotted from item at time of JC creation';

-- DC Line Items: drawing number for dispatch documentation
ALTER TABLE public.dc_line_items
  ADD COLUMN IF NOT EXISTS drawing_number varchar;

COMMENT ON COLUMN public.dc_line_items.drawing_number IS 'Drawing number for this line item — pre-filled from item master, editable per line';
