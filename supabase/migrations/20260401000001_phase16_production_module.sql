-- Phase 16: Production Module (Assembly Work Orders)

-- Assembly Work Orders
CREATE TABLE IF NOT EXISTS public.assembly_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  awo_number varchar NOT NULL,
  awo_type varchar NOT NULL CHECK (awo_type IN ('sub_assembly','finished_good')),
  awo_date date NOT NULL DEFAULT CURRENT_DATE,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  quantity_to_build numeric NOT NULL DEFAULT 1,
  bom_variant_id uuid REFERENCES public.bom_variants(id),
  status varchar DEFAULT 'draft' CHECK (status IN ('draft','pending_materials','in_progress','complete','cancelled')),
  serial_number varchar,
  raised_by varchar,
  raised_by_user_id uuid,
  issued_by varchar,
  issued_by_user_id uuid,
  planned_date date,
  work_order_ref varchar,
  notes text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Assembly Work Order Line Items
CREATE TABLE IF NOT EXISTS public.awo_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  awo_id uuid REFERENCES public.assembly_work_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  drawing_number varchar,
  required_qty numeric NOT NULL,
  issued_qty numeric DEFAULT 0,
  unit varchar DEFAULT 'NOS',
  is_critical boolean DEFAULT false,
  shortage_qty numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Material Issue Requests
CREATE TABLE IF NOT EXISTS public.material_issue_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  mir_number varchar NOT NULL,
  awo_id uuid REFERENCES public.assembly_work_orders(id) ON DELETE CASCADE,
  requested_by varchar,
  requested_by_user_id uuid,
  issued_by varchar,
  issued_by_user_id uuid,
  status varchar DEFAULT 'pending' CHECK (status IN ('pending','partially_issued','issued','cancelled')),
  request_date date DEFAULT CURRENT_DATE,
  issue_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Material Issue Request Line Items
CREATE TABLE IF NOT EXISTS public.mir_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  mir_id uuid REFERENCES public.material_issue_requests(id) ON DELETE CASCADE,
  awo_line_item_id uuid REFERENCES public.awo_line_items(id),
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  drawing_number varchar,
  requested_qty numeric NOT NULL,
  issued_qty numeric DEFAULT 0,
  shortage_qty numeric DEFAULT 0,
  shortage_notes varchar,
  unit varchar DEFAULT 'NOS',
  created_at timestamptz DEFAULT now()
);

-- Auto-number AWO
CREATE OR REPLACE FUNCTION public.generate_awo_number()
RETURNS TRIGGER AS $func$
DECLARE
  fy_prefix text;
  next_seq integer;
  prefix text;
BEGIN
  SELECT CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
    THEN TO_CHAR(CURRENT_DATE, 'YY') || TO_CHAR(CURRENT_DATE + INTERVAL '1 year', 'YY')
    ELSE TO_CHAR(CURRENT_DATE - INTERVAL '1 year', 'YY') || TO_CHAR(CURRENT_DATE, 'YY')
  END INTO fy_prefix;
  prefix := CASE NEW.awo_type WHEN 'sub_assembly' THEN 'SA-WO' ELSE 'FG-WO' END;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(awo_number, '-', 4) AS integer)), 0) + 1
  INTO next_seq
  FROM public.assembly_work_orders
  WHERE company_id = NEW.company_id AND awo_number LIKE prefix || '-' || fy_prefix || '-%';
  NEW.awo_number := prefix || '-' || fy_prefix || '-' || LPAD(next_seq::text, 3, '0');
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_awo_number ON public.assembly_work_orders;
CREATE TRIGGER set_awo_number
  BEFORE INSERT ON public.assembly_work_orders
  FOR EACH ROW WHEN (NEW.awo_number IS NULL OR NEW.awo_number = '')
  EXECUTE FUNCTION public.generate_awo_number();

-- RLS
ALTER TABLE public.assembly_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awo_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_issue_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mir_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation" ON public.assembly_work_orders FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "company_isolation" ON public.awo_line_items FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "company_isolation" ON public.material_issue_requests FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "company_isolation" ON public.mir_line_items FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
