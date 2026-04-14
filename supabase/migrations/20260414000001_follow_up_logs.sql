-- Follow-Up Tracker: log table for PO and DC follow-up actions
-- One row per document (PO or DC), upserted on (company_id, document_id).
-- This table is created in the migration but NOT auto-applied — run manually in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.follow_up_logs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL,
  document_type        text        NOT NULL CHECK (document_type IN ('po', 'dc')),
  document_id          uuid        NOT NULL,
  document_number      text,

  follow_up_1_at       timestamptz,
  follow_up_1_type     text        CHECK (follow_up_1_type IN ('phone', 'email', 'whatsapp')),
  follow_up_1_note     text,

  follow_up_2_at       timestamptz,
  follow_up_2_type     text        CHECK (follow_up_2_type IN ('phone', 'email', 'whatsapp')),
  follow_up_2_note     text,

  follow_up_3_at       timestamptz,
  follow_up_3_type     text        CHECK (follow_up_3_type IN ('phone', 'email', 'whatsapp')),
  follow_up_3_note     text,

  follow_up_4_at       timestamptz,
  follow_up_4_type     text        CHECK (follow_up_4_type IN ('phone', 'email', 'whatsapp')),
  follow_up_4_note     text,

  manual_received      boolean     NOT NULL DEFAULT false,
  manual_received_at   timestamptz,
  manual_received_by   text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, document_id)
);

-- Efficient lookup by company + document
CREATE INDEX IF NOT EXISTS follow_up_logs_company_document_idx
  ON public.follow_up_logs (company_id, document_id);

-- Efficient lookup of manually-received records by date
CREATE INDEX IF NOT EXISTS follow_up_logs_received_at_idx
  ON public.follow_up_logs (company_id, document_type, manual_received_at)
  WHERE manual_received = true;

-- Enable Row Level Security
ALTER TABLE public.follow_up_logs ENABLE ROW LEVEL SECURITY;

-- All authenticated company members can read
CREATE POLICY "Company members can view follow_up_logs"
  ON public.follow_up_logs
  FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Authorised roles can insert (admin, finance, purchase_team, inward_team)
CREATE POLICY "Authorised roles can insert follow_up_logs"
  ON public.follow_up_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('admin', 'finance', 'purchase_team', 'inward_team')
  );

-- Authorised roles can update their own company's records
CREATE POLICY "Authorised roles can update follow_up_logs"
  ON public.follow_up_logs
  FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('admin', 'finance', 'purchase_team', 'inward_team')
  );

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
