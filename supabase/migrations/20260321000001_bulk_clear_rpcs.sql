-- Bulk clear RPCs for Data Import page

CREATE OR REPLACE FUNCTION public.clear_all_parties(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.parties WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_items(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.items WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_bom_lines(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.bom_lines WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_opening_stock(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  UPDATE public.items SET current_stock = 0 WHERE company_id = p_company_id;
  DELETE FROM public.stock_ledger
  WHERE company_id = p_company_id
  AND transaction_type = 'opening_stock';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
