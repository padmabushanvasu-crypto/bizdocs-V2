-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_items_current_stock ON public.items(current_stock);
CREATE INDEX IF NOT EXISTS idx_items_company_id ON public.items(company_id);
CREATE INDEX IF NOT EXISTS idx_grns_company_status ON public.grns(company_id, status);
-- idx_grn_line_items_grn already exists from phase14 migration
CREATE INDEX IF NOT EXISTS idx_stock_ledger_transaction_type ON public.stock_ledger(company_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_items_classification ON public.items(custom_classification_id);

-- Cost accumulation columns on job_cards
ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS initial_cost numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_accumulated_cost numeric(15,2) DEFAULT 0;

NOTIFY pgrst, 'reload schema';
