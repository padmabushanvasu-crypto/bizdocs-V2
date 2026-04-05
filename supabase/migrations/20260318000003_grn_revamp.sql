-- ── Stage columns on grn_line_items ──────────────────────────────────────────
ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS received_qty numeric(15,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_matched boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS condition_on_arrival varchar DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS packing_intact boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendor_invoice_ref varchar,
  ADD COLUMN IF NOT EXISTS quantitative_verified_by varchar,
  ADD COLUMN IF NOT EXISTS quantitative_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS quantitative_notes text,
  ADD COLUMN IF NOT EXISTS qty_inspected numeric(15,3),
  ADD COLUMN IF NOT EXISTS inspection_method varchar,
  ADD COLUMN IF NOT EXISTS conforming_qty numeric(15,3),
  ADD COLUMN IF NOT EXISTS non_conforming_qty numeric(15,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS non_conformance_type varchar,
  ADD COLUMN IF NOT EXISTS deviation_description text,
  ADD COLUMN IF NOT EXISTS disposition varchar,
  ADD COLUMN IF NOT EXISTS reference_drawing varchar,
  ADD COLUMN IF NOT EXISTS qc_inspected_by varchar,
  ADD COLUMN IF NOT EXISTS qc_inspected_at timestamptz,
  ADD COLUMN IF NOT EXISTS qc_notes text;

-- ── Stage columns on grns ────────────────────────────────────────────────────
ALTER TABLE public.grns
  ADD COLUMN IF NOT EXISTS grn_stage varchar DEFAULT 'draft'
    CHECK (grn_stage IN ('draft','quantitative_pending','quantitative_done','quality_pending','quality_done','closed')),
  ADD COLUMN IF NOT EXISTS quantitative_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quantitative_completed_by varchar,
  ADD COLUMN IF NOT EXISTS quality_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_completed_by varchar,
  ADD COLUMN IF NOT EXISTS overall_quality_verdict varchar
    CHECK (overall_quality_verdict IN ('fully_accepted','conditionally_accepted','partially_returned','returned')),
  ADD COLUMN IF NOT EXISTS quality_remarks text,
  ADD COLUMN IF NOT EXISTS vendor_invoice_number varchar,
  ADD COLUMN IF NOT EXISTS vendor_invoice_date date;

-- ── Stage transition function ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_grn_stage_and_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_grn_id uuid;
  v_all_quant_done boolean;
  v_all_qc_done boolean;
  v_current_stage varchar;
  v_verdict varchar;
  v_item record;
  v_item_id uuid;
  v_qty_to_add numeric;
BEGIN
  v_grn_id := NEW.grn_id;

  SELECT grn_stage INTO v_current_stage FROM public.grns WHERE id = v_grn_id;

  -- Check if all line items have quantitative_verified_at set
  SELECT NOT EXISTS(
    SELECT 1 FROM public.grn_line_items
    WHERE grn_id = v_grn_id AND quantitative_verified_at IS NULL
  ) INTO v_all_quant_done;

  -- Check if all line items have qc_inspected_by set
  SELECT NOT EXISTS(
    SELECT 1 FROM public.grn_line_items
    WHERE grn_id = v_grn_id AND qc_inspected_by IS NULL
  ) INTO v_all_qc_done;

  -- Stage: quantitative_pending → quality_pending
  IF v_all_quant_done AND v_current_stage IN ('draft','quantitative_pending','quantitative_done') THEN
    UPDATE public.grns
    SET grn_stage = 'quality_pending',
        quantitative_completed_at = NOW()
    WHERE id = v_grn_id;
    v_current_stage := 'quality_pending';
  END IF;

  -- Stage: quality_pending → closed
  IF v_all_qc_done AND v_current_stage IN ('quality_pending','quality_done') THEN
    -- Calculate verdict
    IF NOT EXISTS(SELECT 1 FROM public.grn_line_items WHERE grn_id = v_grn_id AND (non_conforming_qty IS NOT NULL AND non_conforming_qty > 0)) THEN
      v_verdict := 'fully_accepted';
    ELSIF EXISTS(SELECT 1 FROM public.grn_line_items WHERE grn_id = v_grn_id AND disposition IN ('accept_as_is','conditional_accept'))
      AND NOT EXISTS(SELECT 1 FROM public.grn_line_items WHERE grn_id = v_grn_id AND disposition = 'return_to_vendor') THEN
      v_verdict := 'conditionally_accepted';
    ELSIF EXISTS(SELECT 1 FROM public.grn_line_items WHERE grn_id = v_grn_id AND disposition = 'return_to_vendor')
      AND EXISTS(SELECT 1 FROM public.grn_line_items WHERE grn_id = v_grn_id AND (conforming_qty IS NOT NULL AND conforming_qty > 0)) THEN
      v_verdict := 'partially_returned';
    ELSIF NOT EXISTS(SELECT 1 FROM public.grn_line_items WHERE grn_id = v_grn_id AND (conforming_qty IS NOT NULL AND conforming_qty > 0)) THEN
      v_verdict := 'returned';
    ELSE
      v_verdict := 'fully_accepted';
    END IF;

    UPDATE public.grns
    SET grn_stage = 'closed',
        quality_completed_at = NOW(),
        overall_quality_verdict = v_verdict
    WHERE id = v_grn_id;

    -- Update stock for each line item
    FOR v_item IN
      SELECT * FROM public.grn_line_items WHERE grn_id = v_grn_id
    LOOP
      v_qty_to_add := 0;
      IF v_item.conforming_qty IS NOT NULL AND v_item.conforming_qty > 0 THEN
        v_qty_to_add := v_item.conforming_qty;
      END IF;
      IF v_item.non_conforming_qty IS NOT NULL AND v_item.non_conforming_qty > 0
         AND v_item.disposition IN ('accept_as_is','conditional_accept') THEN
        v_qty_to_add := v_qty_to_add + v_item.non_conforming_qty;
      END IF;

      IF v_qty_to_add > 0 AND v_item.drawing_number IS NOT NULL THEN
        SELECT id INTO v_item_id FROM public.items
        WHERE drawing_revision = v_item.drawing_number
        LIMIT 1;

        IF v_item_id IS NOT NULL THEN
          UPDATE public.items
          SET current_stock = COALESCE(current_stock, 0) + v_qty_to_add,
              stock_raw_material = COALESCE(stock_raw_material, 0) + v_qty_to_add
          WHERE id = v_item_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grn_stage_update ON public.grn_line_items;
CREATE TRIGGER trg_grn_stage_update
  AFTER UPDATE ON public.grn_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_grn_stage_and_stock();

NOTIFY pgrst, 'reload schema';
