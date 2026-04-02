-- Trigger: automatically create a company and profile row for every new auth user.
-- This fires AFTER INSERT ON auth.users so auth.uid() resolves correctly inside the function.
-- SECURITY DEFINER is required to write to public.companies and public.profiles from the
-- auth schema trigger context.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_company_id uuid;
BEGIN
  -- 1. Create a placeholder company for this user
  INSERT INTO public.companies (name, created_at, updated_at)
  VALUES ('My Company', now(), now())
  RETURNING id INTO new_company_id;

  -- 2. Create the profile row and link it to the new company.
  --    ON CONFLICT handles the rare case where the profile row already exists
  --    (e.g. from a previous partial signup attempt) — only backfill company_id if it is null.
  INSERT INTO public.profiles (id, company_id, role, display_name, is_active, created_at, updated_at)
  VALUES (
    NEW.id,
    new_company_id,
    'admin',
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET company_id = COALESCE(profiles.company_id, EXCLUDED.company_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop any stale version of the trigger before (re)creating it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
