-- User Management page: allow company members to see each other's profiles
-- and allow admins/finance to update roles for members in the same company.
--
-- Existing policies (kept untouched):
--   "Users can view own profile"   FOR SELECT USING (id = auth.uid())
--   "Users can update own profile" FOR UPDATE USING (id = auth.uid())
--   "Users can insert own profile" FOR INSERT WITH CHECK (id = auth.uid())
--
-- RLS policies are OR-combined for the same operation,
-- so adding new policies is additive and does not break existing access.

-- 1. Allow any authenticated user to read all profiles that belong to
--    their own company (powers the User Management table).
DROP POLICY IF EXISTS "Company members can view company profiles" ON public.profiles;
CREATE POLICY "Company members can view company profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 2. Allow admins and finance to update the role of any profile in their
--    company (the User Management "Save" button).
--    The USING clause checks the *row being updated* is in the same company.
--    The WITH CHECK clause ensures the update cannot move a profile to a
--    different company and that the actor is admin or finance.
DROP POLICY IF EXISTS "Admins can update company member roles" ON public.profiles;
CREATE POLICY "Admins can update company member roles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND (
      SELECT role FROM public.profiles WHERE id = auth.uid()
    ) IN ('admin', 'finance')
  )
  WITH CHECK (
    company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
