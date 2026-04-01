-- Phase 18: User Roles and Permissions

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role varchar DEFAULT 'admin'
  CHECK (role IN ('admin','purchase_team','inward_team','qc_team','storekeeper','assembly_team'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name varchar,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
