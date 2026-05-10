-- Cost Master Bindings: persisted "this Excel row text → this items.id" mappings,
-- captured when a user manually resolves an ambiguous match in the Cost Master
-- review screen. On the next upload, the importer auto-applies these so the
-- review burden shrinks over time.

CREATE TABLE IF NOT EXISTS public.cost_master_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Raw text from the .xlsx (item_code OR description that was used to match)
  source_text varchar NOT NULL,
  -- Normalised form for lookup (uppercase, strip [\s\.], collapse repeated whitespace).
  -- Must match the normaliser used in items-api / import-utils.
  source_text_norm varchar NOT NULL,

  -- The items.id the user bound this source_text to
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,

  -- Audit
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),

  -- One binding per (company_id, source_text_norm). If user re-binds the same
  -- text to a different item later, we UPSERT so the latest wins.
  UNIQUE (company_id, source_text_norm)
);

CREATE INDEX IF NOT EXISTS idx_cmb_company_norm
  ON public.cost_master_bindings (company_id, source_text_norm);

CREATE INDEX IF NOT EXISTS idx_cmb_item
  ON public.cost_master_bindings (item_id);

ALTER TABLE public.cost_master_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation_select"
  ON public.cost_master_bindings FOR SELECT TO authenticated
  USING (company_id = public.get_company_id());

CREATE POLICY "company_isolation_insert"
  ON public.cost_master_bindings FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_company_id());

CREATE POLICY "company_isolation_update"
  ON public.cost_master_bindings FOR UPDATE TO authenticated
  USING (company_id = public.get_company_id())
  WITH CHECK (company_id = public.get_company_id());

CREATE POLICY "company_isolation_delete"
  ON public.cost_master_bindings FOR DELETE TO authenticated
  USING (company_id = public.get_company_id());

COMMENT ON TABLE public.cost_master_bindings IS
  'Persisted text→item bindings confirmed by users in Cost Master upload review screen. Importer reads these on subsequent uploads to auto-resolve previously-ambiguous matches.';
