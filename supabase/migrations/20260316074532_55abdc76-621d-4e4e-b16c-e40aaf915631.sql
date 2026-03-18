
-- Invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number varchar NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  customer_id uuid REFERENCES public.parties(id),
  customer_name varchar,
  customer_address text,
  customer_gstin varchar,
  customer_phone varchar,
  customer_state_code varchar,
  place_of_supply varchar,
  customer_po_reference varchar,
  dc_reference varchar,
  dc_id uuid REFERENCES public.delivery_challans(id),
  gst_rate numeric DEFAULT 18,
  sub_total numeric DEFAULT 0,
  total_discount numeric DEFAULT 0,
  taxable_value numeric DEFAULT 0,
  cgst_amount numeric DEFAULT 0,
  sgst_amount numeric DEFAULT 0,
  igst_amount numeric DEFAULT 0,
  total_gst numeric DEFAULT 0,
  round_off numeric DEFAULT 0,
  grand_total numeric DEFAULT 0,
  amount_paid numeric DEFAULT 0,
  amount_outstanding numeric DEFAULT 0,
  bank_name varchar,
  bank_account_number varchar,
  bank_ifsc varchar,
  bank_branch varchar,
  terms_and_conditions text,
  special_instructions text,
  internal_remarks text,
  payment_terms varchar,
  status varchar DEFAULT 'draft',
  issued_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Invoice line items
CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  serial_number integer NOT NULL,
  description text NOT NULL,
  drawing_number varchar,
  hsn_sac_code varchar,
  quantity numeric NOT NULL DEFAULT 0,
  unit varchar DEFAULT 'NOS',
  unit_price numeric DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  taxable_amount numeric DEFAULT 0,
  gst_rate numeric DEFAULT 18,
  cgst numeric DEFAULT 0,
  sgst numeric DEFAULT 0,
  igst numeric DEFAULT 0,
  line_total numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Payments table
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number varchar NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  invoice_number varchar,
  customer_id uuid REFERENCES public.parties(id),
  customer_name varchar,
  amount numeric NOT NULL DEFAULT 0,
  payment_mode varchar NOT NULL DEFAULT 'cash',
  reference_number varchar,
  bank_name varchar,
  received_by varchar,
  notes text,
  status varchar DEFAULT 'recorded',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_date ON public.invoices(invoice_date);
CREATE INDEX idx_invoice_line_items_invoice ON public.invoice_line_items(invoice_id);
CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_payments_date ON public.payments(payment_date);

-- RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Invoices policies
CREATE POLICY "Allow all read access on invoices" ON public.invoices FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert access on invoices" ON public.invoices FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update access on invoices" ON public.invoices FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all delete access on invoices" ON public.invoices FOR DELETE TO public USING (true);

-- Invoice line items policies
CREATE POLICY "Allow all read access on invoice_line_items" ON public.invoice_line_items FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert access on invoice_line_items" ON public.invoice_line_items FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update access on invoice_line_items" ON public.invoice_line_items FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all delete access on invoice_line_items" ON public.invoice_line_items FOR DELETE TO public USING (true);

-- Payments policies
CREATE POLICY "Allow all read access on payments" ON public.payments FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert access on payments" ON public.payments FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update access on payments" ON public.payments FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all delete access on payments" ON public.payments FOR DELETE TO public USING (true);

-- Updated_at triggers
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
