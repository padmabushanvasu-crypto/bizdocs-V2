-- Item Classifications
CREATE TABLE IF NOT EXISTS public.item_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  name varchar NOT NULL,
  description text,
  affects_stock boolean DEFAULT true,
  affects_reorder boolean DEFAULT true,
  affects_bom boolean DEFAULT true,
  is_system boolean DEFAULT false,
  color varchar DEFAULT '64748B',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.item_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access" ON public.item_classifications
  FOR ALL USING (
    is_system = true OR
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

INSERT INTO public.item_classifications (name, description, affects_stock, affects_reorder, affects_bom, is_system, color) VALUES
('Raw Material', 'Purchased inputs processed into components', true, true, true, true, 'D97706'),
('Component', 'Made from raw material through Job Cards', true, true, true, true, '16A34A'),
('Sub-Assembly', 'Multiple components assembled together', true, true, true, true, '7C3AED'),
('Bought-Out', 'Purchased ready to use, no processing', true, true, false, true, '0891B2'),
('Finished Good', 'Final product sold to customer', true, false, true, true, '2563EB'),
('Consumable', 'Used in production, not traced per unit', true, true, false, true, '64748B'),
('Asset', 'Company owned assets, tools, equipment', false, false, false, true, 'DC2626')
ON CONFLICT DO NOTHING;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS custom_classification_id uuid REFERENCES public.item_classifications(id);

NOTIFY pgrst, 'reload schema';
