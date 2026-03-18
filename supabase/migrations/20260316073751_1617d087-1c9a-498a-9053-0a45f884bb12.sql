
-- GRN (Goods Receipt Notes) table
CREATE TABLE public.grns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_number VARCHAR NOT NULL,
  grn_date DATE NOT NULL DEFAULT CURRENT_DATE,
  po_id UUID REFERENCES public.purchase_orders(id),
  po_number VARCHAR,
  vendor_id UUID REFERENCES public.parties(id),
  vendor_name VARCHAR,
  vendor_invoice_number VARCHAR,
  vendor_invoice_date DATE,
  vehicle_number VARCHAR,
  lr_reference VARCHAR,
  received_by VARCHAR,
  notes TEXT,
  total_received INTEGER DEFAULT 0,
  total_accepted INTEGER DEFAULT 0,
  total_rejected INTEGER DEFAULT 0,
  status VARCHAR DEFAULT 'draft',
  recorded_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GRN Line Items table
CREATE TABLE public.grn_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_id UUID NOT NULL REFERENCES public.grns(id) ON DELETE CASCADE,
  po_line_item_id UUID REFERENCES public.po_line_items(id),
  serial_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  drawing_number VARCHAR,
  unit VARCHAR DEFAULT 'NOS',
  po_quantity NUMERIC DEFAULT 0,
  previously_received NUMERIC DEFAULT 0,
  pending_quantity NUMERIC DEFAULT 0,
  receiving_now NUMERIC DEFAULT 0,
  accepted_quantity NUMERIC DEFAULT 0,
  rejected_quantity NUMERIC DEFAULT 0,
  rejection_reason VARCHAR,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read access on grns" ON public.grns FOR SELECT USING (true);
CREATE POLICY "Allow all insert access on grns" ON public.grns FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access on grns" ON public.grns FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access on grns" ON public.grns FOR DELETE USING (true);

CREATE POLICY "Allow all read access on grn_line_items" ON public.grn_line_items FOR SELECT USING (true);
CREATE POLICY "Allow all insert access on grn_line_items" ON public.grn_line_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access on grn_line_items" ON public.grn_line_items FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access on grn_line_items" ON public.grn_line_items FOR DELETE USING (true);

-- Indexes
CREATE INDEX idx_grns_po ON public.grns(po_id);
CREATE INDEX idx_grns_status ON public.grns(status);
CREATE INDEX idx_grns_date ON public.grns(grn_date);
CREATE INDEX idx_grn_line_items_grn ON public.grn_line_items(grn_id);

-- Updated at trigger
CREATE TRIGGER update_grns_updated_at
  BEFORE UPDATE ON public.grns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
