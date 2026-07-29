-- Harden SECURITY DEFINER functions: pin a non-mutable search_path.
--
-- STATUS: APPLIED + verified against the live Supabase DB on 2026-07-29.
-- This is a MIGRATION RECORD of a completed change, NOT a pending migration.
-- (ALTER FUNCTION ... SET search_path is idempotent, so re-running is harmless,
-- but there is no need to — it is already live.)
--
-- RATIONALE: SECURITY DEFINER + a mutable search_path is the combination that
-- matters for search-path injection — a caller could shadow an unqualified
-- object with one in their own schema and have it run with the definer's
-- elevated privilege. These 13 DEFINER functions had no search_path set; pinning
-- it to `public, pg_temp` closes that. handle_new_user (fires on every signup)
-- was inspected first and is fully schema-qualified, so the pin is inert to it.
--
-- VERIFIED AFTER: 0 of 20 SECURITY DEFINER functions remain unhardened.
--
-- PROVENANCE: the statements below are EQUIVALENT TO as-executed, not a verbatim
-- transcript. As run, ten of the thirteen were unqualified and three were
-- public.-qualified; the two forms are functionally identical, and all thirteen
-- are shown public.-qualified here for consistency.

ALTER FUNCTION public.clear_all_bom_lines(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_all_company_data(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_all_items(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_all_jig_master(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_all_mould_items(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_all_parties(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_all_process_codes(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_all_processing_routes(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_all_reorder_rules(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_opening_stock(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.replace_po_line_items(uuid,uuid,jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.verify_item_codes_exist(uuid,text[]) SET search_path = public, pg_temp;
