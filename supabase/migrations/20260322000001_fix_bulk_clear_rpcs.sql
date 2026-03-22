-- Fix bulk clear RPCs to null out foreign key references before deleting

CREATE OR REPLACE FUNCTION public.clear_all_items(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  -- Null out item references in dependent tables
  UPDATE public.job_cards SET item_id = NULL WHERE company_id = p_company_id;
  UPDATE public.job_card_steps SET item_id = NULL WHERE company_id = p_company_id AND item_id IS NOT NULL;
  UPDATE public.assembly_order_lines SET item_id = NULL WHERE company_id = p_company_id;
  UPDATE public.assembly_orders SET item_id = NULL WHERE company_id = p_company_id;
  UPDATE public.bom_lines SET parent_item_id = NULL WHERE company_id = p_company_id;
  UPDATE public.bom_lines SET child_item_id = NULL WHERE company_id = p_company_id;
  UPDATE public.bom_line_vendors SET vendor_id = NULL WHERE company_id = p_company_id AND vendor_id IS NOT NULL;
  UPDATE public.po_line_items SET item_id = NULL WHERE company_id = p_company_id AND item_id IS NOT NULL;
  UPDATE public.dc_line_items SET item_id = NULL WHERE company_id = p_company_id AND item_id IS NOT NULL;
  UPDATE public.invoice_line_items SET item_id = NULL WHERE company_id = p_company_id AND item_id IS NOT NULL;
  UPDATE public.grn_line_items SET item_id = NULL WHERE company_id = p_company_id AND item_id IS NOT NULL;
  UPDATE public.serial_numbers SET item_id = NULL WHERE company_id = p_company_id;
  UPDATE public.scrap_register SET item_id = NULL WHERE company_id = p_company_id;
  UPDATE public.stock_ledger SET item_id = NULL WHERE company_id = p_company_id;
  UPDATE public.reorder_rules SET item_id = NULL WHERE company_id = p_company_id;
  -- Now safe to delete
  DELETE FROM public.items WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_parties(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  UPDATE public.purchase_orders SET vendor_id = NULL WHERE company_id = p_company_id AND vendor_id IS NOT NULL;
  UPDATE public.delivery_challans SET party_id = NULL WHERE company_id = p_company_id AND party_id IS NOT NULL;
  UPDATE public.invoices SET customer_id = NULL WHERE company_id = p_company_id AND customer_id IS NOT NULL;
  UPDATE public.sales_orders SET customer_id = NULL WHERE company_id = p_company_id AND customer_id IS NOT NULL;
  UPDATE public.dispatch_notes SET customer_id = NULL WHERE company_id = p_company_id AND customer_id IS NOT NULL;
  UPDATE public.receipts SET party_id = NULL WHERE company_id = p_company_id AND party_id IS NOT NULL;
  UPDATE public.bom_line_vendors SET vendor_id = NULL WHERE company_id = p_company_id AND vendor_id IS NOT NULL;
  UPDATE public.reorder_rules SET preferred_vendor_id = NULL WHERE company_id = p_company_id AND preferred_vendor_id IS NOT NULL;
  UPDATE public.scrap_register SET vendor_id = NULL WHERE company_id = p_company_id AND vendor_id IS NOT NULL;
  DELETE FROM public.parties WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_bom_lines(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.bom_line_vendors WHERE company_id = p_company_id;
  DELETE FROM public.bom_lines WHERE company_id = p_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_opening_stock(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count integer;
BEGIN
  UPDATE public.items SET current_stock = 0 WHERE company_id = p_company_id;
  DELETE FROM public.stock_ledger
  WHERE company_id = p_company_id
  AND transaction_type = 'opening_stock';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
