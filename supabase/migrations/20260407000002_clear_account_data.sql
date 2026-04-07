-- Nuclear reset: delete all transactional and master data for a company.
-- Preserves: companies row, company_settings row (resets sequences only),
--            document_settings rows (resets numbering), profiles rows.
-- Deletion order follows FK dependencies (children before parents).

CREATE OR REPLACE FUNCTION public.clear_all_company_data(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- ── GRN sub-tables ──────────────────────────────────────────────────────────
  DELETE FROM public.grn_receipt_events  WHERE company_id = p_company_id;
  DELETE FROM public.grn_qc_measurements WHERE company_id = p_company_id;
  DELETE FROM public.grn_inspection_lines WHERE company_id = p_company_id;
  DELETE FROM public.grn_scrap_items     WHERE company_id = p_company_id;
  DELETE FROM public.grn_line_items      WHERE company_id = p_company_id;
  DELETE FROM public.grns                WHERE company_id = p_company_id;

  -- ── Delivery Challan sub-tables ─────────────────────────────────────────────
  DELETE FROM public.dc_return_items  WHERE company_id = p_company_id;
  DELETE FROM public.dc_returns       WHERE company_id = p_company_id;
  DELETE FROM public.dc_line_items    WHERE company_id = p_company_id;
  DELETE FROM public.delivery_challans WHERE company_id = p_company_id;

  -- ── Purchase Orders ─────────────────────────────────────────────────────────
  DELETE FROM public.po_line_items   WHERE company_id = p_company_id;
  DELETE FROM public.purchase_orders WHERE company_id = p_company_id;

  -- ── Invoices & Receipts ─────────────────────────────────────────────────────
  DELETE FROM public.invoice_line_items WHERE company_id = p_company_id;
  DELETE FROM public.invoices           WHERE company_id = p_company_id;
  DELETE FROM public.receipts           WHERE company_id = p_company_id;

  -- ── Sales Orders ────────────────────────────────────────────────────────────
  DELETE FROM public.so_line_items WHERE company_id = p_company_id;
  DELETE FROM public.sales_orders  WHERE company_id = p_company_id;

  -- ── Dispatch ────────────────────────────────────────────────────────────────
  DELETE FROM public.packing_list_items   WHERE company_id = p_company_id;
  DELETE FROM public.dn_line_items        WHERE company_id = p_company_id;
  DELETE FROM public.dispatch_notes       WHERE company_id = p_company_id;
  DELETE FROM public.dispatch_record_items WHERE company_id = p_company_id;
  DELETE FROM public.dispatch_records     WHERE company_id = p_company_id;

  -- ── Production / Assembly ────────────────────────────────────────────────────
  DELETE FROM public.mir_line_items        WHERE company_id = p_company_id;
  DELETE FROM public.material_issue_requests WHERE company_id = p_company_id;
  DELETE FROM public.awo_line_items        WHERE company_id = p_company_id;
  DELETE FROM public.assembly_work_orders  WHERE company_id = p_company_id;
  DELETE FROM public.assembly_order_lines  WHERE company_id = p_company_id;
  DELETE FROM public.assembly_orders       WHERE company_id = p_company_id;

  -- ── Job Cards ────────────────────────────────────────────────────────────────
  DELETE FROM public.job_card_steps WHERE company_id = p_company_id;
  DELETE FROM public.job_cards      WHERE company_id = p_company_id;

  -- ── FAT Certificates ────────────────────────────────────────────────────────
  DELETE FROM public.fat_test_results WHERE company_id = p_company_id;
  DELETE FROM public.fat_certificates WHERE company_id = p_company_id;

  -- ── Stock / Ledger / Serial Numbers ─────────────────────────────────────────
  DELETE FROM public.serial_numbers WHERE company_id = p_company_id;
  DELETE FROM public.scrap_register WHERE company_id = p_company_id;
  DELETE FROM public.stock_ledger   WHERE company_id = p_company_id;

  -- ── Audit Log ────────────────────────────────────────────────────────────────
  DELETE FROM public.audit_log WHERE company_id = p_company_id;

  -- ── Reorder Rules ────────────────────────────────────────────────────────────
  DELETE FROM public.reorder_rules WHERE company_id = p_company_id;

  -- ── BOM ──────────────────────────────────────────────────────────────────────
  DELETE FROM public.bpr_vendors          WHERE company_id = p_company_id;
  DELETE FROM public.bom_processing_routes WHERE company_id = p_company_id;
  DELETE FROM public.bom_process_steps    WHERE company_id = p_company_id;
  DELETE FROM public.bom_line_vendors     WHERE company_id = p_company_id;
  DELETE FROM public.bom_lines            WHERE company_id = p_company_id;
  DELETE FROM public.bom_variants         WHERE company_id = p_company_id;

  -- ── Process Library ──────────────────────────────────────────────────────────
  DELETE FROM public.process_code_vendors WHERE company_id = p_company_id;
  DELETE FROM public.process_codes        WHERE company_id = p_company_id;
  DELETE FROM public.stage_templates      WHERE company_id = p_company_id;

  -- ── Jig / Mould ──────────────────────────────────────────────────────────────
  DELETE FROM public.jig_master   WHERE company_id = p_company_id;
  DELETE FROM public.mould_items  WHERE company_id = p_company_id;

  -- ── Item Classifications ─────────────────────────────────────────────────────
  DELETE FROM public.item_classifications WHERE company_id = p_company_id;

  -- ── Master Data ──────────────────────────────────────────────────────────────
  DELETE FROM public.custom_fields WHERE company_id = p_company_id;
  DELETE FROM public.items   WHERE company_id = p_company_id;
  DELETE FROM public.parties WHERE company_id = p_company_id;

  -- ── Reset document numbering sequences ───────────────────────────────────────
  UPDATE public.company_settings
  SET
    invoice_next_number = 1,
    po_next_number      = 1,
    dc_next_number      = 1,
    grn_next_number     = 1
  WHERE company_id = p_company_id;

  UPDATE public.document_settings
  SET numbering_current = numbering_start
  WHERE company_id = p_company_id;

END;
$$;

NOTIFY pgrst, 'reload schema';
