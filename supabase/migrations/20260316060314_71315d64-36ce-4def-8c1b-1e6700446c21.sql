
-- Purchase Orders table
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number VARCHAR(50) NOT NULL,
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor_id UUID REFERENCES public.parties(id),
  vendor_name VARCHAR(255),
  vendor_address TEXT,
  vendor_gstin VARCHAR(15),
  vendor_state_code VARCHAR(2),
  vendor_phone VARCHAR(50),
  reference_number VARCHAR(100),
  payment_terms VARCHAR(100),
  delivery_address TEXT,
  special_instructions TEXT,
  internal_remarks TEXT,
  sub_total DECIMAL(15,2) DEFAULT 0,
  additional_charges JSONB DEFAULT '[]'::jsonb,
  taxable_value DECIMAL(15,2) DEFAULT 0,
  igst_amount DECIMAL(15,2) DEFAULT 0,
  cgst_amount DECIMAL(15,2) DEFAULT 0,
  sgst_amount DECIMAL(15,2) DEFAULT 0,
  total_gst DECIMAL(15,2) DEFAULT 0,
  grand_total DECIMAL(15,2) DEFAULT 0,
  gst_rate DECIMAL(5,2) DEFAULT 18.00,
  status VARCHAR(50) DEFAULT 'draft',
  issued_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- PO Line Items table
CREATE TABLE public.po_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
  serial_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  drawing_number VARCHAR(100),
  quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
  unit VARCHAR(50) DEFAULT 'NOS',
  unit_price DECIMAL(15,2) DEFAULT 0,
  delivery_date DATE,
  line_total DECIMAL(15,2) DEFAULT 0,
  gst_rate DECIMAL(5,2) DEFAULT 18,
  hsn_sac_code VARCHAR(20),
  received_quantity DECIMAL(15,3) DEFAULT 0,
  pending_quantity DECIMAL(15,3),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for purchase_orders (public access for now, will restrict with auth later)
CREATE POLICY "Allow all read access on purchase_orders" ON public.purchase_orders FOR SELECT USING (true);
CREATE POLICY "Allow all insert access on purchase_orders" ON public.purchase_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access on purchase_orders" ON public.purchase_orders FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access on purchase_orders" ON public.purchase_orders FOR DELETE USING (true);

-- RLS policies for po_line_items
CREATE POLICY "Allow all read access on po_line_items" ON public.po_line_items FOR SELECT USING (true);
CREATE POLICY "Allow all insert access on po_line_items" ON public.po_line_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access on po_line_items" ON public.po_line_items FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access on po_line_items" ON public.po_line_items FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX idx_purchase_orders_vendor_id ON public.purchase_orders(vendor_id);
CREATE INDEX idx_purchase_orders_po_date ON public.purchase_orders(po_date);
CREATE INDEX idx_po_line_items_po_id ON public.po_line_items(po_id);
