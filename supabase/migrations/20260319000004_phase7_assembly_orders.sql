-- Assembly Orders table
CREATE TABLE IF NOT EXISTS public.assembly_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  ao_number varchar NOT NULL,
  ao_date date NOT NULL DEFAULT CURRENT_DATE,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  quantity_to_build numeric NOT NULL DEFAULT 1,
  quantity_built numeric DEFAULT 0,
  status varchar DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed','cancelled')),
  bom_snapshot jsonb,
  notes text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Assembly Order Line Items (components consumed)
CREATE TABLE IF NOT EXISTS public.assembly_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  assembly_order_id uuid REFERENCES public.assembly_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  required_qty numeric NOT NULL,
  available_qty numeric DEFAULT 0,
  consumed_qty numeric DEFAULT 0,
  unit varchar,
  unit_cost numeric DEFAULT 0,
  total_cost numeric DEFAULT 0,
  is_available boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Stock Ledger table
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  transaction_type varchar NOT NULL CHECK (transaction_type IN (
    'grn_receipt',
    'job_card_issue',
    'job_card_return',
    'assembly_consumption',
    'assembly_output',
    'invoice_dispatch',
    'dc_issue',
    'dc_return',
    'opening_stock',
    'manual_adjustment',
    'rejection_writeoff'
  )),
  qty_in numeric DEFAULT 0,
  qty_out numeric DEFAULT 0,
  balance_qty numeric NOT NULL,
  unit_cost numeric DEFAULT 0,
  total_value numeric DEFAULT 0,
  reference_type varchar,
  reference_id uuid,
  reference_number varchar,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Serial Numbers table
CREATE TABLE IF NOT EXISTS public.serial_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  serial_number varchar NOT NULL,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  assembly_order_id uuid REFERENCES public.assembly_orders(id),
  status varchar DEFAULT 'in_stock' CHECK (status IN ('in_stock','dispatched','under_warranty','scrapped')),
  invoice_id uuid REFERENCES public.invoices(id),
  invoice_number varchar,
  customer_name varchar,
  dispatch_date date,
  warranty_months integer DEFAULT 12,
  warranty_expiry date,
  fat_completed boolean DEFAULT false,
  fat_completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- BOM Lines table (for the BOM module)
CREATE TABLE IF NOT EXISTS public.bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  child_item_id uuid REFERENCES public.items(id),
  quantity numeric NOT NULL DEFAULT 1,
  unit varchar,
  bom_level integer DEFAULT 1,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, parent_item_id, child_item_id)
);

-- Auto-increment AO number trigger
CREATE OR REPLACE FUNCTION public.generate_ao_number()
RETURNS TRIGGER AS $func$
DECLARE
  fy_prefix text;
  next_seq integer;
BEGIN
  SELECT CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
    THEN TO_CHAR(CURRENT_DATE, 'YY') || TO_CHAR(CURRENT_DATE + INTERVAL '1 year', 'YY')
    ELSE TO_CHAR(CURRENT_DATE - INTERVAL '1 year', 'YY') || TO_CHAR(CURRENT_DATE, 'YY')
  END INTO fy_prefix;

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(ao_number, '-', 3) AS integer)
  ), 0) + 1
  INTO next_seq
  FROM public.assembly_orders
  WHERE company_id = NEW.company_id
  AND ao_number LIKE 'AO-' || fy_prefix || '-%';

  NEW.ao_number := 'AO-' || fy_prefix || '-' || LPAD(next_seq::text, 3, '0');
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_ao_number ON public.assembly_orders;
CREATE TRIGGER set_ao_number
  BEFORE INSERT ON public.assembly_orders
  FOR EACH ROW
  WHEN (NEW.ao_number IS NULL OR NEW.ao_number = '')
  EXECUTE FUNCTION public.generate_ao_number();

-- RLS Policies
ALTER TABLE public.assembly_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation" ON public.assembly_orders FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "company_isolation" ON public.assembly_order_lines FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "company_isolation" ON public.stock_ledger FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "company_isolation" ON public.serial_numbers FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "company_isolation" ON public.bom_lines FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assembly_orders_company ON public.assembly_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_assembly_order_lines_ao ON public.assembly_order_lines(assembly_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_company_item ON public.stock_ledger(company_id, item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_date ON public.stock_ledger(transaction_date);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_company ON public.serial_numbers(company_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_parent ON public.bom_lines(company_id, parent_item_id);
