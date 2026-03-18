-- Fix overly permissive INSERT policy on companies table
-- Replace WITH CHECK (true) with a proper check
DROP POLICY IF EXISTS "Authenticated can create company" ON public.companies;

CREATE POLICY "Authenticated can create company" ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.company_id IS NOT NULL
    )
  );