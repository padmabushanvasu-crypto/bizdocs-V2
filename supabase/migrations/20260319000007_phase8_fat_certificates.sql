-- Phase 8: FAT Certificates and Serial Number Enhancements

-- FAT Certificate table
CREATE TABLE IF NOT EXISTS public.fat_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  fat_number varchar NOT NULL,
  fat_date date NOT NULL DEFAULT CURRENT_DATE,
  serial_number_id uuid REFERENCES public.serial_numbers(id),
  serial_number varchar,
  item_id uuid REFERENCES public.items(id),
  item_code varchar,
  item_description varchar,
  drawing_number varchar,
  drawing_revision varchar,
  customer_id uuid REFERENCES public.parties(id),
  customer_name varchar,
  customer_po_ref varchar,
  assembly_order_id uuid REFERENCES public.assembly_orders(id),
  assembly_order_number varchar,
  status varchar DEFAULT 'pending' CHECK (status IN ('pending','passed','failed','conditional')),
  overall_result varchar CHECK (overall_result IN ('pass','fail','conditional')),
  tested_by varchar,
  witnessed_by varchar,
  test_date date,
  notes text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- FAT Test Results table (individual test parameters)
CREATE TABLE IF NOT EXISTS public.fat_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  fat_certificate_id uuid REFERENCES public.fat_certificates(id) ON DELETE CASCADE,
  test_name varchar NOT NULL,
  test_standard varchar,
  required_value varchar,
  actual_value varchar,
  unit varchar,
  result varchar DEFAULT 'pending' CHECK (result IN ('pass','fail','na','pending')),
  remarks text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Auto-generate FAT number
CREATE OR REPLACE FUNCTION public.generate_fat_number()
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
    CAST(SPLIT_PART(fat_number, '-', 3) AS integer)
  ), 0) + 1
  INTO next_seq
  FROM public.fat_certificates
  WHERE company_id = NEW.company_id
  AND fat_number LIKE 'FAT-' || fy_prefix || '-%';

  NEW.fat_number := 'FAT-' || fy_prefix || '-' || LPAD(next_seq::text, 3, '0');
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_fat_number ON public.fat_certificates;
CREATE TRIGGER set_fat_number
  BEFORE INSERT ON public.fat_certificates
  FOR EACH ROW
  WHEN (NEW.fat_number IS NULL OR NEW.fat_number = '')
  EXECUTE FUNCTION public.generate_fat_number();

-- RLS
ALTER TABLE public.fat_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fat_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation" ON public.fat_certificates
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "company_isolation" ON public.fat_test_results
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fat_certificates_company ON public.fat_certificates(company_id);
CREATE INDEX IF NOT EXISTS idx_fat_certificates_serial ON public.fat_certificates(serial_number_id);
CREATE INDEX IF NOT EXISTS idx_fat_test_results_fat ON public.fat_test_results(fat_certificate_id);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_item ON public.serial_numbers(item_id);
