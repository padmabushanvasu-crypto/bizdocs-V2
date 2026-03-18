
-- Create audit_log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type varchar NOT NULL,
  document_id uuid NOT NULL,
  action varchar NOT NULL,
  details jsonb,
  user_id uuid,
  user_email varchar,
  user_name varchar,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: read-only via company isolation (no UPDATE/DELETE allowed via policy)
CREATE POLICY "company_read_audit" ON public.audit_log
  FOR SELECT TO authenticated
  USING (company_id = public.get_company_id());

CREATE POLICY "company_insert_audit" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_company_id());

-- Index for fast lookups
CREATE INDEX idx_audit_log_document ON public.audit_log(document_id);
CREATE INDEX idx_audit_log_company ON public.audit_log(company_id);
