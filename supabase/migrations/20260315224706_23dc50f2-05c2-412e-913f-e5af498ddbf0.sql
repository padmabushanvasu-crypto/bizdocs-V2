
-- Create parties table
CREATE TABLE public.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type VARCHAR(20) NOT NULL DEFAULT 'both' CHECK (party_type IN ('vendor', 'customer', 'both')),
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  address_line3 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  state_code VARCHAR(2),
  pin_code VARCHAR(10),
  phone1 VARCHAR(20),
  phone2 VARCHAR(20),
  email1 VARCHAR(255),
  email2 VARCHAR(255),
  website VARCHAR(255),
  gstin VARCHAR(15),
  pan VARCHAR(10),
  payment_terms VARCHAR(100),
  credit_limit DECIMAL(15,2),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;

-- For prototype: allow all operations (will be scoped to company_id + auth later)
CREATE POLICY "Allow all read access on parties" ON public.parties FOR SELECT USING (true);
CREATE POLICY "Allow all insert access on parties" ON public.parties FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access on parties" ON public.parties FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access on parties" ON public.parties FOR DELETE USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_parties_updated_at
  BEFORE UPDATE ON public.parties
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for search
CREATE INDEX idx_parties_name ON public.parties USING gin(to_tsvector('english', name));
CREATE INDEX idx_parties_status ON public.parties(status);
CREATE INDEX idx_parties_party_type ON public.parties(party_type);
