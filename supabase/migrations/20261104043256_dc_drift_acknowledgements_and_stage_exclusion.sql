-- Applied live 2026-11-04 (version 20261104043256). Inverse: restore prior v_dc_ledger_drift body, DROP TABLE dc_drift_acknowledgements.
CREATE TABLE IF NOT EXISTS public.dc_drift_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  dc_id uuid NOT NULL REFERENCES public.delivery_challans(id),
  item_id uuid NOT NULL REFERENCES public.items(id),
  gap numeric NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  acknowledged_by uuid DEFAULT auth.uid(),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, dc_id, item_id)
);
ALTER TABLE public.dc_drift_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON public.dc_drift_acknowledgements FOR SELECT USING (company_id = get_company_id());
REVOKE INSERT, UPDATE, DELETE ON public.dc_drift_acknowledgements FROM anon, authenticated;

CREATE OR REPLACE VIEW public.v_dc_ledger_drift WITH (security_invoker = true) AS
 WITH lines AS (
         SELECT d.company_id,
            d.id AS dc_id,
            d.dc_number,
            d.status,
            r.item_id,
            sum(COALESCE(dli.qty_nos, dli.quantity, (0)::numeric)) AS line_qty,
            bool_or((r.item_id IS NULL)) AS has_unresolved
           FROM ((delivery_challans d
             JOIN dc_line_items dli ON ((dli.dc_id = d.id)))
             CROSS JOIN LATERAL ( SELECT
                        CASE
                            WHEN (dli.item_id IS NOT NULL) THEN dli.item_id
                            WHEN (( SELECT count(*) AS count
                               FROM items i_1
                              WHERE ((i_1.company_id = d.company_id) AND (i_1.item_code = TRIM(BOTH FROM dli.item_code)))) = 1) THEN ( SELECT i_1.id
                               FROM items i_1
                              WHERE ((i_1.company_id = d.company_id) AND (i_1.item_code = TRIM(BOTH FROM dli.item_code))))
                            ELSE NULL::uuid
                        END AS item_id) r)
          WHERE (((d.issued_at IS NOT NULL) OR ((d.status)::text = ANY (ARRAY['issued'::text, 'partially_returned'::text, 'fully_returned'::text, 'cancelled'::text, 'deleted'::text]))) AND (NOT _dc_line_is_stage_tracked(dli.id, dli.job_card_id)) AND (dli.rework_source_grn_line_id IS NULL) AND ((dli.item_id IS NOT NULL) OR (NULLIF(TRIM(BOTH FROM dli.item_code), ''::text) IS NOT NULL)) AND (COALESCE(d.issued_at, d.created_at) >= _dc_reconcile_baseline()))
          GROUP BY d.company_id, d.id, d.dc_number, d.status, r.item_id
        ), led AS (
         SELECT sl.reference_id AS dc_id,
            sl.item_id,
            (COALESCE(sum(sl.qty_out), (0)::numeric) - COALESCE(sum(sl.qty_in), (0)::numeric)) AS posted
           FROM (stock_ledger sl
             JOIN delivery_challans d ON ((d.id = sl.reference_id)))
          WHERE (((sl.reference_type)::text = 'delivery_challan'::text) AND ((sl.transaction_type)::text = ANY (ARRAY['dc_issue'::text, 'dc_return'::text])) AND (COALESCE(d.issued_at, d.created_at) >= _dc_reconcile_baseline()))
          GROUP BY sl.reference_id, sl.item_id
        ), recv AS (
         SELECT dli.dc_id,
            dli.item_id,
            sum(_dc_line_received_equiv(dli.id)) AS grn_received
           FROM dc_line_items dli
          WHERE ((EXISTS ( SELECT 1
                   FROM (grn_line_items gli
                     JOIN grns g ON ((g.id = gli.grn_id)))
                  WHERE ((gli.dc_line_item_id = dli.id) AND ((g.status)::text <> ALL (ARRAY['deleted'::text, 'cancelled'::text]))))) AND (NOT _dc_line_is_stage_tracked(dli.id, dli.job_card_id)) AND (dli.rework_source_grn_line_id IS NULL))
          GROUP BY dli.dc_id, dli.item_id
        ), pairs AS (
         SELECT COALESCE(l.company_id, d.company_id) AS company_id,
            COALESCE(l.dc_id, led.dc_id) AS dc_id,
            COALESCE(l.dc_number, d.dc_number) AS dc_number,
            COALESCE(l.status, d.status) AS status,
            COALESCE(l.item_id, led.item_id) AS item_id,
            COALESCE(l.line_qty, (0)::numeric) AS line_qty,
            COALESCE(led.posted, (0)::numeric) AS posted,
            COALESCE(r.grn_received, (0)::numeric) AS grn_received,
            COALESCE(l.has_unresolved, false) AS has_unresolved
           FROM (((lines l
             FULL JOIN led ON (((led.dc_id = l.dc_id) AND (led.item_id = l.item_id))))
             LEFT JOIN delivery_challans d ON ((d.id = COALESCE(l.dc_id, led.dc_id))))
             LEFT JOIN recv r ON (((r.dc_id = COALESCE(l.dc_id, led.dc_id)) AND (r.item_id = COALESCE(l.item_id, led.item_id)))))
          WHERE (((COALESCE(l.status, d.status))::text = ANY (ARRAY['issued'::text, 'partially_returned'::text, 'fully_returned'::text, 'cancelled'::text, 'deleted'::text, 'pending_approval'::text, 'draft'::text, 'rejected'::text])) AND ((l.dc_id IS NOT NULL) OR ((d.status)::text = ANY (ARRAY['cancelled'::text, 'deleted'::text])) OR (d.issued_at IS NOT NULL)))
            -- 03-Nov-2026: a DC+item whose lines were all moved onto a job card is stage-tracked;
            -- its old plain-path ledger rows are not drift.
            AND NOT (l.dc_id IS NULL AND EXISTS (SELECT 1 FROM dc_line_items x
                       WHERE x.dc_id = led.dc_id AND x.item_id = led.item_id AND _dc_line_is_stage_tracked(x.id, x.job_card_id)))
        )
 SELECT p.company_id,
    p.dc_id,
    p.dc_number,
    p.status,
    p.item_id,
    i.item_code,
        CASE
            WHEN ((p.status)::text = ANY (ARRAY['cancelled'::text, 'deleted'::text])) THEN p.grn_received
            ELSE p.line_qty
        END AS target_qty,
    p.posted,
    p.grn_received,
    (
        CASE
            WHEN ((p.status)::text = ANY (ARRAY['cancelled'::text, 'deleted'::text])) THEN p.grn_received
            ELSE p.line_qty
        END - p.posted) AS gap,
    p.has_unresolved,
    (((p.status)::text <> ALL (ARRAY['cancelled'::text, 'deleted'::text])) AND (p.line_qty < p.grn_received)) AS below_grn_received
   FROM (pairs p
     LEFT JOIN items i ON ((i.id = p.item_id)))
  WHERE ((p.item_id IS NOT NULL) AND (
        CASE
            WHEN ((p.status)::text = ANY (ARRAY['cancelled'::text, 'deleted'::text])) THEN p.grn_received
            ELSE p.line_qty
        END <> p.posted)
    -- 03-Nov-2026: audited gaps acknowledged with a reason drop out; any new movement changes the gap and the pair re-surfaces.
    AND NOT EXISTS (SELECT 1 FROM dc_drift_acknowledgements a
                    WHERE a.company_id = p.company_id AND a.dc_id = p.dc_id AND a.item_id = p.item_id
                      AND a.gap = (CASE WHEN ((p.status)::text = ANY (ARRAY['cancelled'::text, 'deleted'::text])) THEN p.grn_received ELSE p.line_qty END - p.posted)));

