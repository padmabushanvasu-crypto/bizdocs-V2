-- Applied live 2026-11-04 (version 20261104043406). GRN ageing alert view.
-- Reuses the app's own rules:
--   qc_pending    = header grn_stage before awaiting_store (draft / quantitative_* / quality_pending)
--   store_pending = v_grn_line_next_action.next_action IN ('post_to_store','post_goods_receipt')
-- Lines already drawn by a DC (issued_on_dc) or done are excluded.
-- Inverse: DROP VIEW public.v_grn_pending_ageing.
CREATE OR REPLACE VIEW public.v_grn_pending_ageing WITH (security_invoker = true) AS
SELECT g.company_id,
       g.id AS grn_id,
       g.grn_number,
       g.grn_type,
       g.grn_stage,
       g.vendor_name,
       g.received_by,
       g.created_at AS recorded_at,
       (CURRENT_DATE - (g.created_at AT TIME ZONE 'Asia/Kolkata')::date) AS age_days,
       gli.id AS grn_line_item_id,
       gli.item_id,
       gli.description,
       gli.received_qty,
       CASE WHEN g.grn_stage IN ('draft','quantitative_pending','quantitative_done','quality_pending') THEN 'qc_pending'
            ELSE 'store_pending' END AS pending_step,
       COALESCE(na.action_label,
                CASE WHEN g.grn_stage IN ('draft','quantitative_pending','quantitative_done') THEN 'Complete receipt check'
                     ELSE 'Record QC' END) AS action_label
FROM grns g
JOIN grn_line_items gli ON gli.grn_id = g.id
LEFT JOIN v_grn_line_next_action na ON na.grn_line_item_id = gli.id
WHERE g.status NOT IN ('deleted','cancelled')
  AND gli.store_confirmed IS NOT TRUE
  AND ( g.grn_stage IN ('draft','quantitative_pending','quantitative_done','quality_pending')
        OR (g.grn_stage = 'awaiting_store' AND na.next_action IN ('post_to_store','post_goods_receipt')) );
GRANT SELECT ON public.v_grn_pending_ageing TO authenticated;
