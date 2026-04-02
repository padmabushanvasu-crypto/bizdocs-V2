-- Fix 1: Add ON DELETE SET NULL to FK columns referencing parties that are missing it
-- This prevents FK constraint violations when deleting a party that still has references

-- job_cards.vendor_id
ALTER TABLE public.job_cards
  DROP CONSTRAINT IF EXISTS job_cards_vendor_id_fkey;
ALTER TABLE public.job_cards
  ADD CONSTRAINT job_cards_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- fat_certificates.customer_id
ALTER TABLE public.fat_certificates
  DROP CONSTRAINT IF EXISTS fat_certificates_customer_id_fkey;
ALTER TABLE public.fat_certificates
  ADD CONSTRAINT fat_certificates_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- dispatch_records.customer_id (phase17)
ALTER TABLE public.dispatch_records
  DROP CONSTRAINT IF EXISTS dispatch_records_customer_id_fkey;
ALTER TABLE public.dispatch_records
  ADD CONSTRAINT dispatch_records_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- reorder_rules.preferred_vendor_id
ALTER TABLE public.reorder_rules
  DROP CONSTRAINT IF EXISTS reorder_rules_preferred_vendor_id_fkey;
ALTER TABLE public.reorder_rules
  ADD CONSTRAINT reorder_rules_preferred_vendor_id_fkey
  FOREIGN KEY (preferred_vendor_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- scrap_register.vendor_id
ALTER TABLE public.scrap_register
  DROP CONSTRAINT IF EXISTS scrap_register_vendor_id_fkey;
ALTER TABLE public.scrap_register
  ADD CONSTRAINT scrap_register_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- bom_process_route.vendor_id
ALTER TABLE public.bom_process_route
  DROP CONSTRAINT IF EXISTS bom_process_route_vendor_id_fkey;
ALTER TABLE public.bom_process_route
  ADD CONSTRAINT bom_process_route_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- purchase_orders.vendor_id
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_vendor_id_fkey;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- delivery_challans.party_id
ALTER TABLE public.delivery_challans
  DROP CONSTRAINT IF EXISTS delivery_challans_party_id_fkey;
ALTER TABLE public.delivery_challans
  ADD CONSTRAINT delivery_challans_party_id_fkey
  FOREIGN KEY (party_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- sales_orders.customer_id
ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_customer_id_fkey;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- invoices.customer_id
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_customer_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- receipts.party_id
ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_party_id_fkey;
ALTER TABLE public.receipts
  ADD CONSTRAINT receipts_party_id_fkey
  FOREIGN KEY (party_id) REFERENCES public.parties(id) ON DELETE SET NULL;

-- Fix 2: Replace clear_all_parties RPC
-- Bug: referenced dispatch_notes (doesn't exist) — real table is dispatch_records
-- Also add missing tables: job_cards, fat_certificates, bom_process_route, dispatch_records

CREATE OR REPLACE FUNCTION public.clear_all_parties(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  UPDATE public.purchase_orders SET vendor_id = NULL WHERE company_id = p_company_id AND vendor_id IS NOT NULL;
  UPDATE public.delivery_challans SET party_id = NULL WHERE company_id = p_company_id AND party_id IS NOT NULL;
  UPDATE public.invoices SET customer_id = NULL WHERE company_id = p_company_id AND customer_id IS NOT NULL;
  UPDATE public.sales_orders SET customer_id = NULL WHERE company_id = p_company_id AND customer_id IS NOT NULL;
  UPDATE public.dispatch_records SET customer_id = NULL WHERE company_id = p_company_id AND customer_id IS NOT NULL;
  UPDATE public.receipts SET party_id = NULL WHERE company_id = p_company_id AND party_id IS NOT NULL;
  UPDATE public.bom_line_vendors SET vendor_id = NULL WHERE company_id = p_company_id AND vendor_id IS NOT NULL;
  UPDATE public.reorder_rules SET preferred_vendor_id = NULL WHERE company_id = p_company_id AND preferred_vendor_id IS NOT NULL;
  UPDATE public.scrap_register SET vendor_id = NULL WHERE company_id = p_company_id AND vendor_id IS NOT NULL;
  UPDATE public.job_cards SET vendor_id = NULL WHERE company_id = p_company_id AND vendor_id IS NOT NULL;
  UPDATE public.fat_certificates SET customer_id = NULL WHERE company_id = p_company_id AND customer_id IS NOT NULL;
  UPDATE public.bom_process_route SET vendor_id = NULL WHERE company_id = p_company_id AND vendor_id IS NOT NULL;
  DELETE FROM public.parties WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Fix 3: Replace company_isolation RLS policy on parties to use inline subquery
-- (more reliable than function reference in edge cases)
DROP POLICY IF EXISTS "company_isolation" ON public.parties;
CREATE POLICY "company_isolation" ON public.parties
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
