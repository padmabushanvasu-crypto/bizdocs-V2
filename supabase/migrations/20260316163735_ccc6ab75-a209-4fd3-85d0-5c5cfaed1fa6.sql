
-- Replace setup_company with upsert-safe version that handles retries
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

  -- Check if user already has a company (idempotent: return existing)
  SELECT company_id INTO _existing_company_id FROM profiles WHERE id = _user_id;
  IF _existing_company_id IS NOT NULL THEN
    -- Update existing company settings instead of failing
    UPDATE companies SET name = _company_name WHERE id = _existing_company_id;
    
    INSERT INTO company_settings (company_id, company_name, gstin, state, state_code, phone)
    VALUES (_existing_company_id, _company_name, _gstin, _state, _state_code, _phone)
    ON CONFLICT (company_id) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      gstin = EXCLUDED.gstin,
      state = EXCLUDED.state,
      state_code = EXCLUDED.state_code,
      phone = EXCLUDED.phone,
      updated_at = now();

    -- Ensure document_settings exist
    INSERT INTO document_settings (company_id, document_type, numbering_prefix, numbering_start, numbering_current)
    VALUES
      (_existing_company_id, 'purchase_order', '25-26/', 1, 0),
      (_existing_company_id, 'delivery_challan', '25-26/', 1, 0),
      (_existing_company_id, 'invoice', '25-26/', 1, 0),
      (_existing_company_id, 'grn', '25-26/', 1, 0),
      (_existing_company_id, 'payment_receipt', 'RCT-2526/', 1, 0)
    ON CONFLICT (company_id, document_type) DO NOTHING;

    RETURN _existing_company_id;
  END IF;

  -- Fresh setup: create company
  INSERT INTO companies (name) VALUES (_company_name) RETURNING id INTO _company_id;

  -- Link profile
  UPDATE profiles SET company_id = _company_id WHERE id = _user_id;

  -- Create settings
  INSERT INTO company_settings (company_id, company_name, gstin, state, state_code, phone)
  VALUES (_company_id, _company_name, _gstin, _state, _state_code, _phone);

  -- Seed document_settings
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

-- Add unique constraint on company_settings(company_id) if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_company_id_unique'
  ) THEN
    -- Only add if no duplicate company_ids exist
    ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_company_id_unique UNIQUE (company_id);
  END IF;
END $$;

-- Add unique constraint on document_settings(company_id, document_type) if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_settings_company_doc_type_unique'
  ) THEN
    ALTER TABLE public.document_settings ADD CONSTRAINT document_settings_company_doc_type_unique UNIQUE (company_id, document_type);
  END IF;
END $$;
