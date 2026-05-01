-- Saved delivery contacts for reuse on purchase orders
CREATE TABLE IF NOT EXISTS delivery_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

ALTER TABLE delivery_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_contacts_company_isolation" ON delivery_contacts
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
