
-- Delivery Challans table
CREATE TABLE public.delivery_challans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dc_number VARCHAR NOT NULL,
  dc_date DATE NOT NULL DEFAULT CURRENT_DATE,
  dc_type VARCHAR NOT NULL DEFAULT 'returnable',
  party_id UUID REFERENCES public.parties(id),
  party_name VARCHAR,
  party_address TEXT,
  party_gstin VARCHAR,
  party_state_code VARCHAR,
  party_phone VARCHAR,
  reference_number VARCHAR,
  approximate_value NUMERIC DEFAULT 0,
  special_instructions TEXT,
  internal_remarks TEXT,
  return_due_date DATE,
  nature_of_job_work VARCHAR,
  total_items INTEGER DEFAULT 0,
  total_qty NUMERIC DEFAULT 0,
  status VARCHAR DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DC Line Items table
CREATE TABLE public.dc_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dc_id UUID NOT NULL REFERENCES public.delivery_challans(id) ON DELETE CASCADE,
  serial_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  drawing_number VARCHAR,
  qty_nos NUMERIC DEFAULT 0,
  qty_kg NUMERIC DEFAULT 0,
  qty_sft NUMERIC DEFAULT 0,
  nature_of_process VARCHAR,
  material_type VARCHAR DEFAULT 'FINISH',
  returned_qty_nos NUMERIC DEFAULT 0,
  returned_qty_kg NUMERIC DEFAULT 0,
  returned_qty_sft NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DC Returns table
CREATE TABLE public.dc_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dc_id UUID NOT NULL REFERENCES public.delivery_challans(id) ON DELETE CASCADE,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DC Return Items table
CREATE TABLE public.dc_return_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES public.dc_returns(id) ON DELETE CASCADE,
  dc_line_item_id UUID NOT NULL REFERENCES public.dc_line_items(id) ON DELETE CASCADE,
  returned_nos NUMERIC DEFAULT 0,
  returned_kg NUMERIC DEFAULT 0,
  returned_sft NUMERIC DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dc_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dc_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dc_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read access on delivery_challans" ON public.delivery_challans FOR SELECT USING (true);
CREATE POLICY "Allow all insert access on delivery_challans" ON public.delivery_challans FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access on delivery_challans" ON public.delivery_challans FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access on delivery_challans" ON public.delivery_challans FOR DELETE USING (true);

CREATE POLICY "Allow all read access on dc_line_items" ON public.dc_line_items FOR SELECT USING (true);
CREATE POLICY "Allow all insert access on dc_line_items" ON public.dc_line_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access on dc_line_items" ON public.dc_line_items FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access on dc_line_items" ON public.dc_line_items FOR DELETE USING (true);

CREATE POLICY "Allow all read access on dc_returns" ON public.dc_returns FOR SELECT USING (true);
CREATE POLICY "Allow all insert access on dc_returns" ON public.dc_returns FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access on dc_returns" ON public.dc_returns FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access on dc_returns" ON public.dc_returns FOR DELETE USING (true);

CREATE POLICY "Allow all read access on dc_return_items" ON public.dc_return_items FOR SELECT USING (true);
CREATE POLICY "Allow all insert access on dc_return_items" ON public.dc_return_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access on dc_return_items" ON public.dc_return_items FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access on dc_return_items" ON public.dc_return_items FOR DELETE USING (true);

-- Indexes
CREATE INDEX idx_dc_status ON public.delivery_challans(status);
CREATE INDEX idx_dc_party ON public.delivery_challans(party_id);
CREATE INDEX idx_dc_date ON public.delivery_challans(dc_date);
CREATE INDEX idx_dc_line_items_dc ON public.dc_line_items(dc_id);
CREATE INDEX idx_dc_returns_dc ON public.dc_returns(dc_id);

-- Updated at trigger
CREATE TRIGGER update_delivery_challans_updated_at
  BEFORE UPDATE ON public.delivery_challans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