-- Data (run once, via execute_sql on 2026-11-04): audited acknowledgements from the 03-Nov-2026 stock audit.
-- INSERT INTO public.dc_drift_acknowledgements (company_id, dc_id, item_id, gap, reason, acknowledged_by)
-- SELECT v.company_id, v.dc_id, v.item_id, v.gap, r.reason, NULL
-- FROM public.v_dc_ledger_drift v
-- JOIN (VALUES
--  ('DC-26-27/1051','MS SQ PPIPE 40 X40X 2MM THICK (QTY-100 NOS)', -13::numeric, 'Audit 03-Nov-2026: DC-1051 cancelled without reversing its 13; re-raised as DC-1106. Leftover absorbed by 12-Oct in-process correction (GRN-2345). Stock correct. Do NOT reconcile - would block GRN-2345.'),
--  ('DC-26-27/1304','230008 V2 W', -81, 'Audit 03-Nov-2026: line changed to 230008 V1 W after issue; issue reversed by edit delta (manual_adjustment 31-Oct). Stock correct.'),
--  ('DC-26-27/689','230302 B', -194, 'Audit 03-Nov-2026: line removed from DC-689 after issue; 194 relieved by edit delta 11-Aug. Stock correct.'),
--  ('DC-26-27/780','230234', 9, 'Audit 03-Nov-2026: line raised 190->199 after issue via edit delta; all 199 returned on GRN-1515. Stock correct.'),
--  ('DC-26-27/815','V869', 5000, 'Audit 03-Nov-2026: cancelled DC on duplicate V869 record; In Process for this record is 0. V869 pending physical count + item merge.'),
--  ('DC-26-27/840','230238CPART-C', 5, 'Audit 03-Nov-2026: issue posted as edit delta (+5); 5 back on GRN-2701 awaiting QC. Free -1 pending physical count (GRN-2704 mis-booked against DC-917 230238 C).'),
--  ('DC-26-27/939','230331F3V4', 32, 'Audit 03-Nov-2026: issue posted as edit delta (+32); 32 returned on GRN-1920. Stock correct.')
-- ) AS r(dc_number, item_code, gap, reason)
--   ON r.dc_number = v.dc_number AND r.item_code = v.item_code AND r.gap = v.gap
-- WHERE v.company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc';
-- 
