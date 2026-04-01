-- Phase 17: Dispatch Module

CREATE TABLE IF NOT EXISTS public.dispatch_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  dr_number varchar NOT NULL,
  dispatch_date date NOT NULL DEFAULT CURRENT_DATE,
  customer_id uuid REFERENCES public.parties(id),
  customer_name varchar,
  customer_po_ref varchar,
  vehicle_number varchar,
  driver_name varchar,
  driver_contact varchar,
  notes text,
  dispatched_by varchar,
  status varchar DEFAULT 'draft' CHECK (status IN ('draft','dispatched','delivered')),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_record_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  dispatch_record_id uuid REFERENCES public.dispatch_records(id) ON DELETE CASCADE,
  serial_number_id uuid REFERENCES public.serial_numbers(id),
  serial_number varchar,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  quantity numeric DEFAULT 1,
  unit varchar DEFAULT 'NOS',
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.generate_dr_number()
RETURNS TRIGGER AS $func$
DECLARE fy_prefix text; next_seq integer;
BEGIN
  SELECT CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
    THEN TO_CHAR(CURRENT_DATE,'YY') || TO_CHAR(CURRENT_DATE + INTERVAL '1 year','YY')
    ELSE TO_CHAR(CURRENT_DATE - INTERVAL '1 year','YY') || TO_CHAR(CURRENT_DATE,'YY')
  END INTO fy_prefix;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(dr_number,'-',3) AS integer)),0)+1 INTO next_seq
  FROM public.dispatch_records WHERE company_id=NEW.company_id AND dr_number LIKE 'DR-'||fy_prefix||'-%';
  NEW.dr_number := 'DR-'||fy_prefix||'-'||LPAD(next_seq::text,3,'0');
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_dr_number ON public.dispatch_records;
CREATE TRIGGER set_dr_number BEFORE INSERT ON public.dispatch_records
  FOR EACH ROW WHEN (NEW.dr_number IS NULL OR NEW.dr_number = '')
  EXECUTE FUNCTION public.generate_dr_number();

ALTER TABLE public.dispatch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_record_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON public.dispatch_records FOR ALL USING (company_id=(SELECT company_id FROM public.profiles WHERE id=auth.uid()));
CREATE POLICY "company_isolation" ON public.dispatch_record_items FOR ALL USING (company_id=(SELECT company_id FROM public.profiles WHERE id=auth.uid()));
