-- ============================================================
-- Consumable Issues
-- ============================================================

-- Main slip table
CREATE TABLE IF NOT EXISTS public.consumable_issues (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_number varchar     NOT NULL,
  issue_date   date        NOT NULL DEFAULT CURRENT_DATE,
  issued_to    varchar     NOT NULL,
  issued_by    varchar,
  notes        text,
  status       varchar     NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft', 'issued')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Line items
CREATE TABLE IF NOT EXISTS public.consumable_issue_lines (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id         uuid        NOT NULL REFERENCES public.consumable_issues(id) ON DELETE CASCADE,
  item_id          uuid        REFERENCES public.items(id),
  item_code        varchar,
  item_description varchar,
  drawing_number   varchar,
  unit             varchar     NOT NULL DEFAULT 'NOS',
  qty_issued       numeric     NOT NULL DEFAULT 0,
  return_status    varchar     NOT NULL DEFAULT 'not_returned'
    CHECK (return_status IN ('returned', 'not_returned')),
  qty_returned     numeric     NOT NULL DEFAULT 0,
  return_reason    text,
  disposition      varchar
    CHECK (disposition IN ('scrap')),
  created_at       timestamptz DEFAULT now()
);

-- Auto-generate issue_number (CIS-YYYY-NNN)
CREATE OR REPLACE FUNCTION public.generate_consumable_issue_number()
RETURNS TRIGGER AS $func$
DECLARE
  fy_prefix text;
  next_seq  integer;
BEGIN
  SELECT CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
    THEN TO_CHAR(CURRENT_DATE, 'YY') || TO_CHAR(CURRENT_DATE + INTERVAL '1 year', 'YY')
    ELSE TO_CHAR(CURRENT_DATE - INTERVAL '1 year', 'YY') || TO_CHAR(CURRENT_DATE, 'YY')
  END INTO fy_prefix;

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(issue_number, '-', 3) AS integer)
  ), 0) + 1
  INTO next_seq
  FROM public.consumable_issues
  WHERE company_id = NEW.company_id
    AND issue_number LIKE 'CIS-' || fy_prefix || '-%';

  NEW.issue_number := 'CIS-' || fy_prefix || '-' || LPAD(next_seq::text, 3, '0');
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_consumable_issue_number ON public.consumable_issues;
CREATE TRIGGER set_consumable_issue_number
  BEFORE INSERT ON public.consumable_issues
  FOR EACH ROW
  WHEN (NEW.issue_number IS NULL OR NEW.issue_number = '')
  EXECUTE FUNCTION public.generate_consumable_issue_number();

-- RLS
ALTER TABLE public.consumable_issues      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumable_issue_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_isolation" ON public.consumable_issues;
CREATE POLICY "company_isolation" ON public.consumable_issues
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "company_isolation" ON public.consumable_issue_lines;
CREATE POLICY "company_isolation" ON public.consumable_issue_lines
  FOR ALL USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_consumable_issues_company    ON public.consumable_issues(company_id);
CREATE INDEX IF NOT EXISTS idx_consumable_issues_date       ON public.consumable_issues(issue_date);
CREATE INDEX IF NOT EXISTS idx_consumable_issue_lines_issue ON public.consumable_issue_lines(issue_id);
CREATE INDEX IF NOT EXISTS idx_consumable_issue_lines_item  ON public.consumable_issue_lines(item_id);

-- Add consumable_issue to stock_ledger transaction_type CHECK
ALTER TABLE public.stock_ledger
  DROP CONSTRAINT IF EXISTS stock_ledger_transaction_type_check;

ALTER TABLE public.stock_ledger
  ADD CONSTRAINT stock_ledger_transaction_type_check
  CHECK (transaction_type IN (
    'grn_receipt',
    'job_card_issue',
    'job_card_return',
    'assembly_consumption',
    'assembly_output',
    'assembly_issue',
    'assembly_return',
    'scrap_write_off',
    'consumable_issue',
    'invoice_dispatch',
    'dc_issue',
    'dc_return',
    'opening_stock',
    'manual_adjustment',
    'rejection_writeoff'
  ));

NOTIFY pgrst, 'reload schema';
