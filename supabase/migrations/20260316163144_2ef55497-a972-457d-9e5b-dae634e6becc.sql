
-- Create a SECURITY DEFINER function for company setup that bypasses RLS
CREATE OR REPLACE FUNCTION public.setup_company(
  _company_name text,
  _gstin text DEFAULT NULL,
  _state text DEFAULT NULL,
  _state_code text DEFAULT NULL,
  _phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _company_id uuid;
  _existing_company_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has a company
  SELECT company_id INTO _existing_company_id FROM profiles WHERE id = _user_id;
  IF _existing_company_id IS NOT NULL THEN
    RAISE EXCEPTION 'User already has a company';
  END IF;

  -- 1. Create company
  INSERT INTO companies (name) VALUES (_company_name) RETURNING id INTO _company_id;

  -- 2. Link profile to company
  UPDATE profiles SET company_id = _company_id WHERE id = _user_id;

  -- 3. Create company_settings
  INSERT INTO company_settings (company_id, company_name, gstin, state, state_code, phone)
  VALUES (_company_id, _company_name, _gstin, _state, _state_code, _phone);

  -- 4. Seed document_settings
  INSERT INTO document_settings (company_id, document_type, numbering_prefix, numbering_start, numbering_current)
  VALUES
    (_company_id, 'purchase_order', '25-26/', 1, 0),
    (_company_id, 'delivery_challan', '25-26/', 1, 0),
    (_company_id, 'invoice', '25-26/', 1, 0),
    (_company_id, 'grn', '25-26/', 1, 0),
    (_company_id, 'payment_receipt', 'RCT-2526/', 1, 0);

  RETURN _company_id;
END;
$$;
