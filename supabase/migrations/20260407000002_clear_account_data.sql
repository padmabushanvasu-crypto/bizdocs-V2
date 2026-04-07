CREATE OR REPLACE FUNCTION public.clear_all_company_data(
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.audit_log WHERE company_id = p_company_id;
  DELETE FROM public.notifications WHERE company_id = p_company_id;
  DELETE FROM public.stock_ledger WHERE company_id = p_company_id;
  DELETE FROM public.scrap_register WHERE company_id = p_company_id;
  DELETE FROM public.fat_test_results WHERE company_id = p_company_id;
  DELETE FROM public.fat_certificates WHERE company_id = p_company_id;
  DELETE FROM public.serial_numbers WHERE company_id = p_company_id;
  DELETE FROM public.dispatch_record_items WHERE company_id = p_company_id;
  DELETE FROM public.dispatch_records WHERE company_id = p_company_id;
  DELETE FROM public.dn_line_items WHERE company_id = p_company_id;
  DELETE FROM public.dispatch_notes WHERE company_id = p_company_id;
  DELETE FROM public.so_line_items WHERE company_id = p_company_id;
  DELETE FROM public.sales_orders WHERE company_id = p_company_id;
  DELETE FROM public.mir_line_items WHERE company_id = p_company_id;
  DELETE FROM public.material_issue_requests WHERE company_id = p_company_id;
  DELETE FROM public.component_processing_log WHERE company_id = p_company_id;
  DELETE FROM public.awo_line_items WHERE company_id = p_company_id;
  DELETE FROM public.assembly_work_orders WHERE company_id = p_company_id;
  DELETE FROM public.assembly_orders WHERE company_id = p_company_id;
  DELETE FROM public.job_card_steps WHERE company_id = p_company_id;
  DELETE FROM public.job_cards WHERE company_id = p_company_id;
  DELETE FROM public.grn_qc_measurements WHERE company_id = p_company_id;
  DELETE FROM public.grn_scrap_items WHERE company_id = p_company_id;
  DELETE FROM public.grn_receipt_events WHERE company_id = p_company_id;
  DELETE FROM public.grn_inspection_lines WHERE company_id = p_company_id;
  DELETE FROM public.grn_line_items WHERE company_id = p_company_id;
  DELETE FROM public.grns WHERE company_id = p_company_id;
  DELETE FROM public.dc_line_items WHERE company_id = p_company_id;
  DELETE FROM public.delivery_challans WHERE company_id = p_company_id;
  DELETE FROM public.invoice_line_items WHERE company_id = p_company_id;
  DELETE FROM public.invoices WHERE company_id = p_company_id;
  DELETE FROM public.receipts WHERE company_id = p_company_id;
  DELETE FROM public.po_line_items WHERE company_id = p_company_id;
  DELETE FROM public.purchase_orders WHERE company_id = p_company_id;
  DELETE FROM public.reorder_rules WHERE company_id = p_company_id;
  DELETE FROM public.bom_processing_stages WHERE company_id = p_company_id;
  DELETE FROM public.bpr_vendors WHERE company_id = p_company_id;
  DELETE FROM public.bom_processing_routes WHERE company_id = p_company_id;
  DELETE FROM public.bom_line_vendors WHERE company_id = p_company_id;
  DELETE FROM public.bom_lines WHERE company_id = p_company_id;
  DELETE FROM public.bom_variants WHERE company_id = p_company_id;
  DELETE FROM public.item_classifications WHERE company_id = p_company_id;
  DELETE FROM public.items WHERE company_id = p_company_id;
  DELETE FROM public.parties WHERE company_id = p_company_id;
  DELETE FROM public.jig_master WHERE company_id = p_company_id;
  DELETE FROM public.mould_items WHERE company_id = p_company_id;
  DELETE FROM public.process_code_vendors WHERE company_id = p_company_id;
  DELETE FROM public.process_codes WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'All company data cleared successfully',
    'company_id', p_company_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'company_id', p_company_id
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
