-- Server-side item code verification: accepts an array of codes and returns
-- whichever ones exist in the items table for the given company.
-- Used by the post-import verification step to avoid PostgREST URL-encoding
-- issues that arise when codes contain special characters (/, (, ), :, &).
-- The array is passed as a JSON parameter, so no URL encoding occurs.

CREATE OR REPLACE FUNCTION public.verify_item_codes_exist(
  p_company_id uuid,
  p_codes       text[]
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  found_codes text[];
BEGIN
  SELECT ARRAY_AGG(item_code)
  INTO found_codes
  FROM public.items
  WHERE company_id = p_company_id
    AND item_code = ANY(p_codes);
  RETURN COALESCE(found_codes, '{}');
END;
$$;

NOTIFY pgrst, 'reload schema';
