-- Add missing Clear All RPCs for import tabs that had no bulk-delete support.
-- Each function does a single bulk DELETE (with dependency cleanup where needed)
-- so Clear All completes in <1 second regardless of row count.

CREATE OR REPLACE FUNCTION public.clear_all_reorder_rules(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.reorder_rules WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_processing_routes(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  -- bpr_vendors references bom_processing_routes — delete junction table first
  DELETE FROM public.bpr_vendors WHERE company_id = p_company_id;
  DELETE FROM public.bom_processing_routes WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_jig_master(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.jig_master WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_mould_items(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.mould_items WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_process_codes(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  -- process_code_vendors references process_codes — delete junction table first
  DELETE FROM public.process_code_vendors WHERE company_id = p_company_id;
  DELETE FROM public.process_codes WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
